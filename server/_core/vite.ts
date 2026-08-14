import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import superjson from "superjson";
import viteConfig from "../../vite.config";
import { buildSsrPrefetch } from "./ssrCaller";

type HeadMeta = { title: string; description: string; ogType?: "website" | "article"; canonicalPath?: string; noindex?: boolean; notFound?: boolean; publishedTime?: string };

function escapeHtml(value: string) { return value.replace(/[&<>\"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] || char)); }
function canonicalOrigin() { return (process.env.CANONICAL_ORIGIN || "https://hamispro.io").replace(/\/$/, ""); }
function composeHead(head: HeadMeta) {
  const origin = canonicalOrigin();
  const canonical = `${origin}${head.canonicalPath || "/"}`;
  const title = escapeHtml(head.title);
  const description = escapeHtml(head.description);
  const robots = head.noindex ? "noindex, nofollow" : "index, follow";
  return `<title>${title}</title><meta name="description" content="${description}" /><meta name="robots" content="${robots}" /><link rel="canonical" href="${escapeHtml(canonical)}" /><meta property="og:title" content="${title}" /><meta property="og:description" content="${description}" /><meta property="og:type" content="${head.ogType || "website"}" /><meta property="og:url" content="${escapeHtml(canonical)}" /><meta property="og:site_name" content="Hamispro.io" /><meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${title}" /><meta name="twitter:description" content="${description}" />`;
}
function composeHtml(template: string, result: { html: string; dehydratedState: unknown; head: HeadMeta }) {
  const serialized = JSON.stringify(superjson.serialize(result.dehydratedState));
  return template.replace("<!--app-head-->", composeHead(result.head)).replace("<!--app-html-->", () => result.html).replace("</head>", `<script>window.__RQ_STATE__=${serialized};</script></head>`);
}

async function renderRequest(req: any, res: any, template: string, render: (url: string, prefetch: any) => Promise<any>) {
  try {
    const prefetch = await buildSsrPrefetch(req, res);
    const result = await render(req.originalUrl, prefetch);
    res.status(result.head.notFound ? 404 : 200).set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }).end(composeHtml(template, result));
  } catch (error) {
    console.error("[SSR] render failed", error);
    res.status(200).set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }).end(template.replace("<!--app-head-->", composeHead({ title: "Hamispro.io — The useful side of AI", description: "Useful signal for the age of AI." })));
  }
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
  const distPath = path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) console.error(`Could not find the build directory: ${distPath}`);
  app.use((req, res, next) => {
    if (req.path === "/index.html") return res.redirect(301, "/");
    if (req.path.length > 1 && req.path.endsWith("/")) return res.redirect(301, req.path.slice(0, -1) + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""));
    next();
  });
  app.use(express.static(distPath, { index: false, redirect: false, maxAge: "1y", immutable: true }));
  app.use("*", async (req, res, next) => {
    try {
      const template = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
      const serverEntry = await import(path.resolve(path.dirname(distPath), "server", "entry-server.js"));
      await renderRequest(req, res, template, serverEntry.render);
    } catch (error) { next(error); }
  });
}
