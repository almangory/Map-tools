import express, { Request, Response, NextFunction } from "express";
import path from "path";
import dns from "dns";
import { createServer as createViteServer } from "vite";
import { decodePlusCode } from "./services/plusCodeService";

const MAX_PROXY_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit

/**
 * Checks whether an IPv4 address belongs to a private/reserved range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;

  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8 (RFC 1918)
  if (a === 127) return true; // 127.0.0.0/8 (Loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (Link-Local / Cloud Metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC 1918)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC 1918)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  return false;
}

/**
 * Checks whether an IPv6 address belongs to a private/reserved range.
 */
function isPrivateIPv6(ip: string): boolean {
  const clean = ip.toLowerCase().replace(/[\[\]]/g, "");
  if (clean === "::1" || clean === "::" || clean.startsWith("fe80") || clean.startsWith("fc") || clean.startsWith("fd")) {
    return true;
  }
  if (clean.startsWith("::ffff:")) {
    const ipv4 = clean.replace("::ffff:", "");
    return isPrivateIPv4(ipv4);
  }
  return false;
}

/**
 * Validates URLs against SSRF (Server-Side Request Forgery) attacks
 * Resolves DNS to check underlying IPs against RFC 1918, loopback, and cloud metadata.
 */
async function isSafeUrl(rawUrl: string): Promise<{ safe: boolean; error?: string; parsedUrl?: URL }> {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, error: "Only HTTP and HTTPS protocols are allowed." };
    }

    const hostname = parsed.hostname.toLowerCase().trim();

    // Block localhost and standard internal hostnames
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local") ||
      hostname === "metadata.google.internal" ||
      hostname === "instance-data"
    ) {
      return { safe: false, error: "Access to local or cloud metadata endpoints is prohibited." };
    }

    // Direct IPv4 Check
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      if (isPrivateIPv4(hostname)) {
        return { safe: false, error: "Access to private or local IP addresses is prohibited." };
      }
    }

    // Direct IPv6 Check
    if (hostname.includes(":")) {
      if (isPrivateIPv6(hostname)) {
        return { safe: false, error: "Access to private IPv6 addresses is prohibited." };
      }
    }

    // Resolve DNS records to prevent DNS Rebinding to internal/metadata addresses
    try {
      const records = await dns.promises.lookup(hostname, { all: true });
      for (const record of records) {
        if (record.family === 4 && isPrivateIPv4(record.address)) {
          return { safe: false, error: "Domain resolves to a prohibited internal IP address." };
        }
        if (record.family === 6 && isPrivateIPv6(record.address)) {
          return { safe: false, error: "Domain resolves to a prohibited internal IPv6 address." };
        }
      }
    } catch {
      return { safe: false, error: "Unable to resolve target domain name." };
    }

    return { safe: true, parsedUrl: parsed };
  } catch {
    return { safe: false, error: "Invalid URL structure." };
  }
}

/**
 * In-memory sliding rate limiter per IP address
 */
