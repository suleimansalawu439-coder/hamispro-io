import { and, desc, eq, gte, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { adminAuditLogs, adminRateLimitBuckets, articles, InsertArticle, newsletterSubscribers, resources, users, InsertUser, Article, Resource, editorialSources, editorialItems, ingestionRuns, EditorialItem, InsertEditorialItem, InsertEditorialSource, analyticsEvents, adPlacements, systemSettings } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { aggregateAdEventMetrics, attachAdEventMetrics } from "./adminOperationsMetrics";
import { getDateRangeThreshold, DateRangeDays } from "./analyticsExtensions";
import sanitizeHtml from "sanitize-html";
import { nanoid } from "nanoid";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const client = postgres(process.env.DATABASE_URL, { prepare: false });
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

type AppDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined || user.openId === ENV.ownerOpenId) {
    values.role = user.role ?? "admin";
    updateSet.role = values.role;
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function consumeAdminRateLimit(key: string, config: { limit: number; windowMs: number }) {
  const db = await getDb();
  if (!db) return { allowed: true, durable: false, retryAfterSeconds: 0 };
  const now = Date.now();
  const resetBefore = now - config.windowMs;
  await db.insert(adminRateLimitBuckets).values({ key, windowStartedAt: now, count: 1 }).onConflictDoUpdate({ target: adminRateLimitBuckets.key, set: {
    windowStartedAt: sql`IF(${adminRateLimitBuckets.windowStartedAt} < ${resetBefore}, ${now}, ${adminRateLimitBuckets.windowStartedAt})`,
    count: sql`IF(${adminRateLimitBuckets.windowStartedAt} < ${resetBefore}, 1, ${adminRateLimitBuckets.count} + 1)`,
  } });
  const rows = await db.select().from(adminRateLimitBuckets).where(eq(adminRateLimitBuckets.key, key)).limit(1);
  const bucket = rows[0];
  if (!bucket) return { allowed: true, durable: true, retryAfterSeconds: 0 };
  const allowed = bucket.count <= config.limit;
  return { allowed, durable: true, retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((config.windowMs - (now - bucket.windowStartedAt)) / 1000)) };
}

export async function insertAdminAuditLog(input: { actorOpenId: string; actorUserId: number; action: string; resourceType: string; resourceId?: number | null; metadata?: string | null; ipAddress?: string | null; userAgent?: string | null }) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(adminAuditLogs).values(input);
  return true;
}

