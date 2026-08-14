import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bold, Check, ExternalLink, Eye, FileUp, Heading2, Italic, Link2, Loader2, Plus, RefreshCw, Sparkles, Underline, X } from "lucide-react";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { MarkdownArticle } from "@/components/ContentPrimitives";
import { trpc } from "@/lib/trpc";
import { queueActionErrorText, queueDetailErrorText } from "@/pages/adminQueueHelpers";
import { useLocation } from "wouter";

type Category = "hacks" | "prompts" | "freebies" | "tutorials" | "news";
type Draft = { id?: number; slug: string; title: string; excerpt: string; content: string; category: Category; seriesKey: string | null; tags: string; seoTitle: string; seoDescription: string; readingTimeMinutes: number; coverImageUrl: string; coverImageKey: string; published: boolean; featured: boolean };
const blank: Draft = { slug: "new-ai-note", title: "", excerpt: "", content: "<h2>Start writing</h2><p>Add the useful idea here.</p>", category: "hacks", seriesKey: null, tags: "", seoTitle: "", seoDescription: "", readingTimeMinutes: 5, coverImageUrl: "", coverImageKey: "", published: false, featured: false };

type QueueStatus = "new" | "processing" | "ready" | "rejected" | "published";
type QueueItem = {
  id: number;
  status: QueueStatus;
  itemType: string;
  category: Category;
  title: string;
  excerpt: string;
  sourceName: string;
  canonicalUrl: string;
  publishedAt: string | Date | null;
  suggestedTitle: string | null;
  aiSummary: string | null;
  suggestedAngle: string | null;
  keyTakeaways: string | null;
  suggestedTags: string | null;
  reviewerNotes: string | null;
  importanceScore: number;
  usefulnessScore: number;
  noveltyScore: number;
  confidenceScore: number;
  freshnessScore: number;
  verificationStatus: "unverified" | "verified" | "needs_review";
  clusterKey: string | null;
  claimWarnings: string | null;
  rawPayload: string | null;
  modelUsed: string | null;
};
type QueueDraft = Omit<QueueItem, "publishedAt"> & { publishedAt: string };

function escapeHtml(value: string) { return value.replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] || char)); }
function markdownToEditorHtml(value: string) { return value.split("\n").map(line => line.startsWith("### ") ? `<h3>${escapeHtml(line.slice(4))}</h3>` : line.startsWith("## ") ? `<h2>${escapeHtml(line.slice(3))}</h2>` : line.startsWith("- ") ? `<ul><li>${escapeHtml(line.slice(2))}</li></ul>` : line.trim() ? `<p>${escapeHtml(line)}</p>` : "").join(""); }
function toDraft(article: any): Draft { return { ...blank, ...article, content: article.content?.trim().startsWith("<") ? article.content : markdownToEditorHtml(article.content || ""), seoTitle: article.seoTitle || "", seoDescription: article.seoDescription || "", coverImageUrl: article.coverImageUrl || "", coverImageKey: article.coverImageKey || "", tags: (article.tags || []).join(",") }; }
function toQueueDraft(item: QueueItem): QueueDraft { return { ...item, publishedAt: item.publishedAt ? new Date(item.publishedAt).toLocaleDateString() : "Unknown date", suggestedTitle: item.suggestedTitle || item.title, aiSummary: item.aiSummary || item.excerpt, suggestedAngle: item.suggestedAngle || "", keyTakeaways: item.keyTakeaways || "", suggestedTags: item.suggestedTags || "", reviewerNotes: item.reviewerNotes || "" }; }
function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 150) || "new-ai-story"; }
function queueBodyHtml(item: QueueDraft) {
  const takeaways = (item.keyTakeaways || "").split(/\n|•|;/).map(value => value.trim()).filter(Boolean).map(value => `<li>${escapeHtml(value.replace(/^[-*]\s*/, ""))}</li>`).join("");
  const angle = item.suggestedAngle ? `<h2>${escapeHtml(item.suggestedAngle)}</h2>` : "";
  const list = takeaways ? `<h3>What matters</h3><ul>${takeaways}</ul>` : "";
  return `${angle}<p>${escapeHtml(item.aiSummary || item.excerpt)}</p>${list}<p><a href="${escapeHtml(item.canonicalUrl)}">Read the original source</a></p>`;
}

