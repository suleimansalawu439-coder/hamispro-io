import { describe, expect, it, vi } from "vitest";

vi.stubEnv("DATABASE_URL", "");
import { getDigestPreferencesByToken, listDigestCandidates, subscribeEmail } from "./db";

describe("digest helper behavior", () => {
  it("provides a portable fallback subscription shape with digest defaults", async () => {
    const result = await subscribeEmail("reader@example.com", "test");
    expect(result.leadMagnet).toBe("Ultimate Prompt Cheatsheet");
    expect(result.topics).toContain("news");
    expect(result.frequency).toBe("weekly");
    expect(result.preferenceToken.length).toBeGreaterThan(20);
  });
  it("returns null for an unknown preference token without a database", async () => {
    await expect(getDigestPreferencesByToken("missing-token-12345678901234567890")).resolves.toBeNull();
  });
  it("selects the recurring news series from the real seed helper path", async () => {
    const results = await listDigestCandidates(["news"], new Date("2026-01-01T00:00:00Z"));
    expect(results.some(article => article.seriesKey === "five-minute-ai-brief")).toBe(true);
  });
});
