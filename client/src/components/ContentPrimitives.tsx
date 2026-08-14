import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Mail, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAnalytics } from "@/hooks/useAnalytics";

const adSlotIds = { leaderboard: import.meta.env.VITE_ADSENSE_SLOT_LEADERBOARD || "", "in-content": import.meta.env.VITE_ADSENSE_SLOT_IN_CONTENT || "", rectangle: import.meta.env.VITE_ADSENSE_SLOT_RECTANGLE || "", anchor: import.meta.env.VITE_ADSENSE_SLOT_ANCHOR || "" } as const;

export function AdSlot({ variant = "in-content" }: { variant?: "leaderboard" | "in-content" | "rectangle" | "anchor" }) {
  const [configured, setConfigured] = useState(false);
  const { track } = useAnalytics();
  const clientId = import.meta.env.VITE_ADSENSE_CLIENT_ID || "";
  const className = variant === "leaderboard" ? "ad-slot ad-leaderboard" : variant === "rectangle" ? "ad-slot ad-rectangle" : variant === "anchor" ? "ad-slot ad-anchor" : "ad-slot ad-in-content";
  useEffect(() => {
    if (!clientId) return;
    if (!document.querySelector("script[data-hamispro-adsense]")) {
      const script = document.createElement("script");
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.hamisproAdsense = "true";
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
      document.head.appendChild(script);
    }
    setConfigured(true);
  }, [clientId]);
  const slotId = adSlotIds[variant];
  useEffect(() => { track("ad_view", typeof window === "undefined" ? "" : window.location.pathname, { placement: variant }); }, [track, variant]);
  if (!clientId || !slotId) return <div className={className} data-ad-slot={variant} aria-label="Advertising placement" onClick={() => track("ad_click", window.location.pathname, { placement: variant })}>AdSense · {variant} slot</div>;
  return <div className={className} data-ad-slot={variant} aria-label="Advertising placement" onClick={() => track("ad_click", window.location.pathname, { placement: variant })}><ins className="adsbygoogle" style={{ display: "block", width: "100%", height: "100%" }} data-ad-client={clientId} data-ad-slot={slotId} data-ad-format="auto" data-full-width-responsive="true" />{configured && <AdSensePush />}</div>;
}

function AdSensePush() {
  useEffect(() => { try { ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({}); } catch {} }, []);
  return null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] || char));
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function MarkdownArticle({ content }: { content: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const blocks = useMemo(() => {
    const lines = content.split("\n");
    const html: string[] = [];
    let paragraph: string[] = [];
    let code: string[] = [];
    let inCode = false;
    let codeLanguage = "text";
    const flushParagraph = () => {
      if (paragraph.length) {
        html.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
        paragraph = [];
      }
    };
    const flushCode = () => {
      if (code.length) {
        const raw = code.join("\n");
        const id = `code-${slugify(raw.slice(0, 24))}`;
        html.push(`<div class=\"prompt-box\" data-copy-id=\"${id}\"><button class=\"copy-button\" data-copy-value=\"${encodeURIComponent(raw)}\">Copy</button><code>${escapeHtml(raw)}</code></div>`);
        code = [];
      }
    };
    for (const line of lines) {
      if (line.startsWith("```")) {
        if (inCode) { flushCode(); inCode = false; } else { flushParagraph(); inCode = true; codeLanguage = line.slice(3).trim() || "text"; void codeLanguage; }
        continue;
      }
      if (inCode) { code.push(line); continue; }
      if (line.startsWith("## ")) { flushParagraph(); const heading = line.slice(3).trim(); html.push(`<h2 id=\"${slugify(heading)}\">${escapeHtml(heading)}</h2>`); continue; }
      if (line.startsWith("### ")) { flushParagraph(); const heading = line.slice(4).trim(); html.push(`<h3 id=\"${slugify(heading)}\">${escapeHtml(heading)}</h3>`); continue; }
      if (line.startsWith("- ")) { flushParagraph(); html.push(`<ul><li>${escapeHtml(line.slice(2))}</li></ul>`); continue; }
      if (!line.trim()) { flushParagraph(); continue; }
      paragraph.push(line.trim());
    }
    if (inCode) flushCode();
    flushParagraph();
    return html.join("");
  }, [content]);
  const renderedContent = content.trim().startsWith("<") ? content : blocks;

  const handleClick = async (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const button = target.closest("[data-copy-value]") as HTMLElement | null;
    if (!button) return;
    const value = decodeURIComponent(button.dataset.copyValue || "");
    await navigator.clipboard?.writeText(value);
    setCopied(button.dataset.copyValue || "");
    window.setTimeout(() => setCopied(null), 1600);
  };

  return <div className="article-content" onClick={handleClick} dangerouslySetInnerHTML={{ __html: renderedContent.replace(/>Copy</g, copied ? ">Copied</" : ">Copy") }} />;
}

export function NewsletterCard({ compact = false }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [preferenceToken, setPreferenceToken] = useState("");
  const { track } = useAnalytics();
  const subscribe = trpc.newsletter.subscribe.useMutation({ onSuccess: result => { setDone(true); setPreferenceToken(result.preferenceToken); setEmail(""); track("newsletter_signup", typeof window === "undefined" ? "" : window.location.pathname, { source: compact ? "sidebar" : "homepage" }); } });
  return <section className={compact ? "rail-card dark" : "newsletter"}>
    <div>
      <div className="eyebrow"><Sparkles size={13} /> Weekly signal</div>
      <h2>Make AI useful before it gets noisy.</h2>
      <p>One concise email with the best hacks, tools, prompts, and explainers. Your free download: <strong>Ultimate Prompt Cheatsheet.</strong></p>
    </div>
    <form className="newsletter-form" onSubmit={event => { event.preventDefault(); if (email) subscribe.mutate({ email, source: compact ? "sidebar" : "homepage" }); }}>
      <label className="sr-only" htmlFor={compact ? "sidebar-email" : "email"}>Email address</label>
      <input id={compact ? "sidebar-email" : "email"} className="text-input" type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
      <button className="button" type="submit" disabled={subscribe.isPending}>{done ? <><Check size={16} /> You're in</> : <><Mail size={16} /> Get the cheatsheet</>}</button>
    </form>
    {preferenceToken && <Link className="digest-manage-link" href={`/digest?token=${preferenceToken}`}>Manage your digest preferences →</Link>}
  </section>;
}

export function CopyPrompt({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="prompt-box"><button className="copy-button" onClick={async () => { await navigator.clipboard?.writeText(children); setCopied(true); window.setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : <><Copy size={12} /> Copy</>}</button><code>{children}</code></div>;
}
