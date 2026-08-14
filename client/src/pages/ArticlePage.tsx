import { useEffect, useMemo } from "react";
import { ArrowLeft, Clock3 } from "lucide-react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { AdSlot, MarkdownArticle, NewsletterCard } from "@/components/ContentPrimitives";
import { useAnalytics } from "@/hooks/useAnalytics";

const categoryLabels: Record<string, string> = { hacks: "AI Hacks", prompts: "Prompt Cheatsheets", freebies: "Freebies & Tools", tutorials: "Tutorials", news: "AI News" };
const seriesLabels: Record<string, string> = { "five-minute-ai-brief": "The 5-Minute AI Brief", "prompt-clinic": "Prompt Clinic", "workflow-autopsy": "Workflow Autopsy", "free-tool-friday": "Free Tool Friday" };

export default function ArticlePage() {
  const [, params] = useRoute("/article/:slug");
  const slug = params?.slug || "";
  const { data: article, isLoading, error } = trpc.content.bySlug.useQuery({ slug });
  const { track } = useAnalytics();
  useEffect(() => { if (article) track("article_read", `/article/${slug}`, { articleId: article.id, category: article.category }); }, [article, slug, track]);
  const toc = useMemo(() => (article?.content || "").split("\n").filter(line => line.startsWith("## ") || line.startsWith("### ")).map(line => ({ label: line.replace(/^#+\s+/, ""), id: line.replace(/^#+\s+/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") })), [article?.content]);
  if (isLoading) return <div className="page-wrap"><div className="loading-state">Loading article…</div></div>;
  if (error || !article) return <div className="page-wrap"><div className="page-heading"><div className="eyebrow">404 / missing signal</div><h1>This article moved.</h1><p>Return to the desk and choose another useful thread.</p><Link href="/" className="button">Back home</Link></div></div>;
  return <div className="page-wrap"><AdSlot variant="leaderboard" /><div className="article-layout"><article><Link href={`/category/${article.category}`} className="text-link"><ArrowLeft size={14} style={{ verticalAlign: "middle" }} /> Back to {categoryLabels[article.category]}</Link><header className="article-header"><div className="eyebrow" style={{ marginTop: "1.5rem" }}>{article.seriesKey ? seriesLabels[article.seriesKey] || article.seriesKey : categoryLabels[article.category]}</div><h1>{article.title}</h1><p>{article.excerpt}</p><div className="article-meta-row"><span>{article.authorName}</span><span>•</span><span><Clock3 size={13} style={{ verticalAlign: "middle" }} /> {article.readingTimeMinutes} min read</span><span>•</span><span>{article.publishedAt ? new Date(article.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Updated recently"}</span></div></header><MarkdownArticle content={article.content} /><AdSlot variant="in-content" /><NewsletterCard compact /></article><aside className="toc"><h3>In this article</h3>{toc.length ? toc.map(item => <a key={item.id} href={`#${item.id}`}>{item.label}</a>) : <span style={{ color: "var(--muted-foreground)", fontSize: ".8rem" }}>A concise field note.</span>}<AdSlot variant="rectangle" /></aside></div></div>;
}
