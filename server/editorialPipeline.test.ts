import { describe, expect, it, vi, beforeEach } from "vitest";
import { runEditorialIngestionPipeline, seedDefaultEditorialSources } from "./editorialIngestion";

const dbMocks = vi.hoisted(() => ({
  createIngestionRun: vi.fn().mockResolvedValue(101),
  finishIngestionRun: vi.fn().mockResolvedValue(true),
  listEditorialSources: vi.fn(),
  upsertEditorialSource: vi.fn().mockResolvedValue({ id: 1 }),
  upsertEditorialItem: vi.fn().mockImplementation(async (input: any) => ({ id: 50, ...input })),
  markEditorialSourceFetched: vi.fn().mockResolvedValue(true),
}));
vi.mock("./db", () => dbMocks);

const llmMocks = vi.hoisted(() => ({
  listLLMModels: vi.fn().mockResolvedValue({ data: [{ id: "gpt-5-mini" }] }),
  invokeLLM: vi.fn().mockResolvedValue({ model: "gpt-5-mini", choices: [{ message: { content: JSON.stringify({ importanceScore: 88, usefulnessScore: 82, noveltyScore: 78, suggestedCategory: "hacks", aiSummary: "Enriched AI summary.", suggestedAngle: "Takeaway angle.", keyTakeaways: "Point 1\nPoint 2", suggestedTags: "ai,hacks" }) } }] }),
}));
vi.mock("./_core/llm", () => llmMocks);

describe("editorial ingestion pipeline comprehensive unit tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds default sources when none are enabled", async () => {
    const defaults = await seedDefaultEditorialSources();
    expect(defaults.length).toBeGreaterThan(0);
    expect(defaults[0]?.domain).toBe("openai.com");
  });

  it("persists enrichment fields and finalizes successful ingestion run", async () => {
    dbMocks.listEditorialSources.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 1, name: "OpenAI News", feedUrl: "https://openai.com/news/rss.xml", defaultCategory: "news", reliabilityScore: 95 }]);
    
    const mockRssXml = `<rss><channel><item><title>Advanced Reasoning Models</title><link>https://openai.com/news/reasoning</link><description>Deep dive into reasoning.</description><pubDate>Mon, 12 Aug 2026 09:00:00 GMT</pubDate></item></channel></rss>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => mockRssXml }));

    const result = await runEditorialIngestionPipeline();
    expect(result.ok).toBe(true);
    expect(dbMocks.createIngestionRun).toHaveBeenCalledWith("scheduled-ingestion");
    expect(dbMocks.upsertEditorialItem).toHaveBeenCalledWith(expect.objectContaining({ aiSummary: "Enriched AI summary.", importanceScore: 88, category: "hacks", modelUsed: "gpt-5-mini", status: "ready" }));
    expect(dbMocks.finishIngestionRun).toHaveBeenCalledWith(101, expect.objectContaining({ status: "completed", sourceCount: 1, fetchedCount: 1, insertedCount: 1, enrichedCount: 1 }));
  });

  it("handles feed fetch failure and finalizes run with error if pipeline crashes", async () => {
    dbMocks.listEditorialSources.mockResolvedValueOnce([{ id: 2, name: "Broken Feed", feedUrl: "https://broken.com/rss.xml", defaultCategory: "news", reliabilityScore: 70 }]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network timeout")));

    const result = await runEditorialIngestionPipeline();
    expect(dbMocks.markEditorialSourceFetched).toHaveBeenCalledWith(2, expect.objectContaining({ error: "Network timeout" }));
    expect(dbMocks.finishIngestionRun).toHaveBeenCalledWith(101, expect.objectContaining({ status: "completed" }));
  });
});
