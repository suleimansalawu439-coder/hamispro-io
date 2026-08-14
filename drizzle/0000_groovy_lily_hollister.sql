CREATE TYPE "public"."adType" AS ENUM('adsense', 'sponsor', 'banner');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('hacks', 'prompts', 'freebies', 'tutorials', 'news');--> statement-breakpoint
CREATE TYPE "public"."freebieHealthStatus" AS ENUM('active', 'expired', 'degraded', 'unchecked');--> statement-breakpoint
CREATE TYPE "public"."frequency" AS ENUM('weekly', 'daily');--> statement-breakpoint
CREATE TYPE "public"."itemType" AS ENUM('news', 'tutorial', 'hack', 'cheat', 'freebie', 'tool', 'release');--> statement-breakpoint
CREATE TYPE "public"."newsletterEditionStatus" AS ENUM('draft', 'review', 'approved', 'sent');--> statement-breakpoint
CREATE TYPE "public"."resourceType" AS ENUM('tool', 'model', 'template', 'offer');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."sourceType" AS ENUM('rss', 'atom', 'release', 'api');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('new', 'processing', 'ready', 'rejected', 'published');--> statement-breakpoint
CREATE TYPE "public"."verificationStatus" AS ENUM('unverified', 'verified', 'needs_review');--> statement-breakpoint
CREATE TABLE "ad_placements" (
	"id" serial PRIMARY KEY NOT NULL,
	"slotKey" varchar(120) NOT NULL,
	"name" varchar(160) NOT NULL,
	"adType" "adType" DEFAULT 'adsense' NOT NULL,
	"adsenseClient" varchar(120),
	"adsenseSlot" varchar(120),
	"customHtml" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"estimatedRevenueCents" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ad_placements_slotKey_unique" UNIQUE("slotKey")
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actorOpenId" varchar(64) NOT NULL,
	"actorUserId" integer NOT NULL,
	"action" varchar(80) NOT NULL,
	"resourceType" varchar(80) NOT NULL,
	"resourceId" integer,
	"metadata" text,
	"ipAddress" varchar(64),
	"userAgent" varchar(500),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_rate_limit_buckets" (
	"key" varchar(191) PRIMARY KEY NOT NULL,
	"windowStartedAt" bigint NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"eventType" varchar(64) NOT NULL,
	"path" varchar(255) NOT NULL,
	"sessionId" varchar(64) NOT NULL,
	"userId" integer,
	"referrer" varchar(500),
	"browser" varchar(120),
	"device" varchar(80),
	"ipAddress" varchar(64),
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(180) NOT NULL,
	"title" varchar(240) NOT NULL,
	"excerpt" text NOT NULL,
	"content" text NOT NULL,
	"category" "category" NOT NULL,
	"seriesKey" varchar(80),
	"authorName" varchar(120) DEFAULT 'Hamispro Editorial' NOT NULL,
	"coverImageUrl" text,
	"coverImageKey" varchar(500),
	"tags" text,
	"seoTitle" varchar(240),
	"seoDescription" text,
	"readingTimeMinutes" integer DEFAULT 5 NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"publishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "editorial_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"sourceId" integer NOT NULL,
	"externalId" varchar(500) NOT NULL,
	"canonicalUrl" text NOT NULL,
	"dedupeHash" varchar(64) NOT NULL,
	"title" varchar(500) NOT NULL,
	"excerpt" text NOT NULL,
	"author" varchar(240),
	"sourceName" varchar(160) NOT NULL,
	"itemType" "itemType" DEFAULT 'news' NOT NULL,
	"category" "category" DEFAULT 'news' NOT NULL,
	"publishedAt" timestamp,
	"discoveredAt" timestamp DEFAULT now() NOT NULL,
	"status" "status" DEFAULT 'new' NOT NULL,
	"importanceScore" integer DEFAULT 0 NOT NULL,
	"usefulnessScore" integer DEFAULT 0 NOT NULL,
	"noveltyScore" integer DEFAULT 0 NOT NULL,
	"confidenceScore" integer DEFAULT 0 NOT NULL,
	"freshnessScore" integer DEFAULT 0 NOT NULL,
	"verificationStatus" "verificationStatus" DEFAULT 'unverified' NOT NULL,
	"clusterKey" varchar(120),
	"claimWarnings" text,
	"aiSummary" text,
	"keyTakeaways" text,
	"suggestedAngle" text,
	"suggestedTitle" varchar(240),
	"suggestedTags" varchar(500),
	"modelUsed" varchar(120),
	"rawPayload" text,
	"reviewerNotes" text,
	"linkedArticleId" integer,
	"reviewedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_items_dedupeHash_unique" UNIQUE("dedupeHash")
);
--> statement-breakpoint
CREATE TABLE "editorial_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"sourceType" "sourceType" NOT NULL,
	"feedUrl" varchar(500) NOT NULL,
	"sourceUrl" varchar(500) NOT NULL,
	"domain" varchar(180) NOT NULL,
	"defaultCategory" "category" DEFAULT 'news' NOT NULL,
	"reliabilityScore" integer DEFAULT 80 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"lastFetchedAt" timestamp,
	"lastError" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "editorial_sources_feedUrl_unique" UNIQUE("feedUrl")
);
--> statement-breakpoint
CREATE TABLE "freebie_health" (
	"id" serial PRIMARY KEY NOT NULL,
	"resourceId" integer NOT NULL,
	"status" "freebieHealthStatus" DEFAULT 'unchecked' NOT NULL,
	"lastCheckedAt" timestamp,
	"statusCode" integer,
	"responseTimeMs" integer,
	"errorSummary" text,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "freebie_health_resourceId_unique" UNIQUE("resourceId")
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"runType" varchar(80) NOT NULL,
	"status" "run_status" NOT NULL,
	"sourceCount" integer DEFAULT 0 NOT NULL,
	"fetchedCount" integer DEFAULT 0 NOT NULL,
	"insertedCount" integer DEFAULT 0 NOT NULL,
	"enrichedCount" integer DEFAULT 0 NOT NULL,
	"errorMessage" text,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"finishedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(500) NOT NULL,
	"url" text NOT NULL,
	"fileName" varchar(255) NOT NULL,
	"mimeType" varchar(120) NOT NULL,
	"sizeBytes" integer NOT NULL,
	"uploadedBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "newsletter_editions" (
	"id" serial PRIMARY KEY NOT NULL,
	"editionNumber" integer NOT NULL,
	"title" varchar(240) NOT NULL,
	"subject" varchar(240) NOT NULL,
	"contentHtml" text NOT NULL,
	"status" "newsletterEditionStatus" DEFAULT 'draft' NOT NULL,
	"scheduledFor" timestamp,
	"sentAt" timestamp,
	"recipientCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_editions_editionNumber_unique" UNIQUE("editionNumber")
);
--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"leadMagnet" varchar(180) DEFAULT 'Ultimate Prompt Cheatsheet' NOT NULL,
	"source" varchar(120) DEFAULT 'homepage' NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"topics" varchar(500) DEFAULT 'hacks,prompts,freebies,tutorials,news' NOT NULL,
	"frequency" "frequency" DEFAULT 'weekly' NOT NULL,
	"timezone" varchar(80) DEFAULT 'UTC' NOT NULL,
	"preferenceToken" varchar(64),
	"unsubscribedAt" timestamp,
	"lastDigestSentAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_subscribers_email_unique" UNIQUE("email"),
	CONSTRAINT "newsletter_subscribers_preferenceToken_unique" UNIQUE("preferenceToken")
);
--> statement-breakpoint
CREATE TABLE "operational_incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"component" varchar(120) NOT NULL,
	"severity" "severity" DEFAULT 'warning' NOT NULL,
	"summary" varchar(255) NOT NULL,
	"details" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"resolvedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(180) NOT NULL,
	"name" varchar(180) NOT NULL,
	"description" text NOT NULL,
	"resourceType" "resourceType" NOT NULL,
	"url" text NOT NULL,
	"priceLabel" varchar(100) DEFAULT 'Free' NOT NULL,
	"tags" text,
	"featured" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "resources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" varchar(120) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE INDEX "admin_audit_actor_created_idx" ON "admin_audit_logs" USING btree ("actorOpenId","createdAt");--> statement-breakpoint
CREATE INDEX "admin_audit_action_created_idx" ON "admin_audit_logs" USING btree ("action","createdAt");--> statement-breakpoint
CREATE INDEX "analytics_event_created_idx" ON "analytics_events" USING btree ("eventType","createdAt");--> statement-breakpoint
CREATE INDEX "analytics_path_idx" ON "analytics_events" USING btree ("path");--> statement-breakpoint
CREATE INDEX "articles_category_idx" ON "articles" USING btree ("category");--> statement-breakpoint
CREATE INDEX "articles_published_idx" ON "articles" USING btree ("published","publishedAt");--> statement-breakpoint
CREATE INDEX "editorial_items_queue_idx" ON "editorial_items" USING btree ("status","importanceScore","discoveredAt");--> statement-breakpoint
CREATE INDEX "editorial_items_source_published_idx" ON "editorial_items" USING btree ("sourceId","publishedAt");--> statement-breakpoint
CREATE INDEX "editorial_sources_enabled_idx" ON "editorial_sources" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "resources_type_idx" ON "resources" USING btree ("resourceType");