export async function listAdminAuditLogs(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(Math.min(limit, 200));
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

const seedArticles: Article[] = [
  {
    id: 1,
    slug: "the-quiet-ai-workflow-that-saves-hours-every-week",
    title: "The quiet AI workflow that saves hours every week",
    excerpt: "A practical system for turning messy research into clear, reusable work with less tab-hopping and more signal.",
    content: "## The three-pass workflow\n\nMost AI workflows fail because the prompt is asked to do too much at once. Use three short passes instead.\n\n### 1. Collect\n\nPaste the raw material into a capture prompt and ask for claims, unknowns, and source links.\n\n### 2. Shape\n\nTurn the capture into a structured brief.\n\n### 3. Ship\n\nAsk for a final output using the brief as the only source of truth.\n\nPrompt template:\n\nYou are an editorial researcher. Extract claims, open questions, and links from the material below. Return JSON with keys: claims, questions, sources.",
    category: "hacks",
    seriesKey: "workflow-autopsy",
    authorName: "Hamispro Editorial",
    coverImageUrl: null,
    coverImageKey: null,
    tags: "workflow,prompts,productivity",
    seoTitle: null,
    seoDescription: null,
    readingTimeMinutes: 7,
    featured: true,
    published: true,
    publishedAt: new Date("2026-08-08T09:00:00Z"),
    createdAt: new Date("2026-08-08T09:00:00Z"),
    updatedAt: new Date("2026-08-08T09:00:00Z"),
  },
  {
    id: 2,
    slug: "the-prompt-debugging-checklist",
    title: "The prompt-debugging checklist",
    excerpt: "When an AI answer feels almost right, diagnose the prompt instead of rewriting it from scratch.",
    content: ["## Prompt quality is observable", "", "Use this checklist before adding more words: context, constraints, examples, format, and evaluation.", "", "### A compact diagnostic", "", "const prompt = { context: 'Who is this for?', task: 'What should happen?', constraints: ['length', 'tone', 'sources'], format: 'What should the answer look like?' };", "", "The fastest improvement usually comes from specifying the output shape."].join("\n"),
    category: "prompts",
    seriesKey: "prompt-clinic",
    authorName: "Hamispro Labs",
    coverImageUrl: null,
    coverImageKey: null,
    tags: "prompting,debugging,templates",
    seoTitle: null,
    seoDescription: null,
    readingTimeMinutes: 5,
    featured: false,
    published: true,
    publishedAt: new Date("2026-08-06T09:00:00Z"),
    createdAt: new Date("2026-08-06T09:00:00Z"),
    updatedAt: new Date("2026-08-06T09:00:00Z"),
  },
  {
    id: 3,
    slug: "seven-free-ai-tools-worth-bookmarking",
    title: "Seven free AI tools worth bookmarking",
    excerpt: "A tested starter set for research, writing, design, coding, and automation without a paid seat.",
    content: "## A small vault beats a crowded toolbox\n\nThese tools are useful because each one has a clear job. Start with one workflow and add only what removes a real bottleneck.",
    category: "freebies",
    seriesKey: "free-tool-friday",
    authorName: "Hamispro Editorial",
    coverImageUrl: null,
    coverImageKey: null,
    tags: "freebies,tools,resources",
    seoTitle: null,
    seoDescription: null,
    readingTimeMinutes: 6,
    featured: false,
    published: true,
    publishedAt: new Date("2026-08-04T09:00:00Z"),
    createdAt: new Date("2026-08-04T09:00:00Z"),
    updatedAt: new Date("2026-08-04T09:00:00Z"),
  },
  {
    id: 4,
    slug: "build-a-personal-ai-research-desk",
    title: "Build a personal AI research desk",
    excerpt: "A tutorial for turning your browser, notes, and favorite model into a calmer research environment.",
    content: "## Start with the information loop\n\nYour research desk needs capture, retrieval, synthesis, and publishing. This guide maps each stage to a simple tool and a repeatable prompt.",
    category: "tutorials",
    seriesKey: null,
    authorName: "Hamispro Labs",
    coverImageUrl: null,
    coverImageKey: null,
    tags: "tutorial,automation,research",
    seoTitle: null,
    seoDescription: null,
    readingTimeMinutes: 11,
    featured: false,
    published: true,
    publishedAt: new Date("2026-08-01T09:00:00Z"),
    createdAt: new Date("2026-08-01T09:00:00Z"),
    updatedAt: new Date("2026-08-01T09:00:00Z"),
  },
  {
    id: 5,
    slug: "why-small-models-are-having-a-big-week",
    title: "Why small models are having a big week",
    excerpt: "What efficient models mean for local workflows, private data, and the next generation of AI products.",
    content: "## Efficiency is becoming a product feature\n\nSmaller models are making AI more portable, cheaper to run, and easier to adapt to a focused job.",
    category: "news",
    seriesKey: "five-minute-ai-brief",
    authorName: "Hamispro Newsroom",
    coverImageUrl: null,
    coverImageKey: null,
    tags: "news,models,industry",
    seoTitle: null,
    seoDescription: null,
    readingTimeMinutes: 4,
    featured: false,
    published: true,
    publishedAt: new Date("2026-07-30T09:00:00Z"),
    createdAt: new Date("2026-07-30T09:00:00Z"),
    updatedAt: new Date("2026-07-30T09:00:00Z"),
  },
];

const seedResources: Resource[] = [
  { id: 1, slug: "hugging-face", name: "Hugging Face", description: "Open model hub, datasets, demos, and spaces for experimenting with modern AI.", resourceType: "model", url: "https://huggingface.co", priceLabel: "Free tier", tags: "models,open-source", featured: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 2, slug: "ollama", name: "Ollama", description: "Run a growing library of open models locally with a simple developer workflow.", resourceType: "tool", url: "https://ollama.com", priceLabel: "Free", tags: "local,developer", featured: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 3, slug: "prompt-library-starter", name: "Prompt Library Starter", description: "A clean, reusable prompt-library structure for teams and solo creators.", resourceType: "template", url: "#", priceLabel: "Free download", tags: "prompts,templates", featured: true, createdAt: new Date(), updatedAt: new Date() },
  { id: 4, slug: "google-ai-studio", name: "Google AI Studio", description: "A generous playground for prototyping with Gemini models and structured outputs.", resourceType: "offer", url: "https://aistudio.google.com", priceLabel: "Free access", tags: "gemini,prototyping", featured: false, createdAt: new Date(), updatedAt: new Date() },
];

function normalizeArticle(article: Article) {
  return { ...article, tags: article.tags ? article.tags.split(",").map(tag => tag.trim()).filter(Boolean) : [] };
}

function sanitizeArticleContent(content: string) {
  if (!content.trim().startsWith("<")) return content;
  return sanitizeHtml(content, { allowedTags: ["p", "br", "strong", "em", "h2", "h3", "ul", "ol", "li", "blockquote", "pre", "code", "a", "hr"], allowedAttributes: { a: ["href", "target", "rel"], code: ["class"] }, allowedSchemes: ["http", "https", "mailto"] });
}

function normalizeResource(resource: Resource) {
  return { ...resource, tags: resource.tags ? resource.tags.split(",").map(tag => tag.trim()).filter(Boolean) : [] };
}

export async function listPublicArticles(category?: Article["category"], search?: string) {
  const db = await getDb();
  if (!db) return seedArticles.filter(article => article.published && (!category || article.category === category) && (!search || `${article.title} ${article.excerpt}`.toLowerCase().includes(search.toLowerCase()))).map(normalizeArticle);
  const filters = [eq(articles.published, true)];
  if (category) filters.push(eq(articles.category, category));
  if (search) filters.push(or(like(articles.title, `%${search}%`), like(articles.excerpt, `%${search}%`))!);
  const rows = await db.select().from(articles).where(and(...filters)).orderBy(desc(articles.publishedAt));
  return (rows.length ? rows : seedArticles).map(normalizeArticle);
}

export async function getArticleBySlug(slug: string) {
  const db = await getDb();
  if (!db) {
    const found = seedArticles.find(article => article.slug === slug && article.published);
    return found ? normalizeArticle(found) : null;
  }
  const rows = await db.select().from(articles).where(and(eq(articles.slug, slug), eq(articles.published, true))).limit(1);
  const article = rows[0];
  return article ? normalizeArticle(article) : (seedArticles.find(item => item.slug === slug) ? normalizeArticle(seedArticles.find(item => item.slug === slug)!) : null);
}

export async function listResources(search?: string, resourceType?: Resource["resourceType"]) {
  const db = await getDb();
  if (!db) return seedResources.filter(item => (!resourceType || item.resourceType === resourceType) && (!search || `${item.name} ${item.description} ${item.tags}`.toLowerCase().includes(search.toLowerCase()))).map(normalizeResource);
  const filters = [];
  if (resourceType) filters.push(eq(resources.resourceType, resourceType));
  if (search) filters.push(or(like(resources.name, `%${search}%`), like(resources.description, `%${search}%`))!);
  const rows = await db.select().from(resources).where(filters.length ? and(...filters) : undefined).orderBy(desc(resources.featured), desc(resources.createdAt));
  return (rows.length ? rows : seedResources).map(normalizeResource);
}

export async function listAllArticles() {
  const db = await getDb();
  if (!db) return seedArticles.map(normalizeArticle);
  const rows = await db.select().from(articles).orderBy(desc(articles.updatedAt));
  return (rows.length ? rows : seedArticles).map(normalizeArticle);
}

export async function createArticle(input: InsertArticle) {
  const safeInput = { ...input, content: sanitizeArticleContent(input.content) };
  const db = await getDb();
  if (!db) return { ...safeInput, id: Math.floor(Math.random() * 100000), createdAt: new Date(), updatedAt: new Date() };
  const result = await db.insert(articles).values(safeInput).returning({ id: articles.id });
  const id = result[0].id;
  const rows = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  return rows[0];
}

export async function updateArticle(id: number, input: Partial<InsertArticle>) {
  const safeInput = { ...input, ...(input.content !== undefined ? { content: sanitizeArticleContent(input.content) } : {}) };
  const db = await getDb();
  if (!db) return { id, ...safeInput, updatedAt: new Date() };
  await db.update(articles).set(safeInput).where(eq(articles.id, id));
  const rows = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  return rows[0];
}

export const seriesLabels = {
  "five-minute-ai-brief": "The 5-Minute AI Brief",
  "prompt-clinic": "Prompt Clinic",
  "workflow-autopsy": "Workflow Autopsy",
  "free-tool-friday": "Free Tool Friday",
} as const;

export async function subscribeEmail(email: string, source = "homepage") {
  const preferenceToken = nanoid(32);
  const db = await getDb();
  if (!db) return { email, leadMagnet: "Ultimate Prompt Cheatsheet", source, confirmed: false, preferenceToken, topics: ["hacks", "prompts", "freebies", "tutorials", "news"], frequency: "weekly" as const, timezone: "UTC" };
  await db.insert(newsletterSubscribers).values({ email, source, preferenceToken }).onConflictDoUpdate({ target: newsletterSubscribers.email, set: { source, unsubscribedAt: null } });
  const rows = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, email)).limit(1);
  const subscriber = rows[0];
  return { email, leadMagnet: "Ultimate Prompt Cheatsheet", source, confirmed: subscriber?.confirmed ?? false, preferenceToken: subscriber?.preferenceToken || preferenceToken, topics: subscriber?.topics.split(",").filter(Boolean) || ["hacks", "prompts", "freebies", "tutorials", "news"], frequency: subscriber?.frequency || "weekly", timezone: subscriber?.timezone || "UTC" };
}

