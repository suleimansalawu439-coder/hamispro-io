import { XMLParser } from "fast-xml-parser";
import crypto from "crypto";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { createIngestionRun, finishIngestionRun, listEditorialSources, markEditorialSourceFetched, upsertEditorialItem, upsertEditorialSource } from "./db";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
});

function computeDedupeHash(canonicalUrl: string, title: string) {
  const cleanUrl = canonicalUrl.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const cleanTitle = title.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return crypto.createHash("sha256").update(`${cleanUrl}:${cleanTitle}`).digest("hex");
}

function computeClusterKey(title: string) {
  const normalized = title.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(word => word.length > 3 && !["about", "after", "with", "from", "this", "that"].includes(word)).slice(0, 8).join("-");
  return normalized.slice(0, 120) || "uncategorized-story";
}

function computeFreshnessScore(publishedAt: Date) {
  const ageHours = Math.max(0, (Date.now() - publishedAt.getTime()) / 3_600_000);
  if (ageHours <= 24) return 100;
  if (ageHours <= 72) return 90;
  if (ageHours <= 168) return 75;
  if (ageHours <= 720) return 55;
  return 30;
}

export async function seedDefaultEditorialSources() {
  return [
    { name: "OpenAI News", sourceType: "rss" as const, feedUrl: "https://openai.com/news/rss.xml", sourceUrl: "https://openai.com/news", domain: "openai.com", defaultCategory: "news" as const, reliabilityScore: 95 },
    { name: "Hugging Face Blog", sourceType: "rss" as const, feedUrl: "https://huggingface.co/blog/feed.xml", sourceUrl: "https://huggingface.co/blog", domain: "huggingface.co", defaultCategory: "tutorials" as const, reliabilityScore: 92 },
    { name: "GitHub AI & LLM Releases", sourceType: "rss" as const, feedUrl: "https://github.blog/tag/ai/feed/", sourceUrl: "https://github.blog/tag/ai/", domain: "github.blog", defaultCategory: "hacks" as const, reliabilityScore: 90 },
  ];
}

export async function runEditorialIngestionPipeline() {
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
        await upsertEditorialSource(def as any);
      }
      sources = await listEditorialSources(true);
    }
    sourceCount = sources.length;

    let model = "gpt-5-mini";
    try {
      const catalog = await listLLMModels();
      const available = catalog.data.map(m => m.id);
      const preferred = ["deepseek-v4-flash", "deepseek-v4-pro", "glm-5.2", "minimax3", "qwen-3.6.7", "gpt-5-mini"];
      model = preferred.find(c => available.some(id => id.toLowerCase().includes(c))) || available.find(id => id.startsWith("gpt-5-mini")) || available[0] || model;
    } catch {
      // fallback
    }

    for (const source of sources) {
      try {
        const response = await fetch(source.feedUrl, { headers: { "user-agent": "HamisproAI/1.0 (Editorial Ingestion Bot)" }, signal: AbortSignal.timeout(12000) });
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
          const publishedAt = publishedRaw ? new Date(publishedRaw) : new Date();

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
            rawPayload: JSON.stringify({ title, link, publishedRaw, sourceName: source.name, discoveredAt: new Date().toISOString(), freshnessScore, clusterKey }).slice(0, 4000),
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
                  { role: "user", content: `${scorePrompt}\n\nSource: ${source.name}\nTitle: ${title}\nExcerpt: ${excerpt}` },
                ],
                responseFormat: { type: "json_schema", json_schema: { name: "editorial_scoring", strict: true, schema: { type: "object", properties: { importanceScore: { type: "integer" }, usefulnessScore: { type: "integer" }, noveltyScore: { type: "integer" }, suggestedCategory: { type: "string" }, aiSummary: { type: "string" }, suggestedAngle: { type: "string" }, keyTakeaways: { type: "string" }, suggestedTags: { type: "string" }, claimWarnings: { type: "string" } }, required: ["importanceScore", "usefulnessScore", "noveltyScore", "suggestedCategory", "aiSummary", "suggestedAngle", "keyTakeaways", "suggestedTags", "claimWarnings"], additionalProperties: false } } },
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
                category: (["hacks", "prompts", "freebies", "tutorials", "news"].includes(parsedScore.suggestedCategory) ? parsedScore.suggestedCategory : source.defaultCategory) as any,
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
                status: "ready",
              });
              enrichedCount++;
            } catch (enrichError) {
              console.warn(`[Editorial Ingestion] Enrichment failed for item ${inserted.id}:`, enrichError);
            }
          }
        }

        await markEditorialSourceFetched(source.id, { error: null });
      } catch (sourceError: any) {
        console.warn(`[Editorial Ingestion] Failed fetching source ${source.name}:`, sourceError);
        await markEditorialSourceFetched(source.id, { error: String(sourceError?.message || sourceError) });
      }
    }

    await finishIngestionRun(runId, { status: "completed", sourceCount, fetchedCount, insertedCount, enrichedCount });
    return { ok: true, sourceCount, fetchedCount, insertedCount, enrichedCount };
  } catch (error: any) {
    await finishIngestionRun(runId, { status: "failed", sourceCount, fetchedCount, insertedCount, enrichedCount, errorMessage: String(error?.message || error) });
    return { ok: false, error: String(error?.message || error) };
  }
}
