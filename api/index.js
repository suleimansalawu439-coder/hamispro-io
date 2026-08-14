// server/_core/app.ts
import "dotenv/config";
import express2 from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var OAUTH_STATE_COOKIE = "__Host-oauth_state";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// server/_core/oauth.ts
import { parse as parseCookieHeader2 } from "cookie";

// server/db.ts
import { and, desc, eq, gte, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// drizzle/schema.ts
import { bigint, integer, pgEnum, pgTable, text, timestamp, varchar, boolean, index, serial } from "drizzle-orm/pg-core";
var roleEnum = pgEnum("role", ["user", "admin"]);
var categoryEnum = pgEnum("category", ["hacks", "prompts", "freebies", "tutorials", "news"]);
var resourceTypeEnum = pgEnum("resourceType", ["tool", "model", "template", "offer"]);
var frequencyEnum = pgEnum("frequency", ["weekly", "daily"]);
var sourceTypeEnum = pgEnum("sourceType", ["rss", "atom", "release", "api"]);
var itemTypeEnum = pgEnum("itemType", ["news", "tutorial", "hack", "cheat", "freebie", "tool", "release"]);
var statusEnum = pgEnum("status", ["new", "processing", "ready", "rejected", "published"]);
var verificationStatusEnum = pgEnum("verificationStatus", ["unverified", "verified", "needs_review"]);
var runStatusEnum = pgEnum("run_status", ["running", "completed", "failed"]);
var adTypeEnum = pgEnum("adType", ["adsense", "sponsor", "banner"]);
var freebieHealthStatusEnum = pgEnum("freebieHealthStatus", ["active", "expired", "degraded", "unchecked"]);
var newsletterEditionStatusEnum = pgEnum("newsletterEditionStatus", ["draft", "review", "approved", "sent"]);
var severityEnum = pgEnum("severity", ["info", "warning", "critical"]);
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => /* @__PURE__ */ new Date()).notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 180 }).notNull().unique(),
  title: varchar("title", { length: 240 }).notNull(),
  excerpt: text("excerpt").notNull(),
  content: text("content").notNull(),
  category: categoryEnum("category").notNull(),
  seriesKey: varchar("seriesKey", { length: 80 }),
  authorName: varchar("authorName", { length: 120 }).default("Hamispro Editorial").notNull(),
  coverImageUrl: text("coverImageUrl"),
  coverImageKey: varchar("coverImageKey", { length: 500 }),
  tags: text("tags"),
  seoTitle: varchar("seoTitle", { length: 240 }),
  seoDescription: text("seoDescription"),
  readingTimeMinutes: integer("readingTimeMinutes").default(5).notNull(),
  featured: boolean("featured").default(false).notNull(),
  published: boolean("published").default(false).notNull(),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => /* @__PURE__ */ new Date()).notNull()
}, (table) => ({
  categoryIdx: index("articles_category_idx").on(table.category),
  publishedIdx: index("articles_published_idx").on(table.published, table.publishedAt)
}));
var resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 180 }).notNull().unique(),
  name: varchar("name", { length: 180 }).notNull(),
  description: text("description").notNull(),
  resourceType: resourceTypeEnum("resourceType").notNull(),
  url: text("url").notNull(),
  priceLabel: varchar("priceLabel", { length: 100 }).default("Free").notNull(),
  tags: text("tags"),
  featured: boolean("featured").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => /* @__PURE__ */ new Date()).notNull()
}, (table) => ({
  resourceTypeIdx: index("resources_type_idx").on(table.resourceType)
}));
var newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  leadMagnet: varchar("leadMagnet", { length: 180 }).default("Ultimate Prompt Cheatsheet").notNull(),
  source: varchar("source", { length: 120 }).default("homepage").notNull(),
  confirmed: boolean("confirmed").default(false).notNull(),
  topics: varchar("topics", { length: 500 }).default("hacks,prompts,freebies,tutorials,news").notNull(),
  frequency: frequencyEnum("frequency").default("weekly").notNull(),
  timezone: varchar("timezone", { length: 80 }).default("UTC").notNull(),
  preferenceToken: varchar("preferenceToken", { length: 64 }).unique(),
  unsubscribedAt: timestamp("unsubscribedAt"),
  lastDigestSentAt: timestamp("lastDigestSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var adminRateLimitBuckets = pgTable("admin_rate_limit_buckets", {
  key: varchar("key", { length: 191 }).primaryKey(),
  windowStartedAt: bigint("windowStartedAt", { mode: "number" }).notNull(),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => /* @__PURE__ */ new Date()).notNull()
});
var adminAuditLogs = pgTable("admin_audit_logs", {
  id: serial("id").primaryKey(),
  actorOpenId: varchar("actorOpenId", { length: 64 }).notNull(),
  actorUserId: integer("actorUserId").notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  resourceType: varchar("resourceType", { length: 80 }).notNull(),
  resourceId: integer("resourceId"),
  metadata: text("metadata"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: varchar("userAgent", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => ({
  actorCreatedIdx: index("admin_audit_actor_created_idx").on(table.actorOpenId, table.createdAt),
  actionCreatedIdx: index("admin_audit_action_created_idx").on(table.action, table.createdAt)
}));
var editorialSources = pgTable("editorial_sources", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  sourceType: sourceTypeEnum("sourceType").notNull(),
  feedUrl: varchar("feedUrl", { length: 500 }).notNull().unique(),
  sourceUrl: varchar("sourceUrl", { length: 500 }).notNull(),
  domain: varchar("domain", { length: 180 }).notNull(),
  defaultCategory: categoryEnum("defaultCategory").default("news").notNull(),
  reliabilityScore: integer("reliabilityScore").default(80).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  lastFetchedAt: timestamp("lastFetchedAt"),
  lastError: text("lastError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => /* @__PURE__ */ new Date()).notNull()
}, (table) => ({
  enabledIdx: index("editorial_sources_enabled_idx").on(table.enabled)
}));
var editorialItems = pgTable("editorial_items", {
  id: serial("id").primaryKey(),
  sourceId: integer("sourceId").notNull(),
  externalId: varchar("externalId", { length: 500 }).notNull(),
  canonicalUrl: text("canonicalUrl").notNull(),
  dedupeHash: varchar("dedupeHash", { length: 64 }).notNull().unique(),
  title: varchar("title", { length: 500 }).notNull(),
  excerpt: text("excerpt").notNull(),
  author: varchar("author", { length: 240 }),
  sourceName: varchar("sourceName", { length: 160 }).notNull(),
  itemType: itemTypeEnum("itemType").default("news").notNull(),
  category: categoryEnum("category").default("news").notNull(),
  publishedAt: timestamp("publishedAt"),
  discoveredAt: timestamp("discoveredAt").defaultNow().notNull(),
  status: statusEnum("status").default("new").notNull(),
  importanceScore: integer("importanceScore").default(0).notNull(),
  usefulnessScore: integer("usefulnessScore").default(0).notNull(),
  noveltyScore: integer("noveltyScore").default(0).notNull(),
  confidenceScore: integer("confidenceScore").default(0).notNull(),
  freshnessScore: integer("freshnessScore").default(0).notNull(),
  verificationStatus: verificationStatusEnum("verificationStatus").default("unverified").notNull(),
  clusterKey: varchar("clusterKey", { length: 120 }),
  claimWarnings: text("claimWarnings"),
  aiSummary: text("aiSummary"),
  keyTakeaways: text("keyTakeaways"),
  suggestedAngle: text("suggestedAngle"),
  suggestedTitle: varchar("suggestedTitle", { length: 240 }),
  suggestedTags: varchar("suggestedTags", { length: 500 }),
  modelUsed: varchar("modelUsed", { length: 120 }),
  rawPayload: text("rawPayload"),
  reviewerNotes: text("reviewerNotes"),
  linkedArticleId: integer("linkedArticleId"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => /* @__PURE__ */ new Date()).notNull()
}, (table) => ({
  queueIdx: index("editorial_items_queue_idx").on(table.status, table.importanceScore, table.discoveredAt),
  sourcePublishedIdx: index("editorial_items_source_published_idx").on(table.sourceId, table.publishedAt)
}));
var ingestionRuns = pgTable("ingestion_runs", {
  id: serial("id").primaryKey(),
  runType: varchar("runType", { length: 80 }).notNull(),
  status: runStatusEnum("status").notNull(),
  sourceCount: integer("sourceCount").default(0).notNull(),
  fetchedCount: integer("fetchedCount").default(0).notNull(),
  insertedCount: integer("insertedCount").default(0).notNull(),
  enrichedCount: integer("enrichedCount").default(0).notNull(),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt")
});
var mediaAssets = pgTable("media_assets", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 500 }).notNull().unique(),
  url: text("url").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: integer("sizeBytes").notNull(),
  uploadedBy: integer("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var analyticsEvents = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  // pageview, ad_view, ad_click, search, newsletter_signup, article_read
  path: varchar("path", { length: 255 }).notNull(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  userId: integer("userId"),
  referrer: varchar("referrer", { length: 500 }),
  browser: varchar("browser", { length: 120 }),
  device: varchar("device", { length: 80 }),
  ipAddress: varchar("ipAddress", { length: 64 }),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull()
}, (table) => ({
  eventCreatedIdx: index("analytics_event_created_idx").on(table.eventType, table.createdAt),
  pathIdx: index("analytics_path_idx").on(table.path)
}));
var adPlacements = pgTable("ad_placements", {
  id: serial("id").primaryKey(),
  slotKey: varchar("slotKey", { length: 120 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  adType: adTypeEnum("adType").default("adsense").notNull(),
  adsenseClient: varchar("adsenseClient", { length: 120 }),
  adsenseSlot: varchar("adsenseSlot", { length: 120 }),
  customHtml: text("customHtml"),
  enabled: boolean("enabled").default(true).notNull(),
  impressions: integer("impressions").default(0).notNull(),
  clicks: integer("clicks").default(0).notNull(),
  estimatedRevenueCents: integer("estimatedRevenueCents").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => /* @__PURE__ */ new Date()).notNull()
});
var systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 120 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => /* @__PURE__ */ new Date()).notNull()
});
var freebieHealth = pgTable("freebie_health", {
  id: serial("id").primaryKey(),
  resourceId: integer("resourceId").notNull().unique(),
  status: freebieHealthStatusEnum("status").default("unchecked").notNull(),
  lastCheckedAt: timestamp("lastCheckedAt"),
  statusCode: integer("statusCode"),
  responseTimeMs: integer("responseTimeMs"),
  errorSummary: text("errorSummary"),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => /* @__PURE__ */ new Date()).notNull()
});
var newsletterEditions = pgTable("newsletter_editions", {
  id: serial("id").primaryKey(),
  editionNumber: integer("editionNumber").notNull().unique(),
  title: varchar("title", { length: 240 }).notNull(),
  subject: varchar("subject", { length: 240 }).notNull(),
  contentHtml: text("contentHtml").notNull(),
  status: newsletterEditionStatusEnum("status").default("draft").notNull(),
  scheduledFor: timestamp("scheduledFor"),
  sentAt: timestamp("sentAt"),
  recipientCount: integer("recipientCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => /* @__PURE__ */ new Date()).notNull()
});
var operationalIncidents = pgTable("operational_incidents", {
  id: serial("id").primaryKey(),
  component: varchar("component", { length: 120 }).notNull(),
  severity: severityEnum("severity").default("warning").notNull(),
  summary: varchar("summary", { length: 255 }).notNull(),
  details: text("details"),
  resolved: boolean("resolved").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt")
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/adminOperationsMetrics.ts
function aggregateAdEventMetrics(events) {
  const counters = /* @__PURE__ */ new Map();
  for (const event of events) {
    let placement = "unknown";
    try {
      placement = event.metadata ? JSON.parse(event.metadata).placement || placement : placement;
    } catch {
    }
    const counter = counters.get(placement) || { impressions: 0, clicks: 0 };
    if (event.eventType === "ad_view") counter.impressions += 1;
    if (event.eventType === "ad_click") counter.clicks += 1;
    counters.set(placement, counter);
  }
  return counters;
}
function attachAdEventMetrics(placements, counters) {
  return placements.map((placement) => ({
    ...placement,
    eventDerivedImpressions: counters.get(placement.slotKey)?.impressions || 0,
    eventDerivedClicks: counters.get(placement.slotKey)?.clicks || 0,
    reportedRevenueCents: placement.estimatedRevenueCents
  }));
}

// server/analyticsExtensions.ts
function getDateRangeThreshold(days) {
  const date = /* @__PURE__ */ new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}
function csvCell(value) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
function generateAnalyticsCsv(metrics) {
  const rows = [
    ["Metric", "Value"],
    ["Date range (days)", String(metrics.rangeDays || "all")],
    ["Total Pageviews", String(metrics.totalPageviews || 0)],
    ["Unique Sessions", String(metrics.uniqueSessions || 0)],
    ["Searches", String(metrics.totalSearches || 0)],
    ["Newsletter Signups", String(metrics.totalNewsletterSignups || 0)],
    ["Estimated Revenue ($)", ((metrics.estimatedRevenueCents || 0) / 100).toFixed(2)],
    [],
    ["Dimension", "Label", "Count"],
    ...(metrics.browsers || []).map((b) => ["Browser", b.label, String(b.value)]),
    ...(metrics.devices || []).map((d) => ["Device", d.label, String(d.value)]),
    ...(metrics.topPaths || []).map((p) => ["Top Path", p.label, String(p.value)])
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

// server/db.ts
import sanitizeHtml from "sanitize-html";
import { nanoid } from "nanoid";
var _db = null;
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values = { openId: user.openId };
  const updateSet = {};
  const textFields = ["name", "email", "loginMethod"];
  for (const field of textFields) {
    if (user[field] !== void 0) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== void 0) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== void 0 || user.openId === ENV.ownerOpenId) {
    values.role = user.role ?? "admin";
    updateSet.role = values.role;
  }
  if (!values.lastSignedIn) values.lastSignedIn = /* @__PURE__ */ new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = /* @__PURE__ */ new Date();
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}
async function consumeAdminRateLimit(key, config) {
  const db = await getDb();
  if (!db) return { allowed: true, durable: false, retryAfterSeconds: 0 };
  const now = Date.now();
  const resetBefore = now - config.windowMs;
  await db.insert(adminRateLimitBuckets).values({ key, windowStartedAt: now, count: 1 }).onConflictDoUpdate({ target: adminRateLimitBuckets.key, set: {
    windowStartedAt: sql`IF(${adminRateLimitBuckets.windowStartedAt} < ${resetBefore}, ${now}, ${adminRateLimitBuckets.windowStartedAt})`,
    count: sql`IF(${adminRateLimitBuckets.windowStartedAt} < ${resetBefore}, 1, ${adminRateLimitBuckets.count} + 1)`
  } });
  const rows = await db.select().from(adminRateLimitBuckets).where(eq(adminRateLimitBuckets.key, key)).limit(1);
  const bucket = rows[0];
  if (!bucket) return { allowed: true, durable: true, retryAfterSeconds: 0 };
  const allowed = bucket.count <= config.limit;
  return { allowed, durable: true, retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((config.windowMs - (now - bucket.windowStartedAt)) / 1e3)) };
}
async function insertAdminAuditLog(input) {
  const db = await getDb();
  if (!db) return false;
  await db.insert(adminAuditLogs).values(input);
  return true;
}
async function listAdminAuditLogs(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.createdAt)).limit(Math.min(limit, 200));
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}
var seedArticles = [
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
    publishedAt: /* @__PURE__ */ new Date("2026-08-08T09:00:00Z"),
    createdAt: /* @__PURE__ */ new Date("2026-08-08T09:00:00Z"),
    updatedAt: /* @__PURE__ */ new Date("2026-08-08T09:00:00Z")
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
    publishedAt: /* @__PURE__ */ new Date("2026-08-06T09:00:00Z"),
    createdAt: /* @__PURE__ */ new Date("2026-08-06T09:00:00Z"),
    updatedAt: /* @__PURE__ */ new Date("2026-08-06T09:00:00Z")
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
    publishedAt: /* @__PURE__ */ new Date("2026-08-04T09:00:00Z"),
    createdAt: /* @__PURE__ */ new Date("2026-08-04T09:00:00Z"),
    updatedAt: /* @__PURE__ */ new Date("2026-08-04T09:00:00Z")
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
    publishedAt: /* @__PURE__ */ new Date("2026-08-01T09:00:00Z"),
    createdAt: /* @__PURE__ */ new Date("2026-08-01T09:00:00Z"),
    updatedAt: /* @__PURE__ */ new Date("2026-08-01T09:00:00Z")
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
    publishedAt: /* @__PURE__ */ new Date("2026-07-30T09:00:00Z"),
    createdAt: /* @__PURE__ */ new Date("2026-07-30T09:00:00Z"),
    updatedAt: /* @__PURE__ */ new Date("2026-07-30T09:00:00Z")
  }
];
var seedResources = [
  { id: 1, slug: "hugging-face", name: "Hugging Face", description: "Open model hub, datasets, demos, and spaces for experimenting with modern AI.", resourceType: "model", url: "https://huggingface.co", priceLabel: "Free tier", tags: "models,open-source", featured: true, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() },
  { id: 2, slug: "ollama", name: "Ollama", description: "Run a growing library of open models locally with a simple developer workflow.", resourceType: "tool", url: "https://ollama.com", priceLabel: "Free", tags: "local,developer", featured: true, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() },
  { id: 3, slug: "prompt-library-starter", name: "Prompt Library Starter", description: "A clean, reusable prompt-library structure for teams and solo creators.", resourceType: "template", url: "#", priceLabel: "Free download", tags: "prompts,templates", featured: true, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() },
  { id: 4, slug: "google-ai-studio", name: "Google AI Studio", description: "A generous playground for prototyping with Gemini models and structured outputs.", resourceType: "offer", url: "https://aistudio.google.com", priceLabel: "Free access", tags: "gemini,prototyping", featured: false, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }
];
function normalizeArticle(article) {
  return { ...article, tags: article.tags ? article.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [] };
}
function sanitizeArticleContent(content) {
  if (!content.trim().startsWith("<")) return content;
  return sanitizeHtml(content, { allowedTags: ["p", "br", "strong", "em", "h2", "h3", "ul", "ol", "li", "blockquote", "pre", "code", "a", "hr"], allowedAttributes: { a: ["href", "target", "rel"], code: ["class"] }, allowedSchemes: ["http", "https", "mailto"] });
}
function normalizeResource(resource) {
  return { ...resource, tags: resource.tags ? resource.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [] };
}
async function listPublicArticles(category, search) {
  const db = await getDb();
  if (!db) return seedArticles.filter((article) => article.published && (!category || article.category === category) && (!search || `${article.title} ${article.excerpt}`.toLowerCase().includes(search.toLowerCase()))).map(normalizeArticle);
  const filters = [eq(articles.published, true)];
  if (category) filters.push(eq(articles.category, category));
  if (search) filters.push(or(like(articles.title, `%${search}%`), like(articles.excerpt, `%${search}%`)));
  const rows = await db.select().from(articles).where(and(...filters)).orderBy(desc(articles.publishedAt));
  return (rows.length ? rows : seedArticles).map(normalizeArticle);
}
async function getArticleBySlug(slug) {
  const db = await getDb();
  if (!db) {
    const found = seedArticles.find((article2) => article2.slug === slug && article2.published);
    return found ? normalizeArticle(found) : null;
  }
  const rows = await db.select().from(articles).where(and(eq(articles.slug, slug), eq(articles.published, true))).limit(1);
  const article = rows[0];
  return article ? normalizeArticle(article) : seedArticles.find((item) => item.slug === slug) ? normalizeArticle(seedArticles.find((item) => item.slug === slug)) : null;
}
async function listResources(search, resourceType) {
  const db = await getDb();
  if (!db) return seedResources.filter((item) => (!resourceType || item.resourceType === resourceType) && (!search || `${item.name} ${item.description} ${item.tags}`.toLowerCase().includes(search.toLowerCase()))).map(normalizeResource);
  const filters = [];
  if (resourceType) filters.push(eq(resources.resourceType, resourceType));
  if (search) filters.push(or(like(resources.name, `%${search}%`), like(resources.description, `%${search}%`)));
  const rows = await db.select().from(resources).where(filters.length ? and(...filters) : void 0).orderBy(desc(resources.featured), desc(resources.createdAt));
  return (rows.length ? rows : seedResources).map(normalizeResource);
}
async function listAllArticles() {
  const db = await getDb();
  if (!db) return seedArticles.map(normalizeArticle);
  const rows = await db.select().from(articles).orderBy(desc(articles.updatedAt));
  return (rows.length ? rows : seedArticles).map(normalizeArticle);
}
async function createArticle(input) {
  const safeInput = { ...input, content: sanitizeArticleContent(input.content) };
  const db = await getDb();
  if (!db) return { ...safeInput, id: Math.floor(Math.random() * 1e5), createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() };
  const result = await db.insert(articles).values(safeInput).returning({ id: articles.id });
  const id = result[0].id;
  const rows = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  return rows[0];
}
async function updateArticle(id, input) {
  const safeInput = { ...input, ...input.content !== void 0 ? { content: sanitizeArticleContent(input.content) } : {} };
  const db = await getDb();
  if (!db) return { id, ...safeInput, updatedAt: /* @__PURE__ */ new Date() };
  await db.update(articles).set(safeInput).where(eq(articles.id, id));
  const rows = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  return rows[0];
}
var seriesLabels = {
  "five-minute-ai-brief": "The 5-Minute AI Brief",
  "prompt-clinic": "Prompt Clinic",
  "workflow-autopsy": "Workflow Autopsy",
  "free-tool-friday": "Free Tool Friday"
};
async function subscribeEmail(email, source = "homepage") {
  const preferenceToken = nanoid(32);
  const db = await getDb();
  if (!db) return { email, leadMagnet: "Ultimate Prompt Cheatsheet", source, confirmed: false, preferenceToken, topics: ["hacks", "prompts", "freebies", "tutorials", "news"], frequency: "weekly", timezone: "UTC" };
  await db.insert(newsletterSubscribers).values({ email, source, preferenceToken }).onConflictDoUpdate({ target: newsletterSubscribers.email, set: { source, unsubscribedAt: null } });
  const rows = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.email, email)).limit(1);
  const subscriber = rows[0];
  return { email, leadMagnet: "Ultimate Prompt Cheatsheet", source, confirmed: subscriber?.confirmed ?? false, preferenceToken: subscriber?.preferenceToken || preferenceToken, topics: subscriber?.topics.split(",").filter(Boolean) || ["hacks", "prompts", "freebies", "tutorials", "news"], frequency: subscriber?.frequency || "weekly", timezone: subscriber?.timezone || "UTC" };
}
async function getDigestPreferencesByToken(preferenceToken) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.preferenceToken, preferenceToken)).limit(1);
  const subscriber = rows[0];
  return subscriber ? { email: subscriber.email, topics: subscriber.topics.split(",").map((topic) => topic.trim()).filter(Boolean), frequency: subscriber.frequency, timezone: subscriber.timezone, unsubscribedAt: subscriber.unsubscribedAt } : null;
}
async function updateDigestPreferencesByToken(preferenceToken, input) {
  const topics = input.topics.join(",");
  const db = await getDb();
  if (!db) return { topics: input.topics, frequency: input.frequency, timezone: input.timezone, updated: false };
  const result = await db.update(newsletterSubscribers).set({ topics, frequency: input.frequency, timezone: input.timezone, unsubscribedAt: null }).where(eq(newsletterSubscribers.preferenceToken, preferenceToken));
  return { topics: input.topics, frequency: input.frequency, timezone: input.timezone, updated: result.length > 0 };
}
async function listDigestCandidates(topics, since) {
  const publicArticles = await listPublicArticles();
  const selected = new Set(topics);
  return publicArticles.filter((article) => selected.has(article.category) && article.publishedAt && new Date(article.publishedAt) >= since).slice(0, 8);
}
async function listDueDigestSubscribers(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(newsletterSubscribers).where(isNull(newsletterSubscribers.unsubscribedAt)).limit(limit);
  const now = Date.now();
  return rows.filter((row) => {
    if (!row.lastDigestSentAt) return true;
    const intervalMs = row.frequency === "daily" ? 24 * 60 * 60 * 1e3 : 7 * 24 * 60 * 60 * 1e3;
    return now - new Date(row.lastDigestSentAt).getTime() >= intervalMs;
  });
}
async function markDigestSent(email, sentAt = /* @__PURE__ */ new Date()) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(newsletterSubscribers).set({ lastDigestSentAt: sentAt }).where(eq(newsletterSubscribers.email, email));
  return result.length > 0;
}
async function listEditorialSources(enabledOnly = false) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(editorialSources).where(enabledOnly ? eq(editorialSources.enabled, true) : void 0).orderBy(editorialSources.name);
}
async function upsertEditorialSource(input) {
  const db = await getDb();
  if (!db) return { ...input, id: 0, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() };
  await db.insert(editorialSources).values(input).onConflictDoUpdate({ target: editorialSources.feedUrl, set: {
    name: input.name,
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl,
    domain: input.domain,
    defaultCategory: input.defaultCategory,
    reliabilityScore: input.reliabilityScore,
    enabled: input.enabled
  } });
  const rows = await db.select().from(editorialSources).where(eq(editorialSources.feedUrl, input.feedUrl)).limit(1);
  return rows[0];
}
async function markEditorialSourceFetched(sourceId, input) {
  const db = await getDb();
  if (!db) return false;
  const result = await db.update(editorialSources).set({ lastFetchedAt: input.fetchedAt ?? /* @__PURE__ */ new Date(), lastError: input.error ?? null }).where(eq(editorialSources.id, sourceId));
  return result.length > 0;
}
async function createIngestionRun(runType) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.insert(ingestionRuns).values({ runType, status: "running" }).returning({ id: ingestionRuns.id });
  return result[0].id;
}
async function finishIngestionRun(id, input) {
  const db = await getDb();
  if (!db || !id) return false;
  const result = await db.update(ingestionRuns).set({ ...input, finishedAt: /* @__PURE__ */ new Date() }).where(eq(ingestionRuns.id, id));
  return result.length > 0;
}
async function listIngestionRuns(limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(Math.min(limit, 100));
}
async function upsertEditorialItem(input) {
  const db = await getDb();
  if (!db) return { ...input, id: 0, createdAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() };
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
    ...input.freshnessScore !== void 0 ? { freshnessScore: input.freshnessScore } : {},
    ...input.verificationStatus !== void 0 ? { verificationStatus: input.verificationStatus } : {},
    ...input.clusterKey !== void 0 ? { clusterKey: input.clusterKey } : {},
    ...input.claimWarnings !== void 0 ? { claimWarnings: input.claimWarnings } : {},
    ...input.importanceScore !== void 0 ? { importanceScore: input.importanceScore } : {},
    ...input.usefulnessScore !== void 0 ? { usefulnessScore: input.usefulnessScore } : {},
    ...input.noveltyScore !== void 0 ? { noveltyScore: input.noveltyScore } : {},
    ...input.confidenceScore !== void 0 ? { confidenceScore: input.confidenceScore } : {},
    ...input.aiSummary !== void 0 ? { aiSummary: input.aiSummary } : {},
    ...input.suggestedAngle !== void 0 ? { suggestedAngle: input.suggestedAngle } : {},
    ...input.keyTakeaways !== void 0 ? { keyTakeaways: input.keyTakeaways } : {},
    ...input.suggestedTags !== void 0 ? { suggestedTags: input.suggestedTags } : {},
    ...input.modelUsed !== void 0 ? { modelUsed: input.modelUsed } : {},
    ...input.status !== void 0 ? { status: input.status } : {}
  } });
  const rows = await db.select().from(editorialItems).where(eq(editorialItems.dedupeHash, input.dedupeHash)).limit(1);
  return rows[0];
}
async function listEditorialQueue(input = {}) {
  const db = await getDb();
  if (!db) return [];
  const filters = input.status ? [eq(editorialItems.status, input.status)] : [];
  return db.select().from(editorialItems).where(filters.length ? and(...filters) : void 0).orderBy(desc(editorialItems.importanceScore), desc(editorialItems.discoveredAt)).limit(Math.min(input.limit ?? 50, 100)).offset(input.offset ?? 0);
}
async function getEditorialItemById(id) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(editorialItems).where(eq(editorialItems.id, id)).limit(1);
  return rows[0] ?? null;
}
async function updateEditorialItem(id, input) {
  const db = await getDb();
  if (!db) return { id, ...input, updatedAt: /* @__PURE__ */ new Date() };
  await db.update(editorialItems).set(input).where(eq(editorialItems.id, id));
  return getEditorialItemById(id);
}
async function trackAnalyticsEvent(input) {
  const db = await getDb();
  if (!db) return;
  await db.insert(analyticsEvents).values(input);
}
async function getDashboardMetrics(days) {
  return getDashboardMetricsFromDb(await getDb(), days);
}
async function getDashboardMetricsFromDb(db, days) {
  if (!db) return { totalUsers: 0, totalArticles: 0, totalSubscribers: 0, totalPageviews: 0, uniqueSessions: 0, totalAdViews: 0, totalAdClicks: 0, totalArticleReads: 0, totalSearches: 0, totalNewsletterSignups: 0, estimatedRevenueCents: 0, daily: [] };
  const rangeStart = days ? getDateRangeThreshold(days) : void 0;
  const timeFilter = rangeStart ? gte(analyticsEvents.createdAt, rangeStart) : void 0;
  const [userRows, articleRows, subscriberRows, pageviewRows, sessionRows, adViewRows, adClickRows, articleReadRows, searchRows, signupRows, ads, browserRows, deviceRows, pathRows, eventRows, dailyRows] = await Promise.all([
    db.select({ count: sql`count(*)` }).from(users),
    db.select({ count: sql`count(*)` }).from(articles),
    db.select({ count: sql`count(*)` }).from(newsletterSubscribers),
    db.select({ count: sql`count(*)` }).from(analyticsEvents).where(timeFilter ? and(eq(analyticsEvents.eventType, "pageview"), timeFilter) : eq(analyticsEvents.eventType, "pageview")),
    db.select({ count: sql`count(distinct ${analyticsEvents.sessionId})` }).from(analyticsEvents).where(timeFilter),
    db.select({ count: sql`count(*)` }).from(analyticsEvents).where(timeFilter ? and(eq(analyticsEvents.eventType, "ad_view"), timeFilter) : eq(analyticsEvents.eventType, "ad_view")),
    db.select({ count: sql`count(*)` }).from(analyticsEvents).where(timeFilter ? and(eq(analyticsEvents.eventType, "ad_click"), timeFilter) : eq(analyticsEvents.eventType, "ad_click")),
    db.select({ count: sql`count(*)` }).from(analyticsEvents).where(timeFilter ? and(eq(analyticsEvents.eventType, "article_read"), timeFilter) : eq(analyticsEvents.eventType, "article_read")),
    db.select({ count: sql`count(*)` }).from(analyticsEvents).where(timeFilter ? and(eq(analyticsEvents.eventType, "search"), timeFilter) : eq(analyticsEvents.eventType, "search")),
    db.select({ count: sql`count(*)` }).from(analyticsEvents).where(timeFilter ? and(eq(analyticsEvents.eventType, "newsletter_signup"), timeFilter) : eq(analyticsEvents.eventType, "newsletter_signup")),
    db.select().from(adPlacements),
    db.select({ browser: analyticsEvents.browser, count: sql`count(*)` }).from(analyticsEvents).where(timeFilter ? and(isNotNull(analyticsEvents.browser), timeFilter) : isNotNull(analyticsEvents.browser)).groupBy(analyticsEvents.browser).orderBy(desc(sql`count(*)`)).limit(6),
    db.select({ device: analyticsEvents.device, count: sql`count(*)` }).from(analyticsEvents).where(timeFilter ? and(isNotNull(analyticsEvents.device), timeFilter) : isNotNull(analyticsEvents.device)).groupBy(analyticsEvents.device).orderBy(desc(sql`count(*)`)).limit(6),
    db.select({ path: analyticsEvents.path, count: sql`count(*)` }).from(analyticsEvents).where(timeFilter).groupBy(analyticsEvents.path).orderBy(desc(sql`count(*)`)).limit(8),
    db.select({ eventType: analyticsEvents.eventType, count: sql`count(*)` }).from(analyticsEvents).where(timeFilter).groupBy(analyticsEvents.eventType).orderBy(desc(sql`count(*)`)).limit(12),
    db.select({ day: sql`DATE(${analyticsEvents.createdAt})`, eventType: analyticsEvents.eventType, count: sql`count(*)` }).from(analyticsEvents).where(timeFilter || gte(analyticsEvents.createdAt, new Date(Date.now() - 13 * 24 * 60 * 60 * 1e3))).groupBy(sql`DATE(${analyticsEvents.createdAt})`, analyticsEvents.eventType).orderBy(sql`DATE(${analyticsEvents.createdAt})`)
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
  const dailyMap = /* @__PURE__ */ new Map();
  for (const row of dailyRows) {
    const day = dailyMap.get(row.day) || { date: row.day, pageviews: 0, reads: 0, adViews: 0, adClicks: 0 };
    if (row.eventType === "pageview") day.pageviews = Number(row.count);
    if (row.eventType === "article_read") day.reads = Number(row.count);
    if (row.eventType === "ad_view") day.adViews = Number(row.count);
    if (row.eventType === "ad_click") day.adClicks = Number(row.count);
    dailyMap.set(row.day, day);
  }
  return { totalUsers: Number(userCount?.count ?? 0), totalArticles: Number(articleCount?.count ?? 0), totalSubscribers: Number(subscriberCount?.count ?? 0), totalPageviews: Number(pageviewCount?.count ?? 0), uniqueSessions: Number(sessionCount?.count ?? 0), totalAdViews: Number(adViewCount?.count ?? 0), totalAdClicks: Number(adClickCount?.count ?? 0), totalArticleReads: Number(articleReadCount?.count ?? 0), totalSearches: Number(searchCount?.count ?? 0), totalNewsletterSignups: Number(signupCount?.count ?? 0), estimatedRevenueCents: ads.reduce((acc, ad) => acc + ad.estimatedRevenueCents, 0), daily: Array.from(dailyMap.values()), browsers: browserRows.map((row) => ({ label: row.browser || "Unknown", value: Number(row.count) })), devices: deviceRows.map((row) => ({ label: row.device || "Unknown", value: Number(row.count) })), topPaths: pathRows.map((row) => ({ label: row.path, value: Number(row.count) })), events: eventRows.map((row) => ({ label: row.eventType, value: Number(row.count) })) };
}
async function listAdPlacements() {
  const db = await getDb();
  if (!db) return [];
  let placements = await db.select().from(adPlacements);
  if (!placements.length) {
    const defaults = [
      { slotKey: "header-leaderboard", name: "Header leaderboard", adType: "adsense", enabled: false },
      { slotKey: "article-in-content", name: "Article in-content", adType: "adsense", enabled: false },
      { slotKey: "article-rectangle", name: "Article sidebar rectangle", adType: "adsense", enabled: false },
      { slotKey: "footer-anchor", name: "Footer anchor", adType: "adsense", enabled: false }
    ];
    await db.insert(adPlacements).values(defaults);
    placements = await db.select().from(adPlacements);
  }
  const adEvents = await db.select({ eventType: analyticsEvents.eventType, metadata: analyticsEvents.metadata }).from(analyticsEvents).where(sql`${analyticsEvents.eventType} in ('ad_view', 'ad_click')`);
  return attachAdEventMetrics(placements, aggregateAdEventMetrics(adEvents));
}
async function updateAdPlacement(slotKey, input) {
  const db = await getDb();
  if (!db) return null;
  await db.update(adPlacements).set(input).where(eq(adPlacements.slotKey, slotKey));
  const rows = await db.select().from(adPlacements).where(eq(adPlacements.slotKey, slotKey)).limit(1);
  return rows[0] ?? null;
}
var DEFAULT_SYSTEM_SETTINGS = [
  { key: "site.faviconUrl", value: "/favicon.svg" },
  { key: "site.ogImageUrl", value: "/og-image.svg" },
  { key: "publication.defaultTimeZone", value: "UTC" },
  { key: "analytics.retentionDays", value: "30" },
  { key: "editorial.minimumConfidence", value: "70" },
  { key: "owner.theme", value: "dark" },
  { key: "owner.accentColor", value: "#d6ff56" }
];
function mergeSystemSettings(stored) {
  const storedKeys = new Set(stored.map((setting) => setting.key));
  return [...DEFAULT_SYSTEM_SETTINGS.filter((setting) => !storedKeys.has(setting.key)), ...stored];
}
async function listSystemSettingsFromDb(db) {
  if (!db) return [...DEFAULT_SYSTEM_SETTINGS];
  return mergeSystemSettings(await db.select().from(systemSettings));
}
async function listSystemSettings(dbOverride) {
  return listSystemSettingsFromDb(dbOverride === void 0 ? await getDb() : dbOverride);
}
async function setSystemSettingWithDb(db, key, value) {
  if (!db) return;
  await db.insert(systemSettings).values({ key, value }).onConflictDoUpdate({ target: systemSettings.key, set: { value } });
}
async function setSystemSetting(key, value, dbOverride) {
  return setSystemSettingWithDb(dbOverride === void 0 ? await getDb() : dbOverride, key, value);
}
async function getLaunchReadiness() {
  const db = await getDb();
  const [sourceCount] = db ? await db.select({ count: sql`count(*)` }).from(editorialSources) : [{ count: 0 }];
  const checks = [
    { key: "database", label: "Database connection", ready: Boolean(db), detail: db ? "Connected to the configured database." : "DATABASE_URL is missing or unavailable." },
    { key: "owner", label: "Owner authorization", ready: Boolean(ENV.ownerOpenId), detail: ENV.ownerOpenId ? "Strict owner-openId gate is configured." : "OWNER_OPEN_ID is missing." },
    { key: "r2", label: "Cloudflare R2 media", ready: Boolean(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME && process.env.R2_PUBLIC_BASE_URL), detail: "Configuration check only; upload a real cover image to verify production serving." },
    { key: "adsense", label: "AdSense configuration", ready: Boolean(process.env.VITE_ADSENSE_CLIENT_ID), detail: process.env.VITE_ADSENSE_CLIENT_ID ? "Client ID is configured." : "Add the AdSense client ID and slot IDs before enabling placements." },
    { key: "analytics", label: "Analytics event store", ready: Boolean(db), detail: "Pageviews, reads, searches, signups, ad views, and ad clicks use the analytics_events table." },
    { key: "sources", label: "Editorial source registry", ready: Number(sourceCount?.count ?? 0) > 0, detail: `${Number(sourceCount?.count ?? 0)} source(s) registered.` }
  ];
  return { ready: checks.every((check) => check.ready), checks };
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app2) {
  app2.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader2(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/storageProxy.ts
function registerStorageProxy(app2) {
  app2.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// server/routers.ts
import { z as z2 } from "zod";
import { TRPCError as TRPCError4 } from "@trpc/server";

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/_core/llm.ts
var ensureArray = (value) => Array.isArray(value) ? value : [value];
var normalizeContentPart = (part) => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }
  if (part.type === "text") {
    return part;
  }
  if (part.type === "image_url") {
    return part;
  }
  if (part.type === "file_url") {
    return part;
  }
  throw new Error("Unsupported message content part");
};
var normalizeMessage = (message) => {
  const { role, name, tool_call_id } = message;
  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content).map((part) => typeof part === "string" ? part : JSON.stringify(part)).join("\n");
    return {
      role,
      name,
      tool_call_id,
      content
    };
  }
  const contentParts = ensureArray(message.content).map(normalizeContentPart);
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text
    };
  }
  return {
    role,
    name,
    content: contentParts
  };
};
var normalizeToolChoice = (toolChoice, tools) => {
  if (!toolChoice) return void 0;
  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }
  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }
    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }
    return {
      type: "function",
      function: { name: tools[0].function.name }
    };
  }
  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name }
    };
  }
  return toolChoice;
};
var resolveApiUrl = () => ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions` : "https://forge.manus.im/v1/chat/completions";
var assertApiKey = () => {
  if (!ENV.forgeApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
};
var normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema
}) => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (explicitFormat.type === "json_schema" && !explicitFormat.json_schema?.schema) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }
  const schema = outputSchema || output_schema;
  if (!schema) return void 0;
  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }
  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...typeof schema.strict === "boolean" ? { strict: schema.strict } : {}
    }
  };
};
var RETRY_MAX_RETRIES = 4;
var RETRY_BASE_DELAY_MS = 500;
var RETRY_MAX_DELAY_MS = 3e4;
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
var parseRetryAfter = (value) => {
  if (!value) return void 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1e3);
  const at = Date.parse(value);
  return Number.isNaN(at) ? void 0 : Math.max(0, at - Date.now());
};
var computeBackoffDelay = (attempt, retryAfterMs) => {
  const cap = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  const jittered = cap / 2 + Math.random() * (cap / 2);
  return Math.min(Math.max(jittered, retryAfterMs ?? 0), RETRY_MAX_DELAY_MS);
};
var fetchWithBackoff = async (url, init) => {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt === RETRY_MAX_RETRIES) {
        return response;
      }
      const retryAfterMs = parseRetryAfter(
        response.headers.get("retry-after")
      );
      try {
        await response.body?.cancel();
      } catch {
      }
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after status ${response.status}`
      );
      await sleep(computeBackoffDelay(attempt, retryAfterMs));
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_MAX_RETRIES) throw error;
      console.warn(
        `LLM request retry ${attempt + 1}/${RETRY_MAX_RETRIES} after network error`
      );
      await sleep(computeBackoffDelay(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("LLM request failed after exhausting retries");
};
async function invokeLLM(params) {
  assertApiKey();
  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
    model,
    thinking,
    reasoning,
    maxTokens,
    max_tokens
  } = params;
  const payload = {
    messages: messages.map(normalizeMessage)
  };
  if (model) {
    payload.model = model;
  }
  if (tools && tools.length > 0) {
    payload.tools = tools;
  }
  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }
  const resolvedMaxTokens = max_tokens ?? maxTokens;
  if (typeof resolvedMaxTokens === "number") {
    payload.max_tokens = resolvedMaxTokens;
  }
  if (thinking) {
    payload.thinking = thinking;
  }
  if (reasoning) {
    payload.reasoning = reasoning;
  }
  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema
  });
  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }
  const response = await fetchWithBackoff(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}
