import { Search, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAnalytics } from "@/hooks/useAnalytics";

export default function SearchPage() {
  const [term, setTerm] = useState("");
  const { track } = useAnalytics();
  const { data: articles, isLoading } = trpc.content.list.useQuery({});
  useEffect(() => { const normalized = term.trim(); if (normalized.length < 2) return; const timer = window.setTimeout(() => track("search", "/search", { queryLength: normalized.length }), 500); return () => window.clearTimeout(timer); }, [term, track]);
  const matches = (articles || []).filter(article => !term || `${article.title} ${article.excerpt} ${(article.tags || []).join(" ")}`.toLowerCase().includes(term.toLowerCase()));
  return <div className="page-wrap"><section className="page-heading"><div className="eyebrow">Search the desk</div><h1>Find your next useful idea.</h1><p>Search across hacks, prompts, tutorials, and the stories behind the news.</p></section><label style={{ display: "block", maxWidth: "680px", position: "relative", marginBottom: "2rem" }}><Search size={18} style={{ position: "absolute", left: "1rem", top: ".85rem", color: "var(--muted-foreground)" }} /><input autoFocus className="text-input" style={{ paddingLeft: "2.8rem", background: "var(--card)", minHeight: "3.3rem" }} value={term} onChange={event => setTerm(event.target.value)} placeholder="Try prompts, workflows, models…" /></label>{isLoading ? <div className="loading-state">Searching…</div> : <div className="article-list">{matches.map(article => <Link key={article.id} href={`/article/${article.slug}`} className="article-row"><div className="article-thumb" /><div><div className="story-meta"><span className="story-category">{article.category}</span><span>•</span><span>{article.readingTimeMinutes} min read</span></div><h3>{article.title}</h3><p>{article.excerpt}</p></div><ArrowUpRight size={18} /></Link>)}{!matches.length && <div className="empty-state">No results yet. Try a simpler search.</div>}</div>}</div>;
}
