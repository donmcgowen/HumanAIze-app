import "dotenv/config";
// Polyfill browser globals required by pdfjs-dist when running in Node.js
// pdfjs-dist v5 references DOMMatrix, ImageData, and Path2D at module load time
if (typeof globalThis.DOMMatrix === "undefined") {
  // @ts-ignore
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() { return new Proxy(this, { get: (t, p) => typeof p === 'string' && !isNaN(+p) ? 0 : (t as any)[p] ?? 0 }); }
  };
}
if (typeof globalThis.ImageData === "undefined") {
  // @ts-ignore
  globalThis.ImageData = class ImageData {
    constructor(public width: number = 0, public height: number = 0) {}
  };
}
if (typeof globalThis.Path2D === "undefined") {
  // @ts-ignore
  globalThis.Path2D = class Path2D {};
}

import express from "express";
import compression from "compression";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startBackgroundSync } from "../backgroundSync";
import { getDatabaseHealth } from "../db";
import { getAuthBackendHealth } from "../auth";
import { clearGenericCacheEntries } from "../localFoodCache";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  const dbHealth = await getDatabaseHealth();
  console.log(
    `[Startup] Database health: ok=${dbHealth.ok} reason=${dbHealth.reason} source=${dbHealth.diagnostics.source}`
  );

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(compression());

  app.get("/api/healthz", (_req, res) => {
    res.status(200).json({ ok: true, service: "humanaize-api" });
  });

  app.get("/api/healthz/db", async (_req, res) => {
    const health = await getDatabaseHealth();
    res.status(health.ok ? 200 : 503).json(health);
  });

  app.get("/api/healthz/auth", async (_req, res) => {
    const health = await getAuthBackendHealth();
    res.status(health.ok ? 200 : 503).json(health);
  });

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const defaultPort = process.env.NODE_ENV === "production" ? "8080" : "3000";
  const preferredPort = parseInt(process.env.PORT ?? defaultPort, 10);
  const port =
    process.env.NODE_ENV === "production"
      ? preferredPort
      : await findAvailablePort(preferredPort);

  if (process.env.NODE_ENV !== "production" && port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Clear stale generic USDA cache entries on startup so branded product searches work correctly
  try {
    const cleared = await clearGenericCacheEntries();
    if (cleared > 0) {
      console.log(`[Startup] Cleared ${cleared} stale generic food cache entries`);
    }
  } catch (error) {
    console.warn("[Startup] Failed to clear generic food cache:", error);
  }

  // Start background sync scheduler (every 5 minutes)
  try {
    await startBackgroundSync(5);
  } catch (error) {
    console.error("Failed to start background sync:", error);
  }
}

startServer().catch(console.error);