export async function getDigestPreferencesByToken(preferenceToken: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.preferenceToken, preferenceToken)).limit(1);
  const subscriber = rows[0];
  return subscriber ? { email: subscriber.email, topics: subscriber.topics.split(",").map(topic => topic.trim()).filter(Boolean), frequency: subscriber.frequency, timezone: subscriber.timezone, unsubscribedAt: subscriber.unsubscribedAt } : null;
}

export async function updateDigestPreferencesByToken(preferenceToken: string, input: { topics: string[]; frequency: "weekly" | "daily"; timezone: string }) {
  const topics = input.topics.join(",");
  const db = await getDb();
  if (!db) return { topics: input.topics, frequency: input.frequency, timezone: input.timezone, updated: false };
  const result = await db.update(newsletterSubscribers).set({ topics, frequency: input.frequency, timezone: input.timezone, unsubscribedAt: null }).where(eq(newsletterSubscribers.preferenceToken, preferenceToken));
  return { topics: input.topics, frequency: input.frequency, timezone: input.timezone, updated: result.length > 0 };
}

export async function listDigestCandidates(topics: string[], since: Date) {
  const publicArticles = await listPublicArticles();
  const selected = new Set(topics);
  return publicArticles.filter(article => selected.has(article.category) && article.publishedAt && new Date(article.publishedAt) >= since).slice(0, 8);
}

