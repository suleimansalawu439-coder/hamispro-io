import React from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { getOperationsQueryError } from "./adminOperationsHelpers";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Activity as ActivityIcon, ArrowUpRight, BarChart3, CheckCircle2, ChevronRight, CircleDollarSign, Download, Eye, Gauge, Mail, Megaphone, Moon, MousePointerClick, Palette, Radio, RefreshCw, Rss, Save, Search, Settings2, ShieldCheck, Sun, Users, WalletCards } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeContext";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const pageConfig: Record<string, { eyebrow: string; title: string; description: string }> = {
  dashboard: { eyebrow: "Owner command center", title: "Good morning, operator.", description: "A clear view of audience, publishing velocity, revenue signals, and editorial system health." },
  analytics: { eyebrow: "Audience intelligence", title: "Analytics that explain attention.", description: "Track sessions, browsers, reading behavior, discovery, newsletter growth, and ad activity." },
  ads: { eyebrow: "Revenue operations", title: "Ads & revenue.", description: "Manage AdSense-ready placements and monitor impressions, clicks, and estimated revenue." },
  sources: { eyebrow: "Signal infrastructure", title: "Source health.", description: "Monitor feed freshness, ingestion reliability, and the signals entering the review queue." },
  newsletter: { eyebrow: "Audience relationship", title: "Newsletter control room.", description: "Understand subscriber growth and keep the personalized digest system healthy." },
  audit: { eyebrow: "Operational trust", title: "Activity & audit.", description: "Review ingestion runs, editorial operations, and the health of owner-side automation." },
  settings: { eyebrow: "System configuration", title: "Settings.", description: "Tune the publication’s operational behavior without editing code." },
};

