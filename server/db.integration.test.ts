import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { adminRateLimitBuckets, articles, newsletterSubscribers } from "../drizzle/schema";

const runDbTests = Boolean(process.env.TEST_DATABASE_URL);
if (runDbTests) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const testEmail = `integration-${Date.now()}@example.test`;
const testSlug = `integration-series-${Date.now()}`;
const testRateKey = `integration-rate-${Date.now()}`;

describe.skipIf(!runDbTests)("database persistence integration", () => {
  let db: any;
  let dbHelpers: typeof import("./db");

  beforeAll(async () => {
    dbHelpers = await import("./db");
    db = await dbHelpers.getDb();
    if (!db) throw new Error("TEST_DATABASE_URL did not produce a database connection");
  });

  afterAll(async () => {
    await db.delete(newsletterSubscribers).where(eq(newsletterSubscribers.email, testEmail));
    await db.delete(articles).where(eq(articles.slug, testSlug));
    await db.delete(adminRateLimitBuckets).where(eq(adminRateLimitBuckets.key, testRateKey));
  });

  it("persists and updates digest preferences by opaque token", async () => {
    const subscribed = await dbHelpers.subscribeEmail(testEmail, "integration-test");
    expect(subscribed.preferenceToken).toBeTruthy();
    const initial = await dbHelpers.getDigestPreferencesByToken(subscribed.preferenceToken);
    expect(initial?.email).toBe(testEmail);
    const updated = await dbHelpers.updateDigestPreferencesByToken(subscribed.preferenceToken, { topics: ["news", "prompts"], frequency: "daily", timezone: "Africa/Lagos" });
    expect(updated.updated).toBe(true);
    const persisted = await dbHelpers.getDigestPreferencesByToken(subscribed.preferenceToken);
    expect(persisted?.topics).toEqual(["news", "prompts"]);
    expect(persisted?.frequency).toBe("daily");
    expect(persisted?.timezone).toBe("Africa/Lagos");
  });

  it("suppresses a repeated durable rate-limit request", async () => {
    const first = await dbHelpers.consumeAdminRateLimit(testRateKey, { limit: 1, windowMs: 60_000 });
    const second = await dbHelpers.consumeAdminRateLimit(testRateKey, { limit: 1, windowMs: 60_000 });
    expect(first).toMatchObject({ allowed: true, durable: true });
    expect(second).toMatchObject({ allowed: false, durable: true });
  });

  it("persists recurring-series metadata through article create, update, and read", async () => {
    await dbHelpers.createArticle({ slug: testSlug, title: "Integration series article", excerpt: "A persistence test article with enough content.", content: "<p>Test content</p>", category: "news", seriesKey: "five-minute-ai-brief", published: true, publishedAt: new Date() });
    const created = await dbHelpers.getArticleBySlug(testSlug);
    expect(created?.seriesKey).toBe("five-minute-ai-brief");
    await dbHelpers.updateArticle(created!.id, { seriesKey: "prompt-clinic" });
    const updated = await dbHelpers.getArticleBySlug(testSlug);
    expect(updated?.seriesKey).toBe("prompt-clinic");
  });
});