export async function listDueDigestSubscribers(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(newsletterSubscribers).where(isNull(newsletterSubscribers.unsubscribedAt)).limit(limit);
  const now = Date.now();
  return rows.filter(row => {
    if (!row.lastDigestSentAt) return true;
    const intervalMs = row.frequency === "daily" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    return now - new Date(row.lastDigestSentAt).getTime() >= intervalMs;
  });
}

export async function markDigestSent(email: string, sentAt = new Date()) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(newsletterSubscribers).set({ lastDigestSentAt: sentAt }).where(eq(newsletterSubscribers.email, email));
  return result.length > 0;
}

export async function listEditorialSources(enabledOnly = false) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(editorialSources).where(enabledOnly ? eq(editorialSources.enabled, true) : undefined).orderBy(editorialSources.name);
}

export async function upsertEditorialSource(input: InsertEditorialSource) {
  const db = await getDb();
  if (!db) return { ...input, id: 0, createdAt: new Date(), updatedAt: new Date() };
  await db.insert(editorialSources).values(input).onConflictDoUpdate({ target: editorialSources.feedUrl, set: {
    name: input.name,
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl,
    domain: input.domain,
    defaultCategory: input.defaultCategory,
    reliabilityScore: input.reliabilityScore,
    enabled: input.enabled,
  } });
  const rows = await db.select().from(editorialSources).where(eq(editorialSources.feedUrl, input.feedUrl)).limit(1);
  return rows[0];
}

