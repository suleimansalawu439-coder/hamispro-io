import { beforeEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import type { TrpcContext } from "./_core/context";

const dbMocks = vi.hoisted(() => ({
  listAllArticles: vi.fn().mockResolvedValue([]),
  createArticle: vi.fn().mockImplementation(async (input: any) => ({ id: 99, ...input })),
  updateArticle: vi.fn().mockImplementation(async (id: number, input: any) => ({ id, ...input })),
  listPublicArticles: vi.fn(),
  getArticleBySlug: vi.fn(),
  listResources: vi.fn(),
  subscribeEmail: vi.fn(),
  insertAdminAuditLog: vi.fn().mockResolvedValue(true),
  consumeAdminRateLimit: vi.fn().mockResolvedValue({ allowed: true, durable: false, retryAfterSeconds: 0 }),
  listEditorialQueue: vi.fn().mockResolvedValue([]),
  getEditorialItemById: vi.fn(),
  updateEditorialItem: vi.fn(),
  getDashboardMetrics: vi.fn(),
}));
vi.mock("./db", () => dbMocks);
const llmMocks = vi.hoisted(() => ({
  listLLMModels: vi.fn().mockResolvedValue({ data: [{ id: "gpt-5-mini" }] }),
  invokeLLM: vi.fn().mockResolvedValue({ model: "gpt-5-mini", choices: [{ message: { content: JSON.stringify({ value: "A clearer sourced summary." }) } }] }),
}));
vi.mock("./_core/llm", () => llmMocks);

import { appRouter } from "./routers";

function user(openId: string, role: "admin" | "user" = "user") { return { id: 1, openId, email: "owner@example.com", name: "Owner", loginMethod: "manus", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as any; }
function context(currentUser: any): TrpcContext { return { user: currentUser, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] }; }
const input = { slug: "owner-note", title: "An owner-published AI note", excerpt: "A useful editorial note that is long enough for validation.", content: "<h2>Useful note</h2><p>Publish this carefully.</p>", category: "hacks" as const, tags: "workflow,ai", seoTitle: "Owner note", seoDescription: "A useful owner note.", readingTimeMinutes: 4, coverImageUrl: "", coverImageKey: "", published: true, featured: false };
const queueItem = { id: 7, sourceId: 1, externalId: "source-7", canonicalUrl: "https://example.com/ai-story", dedupeHash: "abc", title: "A sourced AI story", excerpt: "A sourced excerpt with enough editorial context.", sourceName: "Example Feed", itemType: "news", category: "news", status: "new", importanceScore: 80, usefulnessScore: 70, noveltyScore: 60, confidenceScore: 90, suggestedTitle: null, aiSummary: null, suggestedAngle: null, keyTakeaways: null, suggestedTags: null, reviewerNotes: null, modelUsed: null };

describe("strict owner authorization", () => {
  beforeEach(() => { vi.clearAllMocks(); dbMocks.listEditorialQueue.mockResolvedValue([]); dbMocks.getDashboardMetrics.mockReset(); dbMocks.getEditorialItemById.mockResolvedValue(queueItem); dbMocks.updateEditorialItem.mockImplementation(async (id: number, changes: any) => ({ ...queueItem, id, ...changes })); llmMocks.listLLMModels.mockResolvedValue({ data: [{ id: "gpt-5-mini" }] }); llmMocks.invokeLLM.mockResolvedValue({ model: "gpt-5-mini", choices: [{ message: { content: JSON.stringify({ value: "A clearer sourced summary." }) } }] }); });
  it("exposes isOwner only for the configured owner openId", async () => {
    const ownerMe = await appRouter.createCaller(context(user(ENV.ownerOpenId))).auth.me();
    const adminMe = await appRouter.createCaller(context(user("different-admin", "admin"))).auth.me();
    expect(ownerMe?.isOwner).toBe(true);
    expect(adminMe?.isOwner).toBe(false);
  });
  it("allows the configured owner to list and publish", async () => {
    const caller = appRouter.createCaller(context(user(ENV.ownerOpenId)));
    await expect(caller.admin.articles()).resolves.toEqual([]);
    const saved = await caller.admin.saveArticle(input);
    expect(saved.id).toBe(99);
    expect(dbMocks.createArticle).toHaveBeenCalledWith(expect.objectContaining({ published: true, content: input.content }));
  });
  it("allows the owner to inspect, refine, and publish a queued signal", async () => {
    dbMocks.listEditorialQueue.mockResolvedValue([queueItem]);
    const caller = appRouter.createCaller(context(user(ENV.ownerOpenId)));
    await expect(caller.admin.reviewQueue({ status: "new", limit: 10, offset: 0 })).resolves.toEqual([queueItem]);
    const refined = await caller.admin.refineReviewItem({ id: queueItem.id, mode: "summary" });
    expect(refined?.aiSummary).toBe("A clearer sourced summary.");
    expect(dbMocks.updateEditorialItem).toHaveBeenCalledWith(queueItem.id, expect.objectContaining({ aiSummary: "A clearer sourced summary.", status: "ready", modelUsed: "gpt-5-mini" }));
    const published = await caller.admin.publishReviewItem({ id: queueItem.id, slug: "a-sourced-ai-story", title: "A sourced AI story", excerpt: "A sourced excerpt with enough editorial context.", content: "<p>Hamispro editorial draft.</p>", category: "news", tags: "ai,news", featured: false, seriesKey: null });
    expect(published.id).toBe(99);
    expect(dbMocks.createArticle).toHaveBeenCalledWith(expect.objectContaining({ published: true, category: "news" }));
    expect(dbMocks.updateEditorialItem).toHaveBeenCalledWith(queueItem.id, expect.objectContaining({ status: "published", linkedArticleId: 99 }));
  });
  it("passes the selected analytics range through and exports it as CSV", async () => {
    const metrics = { totalPageviews: 18, uniqueSessions: 7, totalSearches: 3, totalNewsletterSignups: 2, estimatedRevenueCents: 125, browsers: [{ label: "Chrome", value: 5 }], devices: [{ label: "Desktop", value: 6 }], topPaths: [{ label: "/ai-guides", value: 9 }] };
    dbMocks.getDashboardMetrics.mockResolvedValue(metrics);
    const caller = appRouter.createCaller(context(user(ENV.ownerOpenId)));
    await expect(caller.admin.dashboardMetrics({ days: 7 })).resolves.toEqual(metrics);
    const csv = await caller.admin.dashboardMetricsCsv({ days: 7 });
    expect(csv).toContain("Date range (days),7");
    expect(csv).toContain("Total Pageviews,18");
    expect(csv).toContain("Estimated Revenue ($),1.25");
    expect(dbMocks.getDashboardMetrics).toHaveBeenNthCalledWith(1, 7);
    expect(dbMocks.getDashboardMetrics).toHaveBeenNthCalledWith(2, 7);
  });
  it("denies a different user even when their role is admin", async () => {
    const caller = appRouter.createCaller(context(user("different-admin", "admin")));
    await expect(caller.admin.articles()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.saveArticle(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.reviewQueue({ status: "new", limit: 10, offset: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.refineReviewItem({ id: 7, mode: "summary" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
