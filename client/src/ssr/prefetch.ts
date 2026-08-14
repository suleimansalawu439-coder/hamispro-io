import type { QueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/lib/trpc";

export type HeadMeta = { title: string; description: string; ogType?: "website" | "article"; ogImage?: string; canonicalPath?: string; noindex?: boolean; notFound?: boolean; publishedTime?: string };
type RO = inferRouterOutputs<AppRouter>;
export type SsrPrefetch = {
  contentList: (input: { category?: "hacks" | "prompts" | "freebies" | "tutorials" | "news"; search?: string }) => Promise<RO["content"]["list"]>;
  contentBySlug: (slug: string) => Promise<RO["content"]["bySlug"]>;
  resourcesList: (input: { search?: string; resourceType?: "tool" | "model" | "template" | "offer" }) => Promise<RO["resources"]["list"]>;
};

const SITE = "Hamispro.io";
const DEFAULT_DESC = "Useful signal for the age of AI: hacks, prompts, tools, tutorials, and the context behind the news.";

async function seed(queryClient: QueryClient, key: unknown, data: unknown) { queryClient.setQueryData(key as any, data); }

export async function prefetchForPath(url: string, queryClient: QueryClient, prefetch: SsrPrefetch): Promise<HeadMeta> {
  const queryIndex = url.indexOf("?");
  const rawPath = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const path = decodeURI(rawPath || "/");
  if (path === "/" || path === "") {
    const input = {};
    const data = await prefetch.contentList(input);
    await seed(queryClient, getQueryKey(trpc.content.list, input, "query"), data);
    return { title: `${SITE} — The useful side of AI`, description: DEFAULT_DESC, canonicalPath: "/" };
  }
  const categoryMatch = path.match(/^\/category\/(hacks|prompts|tutorials|news)$/);
  if (categoryMatch) {
    const category = categoryMatch[1] as "hacks" | "prompts" | "tutorials" | "news";
    const input = { category };
    const data = await prefetch.contentList(input);
    await seed(queryClient, getQueryKey(trpc.content.list, input, "query"), data);
    const label = category === "hacks" ? "AI Hacks" : category === "prompts" ? "Prompt Cheatsheets" : category === "tutorials" ? "Tutorials" : "AI News";
    return { title: `${label} — ${SITE}`, description: `Useful ${label.toLowerCase()}, explained with clarity and context.`, canonicalPath: path };
  }
  const articleMatch = path.match(/^\/article\/([^/]+)$/);
  if (articleMatch) {
    const slug = articleMatch[1];
    const data = await prefetch.contentBySlug(slug);
    const input = { slug };
    await seed(queryClient, getQueryKey(trpc.content.bySlug, input, "query"), data);
    return { title: `${data.title} — ${SITE}`, description: data.seoDescription || data.excerpt, ogType: "article", ogImage: data.coverImageUrl || undefined, canonicalPath: path, publishedTime: data.publishedAt ? new Date(data.publishedAt).toISOString() : undefined };
  }
  if (path === "/vault") {
    const input = {};
    const data = await prefetch.resourcesList(input);
    await seed(queryClient, getQueryKey(trpc.resources.list, input, "query"), data);
    return { title: `Freebies & Tools — ${SITE}`, description: "A thoughtful vault of free AI tools, open models, templates, and offers.", canonicalPath: path };
  }
  if (path === "/admin") return { title: `Editorial Desk — ${SITE}`, description: "Private owner-only publishing studio.", canonicalPath: path, noindex: true };
  if (path === "/search") return { title: `Search — ${SITE}`, description: DEFAULT_DESC, canonicalPath: path, noindex: true };
  return { title: `Not found — ${SITE}`, description: DEFAULT_DESC, canonicalPath: path, noindex: true, notFound: true };
}
