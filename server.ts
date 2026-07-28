import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.get("/api/proxy", async (req, res) => {
    try {
      const targetUrl = req.query.url as string;
      if (!targetUrl) {
        res.status(400).json({ error: "Missing url parameter" });
        return;
      }

      console.log("Proxying request to:", targetUrl);
      
      const response = await fetch(targetUrl, {
          headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
      });
      
      if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Pass content type
      const contentType = response.headers.get("content-type");
      if (contentType) {
          res.setHeader("Content-Type", contentType);
      }
      
      // If it's a binary file (like kmz), we need to send as buffer
      if (targetUrl.toLowerCase().endsWith('.kmz') || targetUrl.toLowerCase().endsWith('.zip') || (contentType && contentType.includes("application/vnd.google-earth.kmz")) || (contentType && contentType.includes("application/zip"))) {
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
