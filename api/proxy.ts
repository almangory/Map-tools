export default async function handler(req: any, res: any) {
  try {
    const targetUrl = req.query?.url as string;
    if (!targetUrl) {
      res.status(400).json({ error: "Missing url parameter" });
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
