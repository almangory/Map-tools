import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

/**
 * Validates URLs against SSRF (Server-Side Request Forgery) attacks
 * Blocks private IP ranges (RFC 1918), loopback, cloud metadata endpoints (169.254.169.254), and local hostnames.
 */
function isSafeUrl(rawUrl: string): { safe: boolean; error?: string; parsedUrl?: URL } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, error: "Only HTTP and HTTPS protocols are allowed." };
    }

    const hostname = parsed.hostname.toLowerCase().trim();

    // Block localhost, cloud metadata, and internal hostnames
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

    // Check for IPv4 addresses (including private/link-local/loopback ranges)
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = hostname.match(ipv4Regex);
    if (ipMatch) {
      const octets = [
        parseInt(ipMatch[1], 10),
        parseInt(ipMatch[2], 10),
        parseInt(ipMatch[3], 10),
        parseInt(ipMatch[4], 10),
      ];

      // Any octet > 255 is invalid
      if (octets.some(o => o > 255)) {
        return { safe: false, error: "Invalid IP address." };
      }

      // 127.0.0.0/8 (Loopback)
      if (octets[0] === 127) return { safe: false, error: "Loopback addresses are not allowed." };
      // 10.0.0.0/8 (Private RFC 1918)
      if (octets[0] === 10) return { safe: false, error: "Private IP addresses are not allowed." };
      // 172.16.0.0/12 (Private RFC 1918)
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return { safe: false, error: "Private IP addresses are not allowed." };
      // 192.168.0.0/16 (Private RFC 1918)
      if (octets[0] === 192 && octets[1] === 168) return { safe: false, error: "Private IP addresses are not allowed." };
      // 169.254.0.0/16 (Link-Local / AWS/GCP/Azure Cloud Metadata: 169.254.169.254)
      if (octets[0] === 169 && octets[1] === 254) return { safe: false, error: "Cloud metadata endpoints are not allowed." };
      // 0.0.0.0/8
      if (octets[0] === 0) return { safe: false, error: "Invalid IP address." };
    }

    // Block numeric or hexadecimal IP representations (e.g., http://2130706433, http://0x7f000001)
    if (/^\d+$/.test(hostname) || /^0x[0-9a-f]+$/i.test(hostname)) {
      return { safe: false, error: "Numeric/Hex IP representations are not allowed." };
    }

    // Check IPv6 private/link-local/loopback
    if (hostname.startsWith("[") || hostname.includes(":")) {
      const cleanIpv6 = hostname.replace(/[\[\]]/g, "");
      if (
        cleanIpv6 === "::1" ||
        cleanIpv6 === "::" ||
        cleanIpv6.startsWith("fe80") ||
        cleanIpv6.startsWith("fc") ||
        cleanIpv6.startsWith("fd")
      ) {
        return { safe: false, error: "Private IPv6 addresses are not allowed." };
      }
    }

    return { safe: true, parsedUrl: parsed };
  } catch {
    return { safe: false, error: "Invalid URL structure." };
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body Parser for API routes
  app.use(express.json({ limit: "10mb" }));

  // SSRF-Protected Proxy endpoint
  app.get("/api/proxy", async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        res.status(400).json({ error: "Missing url parameter" });
        return;
      }

      // Perform strict SSRF check
      const validation = isSafeUrl(targetUrl);
      if (!validation.safe) {
        console.warn(`[SSRF Blocked] URL: ${targetUrl} - Reason: ${validation.error}`);
        res.status(403).json({ error: validation.error || "Forbidden URL destination." });
        return;
      }

      console.log("Safe proxying request to:", targetUrl);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Pass content type
      const contentType = response.headers.get("content-type");
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      
      // If it's a binary file (like kmz), we need to send as buffer
      const urlLower = targetUrl.toLowerCase();
      if (
        urlLower.endsWith(".kmz") ||
        urlLower.endsWith(".zip") ||
        (contentType && contentType.includes("application/vnd.google-earth.kmz")) ||
        (contentType && contentType.includes("application/zip"))
      ) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.send(buffer);
      } else {
        const text = await response.text();
        res.send(text);
      }
    } catch (error: any) {
      console.error("Proxy error:", error.message);
      res.status(500).json({ error: error.message || "Failed to fetch from url" });
    }
  });

  // Secure Server-side Gemini AI API Route (API Key stays strictly on server)
  app.post("/api/gemini/suggest-mapping", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.warn("Server Gemini API Key is not set in environment.");
        res.status(503).json({ error: "Gemini API key is not configured on the server." });
        return;
      }

      const { headers, sampleRow } = req.body || {};
      if (!headers || !Array.isArray(headers)) {
        res.status(400).json({ error: "Missing or invalid headers array." });
        return;
      }

      const { GoogleGenAI, Type } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
      I have a spreadsheet with the following headers: ${JSON.stringify(headers)}
      Here is a sample row of data: ${JSON.stringify(sampleRow || [])}
      
      I need to map these columns to geographic coordinates.
      Identify which column represents:
      - X Coordinate (Easting or Longitude)
      - Y Coordinate (Northing or Latitude)
      - Z Coordinate (Elevation/Height) - Optional
      - ID / Point Name - Optional
      - Description - Optional

      Return the exact header name for each. If not found, return null.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
            }
          }
        }
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