function createRateLimiter(maxRequests: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetTime: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const clientRecord = hits.get(ip);

    if (!clientRecord || now > clientRecord.resetTime) {
      hits.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (clientRecord.count >= maxRequests) {
      res.status(429).json({ error: "Too many requests. Please slow down and try again shortly." });
      return;
    }

    clientRecord.count++;
    next();
  };
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Security Hardening: Disable information disclosure header
  app.disable("x-powered-by");

  // High-Performance Zero-Overhead HTTP Security Headers
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(self), camera=(), microphone=(), payment=()");
    next();
  });

  // JSON Body Parser for API routes
  app.use(express.json({ limit: "10mb" }));

  const proxyLimiter = createRateLimiter(60, 60 * 1000); // 60 requests per minute
  const geminiLimiter = createRateLimiter(30, 60 * 1000); // 30 requests per minute

  // SSRF-Protected Proxy endpoint with size limits and DNS validation
  app.get("/api/proxy", proxyLimiter, async (req: Request, res: Response) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        res.status(400).json({ error: "Missing url parameter" });
        return;
      }

      // Perform strict SSRF & DNS check
      const validation = await isSafeUrl(targetUrl);
      if (!validation.safe) {
        console.warn(`[SSRF Blocked] URL: ${targetUrl} - Reason: ${validation.error}`);
        res.status(403).json({ error: validation.error || "Forbidden URL destination." });
        return;
      }

      console.log("Safe proxying request to:", targetUrl);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GeoGISPro/1.0",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Prevent memory exhaustion attacks: check content length
      const contentLengthHeader = response.headers.get("content-length");
      if (contentLengthHeader && parseInt(contentLengthHeader, 10) > MAX_PROXY_FILE_SIZE) {
        res.status(413).json({ error: "File exceeds the maximum allowable proxy size (50MB)." });
        return;
      }

      const contentType = response.headers.get("content-type");
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }

      const urlLower = targetUrl.toLowerCase();
      if (
        urlLower.endsWith(".kmz") ||
        urlLower.endsWith(".zip") ||
        (contentType && contentType.includes("application/vnd.google-earth.kmz")) ||
        (contentType && contentType.includes("application/zip"))
      ) {
        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_PROXY_FILE_SIZE) {
          res.status(413).json({ error: "File exceeds the maximum allowable proxy size (50MB)." });
          return;
        }
        res.send(Buffer.from(arrayBuffer));
      } else {
        const text = await response.text();
        if (text.length > MAX_PROXY_FILE_SIZE) {
          res.status(413).json({ error: "Content exceeds allowable proxy text limit." });
          return;
        }
        res.send(text);
      }
    } catch (error: any) {
      console.error("Proxy error:", error.message);
      res.status(500).json({ error: error.message || "Failed to fetch from url" });
    }
  });

  // In-memory cache for resolved map URLs
  const resolvedMapsCache = new Map<string, { lat: number; lon: number; resolvedUrl?: string } | null>();

  // Batch Resolve Maps URLs endpoint
  app.post("/api/resolve-maps-urls", proxyLimiter, async (req: Request, res: Response) => {
    try {
      const { urls } = req.body || {};
      if (!urls || !Array.isArray(urls)) {
        res.status(400).json({ error: "Missing or invalid 'urls' array parameter" });
        return;
      }

      // Limit to 500 unique URLs per batch to prevent denial of service
      const cleanUrls = Array.from(
        new Set(
          urls
            .map((u) => (typeof u === "string" ? u.trim() : ""))
            .filter((u) => u.startsWith("http://") || u.startsWith("https://"))
        )
      ).slice(0, 500);

      const results: Record<string, { lat: number; lon: number; resolvedUrl?: string } | null> = {};
      const toFetch: string[] = [];

      for (const u of cleanUrls) {
        if (resolvedMapsCache.has(u)) {
          results[u] = resolvedMapsCache.get(u)!;
        } else {
          toFetch.push(u);
        }
      }

      // Helper function to extract coordinates from URL or HTML text
      const extractCoordsFromUrlOrHtml = (urlStr: string, htmlStr?: string): { lat: number; lon: number } | null => {
        let decoded = urlStr;
        try {
          decoded = decodeURIComponent(decodeURIComponent(urlStr));
        } catch {}

        // 1. Google Maps pin data !3d<lat>!4d<lon> (most accurate)
        const pinMatch = decoded.match(/!3d([-+]?\d+\.\d+)!4d([-+]?\d+\.\d+)/i);
        if (pinMatch) {
          const lat = parseFloat(pinMatch[1]);
          const lon = parseFloat(pinMatch[2]);
          if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            return { lat, lon };
          }
        }

        // 2. Open Location Code (Plus Code e.g. HQR7+2GH Riyadh or 7HP8HQR7+2GH)
        const plusCodeMatch = decodePlusCode(urlStr) || decodePlusCode(decoded);
        if (plusCodeMatch) {
          return plusCodeMatch;
        }

        // 3. Google Maps /place/<lat>,<lon> in URL path
        const placeMatch = decoded.match(/\/place\/([-+]?\d+\.\d+)[, ]+([-+]?\d+\.\d+)/i);
        if (placeMatch) {
          const lat = parseFloat(placeMatch[1]);
          const lon = parseFloat(placeMatch[2]);
          if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            return { lat, lon };
          }
        }

        // 4. Query param q=... or query=... or ll=... or mlat=... or loc:...
        const qMatch =
          decoded.match(/[?&](?:q|query|ll|mlat|loc|center)=([-+]?\d+\.\d+)[, ]+([-+]?\d+\.\d+)/i) ||
          decoded.match(/[?&]mlat=([-+]?\d+\.\d+)&mlon=([-+]?\d+\.\d+)/i) ||
          decoded.match(/loc:([-+]?\d+\.\d+)[, +]+([-+]?\d+\.\d+)/i);
        if (qMatch) {
          const lat = parseFloat(qMatch[1]);
          const lon = parseFloat(qMatch[2]);
          if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            return { lat, lon };
          }
        }

        // 5. Google Maps @lat,lon
        const atMatch = decoded.match(/@([-+]?\d+\.\d+),([-+]?\d+\.\d+)/i);
        if (atMatch) {
          const lat = parseFloat(atMatch[1]);
          const lon = parseFloat(atMatch[2]);
          if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            return { lat, lon };
          }
        }

        // 6. DMS notation inside URL or HTML: e.g. 24°33'49.9"N 46°31'09.3"E
        const dmsRegex = /(\d+)[°\s]+(\d+)[\x27\x60\u2018\u2019\s]+(\d+(?:\.\d+)?)[\x22\u201c\u201d\s]*([NSEWشطقغ])/gi;
        const checkStr = `${decoded} ${htmlStr ? htmlStr.slice(0, 50000) : ""}`;
        const dmsMatches = [...checkStr.matchAll(dmsRegex)];
        if (dmsMatches.length >= 2) {
          let lat: number | null = null;
          let lon: number | null = null;
          for (const m of dmsMatches) {
            const deg = parseFloat(m[1]);
            const min = parseFloat(m[2]);
            const sec = parseFloat(m[3]);
            const dir = m[4].toUpperCase();
            let val = deg + min / 60 + sec / 3600;
            if (dir === "S" || dir === "ج") val = -val;
            if (dir === "W" || dir === "غ") val = -val;
            if (dir === "N" || dir === "S" || dir === "ش" || dir === "ج") lat = val;
            if (dir === "E" || dir === "W" || dir === "ق" || dir === "غ") lon = val;
          }
          if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            return { lat, lon };
          }
        }

        // 7. Plus Code inside HTML content (e.g. meta tags or page text)
        if (htmlStr) {
          const htmlPlusCode = decodePlusCode(htmlStr);
          if (htmlPlusCode) {
            return htmlPlusCode;
          }

          // 8. HTML static map or meta tags (reject European server default 51.4893323)
          const metaMatch = htmlStr.match(/staticmap\?center=([0-9.-]+)%2C([0-9.-]+)/i) ||
                            htmlStr.match(/staticmap\?center=([0-9.-]+),([0-9.-]+)/i) ||
                            htmlStr.match(/maps\.google\.com\/maps\/api\/staticmap\?[^"]*?center=([0-9.-]+)%2C([0-9.-]+)/i);
          if (metaMatch) {
            const lat = parseFloat(metaMatch[1]);
            const lon = parseFloat(metaMatch[2]);
            // Exclude Google datacenter default in London
            if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(Math.abs(lat - 51.489) < 0.05 && Math.abs(lon - (-0.088)) < 0.05)) {
              return { lat, lon };
            }
          }
        }

        return null;
      };

      // Process in concurrent batches of 10
      const batchSize = 10;
      for (let i = 0; i < toFetch.length; i += batchSize) {
        const batch = toFetch.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (rawUrl) => {
            try {
              // Direct check if URL already contains coordinates or Plus Code
              const directCheck = extractCoordsFromUrlOrHtml(rawUrl);
              if (directCheck) {
                const resObj = { ...directCheck, resolvedUrl: rawUrl };
                resolvedMapsCache.set(rawUrl, resObj);
                results[rawUrl] = resObj;
                return;
              }

              // Verify URL safety
              const validation = await isSafeUrl(rawUrl);
              if (!validation.safe) {
                resolvedMapsCache.set(rawUrl, null);
                results[rawUrl] = null;
                return;
              }

              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout

              // First try a manual redirect fetch to inspect the Location header immediately
              let redirectedLocation: string | null = null;
              try {
                const headOrManualResp = await fetch(rawUrl, {
                  method: "GET",
                  headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GeoGISPro/1.0",
                    "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
                  },
                  signal: controller.signal,
                  redirect: "manual",
                });
                redirectedLocation = headOrManualResp.headers.get("location");
              } catch {}

              if (redirectedLocation) {
                const locExtracted = extractCoordsFromUrlOrHtml(redirectedLocation);
                if (locExtracted) {
                  clearTimeout(timeoutId);
                  const resObj = { ...locExtracted, resolvedUrl: redirectedLocation };
                  resolvedMapsCache.set(rawUrl, resObj);
                  results[rawUrl] = resObj;
                  return;
                }
              }

              // Follow redirects if Location header did not directly contain coords
              const resp = await fetch(rawUrl, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GeoGISPro/1.0",
                  "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
                },
                signal: controller.signal,
                redirect: "follow",
              });
              clearTimeout(timeoutId);

              const finalUrl = resp.url || redirectedLocation || rawUrl;
              let htmlSnippet = "";
              try {
                const text = await resp.text();
                htmlSnippet = text.slice(0, 100000);
              } catch {}

              const extracted =
                extractCoordsFromUrlOrHtml(finalUrl, htmlSnippet) ||
                (redirectedLocation ? extractCoordsFromUrlOrHtml(redirectedLocation, htmlSnippet) : null) ||
                extractCoordsFromUrlOrHtml(rawUrl, htmlSnippet);

              if (extracted) {
                const resObj = { ...extracted, resolvedUrl: finalUrl };
                resolvedMapsCache.set(rawUrl, resObj);
                results[rawUrl] = resObj;
              } else {
                resolvedMapsCache.set(rawUrl, null);
                results[rawUrl] = null;
              }
            } catch (err: any) {
              console.warn(`Failed to resolve map URL (${rawUrl}):`, err.message);
              resolvedMapsCache.set(rawUrl, null);
              results[rawUrl] = null;
            }
          })
        );
      }

      res.json({ results });
    } catch (error: any) {
      console.error("Resolve maps error:", error.message);
      res.status(500).json({ error: error.message || "Failed to resolve map URLs" });
    }
  });

  // Secure Server-side Gemini AI API Route
  app.post("/api/gemini/suggest-mapping", geminiLimiter, async (req: Request, res: Response) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("Server Gemini API Key is not set in environment.");
        res.status(503).json({ error: "Gemini API key is not configured on the server." });
        return;
      }

      const { headers, sampleRow } = req.body || {};
      if (!headers || !Array.isArray(headers) || headers.length === 0) {
        res.status(400).json({ error: "Missing or invalid headers array." });
        return;
      }

      // Limit payload size to avoid prompt injection / excessive cost
      const sanitizedHeaders = headers.slice(0, 100).map((h) => String(h).slice(0, 100));
      const sanitizedSampleRow = Array.isArray(sampleRow)
        ? sampleRow.slice(0, 100).map((val) => (val !== undefined && val !== null ? String(val).slice(0, 100) : ""))
        : [];

      const { GoogleGenAI, Type } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
      I have a spreadsheet with the following headers: ${JSON.stringify(sanitizedHeaders)}
      Here is a sample row of data: ${JSON.stringify(sanitizedSampleRow)}
      
      I need to map these columns to geographic coordinates.
      Identify which column represents:
      - X Coordinate (Easting or Longitude)
      - Y Coordinate (Northing or Latitude)
      - Z Coordinate (Elevation/Height) - Optional
      - ID / Point Name - Optional
      - Description - Optional

      Return the exact header name for each. If not found, return null.
      `;

      const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              xColumn: { type: Type.STRING },
              yColumn: { type: Type.STRING },
              zColumn: { type: Type.STRING },
              idColumn: { type: Type.STRING },
              descColumn: { type: Type.STRING },
            },
          },
        },
      });

      if (response.text) {
        const mapping = JSON.parse(response.text);
        res.json({ mapping });
      } else {
        res.json({ mapping: null });
      }
    } catch (error: any) {
      console.error("Server Gemini mapping error:", error.message);
      res.status(500).json({ error: error.message || "Failed to process mapping with AI." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

