import express, { Request, Response, NextFunction } from "express";
import path from "path";
import dns from "dns";
import { createServer as createViteServer } from "vite";

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

