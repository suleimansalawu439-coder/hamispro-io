import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { listDigestCandidates, listDueDigestSubscribers, markDigestSent } from "./db";
import { isAuthorizedCronRequest } from "./editorialScheduler";

const MAX_BATCH = 100;

export async function handleDigestScheduled(req: Request, res: Response) {
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
    const subscribers = await listDueDigestSubscribers(MAX_BATCH);
    const batches = await Promise.all(subscribers.map(async subscriber => {
      const intervalMs = subscriber.frequency === "daily" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      const since = subscriber.lastDigestSentAt ? new Date(subscriber.lastDigestSentAt) : new Date(Date.now() - intervalMs);
      const candidates = await listDigestCandidates(subscriber.topics.split(",").filter(Boolean), since);
      return { email: subscriber.email, frequency: subscriber.frequency, topics: subscriber.topics.split(",").filter(Boolean), articleCount: candidates.length, articleSlugs: candidates.map(article => article.slug) };
    }));

    // No email provider is bundled by default. When a verified provider webhook is
    // configured, mark a subscriber only after that provider acknowledges the batch.
    const deliveryUrl = process.env.DIGEST_PROVIDER_WEBHOOK_URL;
    let sent = 0;
    if (deliveryUrl) {
      for (const batch of batches) {
        const response = await fetch(deliveryUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "hamispro_digest", recipient: batch.email, topics: batch.topics, articleSlugs: batch.articleSlugs }) });
        if (!response.ok) throw new Error(`Digest provider rejected ${batch.email}: ${response.status}`);
        if (await markDigestSent(batch.email)) sent += 1;
      }
    }
    return res.json({ ok: true, taskUid, dryRun: !deliveryUrl, deliveryConfigured: Boolean(deliveryUrl), bounded: batches.length <= MAX_BATCH, processed: batches.length, sent, batches, startedAt: startedAt.toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message, context: { url: req.originalUrl, taskUid: (req as any).user?.taskUid ?? null }, timestamp: new Date().toISOString() });
  }
}
