import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  subscribeEmail: vi.fn().mockResolvedValue({ email: "reader@example.com", preferenceToken: "token-12345678901234567890", topics: ["hacks", "news"], frequency: "weekly", timezone: "UTC" }),
  getDigestPreferencesByToken: vi.fn().mockResolvedValue({ email: "reader@example.com", topics: ["hacks", "news"], frequency: "weekly", timezone: "UTC", unsubscribedAt: null }),
  updateDigestPreferencesByToken: vi.fn().mockResolvedValue({ topics: ["prompts"], frequency: "daily", timezone: "Africa/Lagos", updated: true }),
  seriesLabels: { "five-minute-ai-brief": "The 5-Minute AI Brief", "prompt-clinic": "Prompt Clinic", "workflow-autopsy": "Workflow Autopsy", "free-tool-friday": "Free Tool Friday" },
  listPublicArticles: vi.fn(),
  getArticleBySlug: vi.fn(),
  listAllArticles: vi.fn(),
  listResources: vi.fn(),
  createArticle: vi.fn(),
  updateArticle: vi.fn(),
}));
vi.mock("./db", () => mocks);

import { appRouter } from "./routers";

const publicContext = { user: null, req: { protocol: "https", headers: {} } as any, res: { clearCookie: () => undefined } as any };

describe("personalized digest", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns a preference token and initial editorial topics on signup", async () => {
    const result = await appRouter.createCaller(publicContext).newsletter.subscribe({ email: "reader@example.com", source: "homepage" });
    expect(result.preferenceToken).toBe("token-12345678901234567890");
    expect(result.topics).toContain("news");
  });
  it("loads preferences through an opaque token", async () => {
    const result = await appRouter.createCaller(publicContext).newsletter.preferences({ token: "token-12345678901234567890" });
    expect(result.email).toBe("reader@example.com");
    expect(result.topics).toEqual(["hacks", "news"]);
  });
  it("persists topic, frequency, and timezone changes", async () => {
    const result = await appRouter.createCaller(publicContext).newsletter.updatePreferences({ token: "token-12345678901234567890", topics: ["prompts"], frequency: "daily", timezone: "Africa/Lagos" });
    expect(result.updated).toBe(true);
    expect(mocks.updateDigestPreferencesByToken).toHaveBeenCalledWith("token-12345678901234567890", { topics: ["prompts"], frequency: "daily", timezone: "Africa/Lagos" });
  });
  it("exposes recurring series labels through the public contract", async () => {
    const result = await appRouter.createCaller(publicContext).newsletter.series();
    expect(result["five-minute-ai-brief"]).toBe("The 5-Minute AI Brief");
  });
});
