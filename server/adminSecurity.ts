import type { TrpcContext } from "./_core/context";
import { TRPCError } from "@trpc/server";
import { consumeAdminRateLimit, insertAdminAuditLog } from "./db";

type LimitConfig = { limit: number; windowMs: number };
type Bucket = { startedAt: number; count: number };

const buckets = new Map<string, Bucket>();
const DEFAULT_LIMITS: Record<string, LimitConfig> = {
  "article.save": { limit: 30, windowMs: 60_000 },
  "media.upload": { limit: 10, windowMs: 60_000 },
  "assistant.generate": { limit: 12, windowMs: 60_000 },
};

function pruneBuckets(now: number) {
  if (buckets.size < 5000) return;
  buckets.forEach((bucket, key) => { if (now - bucket.startedAt > 15 * 60_000) buckets.delete(key); });
}

export async function enforceAdminRateLimit(ctx: TrpcContext, action: keyof typeof DEFAULT_LIMITS) {
  const now = Date.now();
  const config = DEFAULT_LIMITS[action];
  const key = `${ctx.user?.openId || "anonymous"}:${action}`;
  const durableResult = await consumeAdminRateLimit(key, config);
  if (durableResult.durable) {
    if (!durableResult.allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Rate limit exceeded. Retry in ${durableResult.retryAfterSeconds}s.` });
    return;
  }
  const current = buckets.get(key);
  pruneBuckets(now);
  if (!current || now - current.startedAt >= config.windowMs) {
    buckets.set(key, { startedAt: now, count: 1 });
    return;
  }
  if (current.count >= config.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((config.windowMs - (now - current.startedAt)) / 1000));
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Rate limit exceeded. Retry in ${retryAfterSeconds}s.` });
  }
  current.count += 1;
}

export async function auditAdminAction(ctx: TrpcContext, input: { action: string; resourceType: string; resourceId?: number | null; metadata?: Record<string, unknown> }) {
  if (!ctx.user) return false;
  try {
    return await insertAdminAuditLog({
      actorOpenId: ctx.user.openId,
      actorUserId: ctx.user.id,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      ipAddress: (ctx.req.ip || "").slice(0, 64) || null,
      userAgent: String(ctx.req.headers["user-agent"] || "").slice(0, 500) || null,
    });
  } catch (error) {
    // Admin writes should remain available if logging has a transient failure, but the
    // error is surfaced for operations monitoring and must never contain article content.
    console.error("[AdminAudit] Failed to persist event", { action: input.action, error: String(error) });
    return false;
  }
}

export function resetAdminRateLimitBucketsForTests() {
  buckets.clear();
}
