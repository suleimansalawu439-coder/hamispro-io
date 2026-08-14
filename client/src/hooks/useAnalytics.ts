import { useCallback, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

type AnalyticsEventType = "pageview" | "article_read" | "search" | "newsletter_signup" | "ad_view" | "ad_click";

function getSessionId() {
  if (typeof window === "undefined") return "server-session";
  const key = "hamispro-session-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  window.localStorage.setItem(key, created);
  return created;
}

function getDevice() {
  if (typeof window === "undefined") return "unknown";
  if (window.innerWidth < 640) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
}

function getBrowser() {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "Other";
}

export function useAnalytics() {
  const tracker = trpc.trackEvent.useMutation();
  const context = useMemo(() => ({ sessionId: getSessionId(), browser: getBrowser(), device: getDevice(), referrer: typeof document === "undefined" ? undefined : document.referrer }), []);
  const track = useCallback((eventType: AnalyticsEventType, path: string, metadata?: Record<string, unknown>) => {
    tracker.mutate({ eventType, path: path.slice(0, 255), ...context, metadata: metadata ? JSON.stringify(metadata).slice(0, 2000) : undefined });
  }, [context, tracker]);
  return { track };
}

export function PublicPageviewTracker() {
  const [location] = useLocation();
  const { track } = useAnalytics();
  useEffect(() => { if (location.startsWith("/admin")) return; track("pageview", location); }, [location, track]);
  return null;
}
