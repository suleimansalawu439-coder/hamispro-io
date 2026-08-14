import "dotenv/config";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
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

  app.post("/api/auth/login-direct", async (req, res) => {
    try {
      const { password } = req.body;
      const { ENV } = await import("./env");
      if (!password || password !== ENV.ownerOpenId) {
        res.status(403).json({ error: "Invalid credentials" });
        return;
      }
      const { getUserByOpenId, upsertUser } = await import("../db");
      let user = await getUserByOpenId(password);
      if (!user) {
        await upsertUser({ openId: password, name: "Owner", email: "owner@hamispro.io", loginMethod: "direct", lastSignedIn: new Date() });
      }
      const { sdk } = await import("./sdk");
      const sessionToken = await sdk.createSessionToken(password, { name: "Owner" });
      const { getSessionCookieOptions } = await import("./cookies");
      const { COOKIE_NAME, ONE_YEAR_MS } = await import("@shared/const");
      res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

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

  // Fallback global error handler to prevent unhandled serverless function crashes
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    console.error("[App Error]", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Internal Server Error",
        path: req.originalUrl,
      });
    }
  });

  return app;
}

export const app = createApp();
export default app;
