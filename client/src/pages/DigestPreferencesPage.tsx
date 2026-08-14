import { useEffect, useMemo, useState } from "react";
import { Check, Mail, Save } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";

const topics = [
  { key: "hacks", label: "AI hacks & workflows" },
  { key: "prompts", label: "Prompt clinics" },
  { key: "freebies", label: "Free tools & freebies" },
  { key: "tutorials", label: "Tutorials" },
  { key: "news", label: "The 5-Minute AI Brief" },
] as const;

export default function DigestPreferencesPage() {
  const token = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("token") || "";
  const preferences = trpc.newsletter.preferences.useQuery({ token }, { enabled: token.length > 0 });
  const update = trpc.newsletter.updatePreferences.useMutation();
  const [selected, setSelected] = useState<string[]>([]);
  const [frequency, setFrequency] = useState<"weekly" | "daily">("weekly");
  const [timezone, setTimezone] = useState("UTC");
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (preferences.data) { setSelected(preferences.data.topics); setFrequency(preferences.data.frequency); setTimezone(preferences.data.timezone); } }, [preferences.data]);
  const availableTopics = useMemo(() => topics.filter(topic => selected.includes(topic.key)), [selected]);
  if (!token) return <div className="page-wrap"><section className="page-heading"><div className="eyebrow">Newsletter settings</div><h1>Manage your digest.</h1><p>Use the private preferences link from your Hamispro.io email to update your topics.</p><Link href="/" className="button">Back home</Link></section></div>;
  if (preferences.isLoading) return <div className="page-wrap"><div className="loading-state">Loading your digest settings…</div></div>;
  if (preferences.error || !preferences.data) return <div className="page-wrap"><section className="page-heading"><div className="eyebrow">Link unavailable</div><h1>We could not find that digest.</h1><p>The link may have expired or been replaced. Subscribe again to receive a fresh preferences link.</p><Link href="/" className="button"><Mail size={16} /> Return home</Link></section></div>;
  return <div className="page-wrap digest-page"><section className="page-heading"><div className="eyebrow">Newsletter settings</div><h1>Make the signal yours.</h1><p>Choose the topics you want in your Hamispro.io digest. Your settings apply to future emails only.</p></section><section className="digest-card"><div className="digest-email"><Mail size={18} /><span>{preferences.data.email}</span></div><div className="digest-section"><h2>Topics</h2><p>Select at least one editorial lane.</p><div className="topic-grid">{topics.map(topic => <label className={`topic-option${selected.includes(topic.key) ? " selected" : ""}`} key={topic.key}><input type="checkbox" checked={selected.includes(topic.key)} onChange={() => setSelected(current => current.includes(topic.key) ? current.filter(key => key !== topic.key) : [...current, topic.key])} /><span>{topic.label}</span></label>)}</div></div><div className="digest-section"><h2>Frequency</h2><div className="frequency-row">{(["weekly", "daily"] as const).map(option => <button type="button" className={`frequency-option${frequency === option ? " selected" : ""}`} key={option} onClick={() => setFrequency(option)}>{option === "weekly" ? "Weekly field notes" : "Daily signal"}</button>)}</div></div><label className="form-label">Timezone<select value={timezone} onChange={event => setTimezone(event.target.value)}><option value="UTC">UTC</option><option value="Africa/Lagos">Africa/Lagos</option><option value="America/New_York">America/New York</option><option value="Europe/London">Europe/London</option></select></label><div className="digest-actions"><button className="button" disabled={selected.length === 0 || update.isPending} onClick={() => { setSaved(false); update.mutate({ token, topics: selected as any, frequency, timezone }, { onSuccess: () => setSaved(true) }); }}>{saved ? <><Check size={16} /> Settings saved</> : <><Save size={16} /> Save preferences</>}</button><span>{availableTopics.length} topic{availableTopics.length === 1 ? "" : "s"} selected</span></div></section></div>;
}
