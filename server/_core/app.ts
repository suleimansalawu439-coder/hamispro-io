import "dotenv/config";
import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { handleDigestScheduled } from "../digestScheduler";
import { handleEditorialScheduled } from "../editorialScheduler";
import { serveStatic } from "./vite";

export function createApp(): Express {
  const app = express();

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Register endpoints
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.post("/api/scheduled/sendDigest", handleDigestScheduled);
  app.post("/api/scheduled/ingestEditorial", handleEditorialScheduled);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // In production or serverless environments, attach static asset & SSR handlers
  if (process.env.NODE_ENV !== "development") {
    serveStatic(app);
  }

  return app;
}

export const app = createApp();
export default app;
