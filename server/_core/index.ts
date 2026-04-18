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

  app.get("/api/healthz/llm", (_req, res) => {
    const { ENV } = require("./env");
    const { execSync } = require("child_process");
    let pdftoppmAvailable = false;
    let pdftoppmVersion = "not found";
    try {
      const out = execSync("pdftoppm -v 2>&1", { timeout: 3000 }).toString().trim();
      pdftoppmAvailable = true;
      pdftoppmVersion = out.split("\n")[0];
    } catch {}
    res.status(200).json({
      forgeApiUrl: ENV.forgeApiUrl || "(not set)",
      forgeApiKeyPrefix: ENV.forgeApiKey ? ENV.forgeApiKey.substring(0, 10) + "..." : "(not set)",
      geminiApiKey: ENV.geminiApiKey ? ENV.geminiApiKey.substring(0, 10) + "..." : "(not set)",
      llmModel: ENV.llmModel,
      pdftoppmAvailable,
      pdftoppmVersion,
    });
  });

  // Debug endpoint: test pdftoppm from Node.js with a tiny PDF
  app.get("/api/healthz/pdftoppm", async (_req, res) => {
    const { execSync } = require("child_process");
    const { writeFileSync, existsSync, readdirSync, unlinkSync } = require("fs");
    const { tmpdir } = require("os");
    const { join } = require("path");
    const results: any = {};

    try {
      // Test 1: which pdftoppm
      results.which = execSync("which pdftoppm 2>&1", { timeout: 3000 }).toString().trim();
    } catch (e: any) { results.which = "ERROR: " + e.message; }

    try {
      // Test 2: tmpdir
      results.tmpdir = tmpdir();
    } catch (e: any) { results.tmpdir = "ERROR: " + e.message; }

    try {
      // Test 3: write a test file to tmpdir
      const testPath = join(tmpdir(), "test_write.txt");
      writeFileSync(testPath, "test");
      results.tmpdirWritable = true;
      unlinkSync(testPath);
    } catch (e: any) { results.tmpdirWritable = "ERROR: " + e.message; }

    try {
      // Test 4: list tmpdir contents
      results.tmpdirContents = readdirSync(tmpdir()).slice(0, 10);
    } catch (e: any) { results.tmpdirContents = "ERROR: " + e.message; }

    try {
      // Test 5: create a minimal valid PDF and run pdftoppm on it
      // This is a minimal 1-page PDF with a white rectangle
      const minimalPdf = Buffer.from(
        "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/MediaBox[0 0 100 100]/Parent 2 0 R>>endobj\n" +
        "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n" +
        "0000000058 00000 n \n0000000115 00000 n \n" +
        "trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF"
      );
      const pdfPath = join(tmpdir(), "test_clarity.pdf");
      const outPrefix = join(tmpdir(), "test_clarity_out");
      writeFileSync(pdfPath, minimalPdf);
      results.pdfWritten = existsSync(pdfPath);

      try {
        const cmd = `pdftoppm -r 72 -png -f 1 -l 1 "${pdfPath}" "${outPrefix}"`;
        results.pdftoppmCmd = cmd;
        execSync(cmd, { timeout: 15000, stdio: "pipe" });
        results.pdftoppmExecOk = true;
      } catch (e: any) {
        results.pdftoppmExecOk = false;
        results.pdftoppmError = e.message;
        results.pdftoppmStderr = e.stderr?.toString?.() ?? "";
      }

      // Check what files were created
      const allTmp = readdirSync(tmpdir());
      results.outputFiles = allTmp.filter((f: string) => f.startsWith("test_clarity_out"));

      // Cleanup
      try { unlinkSync(pdfPath); } catch {}
      results.outputFiles.forEach((f: string) => { try { unlinkSync(join(tmpdir(), f)); } catch {} });
    } catch (e: any) { results.pdftoppmTest = "ERROR: " + e.message; }

    res.status(200).json(results);
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
