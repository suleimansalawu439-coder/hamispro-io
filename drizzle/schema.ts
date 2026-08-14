import { bigint, integer, pgEnum, pgTable, text, timestamp, varchar, boolean, index, serial } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const categoryEnum = pgEnum("category", ["hacks", "prompts", "freebies", "tutorials", "news"]);
export const resourceTypeEnum = pgEnum("resourceType", ["tool", "model", "template", "offer"]);
export const frequencyEnum = pgEnum("frequency", ["weekly", "daily"]);
export const sourceTypeEnum = pgEnum("sourceType", ["rss", "atom", "release", "api"]);
export const itemTypeEnum = pgEnum("itemType", ["news", "tutorial", "hack", "cheat", "freebie", "tool", "release"]);
export const statusEnum = pgEnum("status", ["new", "processing", "ready", "rejected", "published"]);
export const verificationStatusEnum = pgEnum("verificationStatus", ["unverified", "verified", "needs_review"]);
export const runStatusEnum = pgEnum("run_status", ["running", "completed", "failed"]);
export const adTypeEnum = pgEnum("adType", ["adsense", "sponsor", "banner"]);
export const freebieHealthStatusEnum = pgEnum("freebieHealthStatus", ["active", "expired", "degraded", "unchecked"]);
export const newsletterEditionStatusEnum = pgEnum("newsletterEditionStatus", ["draft", "review", "approved", "sent"]);
export const severityEnum = pgEnum("severity", ["info", "warning", "critical"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const articles = pgTable("articles", {
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
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, table => ({
  categoryIdx: index("articles_category_idx").on(table.category),
  publishedIdx: index("articles_published_idx").on(table.published, table.publishedAt),
}));

export const resources = pgTable("resources", {
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
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, table => ({
  resourceTypeIdx: index("resources_type_idx").on(table.resourceType),
}));

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
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
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const adminRateLimitBuckets = pgTable("admin_rate_limit_buckets", {
  key: varchar("key", { length: 191 }).primaryKey(),
  windowStartedAt: bigint("windowStartedAt", { mode: "number" }).notNull(),
  count: integer("count").notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: serial("id").primaryKey(),
  actorOpenId: varchar("actorOpenId", { length: 64 }).notNull(),
  actorUserId: integer("actorUserId").notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  resourceType: varchar("resourceType", { length: 80 }).notNull(),
  resourceId: integer("resourceId"),
  metadata: text("metadata"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: varchar("userAgent", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  actorCreatedIdx: index("admin_audit_actor_created_idx").on(table.actorOpenId, table.createdAt),
  actionCreatedIdx: index("admin_audit_action_created_idx").on(table.action, table.createdAt),
}));

export const editorialSources = pgTable("editorial_sources", {
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
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, table => ({
  enabledIdx: index("editorial_sources_enabled_idx").on(table.enabled),
}));

export const editorialItems = pgTable("editorial_items", {
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
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
}, table => ({
  queueIdx: index("editorial_items_queue_idx").on(table.status, table.importanceScore, table.discoveredAt),
  sourcePublishedIdx: index("editorial_items_source_published_idx").on(table.sourceId, table.publishedAt),
}));

export const ingestionRuns = pgTable("ingestion_runs", {
  id: serial("id").primaryKey(),
  runType: varchar("runType", { length: 80 }).notNull(),
  status: runStatusEnum("status").notNull(),
  sourceCount: integer("sourceCount").default(0).notNull(),
  fetchedCount: integer("fetchedCount").default(0).notNull(),
  insertedCount: integer("insertedCount").default(0).notNull(),
  enrichedCount: integer("enrichedCount").default(0).notNull(),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
});

export const mediaAssets = pgTable("media_assets", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 500 }).notNull().unique(),
  url: text("url").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  sizeBytes: integer("sizeBytes").notNull(),
  uploadedBy: integer("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type InsertArticle = typeof articles.$inferInsert;
export type Resource = typeof resources.$inferSelect;
export type InsertResource = typeof resources.$inferInsert;
export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type EditorialSource = typeof editorialSources.$inferSelect;
export type InsertEditorialSource = typeof editorialSources.$inferInsert;
export type EditorialItem = typeof editorialItems.$inferSelect;
export type InsertEditorialItem = typeof editorialItems.$inferInsert;
export type IngestionRun = typeof ingestionRuns.$inferSelect;

export const analyticsEvents = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  eventType: varchar("eventType", { length: 64 }).notNull(), // pageview, ad_view, ad_click, search, newsletter_signup, article_read
  path: varchar("path", { length: 255 }).notNull(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  userId: integer("userId"),
  referrer: varchar("referrer", { length: 500 }),
  browser: varchar("browser", { length: 120 }),
  device: varchar("device", { length: 80 }),
  ipAddress: varchar("ipAddress", { length: 64 }),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  eventCreatedIdx: index("analytics_event_created_idx").on(table.eventType, table.createdAt),
  pathIdx: index("analytics_path_idx").on(table.path),
}));

export const adPlacements = pgTable("ad_placements", {
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
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 120 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertAnalyticsEvent = typeof analyticsEvents.$inferInsert;
export type AdPlacement = typeof adPlacements.$inferSelect;
export type InsertAdPlacement = typeof adPlacements.$inferInsert;
export type SystemSetting = typeof systemSettings.$inferSelect;

export const freebieHealth = pgTable("freebie_health", {
  id: serial("id").primaryKey(),
  resourceId: integer("resourceId").notNull().unique(),
  status: freebieHealthStatusEnum("status").default("unchecked").notNull(),
  lastCheckedAt: timestamp("lastCheckedAt"),
  statusCode: integer("statusCode"),
  responseTimeMs: integer("responseTimeMs"),
  errorSummary: text("errorSummary"),
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export const newsletterEditions = pgTable("newsletter_editions", {
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
  updatedAt: timestamp("updatedAt").defaultNow().$onUpdateFn(() => new Date()).notNull(),
});

export const operationalIncidents = pgTable("operational_incidents", {
  id: serial("id").primaryKey(),
  component: varchar("component", { length: 120 }).notNull(),
  severity: severityEnum("severity").default("warning").notNull(),
  summary: varchar("summary", { length: 255 }).notNull(),
  details: text("details"),
  resolved: boolean("resolved").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});

export type FreebieHealth = typeof freebieHealth.$inferSelect;
export type InsertFreebieHealth = typeof freebieHealth.$inferInsert;
export type NewsletterEdition = typeof newsletterEditions.$inferSelect;
export type InsertNewsletterEdition = typeof newsletterEditions.$inferInsert;
export type OperationalIncident = typeof operationalIncidents.$inferSelect;
export type InsertOperationalIncident = typeof operationalIncidents.$inferInsert;
