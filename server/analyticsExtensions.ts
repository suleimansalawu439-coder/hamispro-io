export type DateRangeDays = 7 | 30 | 90 | 365;

export function getDateRangeThreshold(days: DateRangeDays): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function generateAnalyticsCsv(metrics: {
  rangeDays?: number;
  totalPageviews?: number;
  uniqueSessions?: number;
  totalSearches?: number;
  totalNewsletterSignups?: number;
  estimatedRevenueCents?: number;
  browsers?: Array<{ label: string; value: number }>;
  devices?: Array<{ label: string; value: number }>;
  topPaths?: Array<{ label: string; value: number }>;
}) {
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
    ...(metrics.browsers || []).map(b => ["Browser", b.label, String(b.value)]),
    ...(metrics.devices || []).map(d => ["Device", d.label, String(d.value)]),
    ...(metrics.topPaths || []).map(p => ["Top Path", p.label, String(p.value)]),
  ];
  return rows.map(row => row.map(csvCell).join(",")).join("\n");
}
