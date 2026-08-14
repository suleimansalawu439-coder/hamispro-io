export type AdEventMetricInput = { eventType: string; metadata?: string | null };
export type AdEventCounters = { impressions: number; clicks: number };

export function aggregateAdEventMetrics(events: AdEventMetricInput[]) {
  const counters = new Map<string, AdEventCounters>();
  for (const event of events) {
    let placement = "unknown";
    try { placement = event.metadata ? (JSON.parse(event.metadata).placement || placement) : placement; } catch { /* malformed metadata is ignored */ }
    const counter = counters.get(placement) || { impressions: 0, clicks: 0 };
    if (event.eventType === "ad_view") counter.impressions += 1;
    if (event.eventType === "ad_click") counter.clicks += 1;
    counters.set(placement, counter);
  }
  return counters;
}

export function attachAdEventMetrics<T extends { slotKey: string; estimatedRevenueCents: number }>(placements: T[], counters: Map<string, AdEventCounters>) {
  return placements.map(placement => ({
    ...placement,
    eventDerivedImpressions: counters.get(placement.slotKey)?.impressions || 0,
    eventDerivedClicks: counters.get(placement.slotKey)?.clicks || 0,
    reportedRevenueCents: placement.estimatedRevenueCents,
  }));
}