async function listLLMModels() {
  assertApiKey();
  const url = ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0 ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/models` : "https://forge.manus.im/v1/models";
  const response = await fetchWithBackoff(url, {
    headers: { authorization: `Bearer ${ENV.forgeApiKey}` }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `List LLM models failed: ${response.status} ${response.statusText} \u2013 ${errorText}`
    );
  }
  return await response.json();
}

// server/storage.ts
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  return lastDot === -1 ? `${relKey}_${hash}` : `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
function hasR2() {
  return Boolean(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
}
function r2Client() {
  return new S3Client({ region: "auto", endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
}
async function builtInStoragePut(key, data, contentType) {
  const forgeUrl = ENV.forgeApiUrl?.replace(/\/+$/, "");
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) throw new Error("Storage config missing. Add Cloudflare R2 credentials before enabling uploads.");
  const presignUrl = new URL("v1/storage/presign/put", `${forgeUrl}/`);
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, { headers: { Authorization: `Bearer ${forgeKey}` } });
  if (!presignResp.ok) throw new Error(`Storage presign failed (${presignResp.status})`);
  const { url } = await presignResp.json();
  const body = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body });
  if (!uploadResp.ok) throw new Error(`Storage upload failed (${uploadResp.status})`);
  return { key, url: `/manus-storage/${key}` };
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const key = appendHashSuffix(normalizeKey(relKey));
  if (hasR2()) {
    await r2Client().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key, Body: data, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
    const base = (process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "");
    return { key, url: base ? `${base}/${key}` : key };
  }
  return builtInStoragePut(key, data, contentType);
}

