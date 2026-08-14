import { ArrowUpRight, Clock3, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { AdSlot, NewsletterCard } from "@/components/ContentPrimitives";

const categoryLabels: Record<string, string> = { hacks: "AI Hacks", prompts: "Prompt Cheatsheets", freebies: "Freebies & Tools", tutorials: "Tutorials", news: "AI News" };

function StoryCard({ article, featured = false }: { article: any; featured?: boolean }) {
  return <Link href={`/article/${article.slug}`} className={`story-card${featured ? " featured" : ""}`}>
    <div className="story-meta"><span className="story-category">{categoryLabels[article.category]}</span><span>•</span><span>{article.readingTimeMinutes} min read</span></div>
    <h3 className="story-title">{article.title}</h3>
    <p className="story-excerpt">{article.excerpt}</p>
    <div className="story-card-footer"><span>{article.authorName}</span><span className="arrow-chip"><ArrowUpRight size={16} /></span></div>
  </Link>;
}

export default function Home() {
  const { data: articles, isLoading } = trpc.content.list.useQuery({});
  const items = articles || [];
  const featured = items.find(article => article.featured) || items[0];
  const supporting = items.filter(article => article.id !== featured?.id).slice(0, 4);
  const latest = items.slice(0, 4);
  return <>
    <div className="page-wrap">
      <AdSlot variant="leaderboard" />
      <section className="hero">
        <div>
          <div className="eyebrow"><Sparkles size={13} /> The useful side of AI</div>
          <h1 className="display-title">Less noise.<br /><em>More signal.</em></h1>
          <p className="hero-copy">Hamispro.io is a practical AI intelligence hub for people who want sharper workflows, better prompts, useful tools, and context that respects their time.</p>
        </div>
        <aside className="hero-aside">
          <div className="hero-aside-top"><span>Dispatch 001</span><span className="signal"><span className="signal-dot" /> Live desk</span></div>
          <h3>What can AI do for you this week?</h3>
          <p>Start with one repeatable workflow. We turn the fast-moving AI landscape into small, useful moves.</p>
          <div className="hero-aside-footer"><strong>Hamispro editorial</strong><span>Updated weekly</span></div>
        </aside>
      </section>
      <section className="section">
        <div className="section-heading"><div><div className="eyebrow">Editor’s picks</div><h2>Trending now</h2><p>High-signal ideas, carefully chosen for the way people actually work.</p></div><Link href="/category/hacks" className="text-link">View all hacks ↗</Link></div>
        {isLoading ? <div className="loading-state">Loading the desk…</div> : <div className="editorial-grid">{featured && <StoryCard article={featured} featured />}{supporting.map(article => <StoryCard key={article.id} article={article} />)}</div>}
      </section>
      <section className="section">
        <div className="two-column">
          <div><div className="section-heading"><div><div className="eyebrow">Fresh from the desk</div><h2>Latest articles</h2></div><Link href="/category/news" className="text-link">Browse the archive ↗</Link></div><div className="article-list">{latest.map(article => <Link key={article.id} href={`/article/${article.slug}`} className="article-row"><div className="article-thumb" /><div><div className="story-meta"><span className="story-category">{categoryLabels[article.category]}</span><span>•</span><span><Clock3 size={12} /> {article.readingTimeMinutes} min</span></div><h3>{article.title}</h3><p>{article.excerpt}</p></div><span className="article-row-arrow">↗</span></Link>)}</div></div>
          <aside className="side-rail"><div className="rail-card dark"><div className="eyebrow">The vault</div><h3>Free tools with a job to do.</h3><p>Explore the resource desk for open models, free tiers, templates, and limited-time offers.</p><Link href="/vault" className="button small" style={{ marginTop: "1rem" }}>Open the vault ↗</Link></div><AdSlot variant="rectangle" /></aside>
        </div>
      </section>
      <section className="section"><NewsletterCard /></section>
    </div>
  </>;
}
