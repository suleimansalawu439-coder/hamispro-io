import { Search, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

const types = ["all", "tool", "model", "template", "offer"] as const;

export default function VaultPage() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<(typeof types)[number]>("all");
  const { data: resources, isLoading } = trpc.resources.list.useQuery({});
  const filtered = (resources || []).filter(item => (!search || `${item.name} ${item.description} ${(item.tags || []).join(" ")}`.toLowerCase().includes(search.toLowerCase())) && (type === "all" || item.resourceType === type));
  return <div className="page-wrap"><section className="page-heading"><div className="eyebrow">The resource vault</div><h1>Free tools with a job to do.</h1><p>A calm directory of free AI tools, open models, templates, and offers worth your attention.</p></section><div className="filter-bar"><label style={{ flex: "1 1 240px", position: "relative" }}><Search size={16} style={{ position: "absolute", left: ".75rem", top: ".68rem", color: "var(--muted-foreground)" }} /><input className="text-input" style={{ paddingLeft: "2.25rem", background: "var(--card)" }} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search the vault…" /></label>{types.map(value => <button key={value} className={`filter-chip${type === value ? " active" : ""}`} onClick={() => setType(value)}>{value === "all" ? "Everything" : value}</button>)}</div>{isLoading ? <div className="loading-state">Loading resources…</div> : filtered.length ? <div className="vault-grid">{filtered.map(resource => <a className="resource-card" key={resource.id} href={resource.url} target={resource.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer"><span className="resource-type">{resource.resourceType}</span><h3>{resource.name}</h3><p>{resource.description}</p><div className="resource-footer"><span className="resource-price">{resource.priceLabel}</span><span><ArrowUpRight size={15} /></span></div></a>)}</div> : <div className="empty-state">No resources match that search yet. Try a broader phrase.</div>}<section className="section"><div className="rail-card dark"><div className="eyebrow">Have a resource?</div><h3>Know a free tool our readers should try?</h3><p>We are building a thoughtful directory, not a giant list. Send the useful stuff.</p><Link href="/newsletter" className="button small" style={{ marginTop: "1rem" }}>Join the signal ↗</Link></div></section></div>;
}