// server/adminSecurity.ts
import { TRPCError as TRPCError3 } from "@trpc/server";
var buckets = /* @__PURE__ */ new Map();
var DEFAULT_LIMITS = {
  "article.save": { limit: 30, windowMs: 6e4 },
  "media.upload": { limit: 10, windowMs: 6e4 },
  "assistant.generate": { limit: 12, windowMs: 6e4 }
};
function pruneBuckets(now) {
  if (buckets.size < 5e3) return;
  buckets.forEach((bucket, key) => {
    if (now - bucket.startedAt > 15 * 6e4) buckets.delete(key);
  });
}
async function enforceAdminRateLimit(ctx, action) {
  const now = Date.now();
  const config = DEFAULT_LIMITS[action];
  const key = `${ctx.user?.openId || "anonymous"}:${action}`;
  const durableResult = await consumeAdminRateLimit(key, config);
  if (durableResult.durable) {
    if (!durableResult.allowed) throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: `Rate limit exceeded. Retry in ${durableResult.retryAfterSeconds}s.` });
    return;
  }
  const current = buckets.get(key);
  pruneBuckets(now);
  if (!current || now - current.startedAt >= config.windowMs) {
    buckets.set(key, { startedAt: now, count: 1 });
    return;
  }
  if (current.count >= config.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((config.windowMs - (now - current.startedAt)) / 1e3));
    throw new TRPCError3({ code: "TOO_MANY_REQUESTS", message: `Rate limit exceeded. Retry in ${retryAfterSeconds}s.` });
  }
  current.count += 1;
}
async function auditAdminAction(ctx, input) {
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
      userAgent: String(ctx.req.headers["user-agent"] || "").slice(0, 500) || null
    });
  } catch (error) {
    console.error("[AdminAudit] Failed to persist event", { action: input.action, error: String(error) });
    return false;
  }
}

