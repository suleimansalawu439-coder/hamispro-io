import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn().mockResolvedValue({ isCron: true, taskUid: "task-123" }),
  listDueDigestSubscribers: vi.fn(),
  listDigestCandidates: vi.fn().mockResolvedValue([{ slug: "brief-001" }]),
  markDigestSent: vi.fn().mockResolvedValue(true),
}));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));
vi.mock("./db", () => ({ listDueDigestSubscribers: mocks.listDueDigestSubscribers, listDigestCandidates: mocks.listDigestCandidates, markDigestSent: mocks.markDigestSent }));

import { handleDigestScheduled } from "./digestScheduler";

function responseMock() {
  const response: any = { statusCode: 200, body: null };
  response.status = vi.fn((code: number) => { response.statusCode = code; return response; });
  response.json = vi.fn((body: unknown) => { response.body = body; return response; });
  return response;
}

const request = { originalUrl: "/api/scheduled/sendDigest", headers: {} } as any;

describe("scheduled digest delivery", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("DIGEST_PROVIDER_WEBHOOK_URL", "https://provider.example/digest"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 202 })); });
  it("marks a subscriber only after provider acknowledgment", async () => {
    mocks.listDueDigestSubscribers.mockResolvedValueOnce([{ email: "reader@example.com", frequency: "weekly", topics: "news", lastDigestSentAt: null }]);
    const response = responseMock();
    await handleDigestScheduled(request, response);
    expect(response.statusCode).toBe(200);
    expect(response.body.sent).toBe(1);
    expect(mocks.markDigestSent).toHaveBeenCalledWith("reader@example.com");
  });
  it("suppresses the second run once the due list is empty", async () => {
    mocks.listDueDigestSubscribers.mockResolvedValueOnce([{ email: "reader@example.com", frequency: "weekly", topics: "news", lastDigestSentAt: null }]).mockResolvedValueOnce([]);
    const first = responseMock();
    const second = responseMock();
    await handleDigestScheduled(request, first);
    await handleDigestScheduled(request, second);
    expect(first.body.sent).toBe(1);
    expect(second.body.processed).toBe(0);
    expect(mocks.markDigestSent).toHaveBeenCalledTimes(1);
  });
});
