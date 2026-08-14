import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { runEditorialIngestionPipeline } from "./editorialIngestion";

export function isAuthorizedCronRequest(req: Request, user?: any): boolean {
  if (user?.isCron && user?.taskUid) return true;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ") && authHeader.slice(7) === cronSecret) return true;
  if (req.headers["x-cron-secret"] === cronSecret) return true;
  if (req.query.secret === cronSecret) return true;
  return false;
}

export async function handleEditorialScheduled(req: Request, res: Response) {
  const startedAt = new Date();
  try {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      user = null;
    }

    if (!isAuthorizedCronRequest(req, user)) {
      return res.status(403).json({ error: "cron-only: invalid credentials or CRON_SECRET missing" });
    }

    const taskUid = user?.taskUid ?? "external-cron";
    const result = await runEditorialIngestionPipeline();
    return res.json({ ok: result.ok, taskUid, result, startedAt: startedAt.toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message, context: { url: req.originalUrl }, timestamp: new Date().toISOString() });
  }
}
