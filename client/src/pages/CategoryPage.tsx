import { ArrowUpRight } from "lucide-react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";

const labels: Record<string, { title: string; description: string }> = {
  hacks: { title: "AI Hacks", description: "Practical shortcuts, workflow upgrades, and clever ways to make AI earn its place in your day." },
  prompts: { title: "Prompt Cheatsheets", description: "Copy-ready prompt patterns, diagnostics, and templates for consistently better outputs." },
  tutorials: { title: "Tutorials", description: "Step-by-step guides for building useful AI systems, automations, and research workflows." },
  news: { title: "AI News", description: "The developments that matter, explained with context instead of manufactured urgency." },
};

export default function CategoryPage() {
  const [, params] = useRoute("/category/:category");
  const category = (params?.category || "hacks") as "hacks" | "prompts" | "tutorials" | "news";
  const info = labels[category] || labels.hacks;
  const { data: articles, isLoading } = trpc.content.list.useQuery({ category });
  return <div className="page-wrap"><section className="page-heading"><div className="eyebrow">Hamispro desk / category</div><h1>{info.title}</h1><p>{info.description}</p></section><div className="filter-bar">{Object.entries(labels).map(([key, value]) => <Link key={key} href={`/category/${key}`} className={`filter-chip${key === category ? " active" : ""}`}>{value.title}</Link>)}<Link href="/vault" className="filter-chip">Freebies & Tools</Link></div>{isLoading ? <div className="loading-state">Loading the archive…</div> : <div className="article-list">{(articles || []).map(article => <Link key={article.id} href={`/article/${article.slug}`} className="article-row"><div className="article-thumb" /><div><div className="story-meta"><span className="story-category">{info.title}</span><span>•</span><span>{article.readingTimeMinutes} min read</span></div><h3>{article.title}</h3><p>{article.excerpt}</p></div><span className="article-row-arrow"><ArrowUpRight size={18} /></span></Link>)}</div>}</div>;
}
