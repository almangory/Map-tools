import dns from 'dns';

const MAX_PROXY_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;

  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

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

async function isSafeUrl(rawUrl: string): Promise<{ safe: boolean; error?: string }> {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, error: "Only HTTP and HTTPS protocols are allowed." };
    }

    const hostname = parsed.hostname.toLowerCase().trim();

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
      return { safe: false, error: "Access to local or internal endpoints is prohibited." };
    }

    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      if (isPrivateIPv4(hostname)) return { safe: false, error: "Private IP addresses are not allowed." };
    }

    if (hostname.includes(":")) {
      if (isPrivateIPv6(hostname)) return { safe: false, error: "Private IPv6 addresses are not allowed." };
    }

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
      return { safe: false, error: "Unable to resolve target domain." };
    }

    return { safe: true };
  } catch {
    return { safe: false, error: "Invalid URL structure." };
  }
}

export default async function handler(req: any, res: any) {
  try {
    const targetUrl = req.query?.url as string;
    if (!targetUrl) {
      res.status(400).json({ error: "Missing url parameter" });
      return;
    }

    const validation = await isSafeUrl(targetUrl);
    if (!validation.safe) {
      res.status(403).json({ error: validation.error || "Forbidden URL destination." });
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

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

    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader && parseInt(contentLengthHeader, 10) > MAX_PROXY_FILE_SIZE) {
      res.status(413).json({ error: "File exceeds maximum allowable proxy size (50MB)." });
      return;
    }

    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    const urlLower = String(targetUrl || '').toLowerCase();
    if (
      urlLower.endsWith('.kmz') ||
      urlLower.endsWith('.zip') ||
      (contentType && contentType.includes("application/vnd.google-earth.kmz")) ||
      (contentType && contentType.includes("application/zip"))
    ) {
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_PROXY_FILE_SIZE) {
        res.status(413).json({ error: "File exceeds maximum allowable proxy size (50MB)." });
        return;
      }
      res.send(Buffer.from(arrayBuffer));
    } else {
      const text = await response.text();
      if (text.length > MAX_PROXY_FILE_SIZE) {
        res.status(413).json({ error: "Content exceeds allowable proxy limit." });
        return;
      }
      res.send(text);
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch from url" });
  }
}

