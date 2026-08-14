import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function context(user: TrpcContext["user"] = null): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] };
}

describe("public content", () => {
  it("returns a curated list of published articles", async () => {
    const result = await appRouter.createCaller(context()).content.list({});
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("title");
    expect(result[0]).toHaveProperty("tags");
  });

  it("returns the article detail by slug", async () => {
    const result = await appRouter.createCaller(context()).content.bySlug({ slug: "the-quiet-ai-workflow-that-saves-hours-every-week" });
    expect(result.title).toContain("AI workflow");
    expect(result.readingTimeMinutes).toBeGreaterThan(0);
  });

  it("normalizes newsletter emails and preserves the lead magnet", async () => {
    const result = await appRouter.createCaller(context()).newsletter.subscribe({ email: "Reader@Example.com", source: "test" });
    expect(result.email).toBe("reader@example.com");
    expect(result.leadMagnet).toBe("Ultimate Prompt Cheatsheet");
  });
});

describe("admin access", () => {
  it("rejects anonymous access to the editorial desk", async () => {
    await expect(appRouter.createCaller(context()).admin.articles()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