export function QueueDetailLoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="queue-error queue-error-inline" role="alert"><strong>{queueDetailErrorText(message)}</strong>{onRetry ? <button className="button secondary small" onClick={onRetry}>Try again</button> : null}</div>;
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const isOwner = Boolean(user?.isOwner);
  const { data: articles, isLoading: articlesLoading } = trpc.admin.articles.useQuery(undefined, { enabled: Boolean(user) });
  const [workspace, setWorkspace] = useState<"articles" | "queue">(location === "/admin/queue" ? "queue" : "articles");
  const [draft, setDraft] = useState<Draft>(blank);
  const [preview, setPreview] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | "all">("new");
  const [selectedQueueId, setSelectedQueueId] = useState<number | null>(null);
  const [queueDraft, setQueueDraft] = useState<QueueDraft | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const save = trpc.admin.saveArticle.useMutation();
  const upload = trpc.admin.uploadMedia.useMutation({ onSuccess: result => setDraft(current => ({ ...current, coverImageUrl: result.url, coverImageKey: result.key })) });
  const assistant = trpc.admin.writingAssistant.useMutation({ onSuccess: result => setDraft(current => ({ ...current, excerpt: current.excerpt || result.value, seoDescription: current.seoDescription || result.value, tags: current.tags || result.value })) });
  const queueQuery = trpc.admin.reviewQueue.useQuery({ status: queueStatus === "all" ? undefined : queueStatus, limit: 50, offset: 0 }, { enabled: Boolean(user) && isOwner });
  const selectedQueueQuery = trpc.admin.reviewItem.useQuery({ id: selectedQueueId || 0 }, { enabled: Boolean(user) && isOwner && Boolean(selectedQueueId) });
  const updateQueue = trpc.admin.updateReviewItem.useMutation({ onSuccess: () => { queueQuery.refetch(); if (selectedQueueId) selectedQueueQuery.refetch(); } });
  const publishQueue = trpc.admin.publishReviewItem.useMutation({ onSuccess: () => { queueQuery.refetch(); setWorkspace("articles"); } });
  const refineQueue = trpc.admin.refineReviewItem.useMutation({ onSuccess: result => { if (result) setQueueDraft(toQueueDraft(result as QueueItem)); queueQuery.refetch(); } });

  useEffect(() => { if (articles?.[0] && !draft.title) setDraft(toDraft(articles[0])); }, [articles, draft.title]);
  useEffect(() => { setWorkspace(location === "/admin/queue" ? "queue" : "articles"); }, [location]);
  useEffect(() => { if (selectedQueueQuery.data) setQueueDraft(toQueueDraft(selectedQueueQuery.data as QueueItem)); }, [selectedQueueQuery.data]);
  useEffect(() => { if (editorRef.current) editorRef.current.innerHTML = draft.content; }, [draft.id]);

  const canSave = draft.title.trim().length > 4 && draft.excerpt.trim().length > 19 && draft.content.trim().length > 19;
  const status = useMemo(() => save.isSuccess ? "Saved to the editorial desk." : publishQueue.isSuccess ? "Published from the review queue." : upload.isSuccess ? "Cover uploaded." : "Draft changes stay here until you publish.", [save.isSuccess, publishQueue.isSuccess, upload.isSuccess]);
  const syncEditor = () => setDraft(current => ({ ...current, content: editorRef.current?.innerHTML || "" }));
  const command = (name: string, value?: string) => { editorRef.current?.focus(); document.execCommand(name, false, value); syncEditor(); };
  const openQueueItem = (item: QueueItem) => { setSelectedQueueId(item.id); setQueueDraft(toQueueDraft(item)); };
  const updateQueueField = <K extends keyof QueueDraft>(key: K, value: QueueDraft[K]) => setQueueDraft(current => current ? { ...current, [key]: value } : current);
  const saveQueueReview = (status?: QueueStatus) => {
    if (!queueDraft) return;
    updateQueue.mutate({
      id: queueDraft.id,
      status: status || queueDraft.status,
      itemType: queueDraft.itemType as "news" | "tutorial" | "hack" | "cheat" | "freebie" | "tool" | "release",
      category: queueDraft.category,
      suggestedTitle: queueDraft.suggestedTitle,
      suggestedAngle: queueDraft.suggestedAngle,
      aiSummary: queueDraft.aiSummary,
      keyTakeaways: queueDraft.keyTakeaways,
      suggestedTags: queueDraft.suggestedTags,
      reviewerNotes: queueDraft.reviewerNotes,
      importanceScore: queueDraft.importanceScore,
      usefulnessScore: queueDraft.usefulnessScore,
      noveltyScore: queueDraft.noveltyScore,
      confidenceScore: queueDraft.confidenceScore,
      freshnessScore: queueDraft.freshnessScore,
      verificationStatus: queueDraft.verificationStatus,
      clusterKey: queueDraft.clusterKey,
      claimWarnings: queueDraft.claimWarnings,
    });
  };
  const moveQueueItemToEditor = () => {
    if (!queueDraft) return;
    const title = queueDraft.suggestedTitle || queueDraft.title;
    setDraft({ ...blank, slug: slugify(title), title, excerpt: queueDraft.aiSummary || queueDraft.excerpt, content: queueBodyHtml(queueDraft), category: queueDraft.category, tags: queueDraft.suggestedTags || "", seriesKey: null });
    setWorkspace("articles");
    setPreview(false);
  };
  const refineQueueField = (mode: "summary" | "angle" | "tags" | "takeaways") => { if (queueDraft) refineQueue.mutate({ id: queueDraft.id, mode }); };
  const publishFromQueue = () => {
    if (!queueDraft) return;
    const title = (queueDraft.suggestedTitle || queueDraft.title).trim();
    const excerpt = (queueDraft.aiSummary || queueDraft.excerpt).trim().slice(0, 600);
    if (title.length < 5 || excerpt.length < 20) return;
    publishQueue.mutate({ id: queueDraft.id, slug: slugify(title), title, excerpt, content: queueBodyHtml(queueDraft), category: queueDraft.category, tags: queueDraft.suggestedTags || "", featured: false, seriesKey: null });
  };

  if (loading) return <div className="page-wrap"><div className="loading-state">Checking owner access…</div></div>;
  if (!user) return <div className="page-wrap"><section className="page-heading"><div className="eyebrow">Private studio</div><h1>Owner access only.</h1><p>The publishing desk is not part of the public site.</p><button className="button" onClick={() => startLogin()}>Sign in to continue</button></section></div>;
  if (!isOwner) return <div className="page-wrap"><section className="page-heading"><div className="eyebrow">403 / private studio</div><h1>This desk is reserved.</h1><p>Your account is authenticated, but it is not the Hamispro.io owner account.</p></section></div>;

  return <DashboardLayout><div className="page-wrap admin-panel">
    <div className="admin-toolbar"><div><div className="eyebrow">Owner-only publishing studio</div><h1>Editorial desk</h1><p style={{ color: "var(--muted-foreground)", margin: ".7rem 0 0" }}>{status}</p></div><button className="button" onClick={() => { setWorkspace("articles"); setLocation("/admin/articles"); setDraft(blank); setPreview(false); }}><Plus size={16} /> New article</button></div>
    <div className="admin-tabs" role="tablist" aria-label="Editorial workspaces"><button className={workspace === "queue" ? "active" : ""} onClick={() => { setWorkspace("queue"); setLocation("/admin/queue"); }} role="tab" aria-selected={workspace === "queue"}>Review queue <span>{queueQuery.data?.length ?? 0}</span></button><button className={workspace === "articles" ? "active" : ""} onClick={() => { setWorkspace("articles"); setLocation("/admin/articles"); }} role="tab" aria-selected={workspace === "articles"}>Article studio</button></div>

    {workspace === "queue" ? <section className="queue-layout">
      <aside className="queue-list-card">
        <div className="queue-list-header"><div><div className="eyebrow">Signal intake</div><h2>Review queue</h2></div><button className="icon-button" aria-label="Refresh review queue" onClick={() => queueQuery.refetch()}><RefreshCw size={15} /></button></div>
        <div className="queue-filters">{(["new", "ready", "rejected", "published", "all"] as const).map(filter => <button key={filter} className={`filter-chip${queueStatus === filter ? " active" : ""}`} onClick={() => setQueueStatus(filter)}>{filter === "all" ? "All" : filter}</button>)}</div>
        {queueQuery.error ? <div className="queue-error"><strong>Queue unavailable.</strong><span>{queueQuery.error.message}</span><button className="button secondary small" onClick={() => queueQuery.refetch()}>Try again</button></div> : queueQuery.isLoading ? <div className="loading-state">Hunting for signals…</div> : queueQuery.data?.length ? <div className="queue-list">{(queueQuery.data as QueueItem[]).map(item => <button key={item.id} className={`queue-item${selectedQueueId === item.id ? " active" : ""}`} onClick={() => openQueueItem(item)}><div className="queue-item-top"><span className={`status-pill status-${item.status}`}>{item.status}</span><span className="queue-score">{item.importanceScore}/100</span></div><strong>{item.suggestedTitle || item.title}</strong><span>{item.sourceName} · {item.itemType}</span></button>)}</div> : <div className="queue-empty"><Sparkles size={20} /><strong>No signals in this view.</strong><span>The next scheduled ingestion will place fresh items here.</span></div>}
      </aside>
      <section className="queue-detail-card">
        {!queueDraft ? <div className="queue-empty queue-empty-large"><Sparkles size={26} /><h2>Select a signal to refine</h2><p>Choose an item from the queue to inspect its source, adjust the angle, and move it into the publishing desk.</p>{selectedQueueQuery.error ? <QueueDetailLoadError message={selectedQueueQuery.error.message} onRetry={() => selectedQueueQuery.refetch()} /> : null}</div> : <>
          {selectedQueueQuery.error ? <QueueDetailLoadError message={selectedQueueQuery.error.message} onRetry={() => selectedQueueQuery.refetch()} /> : null}
          <div className="queue-detail-header"><div><div className="eyebrow">{queueDraft.sourceName} · {queueDraft.itemType}</div><h2>{queueDraft.title}</h2><p>{queueDraft.excerpt}</p></div><a className="icon-button" href={queueDraft.canonicalUrl} target="_blank" rel="noreferrer" aria-label="Open source"><ExternalLink size={16} /></a></div>
          <div className="queue-source-line"><span>Published {queueDraft.publishedAt}</span><span>Model {queueDraft.modelUsed || "pending enrichment"}</span><a href={queueDraft.canonicalUrl} target="_blank" rel="noreferrer">View source</a></div>
          <div className="queue-trust-grid"><div className="queue-evidence-card"><div className="eyebrow">Source evidence</div><strong>{queueDraft.sourceName}</strong><p>{queueDraft.excerpt}</p><div className="queue-evidence-meta"><span>Freshness {queueDraft.freshnessScore}/100</span><span>Cluster {queueDraft.clusterKey || "unclustered"}</span></div><details><summary>Raw provenance payload</summary><pre>{queueDraft.rawPayload || "No raw payload recorded."}</pre></details></div><div className="queue-evidence-card"><div className="eyebrow">Verification gate</div><label className="form-label">Status<select value={queueDraft.verificationStatus} onChange={event => updateQueueField("verificationStatus", event.target.value as QueueDraft["verificationStatus"])}><option value="unverified">Unverified</option><option value="needs_review">Needs review</option><option value="verified">Verified</option></select></label><label className="form-label">Freshness score<input type="number" min="0" max="100" value={queueDraft.freshnessScore} onChange={event => updateQueueField("freshnessScore", Number(event.target.value))} /></label><label className="form-label">Claim warnings<textarea value={queueDraft.claimWarnings || ""} onChange={event => updateQueueField("claimWarnings", event.target.value)} placeholder="Unverified dates, claims, or context to check" /></label></div></div>
          <div className="queue-diff-grid"><div><div className="eyebrow">AI-enriched draft</div><strong>{queueDraft.suggestedTitle || queueDraft.title}</strong><p>{queueDraft.aiSummary || queueDraft.excerpt}</p></div><div><div className="eyebrow">Original source</div><strong>{queueDraft.title}</strong><p>{queueDraft.excerpt}</p></div></div>
          <div className="score-grid">{([ ["importanceScore", "Importance"], ["usefulnessScore", "Usefulness"], ["noveltyScore", "Novelty"], ["confidenceScore", "Confidence"] ] as const).map(([key, label]) => <label className="form-label" key={key}>{label}<input type="number" min="0" max="100" value={queueDraft[key]} onChange={event => updateQueueField(key, Number(event.target.value))} /></label>)}</div>
          <div className="queue-refine-strip"><span><Sparkles size={14} /> AI refinement</span><small>Uses only the sourced title, excerpt, and URL.</small><div className="queue-refine-actions">{([ ["summary", "Summary"], ["angle", "Angle"], ["tags", "Tags"], ["takeaways", "Takeaways"] ] as const).map(([mode, label]) => <button key={mode} className="button secondary small" disabled={refineQueue.isPending} onClick={() => refineQueueField(mode)}>{refineQueue.isPending ? <Loader2 className="animate-spin" size={13} /> : <Sparkles size={13} />} {label}</button>)}</div></div>
          {queueActionErrorText([refineQueue.error?.message, updateQueue.error?.message, publishQueue.error?.message]) ? <div className="queue-error queue-error-inline" role="alert"><strong>Action not completed.</strong><span>{queueActionErrorText([refineQueue.error?.message, updateQueue.error?.message, publishQueue.error?.message])}</span></div> : null}
          <div className="form-grid queue-form"><div className="form-row"><label className="form-label">Working title<input value={queueDraft.suggestedTitle || ""} onChange={event => updateQueueField("suggestedTitle", event.target.value)} /></label><label className="form-label">Category<select value={queueDraft.category} onChange={event => updateQueueField("category", event.target.value as Category)}><option value="hacks">AI Hacks</option><option value="prompts">Prompts</option><option value="freebies">Freebies & Tools</option><option value="tutorials">Tutorials</option><option value="news">AI News</option></select></label></div><label className="form-label">Editorial summary<textarea value={queueDraft.aiSummary || ""} onChange={event => updateQueueField("aiSummary", event.target.value)} /></label><label className="form-label">Suggested angle<textarea value={queueDraft.suggestedAngle || ""} onChange={event => updateQueueField("suggestedAngle", event.target.value)} placeholder="What is the Hamispro reader takeaway?" /></label><label className="form-label">Key takeaways<textarea value={queueDraft.keyTakeaways || ""} onChange={event => updateQueueField("keyTakeaways", event.target.value)} placeholder="One takeaway per line" /></label><div className="form-row"><label className="form-label">Tags<input value={queueDraft.suggestedTags || ""} onChange={event => updateQueueField("suggestedTags", event.target.value)} /></label><label className="form-label">Reviewer notes<textarea value={queueDraft.reviewerNotes || ""} onChange={event => updateQueueField("reviewerNotes", event.target.value)} /></label></div></div>
          <div className="queue-actions"><button className="button secondary" disabled={updateQueue.isPending} onClick={() => saveQueueReview()}>{updateQueue.isPending ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />} Save refinement</button><button className="button secondary" onClick={() => saveQueueReview("rejected")}><X size={15} /> Reject</button><button className="button secondary" onClick={() => saveQueueReview("ready")}><Check size={15} /> Mark ready</button><button className="button secondary" onClick={moveQueueItemToEditor}>Use as article draft</button><button className="button" disabled={publishQueue.isPending || queueDraft.status !== "ready"} onClick={publishFromQueue}>{publishQueue.isPending ? <Loader2 className="animate-spin" size={15} /> : <FileUp size={15} />} Publish now</button></div>
        </>}
      </section>
    </section> : <div className="admin-grid">
      <aside className="admin-list">{articlesLoading ? <div className="loading-state">Loading drafts…</div> : (articles || []).map(article => <button className={`admin-list-item${draft.id === article.id ? " active" : ""}`} key={article.id} onClick={() => { setDraft(toDraft(article)); setPreview(false); }}><strong>{article.title}</strong><span>{article.published ? "Published" : "Draft"} · {article.category}</span></button>)}</aside>
      <section className="editor-card">
        <div className="form-grid"><div className="form-row"><label className="form-label">Title<input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder="A useful AI idea" /></label><label className="form-label">Slug<input value={draft.slug} onChange={event => setDraft({ ...draft, slug: event.target.value })} /></label></div><div className="form-row"><label className="form-label">Category<select value={draft.category} onChange={event => setDraft({ ...draft, category: event.target.value as Category })}><option value="hacks">AI Hacks</option><option value="prompts">Prompt Cheatsheets</option><option value="freebies">Freebies & Tools</option><option value="tutorials">Tutorials</option><option value="news">AI News</option></select></label><label className="form-label">Recurring series<select value={draft.seriesKey || "none"} onChange={event => setDraft({ ...draft, seriesKey: event.target.value === "none" ? null : event.target.value })}><option value="none">Standalone article</option><option value="five-minute-ai-brief">The 5-Minute AI Brief</option><option value="prompt-clinic">Prompt Clinic</option><option value="workflow-autopsy">Workflow Autopsy</option><option value="free-tool-friday">Free Tool Friday</option></select></label></div><div className="form-row"><label className="form-label">Reading time (minutes)<input type="number" min="1" max="120" value={draft.readingTimeMinutes} onChange={event => setDraft({ ...draft, readingTimeMinutes: Number(event.target.value) })} /></label><span /></div><label className="form-label">Excerpt<textarea value={draft.excerpt} onChange={event => setDraft({ ...draft, excerpt: event.target.value })} placeholder="The promise of this story in two sentences" /></label><div className="editor-frame"><div className="editor-tabs"><div className="editor-toolbar"><button type="button" aria-label="Bold" onClick={() => command("bold")}><Bold size={15} /></button><button type="button" aria-label="Italic" onClick={() => command("italic")}><Italic size={15} /></button><button type="button" aria-label="Underline" onClick={() => command("underline")}><Underline size={15} /></button><button type="button" aria-label="Heading" onClick={() => command("formatBlock", "<h2>")}><Heading2 size={15} /></button><button type="button" aria-label="Link" onClick={() => { const url = window.prompt("Link URL"); if (url) command("createLink", url); }}><Link2 size={15} /></button><span className="editor-toolbar-spacer" /><button type="button" className={preview ? "active" : ""} onClick={() => setPreview(value => !value)}><Eye size={15} /> {preview ? "Edit" : "Preview"}</button></div></div>{preview ? <div className="editor-preview"><MarkdownArticle content={draft.content} /></div> : <div ref={editorRef} className="editor-contenteditable" contentEditable suppressContentEditableWarning onInput={syncEditor} aria-label="Article body" />}</div><div className="assistant-strip"><span><Sparkles size={14} style={{ verticalAlign: "middle" }} /> Editorial assistant</span><button className="button secondary small" disabled={assistant.isPending} onClick={() => assistant.mutate({ mode: "summary", title: draft.title, content: draft.content })}>Draft summary</button><button className="button secondary small" disabled={assistant.isPending} onClick={() => assistant.mutate({ mode: "seo", title: draft.title, content: draft.content })}>Write SEO description</button><button className="button secondary small" disabled={assistant.isPending} onClick={() => assistant.mutate({ mode: "tags", title: draft.title, content: draft.content })}>Suggest tags</button></div><div className="form-row"><label className="form-label">Tags<input value={draft.tags} onChange={event => setDraft({ ...draft, tags: event.target.value })} placeholder="prompts,workflow,tools" /></label><label className="form-label">Cover image<input type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => upload.mutate({ fileName: file.name, mimeType: file.type, base64: String(reader.result).split(",")[1] || "", sizeBytes: file.size }); reader.readAsDataURL(file); }} /><small style={{ color: "var(--muted-foreground)" }}>{upload.isPending ? "Uploading…" : draft.coverImageUrl ? "Cover ready" : "R2 is enabled when production credentials are supplied."}</small></label></div><label className="form-label">SEO meta description<textarea value={draft.seoDescription} onChange={event => setDraft({ ...draft, seoDescription: event.target.value })} placeholder="A clear description for search results" /></label></div>
        <div className="editor-actions"><button className="button secondary" onClick={() => save.mutate({ ...draft, published: false })}>Save draft</button><button className="button" disabled={!canSave || save.isPending} onClick={() => save.mutate({ ...draft, published: true })}>{save.isPending ? <Loader2 className="animate-spin" size={16} /> : <FileUp size={16} />} Publish article</button></div>
      </section>
    </div>}
  </div></DashboardLayout>;
}
