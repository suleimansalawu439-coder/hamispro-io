import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ insertAdminAuditLog: vi.fn().mockResolvedValue(true), consumeAdminRateLimit: vi.fn().mockResolvedValue({ allowed: true, durable: false, retryAfterSeconds: 0 }) }));
vi.mock("./db", () => dbMock);

import { auditAdminAction, enforceAdminRateLimit, resetAdminRateLimitBucketsForTests } from "./adminSecurity";

const ctx: any = { user: { id: 1, openId: "owner-open-id" }, req: { ip: "127.0.0.1", headers: { "user-agent": "test-agent" } } };

describe("admin security controls", () => {
  beforeEach(() => { resetAdminRateLimitBucketsForTests(); vi.clearAllMocks(); });
  it("throttles repeated article saves in a bounded window", async () => {
    for (let index = 0; index < 30; index += 1) await enforceAdminRateLimit(ctx, "article.save");
    await expect(enforceAdminRateLimit(ctx, "article.save")).rejects.toThrow(/Rate limit exceeded/);
  });
  it("records an audit event without article body content", async () => {
    await auditAdminAction(ctx, { action: "article.publish", resourceType: "article", resourceId: 7, metadata: { slug: "test-note", published: true } });
    expect(dbMock.insertAdminAuditLog).toHaveBeenCalledWith(expect.objectContaining({ actorOpenId: "owner-open-id", action: "article.publish", resourceId: 7, ipAddress: "127.0.0.1", userAgent: "test-agent", metadata: JSON.stringify({ slug: "test-note", published: true }) }));
    expect(JSON.stringify(dbMock.insertAdminAuditLog.mock.calls[0])).not.toContain("article body");
  });
});
