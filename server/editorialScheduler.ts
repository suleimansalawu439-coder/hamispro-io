import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { runEditorialIngestionPipeline } from "./editorialIngestion";

export async function handleEditorialScheduled(req: Request, res: Response) {
  const startedAt = new Date();
  try {
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      return res.status(403).json({ error: "cron-only" });
    }
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });

    const result = await runEditorialIngestionPipeline();
    return res.json({ ok: result.ok, taskUid: user.taskUid, result, startedAt: startedAt.toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message, context: { url: req.originalUrl }, timestamp: new Date().toISOString() });
  }
}