export async function markEditorialSourceFetched(sourceId: number, input: { fetchedAt?: Date; error?: string | null }) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(editorialSources).set({ lastFetchedAt: input.fetchedAt ?? new Date(), lastError: input.error ?? null }).where(eq(editorialSources.id, sourceId));
  return result.length > 0;
}

export async function createIngestionRun(runType: string) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(ingestionRuns).values({ runType, status: "running" }).returning({ id: ingestionRuns.id });
  return result[0].id;
}

export async function finishIngestionRun(id: number, input: { status: "completed" | "failed"; sourceCount: number; fetchedCount: number; insertedCount: number; enrichedCount: number; errorMessage?: string | null }) {
  const db = await getDb();
  if (!db || !id) return false;
  const result = await db.update(ingestionRuns).set({ ...input, finishedAt: new Date() }).where(eq(ingestionRuns.id, id));
  return result.length > 0;
}

export async function listIngestionRuns(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(Math.min(limit, 100));
}

export async function upsertEditorialItem(input: InsertEditorialItem) {
  const db = await getDb();
  if (!db) return { ...input, id: 0, createdAt: new Date(), updatedAt: new Date() };
  await db.insert(editorialItems).values(input).onConflictDoUpdate({ target: editorialItems.dedupeHash, set: {
    sourceId: input.sourceId,
    externalId: input.externalId,
    canonicalUrl: input.canonicalUrl,
    title: input.title,
    excerpt: input.excerpt,
    author: input.author,
    sourceName: input.sourceName,
    itemType: input.itemType,
    category: input.category,
    publishedAt: input.publishedAt,
    rawPayload: input.rawPayload,
    ...(input.freshnessScore !== undefined ? { freshnessScore: input.freshnessScore } : {}),
    ...(input.verificationStatus !== undefined ? { verificationStatus: input.verificationStatus } : {}),
    ...(input.clusterKey !== undefined ? { clusterKey: input.clusterKey } : {}),
    ...(input.claimWarnings !== undefined ? { claimWarnings: input.claimWarnings } : {}),
    ...(input.importanceScore !== undefined ? { importanceScore: input.importanceScore } : {}),
    ...(input.usefulnessScore !== undefined ? { usefulnessScore: input.usefulnessScore } : {}),
    ...(input.noveltyScore !== undefined ? { noveltyScore: input.noveltyScore } : {}),
    ...(input.confidenceScore !== undefined ? { confidenceScore: input.confidenceScore } : {}),
    ...(input.aiSummary !== undefined ? { aiSummary: input.aiSummary } : {}),
    ...(input.suggestedAngle !== undefined ? { suggestedAngle: input.suggestedAngle } : {}),
    ...(input.keyTakeaways !== undefined ? { keyTakeaways: input.keyTakeaways } : {}),
    ...(input.suggestedTags !== undefined ? { suggestedTags: input.suggestedTags } : {}),
    ...(input.modelUsed !== undefined ? { modelUsed: input.modelUsed } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  } });
  const rows = await db.select().from(editorialItems).where(eq(editorialItems.dedupeHash, input.dedupeHash)).limit(1);
  return rows[0];
}

export async function listEditorialQueue(input: { status?: EditorialItem["status"]; limit?: number; offset?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const filters = input.status ? [eq(editorialItems.status, input.status)] : [];
  return db.select().from(editorialItems)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(editorialItems.importanceScore), desc(editorialItems.discoveredAt))
    .limit(Math.min(input.limit ?? 50, 100))
    .offset(input.offset ?? 0);
}

export async function getEditorialItemById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(editorialItems).where(eq(editorialItems.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateEditorialItem(id: number, input: Partial<InsertEditorialItem>) {
  const db = await getDb();
  if (!db) return { id, ...input, updatedAt: new Date() };
  await db.update(editorialItems).set(input).where(eq(editorialItems.id, id));
  return getEditorialItemById(id);
}

export async function trackAnalyticsEvent(input: { eventType: string; path: string; sessionId: string; userId?: number; referrer?: string; browser?: string; device?: string; ipAddress?: string; metadata?: string }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(analyticsEvents).values(input);
}

export async function getDashboardMetrics(days?: DateRangeDays) {
  return getDashboardMetricsFromDb(await getDb(), days);
}

export async function getDashboardMetricsFromDb(db: AppDb | null, days?: DateRangeDays) {
  if (!db) return { totalUsers: 0, totalArticles: 0, totalSubscribers: 0, totalPageviews: 0, uniqueSessions: 0, totalAdViews: 0, totalAdClicks: 0, totalArticleReads: 0, totalSearches: 0, totalNewsletterSignups: 0, estimatedRevenueCents: 0, daily: [] };
  const rangeStart = days ? getDateRangeThreshold(days) : undefined;
  const timeFilter = rangeStart ? gte(analyticsEvents.createdAt, rangeStart) : undefined;
  const [userRows, articleRows, subscriberRows, pageviewRows, sessionRows, adViewRows, adClickRows, articleReadRows, searchRows, signupRows, ads, browserRows, deviceRows, pathRows, eventRows, dailyRows] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(users),
    db.select({ count: sql<number>`count(*)` }).from(articles),
    db.select({ count: sql<number>`count(*)` }).from(newsletterSubscribers),
    db.select({ count: sql<number>`count(*)` }).from(analyticsEvents).where(timeFilter ? and(eq(analyticsEvents.eventType, "pageview"), timeFilter) : eq(analyticsEvents.eventType, "pageview")),
    db.select({ count: sql<number>`count(distinct ${analyticsEvents.sessionId})` }).from(analyticsEvents).where(timeFilter),
    db.select({ count: sql<number>`count(*)` }).from(analyticsEvents).where(timeFilter ? and(eq(analyticsEvents.eventType, "ad_view"), timeFilter) : eq(analyticsEvents.eventType, "ad_view")),
    db.select({ count: sql<number>`count(*)` }).from(analyticsEvents).where(timeFilter ? and(eq(analyticsEvents.eventType, "ad_click"), timeFilter) : eq(analyticsEvents.eventType, "ad_click")),
    db.select({ count: sql<number>`count(*)` }).from(analyticsEvents).where(timeFilter ? and(eq(analyticsEvents.eventType, "article_read"), timeFilter) : eq(analyticsEvents.eventType, "article_read")),
    db.select({ count: sql<number>`count(*)` }).from(analyticsEvents).where(timeFilter ? and(eq(analyticsEvents.eventType, "search"), timeFilter) : eq(analyticsEvents.eventType, "search")),
    db.select({ count: sql<number>`count(*)` }).from(analyticsEvents).where(timeFilter ? and(eq(analyticsEvents.eventType, "newsletter_signup"), timeFilter) : eq(analyticsEvents.eventType, "newsletter_signup")),
    db.select().from(adPlacements),
    db.select({ browser: analyticsEvents.browser, count: sql<number>`count(*)` }).from(analyticsEvents).where(timeFilter ? and(isNotNull(analyticsEvents.browser), timeFilter) : isNotNull(analyticsEvents.browser)).groupBy(analyticsEvents.browser).orderBy(desc(sql`count(*)`)).limit(6),
    db.select({ device: analyticsEvents.device, count: sql<number>`count(*)` }).from(analyticsEvents).where(timeFilter ? and(isNotNull(analyticsEvents.device), timeFilter) : isNotNull(analyticsEvents.device)).groupBy(analyticsEvents.device).orderBy(desc(sql`count(*)`)).limit(6),
    db.select({ path: analyticsEvents.path, count: sql<number>`count(*)` }).from(analyticsEvents).where(timeFilter).groupBy(analyticsEvents.path).orderBy(desc(sql`count(*)`)).limit(8),
    db.select({ eventType: analyticsEvents.eventType, count: sql<number>`count(*)` }).from(analyticsEvents).where(timeFilter).groupBy(analyticsEvents.eventType).orderBy(desc(sql`count(*)`)).limit(12),
    db.select({ day: sql<string>`DATE(${analyticsEvents.createdAt})`, eventType: analyticsEvents.eventType, count: sql<number>`count(*)` }).from(analyticsEvents).where(timeFilter || gte(analyticsEvents.createdAt, new Date(Date.now() - 13 * 24 * 60 * 60 * 1000))).groupBy(sql`DATE(${analyticsEvents.createdAt})`, analyticsEvents.eventType).orderBy(sql`DATE(${analyticsEvents.createdAt})`),
  ]);
  const userCount = userRows[0];
  const articleCount = articleRows[0];
  const subscriberCount = subscriberRows[0];
  const pageviewCount = pageviewRows[0];
  const sessionCount = sessionRows[0];
  const adViewCount = adViewRows[0];
  const adClickCount = adClickRows[0];
  const articleReadCount = articleReadRows[0];
  const searchCount = searchRows[0];
  const signupCount = signupRows[0];
  const dailyMap = new Map<string, { date: string; pageviews: number; reads: number; adViews: number; adClicks: number }>();
  for (const row of dailyRows) {
    const day = dailyMap.get(row.day) || { date: row.day, pageviews: 0, reads: 0, adViews: 0, adClicks: 0 };
    if (row.eventType === "pageview") day.pageviews = Number(row.count);
    if (row.eventType === "article_read") day.reads = Number(row.count);
    if (row.eventType === "ad_view") day.adViews = Number(row.count);
    if (row.eventType === "ad_click") day.adClicks = Number(row.count);
    dailyMap.set(row.day, day);
  }
  return { totalUsers: Number(userCount?.count ?? 0), totalArticles: Number(articleCount?.count ?? 0), totalSubscribers: Number(subscriberCount?.count ?? 0), totalPageviews: Number(pageviewCount?.count ?? 0), uniqueSessions: Number(sessionCount?.count ?? 0), totalAdViews: Number(adViewCount?.count ?? 0), totalAdClicks: Number(adClickCount?.count ?? 0), totalArticleReads: Number(articleReadCount?.count ?? 0), totalSearches: Number(searchCount?.count ?? 0), totalNewsletterSignups: Number(signupCount?.count ?? 0), estimatedRevenueCents: ads.reduce((acc, ad) => acc + ad.estimatedRevenueCents, 0), daily: Array.from(dailyMap.values()), browsers: browserRows.map(row => ({ label: row.browser || "Unknown", value: Number(row.count) })), devices: deviceRows.map(row => ({ label: row.device || "Unknown", value: Number(row.count) })), topPaths: pathRows.map(row => ({ label: row.path, value: Number(row.count) })), events: eventRows.map(row => ({ label: row.eventType, value: Number(row.count) })) };
}

export async function listAdPlacements() {
  const db = await getDb();
  if (!db) return [];
  let placements = await db.select().from(adPlacements);
  if (!placements.length) {
    const defaults = [
      { slotKey: "header-leaderboard", name: "Header leaderboard", adType: "adsense" as const, enabled: false },
      { slotKey: "article-in-content", name: "Article in-content", adType: "adsense" as const, enabled: false },
      { slotKey: "article-rectangle", name: "Article sidebar rectangle", adType: "adsense" as const, enabled: false },
      { slotKey: "footer-anchor", name: "Footer anchor", adType: "adsense" as const, enabled: false },
    ];
    await db.insert(adPlacements).values(defaults);
    placements = await db.select().from(adPlacements);
  }
  const adEvents = await db.select({ eventType: analyticsEvents.eventType, metadata: analyticsEvents.metadata }).from(analyticsEvents).where(sql`${analyticsEvents.eventType} in ('ad_view', 'ad_click')`);
  return attachAdEventMetrics(placements, aggregateAdEventMetrics(adEvents));
}

export async function updateAdPlacement(slotKey: string, input: Partial<typeof adPlacements.$inferInsert>) {
  const db = await getDb();
  if (!db) return null;
  await db.update(adPlacements).set(input).where(eq(adPlacements.slotKey, slotKey));
  const rows = await db.select().from(adPlacements).where(eq(adPlacements.slotKey, slotKey)).limit(1);
  return rows[0] ?? null;
}

export const DEFAULT_SYSTEM_SETTINGS = [
  { key: "publication.defaultTimeZone", value: "UTC" },
  { key: "analytics.retentionDays", value: "30" },
  { key: "editorial.minimumConfidence", value: "70" },
  { key: "owner.theme", value: "light" },
  { key: "owner.accentColor", value: "#d6ff56" },
] as const;

export function mergeSystemSettings(stored: Array<{ key: string; value: string }>) {
  const storedKeys = new Set(stored.map(setting => setting.key));
  return [...DEFAULT_SYSTEM_SETTINGS.filter(setting => !storedKeys.has(setting.key)), ...stored];
}

export async function listSystemSettingsFromDb(db: AppDb | null) {
  if (!db) return [...DEFAULT_SYSTEM_SETTINGS];
  return mergeSystemSettings(await db.select().from(systemSettings));
}

export async function listSystemSettings(dbOverride?: AppDb | null) {
  return listSystemSettingsFromDb(dbOverride === undefined ? await getDb() : dbOverride);
}

export async function setSystemSettingWithDb(db: AppDb | null, key: string, value: string) {
  if (!db) return;
  await db.insert(systemSettings).values({ key, value }).onConflictDoUpdate({ target: systemSettings.key, set: { value } });
}

export async function setSystemSetting(key: string, value: string, dbOverride?: AppDb | null) {
  return setSystemSettingWithDb(dbOverride === undefined ? await getDb() : dbOverride, key, value);
}

export async function getLaunchReadiness() {
  const db = await getDb();
  const [sourceCount] = db ? await db.select({ count: sql<number>`count(*)` }).from(editorialSources) : [{ count: 0 }];
  const checks = [
    { key: "database", label: "Database connection", ready: Boolean(db), detail: db ? "Connected to the configured database." : "DATABASE_URL is missing or unavailable." },
    { key: "owner", label: "Owner authorization", ready: Boolean(ENV.ownerOpenId), detail: ENV.ownerOpenId ? "Strict owner-openId gate is configured." : "OWNER_OPEN_ID is missing." },
    { key: "r2", label: "Cloudflare R2 media", ready: Boolean(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME && process.env.R2_PUBLIC_BASE_URL), detail: "Configuration check only; upload a real cover image to verify production serving." },
    { key: "adsense", label: "AdSense configuration", ready: Boolean(process.env.VITE_ADSENSE_CLIENT_ID), detail: process.env.VITE_ADSENSE_CLIENT_ID ? "Client ID is configured." : "Add the AdSense client ID and slot IDs before enabling placements." },
    { key: "analytics", label: "Analytics event store", ready: Boolean(db), detail: "Pageviews, reads, searches, signups, ad views, and ad clicks use the analytics_events table." },
    { key: "sources", label: "Editorial source registry", ready: Number(sourceCount?.count ?? 0) > 0, detail: `${Number(sourceCount?.count ?? 0)} source(s) registered.` },
  ];
  return { ready: checks.every(check => check.ready), checks };
}
