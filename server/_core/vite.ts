import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";

// setupVite is only called in development — all vite imports are dynamic
// so they don't get resolved at production startup.
export async function setupVite(app: Express, server: Server) {
  const { createServer: createViteServer } = await import("vite");
  const { default: viteConfig } = await import("../../vite.config");

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: { middlewareMode: true, hmr: { server }, allowedHosts: true as const },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(import.meta.dirname, "../..", "client", "index.html");
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${nanoid()}"`);
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // In production the bundle lives at dist/index.js so import.meta.dirname = dist/
  // Vite builds the client into dist/public/
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    console.error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
  }

  app.use(
    express.static(distPath, {
      setHeaders: (res, filePath) => {
        // Vite emits hashed assets in /assets; cache them aggressively.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }

        // Keep HTML non-cacheable so clients pick up new asset references quickly.
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      },
    })
  );
  // Hostname-based routing:
  // - humanaize.life (root domain) → redirect to /landing (platform landing page)
  // - app.humanaize.life or any other host → serve the SPA normally
  app.use("*", (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString().toLowerCase();
    const isRootDomain = host === "humanaize.life" || host === "www.humanaize.life";
    // If root domain and not already on /landing, redirect to landing page
    if (isRootDomain && !req.originalUrl.startsWith("/landing") && !req.originalUrl.startsWith("/api")) {
      return res.redirect(301, "/landing");
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
