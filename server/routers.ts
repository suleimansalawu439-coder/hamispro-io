import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { storagePut } from "./storage";
import { createArticle, getArticleBySlug, listAdminAuditLogs, listAllArticles, listPublicArticles, listResources, subscribeEmail, updateArticle, getDigestPreferencesByToken, updateDigestPreferencesByToken, seriesLabels, listEditorialSources, listEditorialQueue, listIngestionRuns, getEditorialItemById, updateEditorialItem, getDashboardMetrics, getLaunchReadiness, listAdPlacements, updateAdPlacement, listSystemSettings, setSystemSetting, trackAnalyticsEvent, upsertUser, getUserByOpenId } from "./db";
import { ENV } from "./_core/env";
import { generateAnalyticsCsv } from "./analyticsExtensions";
import { auditAdminAction, enforceAdminRateLimit } from "./adminSecurity";
import { sdk } from "./_core/sdk";

const categories = ["hacks", "prompts", "freebies", "tutorials", "news"] as const;
const resourceTypes = ["tool", "model", "template", "offer"] as const;

const ownerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.openId !== ENV.ownerOpenId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner access required" });
  }
  return next();
});

export const appRouter = router({
  trackEvent: publicProcedure.input(z.object({ eventType: z.enum(["pageview", "article_read", "search", "newsletter_signup", "ad_view", "ad_click"]), path: z.string().min(1).max(255), sessionId: z.string().min(8).max(64), referrer: z.string().max(500).optional(), browser: z.string().max(120).optional(), device: z.string().max(80).optional(), metadata: z.string().max(2000).optional() })).mutation(async ({ input, ctx }) => { await trackAnalyticsEvent({ ...input, userId: ctx.user?.id, ipAddress: ctx.req.ip }); return { success: true }; }),
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user ? { ...opts.ctx.user, isOwner: opts.ctx.user.openId === ENV.ownerOpenId } : null),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  content: router({
    list: publicProcedure
      .input(z.object({ category: z.enum(categories).optional(), search: z.string().trim().max(80).optional() }).optional())
      .query(({ input }) => listPublicArticles(input?.category, input?.search)),
    bySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(180) })).query(async ({ input }) => {
      const article = await getArticleBySlug(input.slug);
      if (!article) throw new TRPCError({ code: "NOT_FOUND", message: "Article not found" });
      return article;
    }),
    categories: publicProcedure.query(() => categories),
  }),
  resources: router({
    list: publicProcedure.input(z.object({ search: z.string().trim().max(80).optional(), resourceType: z.enum(resourceTypes).optional() }).optional()).query(({ input }) => listResources(input?.search, input?.resourceType)),
  }),
  newsletter: router({
    subscribe: publicProcedure.input(z.object({ email: z.string().email().max(320), source: z.string().max(120).default("homepage") })).mutation(({ input }) => subscribeEmail(input.email.toLowerCase(), input.source)),
    preferences: publicProcedure.input(z.object({ token: z.string().min(20).max(64) })).query(async ({ input }) => {
      const preferences = await getDigestPreferencesByToken(input.token);
      if (!preferences) throw new TRPCError({ code: "NOT_FOUND", message: "Preference link not found" });
      return preferences;
    }),
    updatePreferences: publicProcedure.input(z.object({ token: z.string().min(20).max(64), topics: z.array(z.enum(categories)).min(1).max(5), frequency: z.enum(["weekly", "daily"]), timezone: z.string().min(1).max(80) })).mutation(async ({ input }) => {
      const updated = await updateDigestPreferencesByToken(input.token, { topics: input.topics, frequency: input.frequency, timezone: input.timezone });
      if (!updated.updated) throw new TRPCError({ code: "NOT_FOUND", message: "Preference link not found" });
      return updated;
    }),
    series: publicProcedure.query(() => seriesLabels),
  }),
  admin: router({
    articles: ownerProcedure.query(() => listAllArticles()),
    auditLogs: ownerProcedure.input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).optional()).query(({ input }) => listAdminAuditLogs(input?.limit || 100)),
    saveArticle: ownerProcedure.input(z.object({
      id: z.number().optional(),
      slug: z.string().min(3).max(180),
      title: z.string().min(5).max(240),
      excerpt: z.string().min(20),
      content: z.string().min(20),
      category: z.enum(categories),
      tags: z.string().max(500).default(""),
      seoTitle: z.string().max(240).optional(),
      seoDescription: z.string().max(400).optional(),
      readingTimeMinutes: z.number().int().min(1).max(120).default(5),
      seriesKey: z.string().max(80).optional().nullable(),
      coverImageUrl: z.string().optional(),
      coverImageKey: z.string().optional(),
      published: z.boolean().default(false),
      featured: z.boolean().default(false),
    })).mutation(async ({ input, ctx }) => {
      await enforceAdminRateLimit(ctx, "article.save");
      const payload = { ...input, authorName: ctx.user.name || "Hamispro Editorial", publishedAt: input.published ? new Date() : null };
      const result = input.id ? await updateArticle(input.id, payload) : await createArticle(payload);
      await auditAdminAction(ctx, { action: input.published ? "article.publish" : "article.save_draft", resourceType: "article", resourceId: typeof result?.id === "number" ? result.id : input.id ?? null, metadata: { slug: input.slug, category: input.category, published: input.published } });
      return result;
    }),
    uploadMedia: ownerProcedure.input(z.object({ fileName: z.string().min(1).max(255), mimeType: z.string().min(1).max(120), base64: z.string().min(1), sizeBytes: z.number().int().positive().max(15 * 1024 * 1024) })).mutation(async ({ input, ctx }) => {
      await enforceAdminRateLimit(ctx, "media.upload");
      const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
      const key = `hamispro/${ctx.user.id}/${Date.now()}-${safeName}`;
      const buffer = Buffer.from(input.base64, "base64");
      const result = await storagePut(key, buffer, input.mimeType);
      await auditAdminAction(ctx, { action: "media.upload", resourceType: "media", metadata: { fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes, key } });
      return { ...result, fileName: input.fileName, sizeBytes: input.sizeBytes };
    }),
    writingAssistant: ownerProcedure.input(z.object({ mode: z.enum(["summary", "seo", "tags"]), title: z.string().max(240), content: z.string().max(20000) })).mutation(async ({ input, ctx }) => {
      await enforceAdminRateLimit(ctx, "assistant.generate");
      const task = input.mode === "summary" ? "Write a concise, useful article excerpt in 1-2 sentences." : input.mode === "seo" ? "Write an SEO meta description under 155 characters." : "Suggest 5 concise, relevant tags separated by commas.";
      const response = await invokeLLM({
        messages: [
          { role: "system", content: "You are the Hamispro.io editorial assistant. Be precise, useful, and never invent facts." },
          { role: "user", content: `${task}\n\nTitle: ${input.title}\n\nDraft:\n${input.content}` },
        ],
      });
      const content = response.choices?.[0]?.message?.content;
      await auditAdminAction(ctx, { action: "assistant.generate", resourceType: "writing_assistant", metadata: { mode: input.mode, title: input.title } });
      return { value: typeof content === "string" ? content.trim() : "" };
    }),
    dashboardMetrics: ownerProcedure.input(z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]).optional() }).optional()).query(({ input }) => getDashboardMetrics(input?.days)),
    dashboardMetricsCsv: ownerProcedure.input(z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]).optional() }).optional()).query(async ({ input }) => { const metrics = await getDashboardMetrics(input?.days); return generateAnalyticsCsv({ ...metrics, rangeDays: input?.days }); }),
    launchReadiness: ownerProcedure.query(() => getLaunchReadiness()),
    adPlacements: ownerProcedure.query(() => listAdPlacements()),
    updateAdPlacement: ownerProcedure.input(z.object({ slotKey: z.string().min(1).max(120), enabled: z.boolean().optional(), adType: z.enum(["adsense", "sponsor", "banner"]).optional(), adsenseClient: z.string().optional().nullable(), adsenseSlot: z.string().optional().nullable(), customHtml: z.string().optional().nullable() })).mutation(async ({ input, ctx }) => {
      await enforceAdminRateLimit(ctx, "ads.update");
      const { slotKey, ...changes } = input;
      const res = await updateAdPlacement(slotKey, changes);
      await auditAdminAction(ctx, { action: "ads.update", resourceType: "ad_placement", metadata: { slotKey, changes } });
      return res;
    }),
    systemSettings: ownerProcedure.query(() => listSystemSettings()),
    updateSetting: ownerProcedure.input(z.object({ key: z.string().min(1).max(120), value: z.string() })).mutation(async ({ input, ctx }) => {
      await enforceAdminRateLimit(ctx, "settings.update");
      await setSystemSetting(input.key, input.value);
      await auditAdminAction(ctx, { action: "settings.update", resourceType: "system_setting", metadata: { key: input.key } });
      return { success: true };
    }),
    editorialSources: ownerProcedure.query(() => listEditorialSources()),
    ingestionRuns: ownerProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(20) }).optional()).query(({ input }) => listIngestionRuns(input?.limit ?? 20)),
    reviewQueue: ownerProcedure.input(z.object({ status: z.enum(["new", "processing", "ready", "rejected", "published"]).optional(), limit: z.number().int().min(1).max(100).default(50), offset: z.number().int().min(0).default(0) }).optional()).query(({ input }) => listEditorialQueue(input)),
    reviewItem: ownerProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
      const item = await getEditorialItemById(input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Editorial item not found" });
      return item;
    }),
    refineReviewItem: ownerProcedure.input(z.object({ id: z.number().int().positive(), mode: z.enum(["summary", "angle", "tags", "takeaways"]) })).mutation(async ({ input, ctx }) => {
      await enforceAdminRateLimit(ctx, "editorial.refine");
      const item = await getEditorialItemById(input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Editorial item not found" });
      const preferredModels = ["deepseek-v4-flash", "deepseek-v4-pro", "glm-5.2", "minimax3", "qwen-3.6.7", "gpt-5-mini"];
      let model = "gpt-5-mini";
      try {
        const catalog = await listLLMModels();
        const available = catalog.data.map(entry => entry.id);
        model = preferredModels.find(candidate => available.some(id => id.toLowerCase() === candidate.toLowerCase() || id.toLowerCase().includes(candidate.toLowerCase()))) || available.find(id => id.startsWith("gpt-5-mini")) || available[0] || model;
      } catch (error) {
        console.warn("[Editorial] Model catalog unavailable; using gpt-5-mini fallback", error);
      }
      const modeInstructions = {
        summary: "Write a factual 1–2 sentence summary for an editor. Preserve uncertainty and do not add facts absent from the source metadata.",
        angle: "Suggest one sharp, reader-first Hamispro editorial angle in a single sentence. Do not exaggerate or invent implications.",
        tags: "Return 3–6 concise topical tags as a comma-separated string. Use lowercase nouns or short phrases only.",
        takeaways: "Return up to 3 useful takeaways, one per line. Only state what can be supported by the supplied source metadata.",
      } as const;
      const response = await invokeLLM({
        model,
        maxTokens: 320,
        messages: [
          { role: "system", content: "You are the Hamispro.io editorial intelligence assistant. You help an owner-editor refine sourced material. Never fabricate facts, quotes, numbers, product capabilities, or dates. Output JSON only." },
          { role: "user", content: `${modeInstructions[input.mode]}\n\nSource: ${item.sourceName}\nTitle: ${item.title}\nExcerpt: ${item.excerpt}\nCanonical URL: ${item.canonicalUrl}\nExisting suggestion: ${input.mode === "summary" ? item.aiSummary || "none" : input.mode === "angle" ? item.suggestedAngle || "none" : input.mode === "tags" ? item.suggestedTags || "none" : item.keyTakeaways || "none"}` },
        ],
        responseFormat: { type: "json_schema", json_schema: { name: "editorial_refinement", strict: true, schema: { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false } } },
      });
      const raw = response.choices?.[0]?.message?.content;
      let value = "";
      try { value = typeof raw === "string" ? (JSON.parse(raw).value || "").trim() : ""; } catch { value = typeof raw === "string" ? raw.trim() : ""; }
      if (!value) throw new TRPCError({ code: "BAD_REQUEST", message: "The editorial model returned no usable refinement" });
      const fieldByMode = { summary: "aiSummary", angle: "suggestedAngle", tags: "suggestedTags", takeaways: "keyTakeaways" } as const;
      const result = await updateEditorialItem(input.id, { [fieldByMode[input.mode]]: value, modelUsed: response.model || model, status: "ready", reviewedAt: new Date() });
      await auditAdminAction(ctx, { action: "editorial.refine", resourceType: "editorial_item", resourceId: input.id, metadata: { mode: input.mode, model: response.model || model } });
      return result;
    }),
    updateReviewItem: ownerProcedure.input(z.object({
      id: z.number().int().positive(),
      status: z.enum(["new", "processing", "ready", "rejected", "published"]).optional(),
      itemType: z.enum(["news", "tutorial", "hack", "cheat", "freebie", "tool", "release"]).optional(),
      category: z.enum(categories).optional(),
      suggestedTitle: z.string().max(240).optional().nullable(),
      suggestedAngle: z.string().max(5000).optional().nullable(),
      aiSummary: z.string().max(5000).optional().nullable(),
      keyTakeaways: z.string().max(10000).optional().nullable(),
      suggestedTags: z.string().max(500).optional().nullable(),
      reviewerNotes: z.string().max(5000).optional().nullable(),
      importanceScore: z.number().int().min(0).max(100).optional(),
      usefulnessScore: z.number().int().min(0).max(100).optional(),
      noveltyScore: z.number().int().min(0).max(100).optional(),
      confidenceScore: z.number().int().min(0).max(100).optional(),
      freshnessScore: z.number().int().min(0).max(100).optional(),
      verificationStatus: z.enum(["unverified", "verified", "needs_review"]).optional(),
      clusterKey: z.string().max(120).optional().nullable(),
      claimWarnings: z.string().max(10000).optional().nullable(),
    })).mutation(async ({ input, ctx }) => {
      await enforceAdminRateLimit(ctx, "editorial.review");
      const { id, ...changes } = input;
      const result = await updateEditorialItem(id, { ...changes, reviewedAt: changes.status && changes.status !== "new" ? new Date() : undefined });
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Editorial item not found" });
      await auditAdminAction(ctx, { action: "editorial.review", resourceType: "editorial_item", resourceId: id, metadata: { status: input.status, category: input.category } });
      return result;
    }),
    publishReviewItem: ownerProcedure.input(z.object({
      id: z.number().int().positive(),
      slug: z.string().min(3).max(180),
      title: z.string().min(5).max(240),
      excerpt: z.string().min(20).max(600),
      content: z.string().min(20).max(50000),
      category: z.enum(categories),
      tags: z.string().max(500).default(""),
      seoTitle: z.string().max(240).optional(),
      seoDescription: z.string().max(400).optional(),
      seriesKey: z.string().max(80).optional().nullable(),
      featured: z.boolean().default(false),
    })).mutation(async ({ input, ctx }) => {
      await enforceAdminRateLimit(ctx, "editorial.publish");
      const item = await getEditorialItemById(input.id);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Editorial item not found" });
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
        publishedAt: new Date(),
        authorName: ctx.user.name || "Hamispro Editorial",
      });
      await updateEditorialItem(input.id, { status: "published", linkedArticleId: typeof article?.id === "number" ? article.id : null, reviewedAt: new Date() });
      await auditAdminAction(ctx, { action: "editorial.publish", resourceType: "editorial_item", resourceId: input.id, metadata: { articleId: article?.id, slug: input.slug, category: input.category } });
      return article;
    }),
  }),
});

export type AppRouter = typeof appRouter;