// server/routers.ts
var categories = ["hacks", "prompts", "freebies", "tutorials", "news"];
var resourceTypes = ["tool", "model", "template", "offer"];
var ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.openId !== ENV.ownerOpenId) {
    throw new TRPCError4({ code: "FORBIDDEN", message: "Owner access required" });
  }
  return next();
});
var appRouter = router({
  trackEvent: publicProcedure.input(z2.object({ eventType: z2.enum(["pageview", "article_read", "search", "newsletter_signup", "ad_view", "ad_click"]), path: z2.string().min(1).max(255), sessionId: z2.string().min(8).max(64), referrer: z2.string().max(500).optional(), browser: z2.string().max(120).optional(), device: z2.string().max(80).optional(), metadata: z2.string().max(2e3).optional() })).mutation(async ({ input, ctx }) => {
    await trackAnalyticsEvent({ ...input, userId: ctx.user?.id, ipAddress: ctx.req.ip });
    return { success: true };
  }),
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user ? { ...opts.ctx.user, isOwner: opts.ctx.user.openId === ENV.ownerOpenId } : null),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  content: router({
    list: publicProcedure.input(z2.object({ category: z2.enum(categories).optional(), search: z2.string().trim().max(80).optional() }).optional()).query(({ input }) => listPublicArticles(input?.category, input?.search)),
    bySlug: publicProcedure.input(z2.object({ slug: z2.string().min(1).max(180) })).query(async ({ input }) => {
      const article = await getArticleBySlug(input.slug);
      if (!article) throw new TRPCError4({ code: "NOT_FOUND", message: "Article not found" });
      return article;
    }),
    categories: publicProcedure.query(() => categories)
  }),
  resources: router({
    list: publicProcedure.input(z2.object({ search: z2.string().trim().max(80).optional(), resourceType: z2.enum(resourceTypes).optional() }).optional()).query(({ input }) => listResources(input?.search, input?.resourceType))
  }),
  newsletter: router({
    subscribe: publicProcedure.input(z2.object({ email: z2.string().email().max(320), source: z2.string().max(120).default("homepage") })).mutation(({ input }) => subscribeEmail(input.email.toLowerCase(), input.source)),
    preferences: publicProcedure.input(z2.object({ token: z2.string().min(20).max(64) })).query(async ({ input }) => {
      const preferences = await getDigestPreferencesByToken(input.token);
      if (!preferences) throw new TRPCError4({ code: "NOT_FOUND", message: "Preference link not found" });
      return preferences;
    }),
    updatePreferences: publicProcedure.input(z2.object({ token: z2.string().min(20).max(64), topics: z2.array(z2.enum(categories)).min(1).max(5), frequency: z2.enum(["weekly", "daily"]), timezone: z2.string().min(1).max(80) })).mutation(async ({ input }) => {
      const updated = await updateDigestPreferencesByToken(input.token, { topics: input.topics, frequency: input.frequency, timezone: input.timezone });
      if (!updated.updated) throw new TRPCError4({ code: "NOT_FOUND", message: "Preference link not found" });
      return updated;
    }),
    series: publicProcedure.query(() => seriesLabels)
  }),
  admin: router({
    articles: ownerProcedure.query(() => listAllArticles()),
    auditLogs: ownerProcedure.input(z2.object({ limit: z2.number().int().min(1).max(200).default(100) }).optional()).query(({ input }) => listAdminAuditLogs(input?.limit || 100)),
    saveArticle: ownerProcedure.input(z2.object({
      id: z2.number().optional(),
      slug: z2.string().min(3).max(180),
      title: z2.string().min(5).max(240),
      excerpt: z2.string().min(20),
      content: z2.string().min(20),
      category: z2.enum(categories),
      tags: z2.string().max(500).default(""),
      seoTitle: z2.string().max(240).optional(),
      seoDescription: z2.string().max(400).optional(),
      readingTimeMinutes: z2.number().int().min(1).max(120).default(5),
      seriesKey: z2.string().max(80).optional().nullable(),
      coverImageUrl: z2.string().optional(),
      coverImageKey: z2.string().optional(),
      published: z2.boolean().default(false),
      featured: z2.boolean().default(false)
    })).mutation(async ({ input, ctx }) => {
      await enforceAdminRateLimit(ctx, "article.save");
      const payload = { ...input, authorName: ctx.user.name || "Hamispro Editorial", publishedAt: input.published ? /* @__PURE__ */ new Date() : null };
      const result = input.id ? await updateArticle(input.id, payload) : await createArticle(payload);
      await auditAdminAction(ctx, { action: input.published ? "article.publish" : "article.save_draft", resourceType: "article", resourceId: typeof result?.id === "number" ? result.id : input.id ?? null, metadata: { slug: input.slug, category: input.category, published: input.published } });
      return result;
    }),
    uploadMedia: ownerProcedure.input(z2.object({ fileName: z2.string().min(1).max(255), mimeType: z2.string().min(1).max(120), base64: z2.string().min(1), sizeBytes: z2.number().int().positive().max(15 * 1024 * 1024) })).mutation(async ({ input, ctx }) => {
      await enforceAdminRateLimit(ctx, "media.upload");
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
      const key = `hamispro/${ctx.user.id}/${Date.now()}-${safeName}`;
      const buffer = Buffer.from(input.base64, "base64");
      const result = await storagePut(key, buffer, input.mimeType);
      await auditAdminAction(ctx, { action: "media.upload", resourceType: "media", metadata: { fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes, key } });
      return { ...result, fileName: input.fileName, sizeBytes: input.sizeBytes };
    }),
    writingAssistant: ownerProcedure.input(z2.object({ mode: z2.enum(["summary", "seo", "tags"]), title: z2.string().max(240), content: z2.string().max(2e4) })).mutation(async ({ input, ctx }) => {
      await enforceAdminRateLimit(ctx, "assistant.generate");
      const task = input.mode === "summary" ? "Write a concise, useful article excerpt in 1-2 sentences." : input.mode === "seo" ? "Write an SEO meta description under 155 characters." : "Suggest 5 concise, relevant tags separated by commas.";
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are the Hamispro.io editorial assistant. Be precise, useful, and never invent facts." },
          { role: "user", content: `${task}

Title: ${input.title}

Draft:
${input.content}` }
        ]
      });
      const content = response.choices?.[0]?.message?.content;
      await auditAdminAction(ctx, { action: "assistant.generate", resourceType: "writing_assistant", metadata: { mode: input.mode, title: input.title } });
      return { value: typeof content === "string" ? content.trim() : "" };
    }),
    dashboardMetrics: ownerProcedure.input(z2.object({ days: z2.union([z2.literal(7), z2.literal(30), z2.literal(90), z2.literal(365)]).optional() }).optional()).query(({ input }) => getDashboardMetrics(input?.days)),
    dashboardMetricsCsv: ownerProcedure.input(z2.object({ days: z2.union([z2.literal(7), z2.literal(30), z2.literal(90), z2.literal(365)]).optional() }).optional()).query(async ({ input }) => {
      const metrics = await getDashboardMetrics(input?.days);
      return generateAnalyticsCsv({ ...metrics, rangeDays: input?.days });
    }),
    launchReadiness: ownerProcedure.query(() => getLaunchReadiness()),
    adPlacements: ownerProcedure.query(() => listAdPlacements()),
    updateAdPlacement: ownerProcedure.input(z2.object({ slotKey: z2.string().min(1).max(120), enabled: z2.boolean().optional(), adType: z2.enum(["adsense", "sponsor", "banner"]).optional(), adsenseClient: z2.string().optional().nullable(), adsenseSlot: z2.string().optional().nullable(), customHtml: z2.string().optional().nullable() })).mutation(async ({ input, ctx }) => {
      await enforceAdminRateLimit(ctx, "ads.update");
      const { slotKey, ...changes } = input;
      const res = await updateAdPlacement(slotKey, changes);
      await auditAdminAction(ctx, { action: "ads.update", resourceType: "ad_placement", metadata: { slotKey, changes } });
      return res;
    }),
    systemSettings: ownerProcedure.query(() => listSystemSettings()),
    updateSetting: ownerProcedure.input(z2.object({ key: z2.string().min(1).max(120), value: z2.string() })).mutation(async ({ input, ctx }) => {
      await enforceAdminRateLimit(ctx, "settings.update");
      await setSystemSetting(input.key, input.value);
      await auditAdminAction(ctx, { action: "settings.update", resourceType: "system_setting", metadata: { key: input.key } });
      return { success: true };
    }),
    editorialSources: ownerProcedure.query(() => listEditorialSources()),
    ingestionRuns: ownerProcedure.input(z2.object({ limit: z2.number().int().min(1).max(100).default(20) }).optional()).query(({ input }) => listIngestionRuns(input?.limit ?? 20)),
    reviewQueue: ownerProcedure.input(z2.object({ status: z2.enum(["new", "processing", "ready", "rejected", "published"]).optional(), limit: z2.number().int().min(1).max(100).default(50), offset: z2.number().int().min(0).default(0) }).optional()).query(({ input }) => listEditorialQueue(input)),
    reviewItem: ownerProcedure.input(z2.object({ id: z2.number().int().positive() })).query(async ({ input }) => {
      const item = await getEditorialItemById(input.id);
      if (!item) throw new TRPCError4({ code: "NOT_FOUND", message: "Editorial item not found" });
      return item;
    }),
    refineReviewItem: ownerProcedure.input(z2.object({ id: z2.number().int().positive(), mode: z2.enum(["summary", "angle", "tags", "takeaways"]) })).mutation(async ({ input, ctx }) => {
      await enforceAdminRateLimit(ctx, "editorial.refine");
      const item = await getEditorialItemById(input.id);
      if (!item) throw new TRPCError4({ code: "NOT_FOUND", message: "Editorial item not found" });
      const preferredModels = ["deepseek-v4-flash", "deepseek-v4-pro", "glm-5.2", "minimax3", "qwen-3.6.7", "gpt-5-mini"];
      let model = "gpt-5-mini";
      try {
        const catalog = await listLLMModels();
        const available = catalog.data.map((entry) => entry.id);
        model = preferredModels.find((candidate) => available.some((id) => id.toLowerCase() === candidate.toLowerCase() || id.toLowerCase().includes(candidate.toLowerCase()))) || available.find((id) => id.startsWith("gpt-5-mini")) || available[0] || model;
      } catch (error) {
        console.warn("[Editorial] Model catalog unavailable; using gpt-5-mini fallback", error);
      }
      const modeInstructions = {
        summary: "Write a factual 1\u20132 sentence summary for an editor. Preserve uncertainty and do not add facts absent from the source metadata.",
        angle: "Suggest one sharp, reader-first Hamispro editorial angle in a single sentence. Do not exaggerate or invent implications.",
        tags: "Return 3\u20136 concise topical tags as a comma-separated string. Use lowercase nouns or short phrases only.",
        takeaways: "Return up to 3 useful takeaways, one per line. Only state what can be supported by the supplied source metadata."
      };
      const response = await invokeLLM({
        model,
        maxTokens: 320,
        messages: [
          { role: "system", content: "You are the Hamispro.io editorial intelligence assistant. You help an owner-editor refine sourced material. Never fabricate facts, quotes, numbers, product capabilities, or dates. Output JSON only." },
          { role: "user", content: `${modeInstructions[input.mode]}

Source: ${item.sourceName}
Title: ${item.title}
Excerpt: ${item.excerpt}
Canonical URL: ${item.canonicalUrl}
Existing suggestion: ${input.mode === "summary" ? item.aiSummary || "none" : input.mode === "angle" ? item.suggestedAngle || "none" : input.mode === "tags" ? item.suggestedTags || "none" : item.keyTakeaways || "none"}` }
        ],
        responseFormat: { type: "json_schema", json_schema: { name: "editorial_refinement", strict: true, schema: { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false } } }
      });
      const raw = response.choices?.[0]?.message?.content;
      let value = "";
      try {
        value = typeof raw === "string" ? (JSON.parse(raw).value || "").trim() : "";
      } catch {
        value = typeof raw === "string" ? raw.trim() : "";
      }
      if (!value) throw new TRPCError4({ code: "BAD_REQUEST", message: "The editorial model returned no usable refinement" });
      const fieldByMode = { summary: "aiSummary", angle: "suggestedAngle", tags: "suggestedTags", takeaways: "keyTakeaways" };
      const result = await updateEditorialItem(input.id, { [fieldByMode[input.mode]]: value, modelUsed: response.model || model, status: "ready", reviewedAt: /* @__PURE__ */ new Date() });
      await auditAdminAction(ctx, { action: "editorial.refine", resourceType: "editorial_item", resourceId: input.id, metadata: { mode: input.mode, model: response.model || model } });
      return result;
    }),
    updateReviewItem: ownerProcedure.input(z2.object({
      id: z2.number().int().positive(),
      status: z2.enum(["new", "processing", "ready", "rejected", "published"]).optional(),
      itemType: z2.enum(["news", "tutorial", "hack", "cheat", "freebie", "tool", "release"]).optional(),
      category: z2.enum(categories).optional(),
      suggestedTitle: z2.string().max(240).optional().nullable(),
      suggestedAngle: z2.string().max(5e3).optional().nullable(),
      aiSummary: z2.string().max(5e3).optional().nullable(),
      keyTakeaways: z2.string().max(1e4).optional().nullable(),
      suggestedTags: z2.string().max(500).optional().nullable(),
      reviewerNotes: z2.string().max(5e3).optional().nullable(),
      importanceScore: z2.number().int().min(0).max(100).optional(),
      usefulnessScore: z2.number().int().min(0).max(100).optional(),
      noveltyScore: z2.number().int().min(0).max(100).optional(),
      confidenceScore: z2.number().int().min(0).max(100).optional(),
      freshnessScore: z2.number().int().min(0).max(100).optional(),
      verificationStatus: z2.enum(["unverified", "verified", "needs_review"]).optional(),
      clusterKey: z2.string().max(120).optional().nullable(),
      claimWarnings: z2.string().max(1e4).optional().nullable()
    })).mutation(async ({ input, ctx }) => {
      await enforceAdminRateLimit(ctx, "editorial.review");
      const { id, ...changes } = input;
      const result = await updateEditorialItem(id, { ...changes, reviewedAt: changes.status && changes.status !== "new" ? /* @__PURE__ */ new Date() : void 0 });
      if (!result) throw new TRPCError4({ code: "NOT_FOUND", message: "Editorial item not found" });
      await auditAdminAction(ctx, { action: "editorial.review", resourceType: "editorial_item", resourceId: id, metadata: { status: input.status, category: input.category } });
      return result;
    }),
    publishReviewItem: ownerProcedure.input(z2.object({
      id: z2.number().int().positive(),
      slug: z2.string().min(3).max(180),
      title: z2.string().min(5).max(240),
      excerpt: z2.string().min(20).max(600),
      content: z2.string().min(20).max(5e4),
      category: z2.enum(categories),
      tags: z2.string().max(500).default(""),
      seoTitle: z2.string().max(240).optional(),
      seoDescription: z2.string().max(400).optional(),
      seriesKey: z2.string().max(80).optional().nullable(),
      featured: z2.boolean().default(false)
    })).mutation(async ({ input, ctx }) => {
      await enforceAdminRateLimit(ctx, "editorial.publish");
      const item = await getEditorialItemById(input.id);
      if (!item) throw new TRPCError4({ code: "NOT_FOUND", message: "Editorial item not found" });
      const article = await createArticle({
        slug: input.slug,
        title: input.title,
        excerpt: input.excerpt,
        content: input.content,
        category: input.category,
        tags: input.tags,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        seriesKey: input.seriesKey,
        featured: input.featured,
        published: true,
        publishedAt: /* @__PURE__ */ new Date(),
        authorName: ctx.user.name || "Hamispro Editorial"
      });
      await updateEditorialItem(input.id, { status: "published", linkedArticleId: typeof article?.id === "number" ? article.id : null, reviewedAt: /* @__PURE__ */ new Date() });
      await auditAdminAction(ctx, { action: "editorial.publish", resourceType: "editorial_item", resourceId: input.id, metadata: { articleId: article?.id, slug: input.slug, category: input.category } });
      return article;
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/editorialIngestion.ts
import { XMLParser } from "fast-xml-parser";
import crypto2 from "crypto";
var parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true
});
function computeDedupeHash(canonicalUrl, title) {
  const cleanUrl = canonicalUrl.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const cleanTitle = title.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return crypto2.createHash("sha256").update(`${cleanUrl}:${cleanTitle}`).digest("hex");
}
function computeClusterKey(title) {
  const normalized = title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 3 && !["about", "after", "with", "from", "this", "that"].includes(word)).slice(0, 8).join("-");
  return normalized.slice(0, 120) || "uncategorized-story";
}
function computeFreshnessScore(publishedAt) {
  const ageHours = Math.max(0, (Date.now() - publishedAt.getTime()) / 36e5);
  if (ageHours <= 24) return 100;
  if (ageHours <= 72) return 90;
  if (ageHours <= 168) return 75;
  if (ageHours <= 720) return 55;
  return 30;
}
async function seedDefaultEditorialSources() {
  return [
    { name: "OpenAI News", sourceType: "rss", feedUrl: "https://openai.com/news/rss.xml", sourceUrl: "https://openai.com/news", domain: "openai.com", defaultCategory: "news", reliabilityScore: 95 },
    { name: "Hugging Face Blog", sourceType: "rss", feedUrl: "https://huggingface.co/blog/feed.xml", sourceUrl: "https://huggingface.co/blog", domain: "huggingface.co", defaultCategory: "tutorials", reliabilityScore: 92 },
    { name: "GitHub AI & LLM Releases", sourceType: "rss", feedUrl: "https://github.blog/tag/ai/feed/", sourceUrl: "https://github.blog/tag/ai/", domain: "github.blog", defaultCategory: "hacks", reliabilityScore: 90 }
  ];
}
async function runEditorialIngestionPipeline() {
  const runId = await createIngestionRun("scheduled-ingestion");
  if (!runId) return { ok: false, message: "Failed to create ingestion run" };
  let sourceCount = 0;
  let fetchedCount = 0;
  let insertedCount = 0;
  let enrichedCount = 0;
  try {
    let sources = await listEditorialSources(true);
    if (!sources.length) {
      const defaults = await seedDefaultEditorialSources();
      for (const def of defaults) {
        await upsertEditorialSource(def);
      }
      sources = await listEditorialSources(true);
    }
    sourceCount = sources.length;
    let model = "gpt-5-mini";
    try {
      const catalog = await listLLMModels();
      const available = catalog.data.map((m) => m.id);
      const preferred = ["deepseek-v4-flash", "deepseek-v4-pro", "glm-5.2", "minimax3", "qwen-3.6.7", "gpt-5-mini"];
      model = preferred.find((c) => available.some((id) => id.toLowerCase().includes(c))) || available.find((id) => id.startsWith("gpt-5-mini")) || available[0] || model;
    } catch {
    }
    for (const source of sources) {
      try {
        const response = await fetch(source.feedUrl, { headers: { "user-agent": "HamisproAI/1.0 (Editorial Ingestion Bot)" }, signal: AbortSignal.timeout(12e3) });
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
        const xmlText = await response.text();
        const parsed = parser.parse(xmlText);
        const channel = parsed?.rss?.channel || parsed?.feed;
        const rawItems = channel?.item || channel?.entry || [];
        const items = Array.isArray(rawItems) ? rawItems : [rawItems];
        fetchedCount += items.length;
        for (const raw of items.slice(0, 15)) {
          const title = String(raw?.title || "").trim();
          const link = String(raw?.link?.["@_href"] || raw?.link || raw?.guid || "").trim();
          const excerpt = String(raw?.description || raw?.summary || raw?.content || title).replace(/<[^>]*>/g, "").trim().slice(0, 800);
          const externalId = String(raw?.guid || link || title);
          const publishedRaw = raw?.pubDate || raw?.published || raw?.updated;
          const publishedAt = publishedRaw ? new Date(publishedRaw) : /* @__PURE__ */ new Date();
          if (!title || !link) continue;
          const dedupeHash = computeDedupeHash(link, title);
          const freshnessScore = computeFreshnessScore(publishedAt);
          const clusterKey = computeClusterKey(title);
          const inserted = await upsertEditorialItem({
            sourceId: source.id,
            externalId: externalId.slice(0, 500),
            canonicalUrl: link,
            dedupeHash,
            title: title.slice(0, 500),
            excerpt: excerpt || title,
            sourceName: source.name,
            category: source.defaultCategory,
            itemType: "news",
            publishedAt,
            status: "new",
            importanceScore: source.reliabilityScore > 90 ? 80 : 65,
            usefulnessScore: 70,
            noveltyScore: 70,
            confidenceScore: 85,
            freshnessScore,
            verificationStatus: "unverified",
            clusterKey,
            claimWarnings: "Source-derived item requires owner verification before publication.",
            rawPayload: JSON.stringify({ title, link, publishedRaw, sourceName: source.name, discoveredAt: (/* @__PURE__ */ new Date()).toISOString(), freshnessScore, clusterKey }).slice(0, 4e3)
          });
          if (inserted) {
            insertedCount++;
            try {
              const scorePrompt = `Evaluate this AI news item for Hamispro.io (an AI intelligence hub for hacks, prompts, freebies, tutorials, and news). Return JSON with: importanceScore (0-100), usefulnessScore (0-100), noveltyScore (0-100), suggestedCategory ("hacks"|"prompts"|"freebies"|"tutorials"|"news"), aiSummary (1-2 sentences), suggestedAngle (1 sentence takeaway), keyTakeaways (3 bullet lines separated by newlines), suggestedTags (comma separated), claimWarnings (short warnings separated by newlines).`;
              const scoreRes = await invokeLLM({
                model,
                maxTokens: 500,
                messages: [
                  { role: "system", content: "You are Hamispro's automated editorial evaluator. Output strict JSON only." },
                  { role: "user", content: `${scorePrompt}

Source: ${source.name}
Title: ${title}
Excerpt: ${excerpt}` }
                ],
                responseFormat: { type: "json_schema", json_schema: { name: "editorial_scoring", strict: true, schema: { type: "object", properties: { importanceScore: { type: "integer" }, usefulnessScore: { type: "integer" }, noveltyScore: { type: "integer" }, suggestedCategory: { type: "string" }, aiSummary: { type: "string" }, suggestedAngle: { type: "string" }, keyTakeaways: { type: "string" }, suggestedTags: { type: "string" }, claimWarnings: { type: "string" } }, required: ["importanceScore", "usefulnessScore", "noveltyScore", "suggestedCategory", "aiSummary", "suggestedAngle", "keyTakeaways", "suggestedTags", "claimWarnings"], additionalProperties: false } } }
              });
              const rawContent = scoreRes.choices?.[0]?.message?.content;
              const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent || "{}");
              const parsedScore = JSON.parse(contentStr);
              await upsertEditorialItem({
                id: inserted.id,
                sourceId: source.id,
                externalId: inserted.externalId,
                canonicalUrl: inserted.canonicalUrl,
                dedupeHash: inserted.dedupeHash,
                title: inserted.title,
                excerpt: inserted.excerpt,
                sourceName: inserted.sourceName,
                category: ["hacks", "prompts", "freebies", "tutorials", "news"].includes(parsedScore.suggestedCategory) ? parsedScore.suggestedCategory : source.defaultCategory,
                importanceScore: Number(parsedScore.importanceScore ?? 75),
                usefulnessScore: Number(parsedScore.usefulnessScore ?? 70),
                noveltyScore: Number(parsedScore.noveltyScore ?? 70),
                confidenceScore: 88,
                freshnessScore,
                verificationStatus: "unverified",
                clusterKey,
                claimWarnings: parsedScore.claimWarnings || "Owner verification required before publication.",
                aiSummary: parsedScore.aiSummary || excerpt,
                suggestedAngle: parsedScore.suggestedAngle || "",
                keyTakeaways: parsedScore.keyTakeaways || "",
                suggestedTags: parsedScore.suggestedTags || "",
                modelUsed: scoreRes.model || model,
                status: "ready"
              });
              enrichedCount++;
            } catch (enrichError) {
              console.warn(`[Editorial Ingestion] Enrichment failed for item ${inserted.id}:`, enrichError);
            }
          }
        }
        await markEditorialSourceFetched(source.id, { error: null });
      } catch (sourceError) {
        console.warn(`[Editorial Ingestion] Failed fetching source ${source.name}:`, sourceError);
        await markEditorialSourceFetched(source.id, { error: String(sourceError?.message || sourceError) });
      }
    }
    await finishIngestionRun(runId, { status: "completed", sourceCount, fetchedCount, insertedCount, enrichedCount });
    return { ok: true, sourceCount, fetchedCount, insertedCount, enrichedCount };
  } catch (error) {
    await finishIngestionRun(runId, { status: "failed", sourceCount, fetchedCount, insertedCount, enrichedCount, errorMessage: String(error?.message || error) });
    return { ok: false, error: String(error?.message || error) };
  }
}

