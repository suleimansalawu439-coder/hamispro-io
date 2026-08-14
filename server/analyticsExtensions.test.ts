import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateAnalyticsCsv, getDateRangeThreshold } from "./analyticsExtensions";

describe("analytics extensions", () => {
  beforeEach(() => vi.useRealTimers());

  it("calculates a midnight threshold for the selected day range", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T15:30:00.000Z"));
    expect(getDateRangeThreshold(7).toISOString()).toBe("2026-08-05T00:00:00.000Z");
  });

  it("exports KPI and breakdown data as comma-safe CSV", () => {
    const csv = generateAnalyticsCsv({ totalPageviews: 12, uniqueSessions: 7, totalSearches: 2, totalNewsletterSignups: 1, estimatedRevenueCents: 349, browsers: [{ label: "Chrome, Mobile", value: 4 }], devices: [{ label: "Phone", value: 3 }], topPaths: [{ label: "/article/ai,tools", value: 2 }] });
    expect(csv).toContain("Metric,Value");
    expect(csv).toContain("Total Pageviews,12");
    expect(csv).toContain('Browser,"Chrome, Mobile",4');
    expect(csv).toContain('Top Path,"/article/ai,tools",2');
    expect(csv).toContain("Estimated Revenue ($),3.49");
  });
});
