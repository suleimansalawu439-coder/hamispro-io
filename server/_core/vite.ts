import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { pathToFileURL } from "url";
import { createServer as createViteServer } from "vite";
import superjson from "superjson";
import viteConfig from "../../vite.config";
import { buildSsrPrefetch } from "./ssrCaller";

export type HeadMeta = {
  title: string;
  description: string;
  ogType?: "website" | "article";
  ogImage?: string;
  faviconUrl?: string;
  canonicalPath?: string;
  noindex?: boolean;
  notFound?: boolean;
  publishedTime?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] || char));
}

function canonicalOrigin() {
  return (process.env.CANONICAL_ORIGIN || "https://hamispro.io").replace(/\/$/, "");
}

function composeHead(head: HeadMeta) {
  const origin = canonicalOrigin();
  const canonical = `${origin}${head.canonicalPath || "/"}`;
  const title = escapeHtml(head.title || "Hamispro.io — The useful side of AI");
  const description = escapeHtml(head.description || "Practical AI workflows, prompts, free tools, tutorials, and signals.");
  const robots = head.noindex ? "noindex, nofollow" : "index, follow";
  const ogImage = head.ogImage ? escapeHtml(head.ogImage) : `${origin}/og-image.svg`;
  const favicon = head.faviconUrl ? escapeHtml(head.faviconUrl) : "/favicon.svg";

  return `<title>${title}</title><meta name="description" content="${description}" /><meta name="robots" content="${robots}" /><link rel="canonical" href="${escapeHtml(canonical)}" /><link rel="icon" type="image/svg+xml" href="${favicon}" /><meta property="og:title" content="${title}" /><meta property="og:description" content="${description}" /><meta property="og:type" content="${head.ogType || "website"}" /><meta property="og:url" content="${escapeHtml(canonical)}" /><meta property="og:image" content="${ogImage}" /><meta property="og:site_name" content="Hamispro.io" /><meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${title}" /><meta name="twitter:description" content="${description}" /><meta name="twitter:image" content="${ogImage}" />`;
}

function composeHtml(template: string, result: { html: string; dehydratedState: unknown; head: HeadMeta }) {
  const serialized = JSON.stringify(superjson.serialize(result.dehydratedState));
  return template
    .replace("<!--app-head-->", composeHead(result.head))
    .replace("<!--app-html-->", () => result.html || "")
    .replace("</head>", `<script>window.__RQ_STATE__=${serialized};</script></head>`);
}

function getFallbackTemplate() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <!--app-head-->
  </head>
  <body>
    <div id="root"><!--app-html--></div>
    <script type="module" src="/src/entry-client.tsx"></script>
  </body>
</html>`;
}

export function findPublicDistPath(): string {
  const candidates = [
    path.resolve(process.cwd(), "dist", "public"),
    path.resolve(import.meta.dirname, "public"),
    path.resolve(import.meta.dirname, "..", "public"),
    path.resolve(import.meta.dirname, "../dist/public"),
    path.resolve(import.meta.dirname, "../../dist/public"),
    path.resolve(process.cwd(), "client"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(process.cwd(), "dist", "public");
}

export async function findTemplate(): Promise<string> {
  const candidates = [
    path.resolve(findPublicDistPath(), "index.html"),
    path.resolve(process.cwd(), "dist", "public", "index.html"),
    path.resolve(process.cwd(), "client", "index.html"),
    path.resolve(import.meta.dirname, "../../client/index.html"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return fs.promises.readFile(c, "utf-8");
    }
  }
  return getFallbackTemplate();
}

export async function loadServerEntry(): Promise<any> {
  const candidates = [
    path.resolve(process.cwd(), "dist", "server", "entry-server.js"),
    path.resolve(path.dirname(findPublicDistPath()), "server", "entry-server.js"),
    path.resolve(import.meta.dirname, "server", "entry-server.js"),
    path.resolve(import.meta.dirname, "..", "server", "entry-server.js"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const fileUrl = pathToFileURL(c).href;
        return await import(fileUrl);
      } catch (err) {
        console.warn("[SSR] Error importing server entry:", err);
      }
    }
  }
  return null;
}

async function renderRequest(req: any, res: any, template: string, render?: (url: string, prefetch: any) => Promise<any>) {
  const rawUrl = req.originalUrl || req.url || "/";
  const queryIndex = rawUrl.indexOf("?");
  const pathname = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);

  // Admin routes render as a fast client-side SPA to avoid private session SSR overhead
  if (pathname.startsWith("/admin")) {
    const adminHead = composeHead({
      title: "Editorial Desk — Hamispro.io",
      description: "Private owner-only publishing studio.",
      noindex: true,
      canonicalPath: pathname,
    });
    const adminHtml = template
      .replace("<!--app-head-->", adminHead)
      .replace("<!--app-html-->", () => "");
    return res
      .status(200)
      .set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-cache, no-store, must-revalidate" })
      .end(adminHtml);
  }

  try {
    if (render) {
      const prefetch = await buildSsrPrefetch(req, res);
      const result = await render(rawUrl, prefetch);
      res
        .status(result.head.notFound ? 404 : 200)
        .set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" })
        .end(composeHtml(template, result));
      return;
    }
  } catch (error) {
    console.error("[SSR] render failed, falling back to static HTML:", error);
  }

  // Graceful fallback to client SPA
  const fallbackHead = composeHead({
    title: "Hamispro.io — The useful side of AI",
    description: "Useful signal for the age of AI. Hacks, Prompts, Freebies, Tutorials, and News.",
    canonicalPath: pathname,
  });
  const fallbackHtml = template
    .replace("<!--app-head-->", fallbackHead)
    .replace("<!--app-html-->", () => "");
  res.status(200).set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" }).end(fallbackHtml);
}

export async function setupVite(app: Express, server: Server) {
  const vite = await createViteServer({ ...viteConfig, configFile: false, server: { middlewareMode: true, hmr: { server }, allowedHosts: true as const }, appType: "custom" });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    try {
      const clientTemplate = path.resolve(import.meta.dirname, "../..", "client", "index.html");
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(`src="/src/entry-client.tsx"`, `src="/src/entry-client.tsx?v=${nanoid()}"`);
      template = await vite.transformIndexHtml(req.originalUrl, template);
      const serverEntry = await vite.ssrLoadModule("/src/entry-server.tsx");
      await renderRequest(req, res, template, serverEntry.render);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = findPublicDistPath();

  app.use((req, res, next) => {
    if (req.path === "/index.html") return res.redirect(301, "/");
    if (req.path.length > 1 && req.path.endsWith("/")) return res.redirect(301, req.path.slice(0, -1) + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""));
    next();
  });

  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath, { index: false, redirect: false, maxAge: "1y", immutable: true }));
  }

  app.use("*", async (req, res) => {
    try {
      const template = await findTemplate();
      const serverEntry = await loadServerEntry();
      await renderRequest(req, res, template, serverEntry?.render);
    } catch (error) {
      console.error("[Static Server Error]", error);
      res.status(200).type("text/html").send(getFallbackTemplate());
    }
  });
}