// server/editorialScheduler.ts
function isAuthorizedCronRequest(req, user) {
  if (user?.isCron && user?.taskUid) return true;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ") && authHeader.slice(7) === cronSecret) return true;
  if (req.headers["x-cron-secret"] === cronSecret) return true;
  if (req.query.secret === cronSecret) return true;
  return false;
}
async function handleEditorialScheduled(req, res) {
  const startedAt = /* @__PURE__ */ new Date();
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
    const result = await runEditorialIngestionPipeline();
    return res.json({ ok: result.ok, taskUid, result, startedAt: startedAt.toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: message, context: { url: req.originalUrl }, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  }
}

// server/digestScheduler.ts
var MAX_BATCH = 100;
async function handleDigestScheduled(req, res) {
  const startedAt = /* @__PURE__ */ new Date();
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
    const batches = await Promise.all(subscribers.map(async (subscriber) => {
      const intervalMs = subscriber.frequency === "daily" ? 24 * 60 * 60 * 1e3 : 7 * 24 * 60 * 60 * 1e3;
      const since = subscriber.lastDigestSentAt ? new Date(subscriber.lastDigestSentAt) : new Date(Date.now() - intervalMs);
      const candidates = await listDigestCandidates(subscriber.topics.split(",").filter(Boolean), since);
      return { email: subscriber.email, frequency: subscriber.frequency, topics: subscriber.topics.split(",").filter(Boolean), articleCount: candidates.length, articleSlugs: candidates.map((article) => article.slug) };
    }));
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
    return res.status(500).json({ error: message, context: { url: req.originalUrl, taskUid: req.user?.taskUid ?? null }, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  }
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid as nanoid2 } from "nanoid";
import path2 from "path";
import { pathToFileURL } from "url";
import { createServer as createViteServer } from "vite";
import superjson2 from "superjson";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/ssrCaller.ts
async function buildSsrPrefetch(req, res) {
  const ctx = await createContext({ req, res, info: {} });
  const caller = appRouter.createCaller(ctx);
  return {
    contentList: (input) => caller.content.list(input),
    contentBySlug: (slug) => caller.content.bySlug({ slug }),
    resourcesList: (input) => caller.resources.list(input)
  };
}

// server/_core/vite.ts
function escapeHtml(value) {
  return value.replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] || char);
}
function canonicalOrigin() {
  return (process.env.CANONICAL_ORIGIN || "https://hamispro.io").replace(/\/$/, "");
}
function composeHead(head) {
  const origin = canonicalOrigin();
  const canonical = `${origin}${head.canonicalPath || "/"}`;
  const title = escapeHtml(head.title || "Hamispro.io \u2014 The useful side of AI");
  const description = escapeHtml(head.description || "Practical AI workflows, prompts, free tools, tutorials, and signals.");
  const robots = head.noindex ? "noindex, nofollow" : "index, follow";
  const ogImage = head.ogImage ? escapeHtml(head.ogImage) : `${origin}/og-image.svg`;
  const favicon = head.faviconUrl ? escapeHtml(head.faviconUrl) : "/favicon.svg";
  return `<title>${title}</title><meta name="description" content="${description}" /><meta name="robots" content="${robots}" /><link rel="canonical" href="${escapeHtml(canonical)}" /><link rel="icon" type="image/svg+xml" href="${favicon}" /><meta property="og:title" content="${title}" /><meta property="og:description" content="${description}" /><meta property="og:type" content="${head.ogType || "website"}" /><meta property="og:url" content="${escapeHtml(canonical)}" /><meta property="og:image" content="${ogImage}" /><meta property="og:site_name" content="Hamispro.io" /><meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${title}" /><meta name="twitter:description" content="${description}" /><meta name="twitter:image" content="${ogImage}" />`;
}
function composeHtml(template, result) {
  const serialized = JSON.stringify(superjson2.serialize(result.dehydratedState));
  return template.replace("<!--app-head-->", composeHead(result.head)).replace("<!--app-html-->", () => result.html || "").replace("</head>", `<script>window.__RQ_STATE__=${serialized};</script></head>`);
}
function getFallbackTemplate() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <!--app-head-->
  </head>
  <body>
    <div id="root"><!--app-html--></div>
    <script type="module" src="/src/entry-client.tsx"></script>
  </body>
