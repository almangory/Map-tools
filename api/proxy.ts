function isSafeUrl(rawUrl: string): { safe: boolean; error?: string } {
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

    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = hostname.match(ipv4Regex);
    if (ipMatch) {
      const octets = [
        parseInt(ipMatch[1], 10),
        parseInt(ipMatch[2], 10),
        parseInt(ipMatch[3], 10),
        parseInt(ipMatch[4], 10),
      ];

      if (octets.some(o => o > 255)) return { safe: false, error: "Invalid IP address." };
      if (octets[0] === 127) return { safe: false, error: "Loopback addresses are not allowed." };
      if (octets[0] === 10) return { safe: false, error: "Private IP addresses are not allowed." };
      if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return { safe: false, error: "Private IP addresses are not allowed." };
      if (octets[0] === 192 && octets[1] === 168) return { safe: false, error: "Private IP addresses are not allowed." };
      if (octets[0] === 169 && octets[1] === 254) return { safe: false, error: "Cloud metadata endpoints are not allowed." };
      if (octets[0] === 0) return { safe: false, error: "Invalid IP address." };
    }

    if (/^\d+$/.test(hostname) || /^0x[0-9a-f]+$/i.test(hostname)) {
      return { safe: false, error: "Numeric/Hex IP representations are not allowed." };
    }

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

    const validation = isSafeUrl(targetUrl);
    if (!validation.safe) {
      res.status(403).json({ error: validation.error || "Forbidden URL destination." });
      return;
    }

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
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
      const buffer = Buffer.from(arrayBuffer);
      res.send(buffer);
    } else {
      const text = await response.text();
      res.send(text);
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch from url" });
  }
}
