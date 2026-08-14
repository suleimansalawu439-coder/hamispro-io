import { describe, expect, it } from "vitest";
import { aggregateAdEventMetrics, attachAdEventMetrics } from "./adminOperationsMetrics";

describe("ad operations metrics", () => {
  it("aggregates impressions and clicks by placement from tracked events", () => {
    const counters = aggregateAdEventMetrics([
      { eventType: "ad_view", metadata: JSON.stringify({ placement: "header-leaderboard" }) },
      { eventType: "ad_view", metadata: JSON.stringify({ placement: "header-leaderboard" }) },
      { eventType: "ad_click", metadata: JSON.stringify({ placement: "header-leaderboard" }) },
    ]);
    expect(counters.get("header-leaderboard")).toEqual({ impressions: 2, clicks: 1 });
  });

  it("does not treat event counters as provider revenue", () => {
    const placements = attachAdEventMetrics([{ slotKey: "article-in-content", estimatedRevenueCents: 125 }], new Map([["article-in-content", { impressions: 8, clicks: 2 }]]));
    expect(placements[0]).toMatchObject({ eventDerivedImpressions: 8, eventDerivedClicks: 2, reportedRevenueCents: 125 });
  });

  it("ignores malformed metadata without losing the event", () => {
    const counters = aggregateAdEventMetrics([{ eventType: "ad_view", metadata: "not-json" }]);
    expect(counters.get("unknown")).toEqual({ impressions: 1, clicks: 0 });
  });
});