</html>`;
}
function findPublicDistPath() {
  const candidates = [
    path2.resolve(process.cwd(), "dist", "public"),
    path2.resolve(import.meta.dirname, "public"),
    path2.resolve(import.meta.dirname, "..", "public"),
    path2.resolve(import.meta.dirname, "../dist/public"),
    path2.resolve(import.meta.dirname, "../../dist/public"),
    path2.resolve(process.cwd(), "client")
  ];
  for (const c of candidates) {
    if (fs2.existsSync(c)) return c;
  }
  return path2.resolve(process.cwd(), "dist", "public");
}
async function findTemplate() {
  const candidates = [
    path2.resolve(findPublicDistPath(), "index.html"),
    path2.resolve(process.cwd(), "dist", "public", "index.html"),
    path2.resolve(process.cwd(), "client", "index.html"),
    path2.resolve(import.meta.dirname, "../../client/index.html")
  ];
  for (const c of candidates) {
    if (fs2.existsSync(c)) {
      return fs2.promises.readFile(c, "utf-8");
    }
  }
  return getFallbackTemplate();
}
async function loadServerEntry() {
  const candidates = [
    path2.resolve(process.cwd(), "dist", "server", "entry-server.js"),
    path2.resolve(path2.dirname(findPublicDistPath()), "server", "entry-server.js"),
    path2.resolve(import.meta.dirname, "server", "entry-server.js"),
    path2.resolve(import.meta.dirname, "..", "server", "entry-server.js")
  ];
  for (const c of candidates) {
    if (fs2.existsSync(c)) {
      try {
        const fileUrl = pathToFileURL(c).href;
        return await import(fileUrl);
      } catch (err) {
        console.warn("[SSR] Error importing server entry:", err);
      }
    }
  }
  return null;
}
async function renderRequest(req, res, template, render) {
  const rawUrl = req.originalUrl || req.url || "/";
  const queryIndex = rawUrl.indexOf("?");
  const pathname = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
  if (pathname.startsWith("/admin")) {
    const adminHead = composeHead({
      title: "Editorial Desk \u2014 Hamispro.io",
      description: "Private owner-only publishing studio.",
      noindex: true,
      canonicalPath: pathname
    });
    const adminHtml = template.replace("<!--app-head-->", adminHead).replace("<!--app-html-->", () => "");
    return res.status(200).set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-cache, no-store, must-revalidate" }).end(adminHtml);
  }
  try {
    if (render) {
      const prefetch = await buildSsrPrefetch(req, res);
      const result = await render(rawUrl, prefetch);
      res.status(result.head.notFound ? 404 : 200).set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" }).end(composeHtml(template, result));
      return;
    }
  } catch (error) {
    console.error("[SSR] render failed, falling back to static HTML:", error);
  }
  const fallbackHead = composeHead({
    title: "Hamispro.io \u2014 The useful side of AI",
    description: "Useful signal for the age of AI. Hacks, Prompts, Freebies, Tutorials, and News.",
    canonicalPath: pathname
  });
  const fallbackHtml = template.replace("<!--app-head-->", fallbackHead).replace("<!--app-html-->", () => "");
  res.status(200).set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" }).end(fallbackHtml);
}
function serveStatic(app2) {
  const distPath = findPublicDistPath();
  app2.use((req, res, next) => {
    if (req.path === "/index.html") return res.redirect(301, "/");
    if (req.path.length > 1 && req.path.endsWith("/")) return res.redirect(301, req.path.slice(0, -1) + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""));
    next();
  });
  if (fs2.existsSync(distPath)) {
    app2.use(express.static(distPath, { index: false, redirect: false, maxAge: "1y", immutable: true }));
  }
  app2.use("*", async (req, res) => {
    try {
      const template = await findTemplate();
      const serverEntry = await loadServerEntry();
      await renderRequest(req, res, template, serverEntry?.render);
    } catch (error) {
      console.error("[Static Server Error]", error);
      res.status(200).type("text/html").send(getFallbackTemplate());
    }
  });
}

// server/_core/app.ts
function createApp() {
  const app2 = express2();
  app2.use(express2.json({ limit: "50mb" }));
  app2.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app2);
  registerOAuthRoutes(app2);
  app2.post("/api/scheduled/sendDigest", handleDigestScheduled);
  app2.post("/api/scheduled/ingestEditorial", handleEditorialScheduled);
  app2.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV !== "development") {
    serveStatic(app2);
  }
  app2.use((err, req, res, _next) => {
    console.error("[App Error]", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Internal Server Error",
        path: req.originalUrl
      });
    }
  });
  return app2;
}
var app = createApp();

// api/serverless.ts
function handler(req, res) {
  return app(req, res);
}
export {
  handler as default
};