function formatNumber(value: number | undefined) { return new Intl.NumberFormat("en-US", { notation: value && value > 9999 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value || 0); }
function formatMoney(cents: number | undefined) { return `$${((cents || 0) / 100).toFixed(2)}`; }

function KpiCard({ label, value, note, icon: Icon, accent = "lime" }: { label: string; value: string; note: string; icon: LucideIcon; accent?: string }) {
  return <article className={`ops-kpi ops-kpi-${accent}`}><div className="ops-kpi-top"><span>{label}</span><Icon size={16} /></div><strong>{value}</strong><small>{note}</small></article>;
}

export function QueryNotice({ label, message, onRetry }: { label: string; message: string; onRetry: () => void }) { return <div className="ops-error ops-error-inline" role="alert"><strong>{label} unavailable.</strong><span>{message}</span><button className="button secondary small" onClick={onRetry}>Retry</button></div>; }

type AnalyticsDays = 7 | 30 | 90 | 365;

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function AnalyticsToolbar({ days, onDaysChange, onExport, isExporting, error }: { days: AnalyticsDays; onDaysChange: (days: AnalyticsDays) => void; onExport: () => void; isExporting: boolean; error?: string }) {
  return <div className="ops-analytics-toolbar"><div><span className="eyebrow">Reporting window</span><strong>Analyze a focused period</strong>{error ? <small className="ops-inline-error" role="alert">CSV export unavailable: {error}</small> : null}</div><div className="ops-analytics-actions"><label className="ops-select-wrap"><span className="sr-only">Analytics date range</span><select value={days} onChange={event => onDaysChange(Number(event.target.value) as AnalyticsDays)}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 365 days</option></select></label><button className="button secondary small" type="button" onClick={onExport} disabled={isExporting}><Download size={14} />{isExporting ? "Preparing…" : "Export CSV"}</button></div></div>;
}

function AnalyticsChart({ daily }: { daily: Array<{ date: string; pageviews: number; reads: number; adViews: number; adClicks: number }> }) {
  return <div className="ops-chart-card"><div className="ops-card-heading"><div><span className="eyebrow">Selected range</span><h3>Attention trend</h3></div><span className="ops-legend"><i className="legend-pageviews" /> Pageviews <i className="legend-reads" /> Reads</span></div>{daily.length ? <div className="ops-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={daily}><defs><linearGradient id="pageviewsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d6ff38" stopOpacity={0.55} /><stop offset="100%" stopColor="#d6ff38" stopOpacity={0} /></linearGradient><linearGradient id="readsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f2876b" stopOpacity={0.38} /><stop offset="100%" stopColor="#f2876b" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#dfe2da" vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#778077" }} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#778077" }} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #dfe2da", boxShadow: "0 12px 30px rgba(24,32,29,.1)" }} /><Area type="monotone" dataKey="pageviews" stroke="#61770d" strokeWidth={2.5} fill="url(#pageviewsFill)" /><Area type="monotone" dataKey="reads" stroke="#e57457" strokeWidth={2} fill="url(#readsFill)" /></AreaChart></ResponsiveContainer></div> : <div className="ops-empty"><BarChart3 size={20} /><strong>Waiting for analytics events</strong><span>Once public traffic is tracked, this chart will show actual daily attention.</span></div>}</div>;
}

function ReadinessCard({ readiness }: { readiness: any }) { return <article className="ops-card ops-readiness-card"><div className="ops-card-heading"><div><span className="eyebrow">Launch checklist</span><h3>{readiness?.ready ? "Ready for the next release." : "A few checks need attention."}</h3></div><ShieldCheck size={18} /></div><div className="ops-readiness-list">{(readiness?.checks || []).map((check: any) => <div key={check.key}><span className={`ops-health ${check.ready ? "good" : "bad"}`}>{check.ready ? "Ready" : "Action"}</span><strong>{check.label}</strong><small>{check.detail}</small></div>)}</div></article>; }

function DashboardView({ metrics, readiness }: { metrics: any; readiness: any }) {
  return <>
    <div className="ops-kpi-grid">
      <KpiCard label="Pageviews" value={formatNumber(metrics?.totalPageviews)} note="All tracked public views" icon={Eye} />
      <KpiCard label="Unique sessions" value={formatNumber(metrics?.uniqueSessions)} note="Distinct session IDs" icon={Users} accent="coral" />
      <KpiCard label="Article reads" value={formatNumber(metrics?.totalArticleReads)} note="Reading-intent events" icon={Gauge} accent="purple" />
      <KpiCard label="Subscribers" value={formatNumber(metrics?.totalSubscribers)} note="Digest audience" icon={Mail} accent="blue" />
      <KpiCard label="Ad clicks" value={formatNumber(metrics?.totalAdClicks)} note="Measured placement clicks" icon={MousePointerClick} accent="coral" />
      <KpiCard label="Est. revenue" value={formatMoney(metrics?.estimatedRevenueCents)} note="Configured placement totals" icon={WalletCards} accent="purple" />
    </div>
    <div className="ops-dashboard-grid"><AnalyticsChart daily={metrics?.daily || []} /><article className="ops-card ops-command-card"><div className="ops-card-heading"><div><span className="eyebrow">Operator focus</span><h3>What needs attention</h3></div><ShieldCheck size={18} /></div><div className="ops-checklist"><div><CheckCircle2 size={16} /><span>Owner access is protected by strict openId checks.</span></div><div><CheckCircle2 size={16} /><span>Editorial queue is ready for manual refinement.</span></div><div><Radio size={16} /><span>Source health and ingestion runs are one click away.</span></div><div><ArrowUpRight size={16} /><span>Publish consistently before optimizing ad density.</span></div></div><Link href="/admin/queue" className="ops-text-link">Open review queue <ChevronRight size={15} /></Link></article></div>
    <ReadinessCard readiness={readiness} />
  </>;
}

function BreakdownCard({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) { const max = Math.max(...rows.map(row => row.value), 1); return <div className="ops-card ops-breakdown-card"><div className="ops-card-heading"><div><span className="eyebrow">Measured distribution</span><h3>{title}</h3></div><BarChart3 size={17} /></div>{rows.length ? <div className="ops-breakdown-list">{rows.map(row => <div key={row.label}><div className="ops-breakdown-label"><strong>{row.label}</strong><span>{formatNumber(row.value)}</span></div><div className="ops-breakdown-track"><span style={{ width: `${Math.max(4, Math.round((row.value / max) * 100))}%` }} /></div></div>)}</div> : <div className="ops-empty"><strong>No events yet</strong><span>Real traffic will populate this distribution.</span></div>}</div>; }

function AnalyticsView({ metrics, days, onDaysChange, onExport, isExporting, exportError }: { metrics: any; days: AnalyticsDays; onDaysChange: (days: AnalyticsDays) => void; onExport: () => void; isExporting: boolean; exportError?: string }) {
  return <><AnalyticsToolbar days={days} onDaysChange={onDaysChange} onExport={onExport} isExporting={isExporting} error={exportError} /><div className="ops-kpi-grid ops-kpi-grid-wide"><KpiCard label="Pageviews" value={formatNumber(metrics?.totalPageviews)} note="Public traffic" icon={Eye} /><KpiCard label="Sessions" value={formatNumber(metrics?.uniqueSessions)} note="Deduplicated sessions" icon={Users} accent="coral" /><KpiCard label="Searches" value={formatNumber(metrics?.totalSearches)} note="On-site discovery intent" icon={Search} accent="purple" /><KpiCard label="Newsletter signups" value={formatNumber(metrics?.totalNewsletterSignups)} note="Tracked conversion events" icon={Mail} accent="blue" /></div><AnalyticsChart daily={metrics?.daily || []} /><div className="ops-breakdown-grid"><BreakdownCard title="Browsers" rows={metrics?.browsers || []} /><BreakdownCard title="Devices" rows={metrics?.devices || []} /><BreakdownCard title="Event mix" rows={metrics?.events || []} /><BreakdownCard title="Top content paths" rows={metrics?.topPaths || []} /></div><div className="ops-card"><div className="ops-card-heading"><div><span className="eyebrow">Instrumentation map</span><h3>Metrics being tracked</h3></div><BarChart3 size={18} /></div><div className="ops-metric-list">{[["Pageviews", "Every public route view"], ["Article reads", "Reading-intent on article pages"], ["Searches", "Search submit behavior"], ["Newsletter signups", "Lead magnet and digest conversion"], ["Ad views", "Ad placement impressions"], ["Ad clicks", "Ad placement click-through"], ["Browser & device", "Captured alongside session events"], ["Users", "Authenticated users in the owner database"]].map(([label, desc]) => <div key={label}><strong>{label}</strong><span>{desc}</span><CheckCircle2 size={15} /></div>)}</div></div></>;
}

export function AdsView({ placements, onUpdate, isUpdating, error, onRetry }: { placements: any[]; onUpdate: (slotKey: string, enabled: boolean) => void; isUpdating: boolean; error?: string; onRetry: () => void }) {
  return <>{error ? <QueryNotice label="Ads data" message={error} onRetry={onRetry} /> : null}<div className="ops-kpi-grid ops-kpi-grid-wide"><KpiCard label="Placements" value={formatNumber(placements.length)} note="Configured ad surfaces" icon={Megaphone} /><KpiCard label="Impressions" value={formatNumber(placements.reduce((sum, ad) => sum + ad.eventDerivedImpressions, 0))} note="Event-derived counters" icon={Eye} accent="coral" /><KpiCard label="Clicks" value={formatNumber(placements.reduce((sum, ad) => sum + ad.eventDerivedClicks, 0))} note="Measured interactions" icon={MousePointerClick} accent="purple" /><KpiCard label="Reported revenue" value={formatMoney(placements.reduce((sum, ad) => sum + ad.reportedRevenueCents, 0))} note="Provider/manual values" icon={CircleDollarSign} accent="blue" /></div><div className="ops-card"><div className="ops-card-heading"><div><span className="eyebrow">Placement registry</span><h3>Ads, sponsorships, and banners</h3></div><span className="ops-live-badge">Owner editable</span></div><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Placement</th><th>Type</th><th>Impressions</th><th>Clicks</th><th>Reported revenue</th><th>State</th></tr></thead><tbody>{placements.length ? placements.map(ad => <tr key={ad.slotKey}><td><strong>{ad.name}</strong><small>{ad.slotKey}</small></td><td><span className="ops-chip">{ad.adType}</span></td><td>{formatNumber(ad.eventDerivedImpressions)}</td><td>{formatNumber(ad.eventDerivedClicks)}</td><td>{formatMoney(ad.reportedRevenueCents)}</td><td><button className={`ops-toggle ${ad.enabled ? "enabled" : ""}`} disabled={isUpdating} onClick={() => onUpdate(ad.slotKey, !ad.enabled)} aria-label={`Toggle ${ad.name}`}>{ad.enabled ? "Live" : "Off"}</button></td></tr>) : <tr><td colSpan={6}><div className="ops-empty"><Megaphone size={20} /><strong>No placements yet</strong><span>Seed placements from the Settings page before enabling production ads.</span></div></td></tr>}</tbody></table></div></div></>;
}

function sourceFreshness(source: any) { const fetchedAt = source.lastFetchedAt ? new Date(source.lastFetchedAt).getTime() : 0; const stale = !fetchedAt || Date.now() - fetchedAt > 48 * 60 * 60 * 1000; return { stale, label: stale ? "Stale" : "Fresh" }; }

export function SourcesView({ sources, runs, error, onRetry }: { sources: any[]; runs: any[]; error?: string; onRetry: () => void }) {
  return <>{error ? <QueryNotice label="Source monitoring" message={error} onRetry={onRetry} /> : null}<div className="ops-kpi-grid ops-kpi-grid-wide"><KpiCard label="Enabled sources" value={formatNumber(sources.filter(source => source.enabled).length)} note="Feeds currently polled" icon={Rss} /><KpiCard label="Healthy feeds" value={formatNumber(sources.filter(source => !source.lastError).length)} note="No recorded last error" icon={CheckCircle2} accent="lime" /><KpiCard label="Recent runs" value={formatNumber(runs.length)} note="Latest ingestion records" icon={RefreshCw} accent="purple" /></div><div className="ops-card"><div className="ops-card-heading"><div><span className="eyebrow">Feed registry</span><h3>Source health</h3></div><Link href="/admin/queue" className="ops-text-link">Review queue <ChevronRight size={15} /></Link></div><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Source</th><th>Category</th><th>Reliability</th><th>Last fetched</th><th>Health</th></tr></thead><tbody>{sources.map(source => <tr key={source.id}><td><strong>{source.name}</strong><small>{source.domain}</small></td><td>{source.defaultCategory}</td><td>{source.reliabilityScore}/100</td><td>{source.lastFetchedAt ? new Date(source.lastFetchedAt).toLocaleString() : "Never"}</td><td><span className={`ops-health ${source.lastError || sourceFreshness(source).stale ? "bad" : "good"}`}>{source.lastError ? "Needs attention" : sourceFreshness(source).label}</span>{source.lastError ? <small>{source.lastError}</small> : null}</td></tr>)}</tbody></table></div></div><div className="ops-card"><div className="ops-card-heading"><div><span className="eyebrow">Run history</span><h3>Ingestion operations</h3></div><RefreshCw size={18} /></div><div className="ops-run-list">{runs.map(run => <div key={run.id}><span className={`ops-health ${run.status === "completed" ? "good" : "bad"}`}>{run.status}</span><strong>{run.runType}</strong><span>{run.insertedCount} inserted · {run.enrichedCount} enriched</span><time>{new Date(run.startedAt).toLocaleString()}</time></div>)}</div></div></>;
}

export function ActivityView({ logs, error, onRetry }: { logs: any[]; error?: string; onRetry: () => void }) { return <>{error ? <QueryNotice label="Activity data" message={error} onRetry={onRetry} /> : null}<div className="ops-card"><div className="ops-card-heading"><div><span className="eyebrow">Operational trust</span><h3>Owner activity ledger</h3></div><ActivityIcon size={18} /></div><div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Action</th><th>Resource</th><th>Actor</th><th>Metadata</th><th>Time</th></tr></thead><tbody>{logs.length ? logs.map(log => <tr key={log.id}><td><strong>{log.action}</strong><small>{log.requestId || "Owner action"}</small></td><td><span className="ops-chip">{log.resourceType || "system"}</span><small>{log.resourceId ? `#${log.resourceId}` : "-"}</small></td><td>{log.actorName || log.actorOpenId || "Owner"}</td><td><small>{log.metadata ? String(log.metadata).slice(0, 180) : "No extra metadata"}</small></td><td><small>{log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}</small></td></tr>) : <tr><td colSpan={5}><div className="ops-empty"><ActivityIcon size={20} /><strong>No owner activity yet</strong><span>Publishing, review, settings, ads, and media actions will appear here.</span></div></td></tr>}</tbody></table></div></div></>; }

function OperationsLoadingState({ section }: { section: string }) { return <main className="ops-content ops-loading-content"><div className="ops-kpi-grid ops-kpi-grid-wide">{Array.from({ length: section === "dashboard" ? 6 : 4 }).map((_, index) => <div key={index} className="ops-kpi ops-skeleton" />)}</div><div className="ops-dashboard-grid"><div className="ops-chart-card ops-skeleton-panel"><span className="ops-skeleton-line" /><span className="ops-skeleton-title" /><span className="ops-skeleton-chart" /></div><div className="ops-card ops-skeleton-panel"><span className="ops-skeleton-line" /><span className="ops-skeleton-title" /><span className="ops-skeleton-list" /></div></div></main>; }

export function SettingsView({ settings, onSave, isSaving, error, onRetry, theme, onToggleTheme, accentColor, onAccentChange }: { settings: any[]; onSave: (key: string, value: string) => void; isSaving: boolean; error?: string; onRetry: () => void; theme: "light" | "dark"; onToggleTheme: () => void; accentColor: string; onAccentChange: (color: string) => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const rows = settings.filter(setting => !["owner.theme", "owner.accentColor"].includes(setting.key));
  const fallbackRows = rows.length ? rows : [{ key: "publication.defaultTimeZone", value: "UTC" }, { key: "analytics.retentionDays", value: "30" }, { key: "editorial.minimumConfidence", value: "70" }];
  const accentOptions = ["#d6ff56", "#9ce8ff", "#ffc27d", "#f6a7ff"];
  return <>{error ? <QueryNotice label="Settings data" message={error} onRetry={onRetry} /> : null}<div className="ops-card ops-theme-card"><div className="ops-card-heading"><div><span className="eyebrow">Owner appearance</span><h3>Make the desk yours.</h3><p>Theme preferences are stored server-side and follow you between sessions.</p></div><Palette size={18} /></div><div className="ops-theme-controls"><div className="ops-theme-control"><div><strong>Color mode</strong><small>Switch the owner console between a bright and low-light workspace.</small></div><button type="button" className={`ops-theme-toggle ${theme === "dark" ? "is-dark" : ""}`} onClick={onToggleTheme} aria-pressed={theme === "dark"}><span>{theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}</span>{theme === "dark" ? "Dark mode" : "Light mode"}</button></div><div className="ops-theme-control"><div><strong>Accent color</strong><small>Choose the lime, sky, amber, or violet operator accent.</small></div><div className="ops-accent-options">{accentOptions.map(color => <button key={color} type="button" className={`ops-accent-swatch ${accentColor === color ? "selected" : ""}`} style={{ background: color }} onClick={() => onAccentChange(color)} aria-label={`Use ${color} accent`} aria-pressed={accentColor === color} />)}</div></div></div></div><div className="ops-card"><div className="ops-card-heading"><div><span className="eyebrow">Publication controls</span><h3>System settings</h3></div><Settings2 size={18} /></div><div className="ops-settings-list">{fallbackRows.map(setting => <label key={setting.key} className="ops-setting-row"><span><strong>{setting.key}</strong><small>Stored server-side and owner-editable.</small></span><input value={drafts[setting.key] ?? setting.value} onChange={event => setDrafts(current => ({ ...current, [setting.key]: event.target.value }))} /><button className="button secondary small" disabled={isSaving} onClick={() => onSave(setting.key, drafts[setting.key] ?? setting.value)}><Save size={13} /> Save</button></label>)}</div></div></>;
}

export default function AdminOperationsPage({ params }: { params?: { section?: string } }) {
  const section = params?.section || "dashboard";
  const config = pageConfig[section] || pageConfig.dashboard;
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const enabled = Boolean(user?.isOwner);
  const { theme, toggleTheme } = useTheme();
  const [analyticsDays, setAnalyticsDays] = useState<AnalyticsDays>(30);
  const [accentColor, setAccentColor] = useState("#d6ff56");
  const analyticsInput = useMemo(() => ({ days: analyticsDays }), [analyticsDays]);
  const metricsEnabled = enabled && ["dashboard", "analytics", "newsletter"].includes(section);
  const metricsQuery = trpc.admin.dashboardMetrics.useQuery(analyticsInput, { enabled: metricsEnabled });
  const csvQuery = trpc.admin.dashboardMetricsCsv.useQuery(analyticsInput, { enabled: enabled && section === "analytics" });
  const readinessQuery = trpc.admin.launchReadiness.useQuery(undefined, { enabled: enabled && section === "dashboard" });
  const adsQuery = trpc.admin.adPlacements.useQuery(undefined, { enabled: enabled && section === "ads" });
  const sourceEnabled = enabled && ["sources", "audit"].includes(section);
  const sourcesQuery = trpc.admin.editorialSources.useQuery(undefined, { enabled: sourceEnabled });
  const runsQuery = trpc.admin.ingestionRuns.useQuery({ limit: 20 }, { enabled: sourceEnabled });
  const settingsQuery = trpc.admin.systemSettings.useQuery(undefined, { enabled: enabled && section === "settings" });
  const auditQuery = trpc.admin.auditLogs.useQuery({ limit: 100 }, { enabled: enabled && section === "audit" });
  const updateAd = trpc.admin.updateAdPlacement.useMutation({ onSuccess: () => adsQuery.refetch() });
  const saveSetting = trpc.admin.updateSetting.useMutation({ onSuccess: () => settingsQuery.refetch() });
  useEffect(() => {
    const savedTheme = (settingsQuery.data || []).find((setting: any) => setting.key === "owner.theme")?.value;
    if ((savedTheme === "dark" || savedTheme === "light") && savedTheme !== theme) toggleTheme?.();
    const savedAccent = (settingsQuery.data || []).find((setting: any) => setting.key === "owner.accentColor")?.value;
    if (typeof savedAccent === "string" && savedAccent.startsWith("#")) setAccentColor(savedAccent);
  }, [settingsQuery.data, theme, toggleTheme]);
  useEffect(() => {
    document.documentElement.style.setProperty("--owner-accent", accentColor);
  }, [accentColor]);
  const handleExport = async () => {
    const result = await csvQuery.refetch();
    if (result.data) downloadCsv(`hamispro-analytics-${analyticsDays}d.csv`, result.data);
  };
  const handleToggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    toggleTheme?.();
    saveSetting.mutate({ key: "owner.theme", value: nextTheme });
  };
  const handleAccentChange = (color: string) => {
    setAccentColor(color);
    saveSetting.mutate({ key: "owner.accentColor", value: color });
  };
  const data = metricsQuery.data as any;
  const loading = metricsEnabled && metricsQuery.isLoading && !data;
  const page = section === "analytics" ? <AnalyticsView metrics={data} days={analyticsDays} onDaysChange={setAnalyticsDays} onExport={handleExport} isExporting={csvQuery.isFetching} exportError={csvQuery.error?.message} /> : section === "ads" ? <AdsView placements={(adsQuery.data || []) as any[]} isUpdating={updateAd.isPending} onUpdate={(slotKey, enabledValue) => updateAd.mutate({ slotKey, enabled: enabledValue })} error={adsQuery.error?.message} onRetry={() => adsQuery.refetch()} /> : section === "sources" ? <SourcesView sources={(sourcesQuery.data || []) as any[]} runs={(runsQuery.data || []) as any[]} error={getOperationsQueryError(sourcesQuery.error?.message, runsQuery.error?.message)} onRetry={() => { void Promise.all([sourcesQuery.refetch(), runsQuery.refetch()]); }} /> : section === "newsletter" ? <><div className="ops-kpi-grid ops-kpi-grid-wide"><KpiCard label="Subscribers" value={formatNumber(data?.totalSubscribers)} note="Current digest audience" icon={Mail} /><KpiCard label="Signup events" value={formatNumber(data?.totalNewsletterSignups)} note="Tracked conversion actions" icon={Users} accent="coral" /></div><div className="ops-card ops-newsletter-card"><Mail size={24} /><div><span className="eyebrow">Personalized digest</span><h3>Your audience system is ready for iteration.</h3><p>Use the existing topic preferences, frequency controls, and digest scheduler as the foundation for growth experiments.</p><Link href="/digest" className="ops-text-link">Preview subscriber preferences <ArrowUpRight size={15} /></Link></div></div></> : section === "audit" ? <ActivityView logs={(auditQuery.data || []) as any[]} error={auditQuery.error?.message} onRetry={() => auditQuery.refetch()} /> : section === "settings" ? <SettingsView settings={(settingsQuery.data || []) as any[]} isSaving={saveSetting.isPending} onSave={(key, value) => saveSetting.mutate({ key, value })} error={settingsQuery.error?.message} onRetry={() => settingsQuery.refetch()} theme={theme} onToggleTheme={handleToggleTheme} accentColor={accentColor} onAccentChange={handleAccentChange} /> : <DashboardView metrics={data} readiness={readinessQuery.data} />;
  return <DashboardLayout><div className="ops-shell"><header className="ops-header"><div><span className="ops-brand-mark">H</span><div><div className="eyebrow">Hamispro.io · Owner backend</div><h1>{config.title}</h1><p>{config.description}</p></div></div><div className="ops-header-actions"><span className="ops-owner-pill"><span /> Owner mode</span><a className="button secondary small" href="/" target="_blank" rel="noreferrer">View site <ArrowUpRight size={14} /></a></div></header>{loading ? <OperationsLoadingState section={section} /> : metricsQuery.error ? <div className="ops-error"><strong>Backend data unavailable.</strong><span>{metricsQuery.error.message}</span><button className="button secondary small" onClick={() => metricsQuery.refetch()}>Retry</button></div> : <main className="ops-content">{page}</main>}</div></DashboardLayout>;
}
