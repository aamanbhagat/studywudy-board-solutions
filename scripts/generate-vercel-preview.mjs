import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import {
  CORE_PREVIEW_ROUTES,
  ELECTROSTATICS_BASE,
  PHYSICS_BOOK_BASE,
  PREVIEW_BRANCH,
  normalizePreviewRoute,
  previewSnapshotRelativePath,
} from "./vercel-preview-routes.mjs";

const sourceOrigin = new URL(
  process.env.STUDYWUDY_PREVIEW_SOURCE_ORIGIN || "http://127.0.0.1:8789",
);
const repositoryRoot = resolve(import.meta.dirname, "..");
const previewRoot = resolve(repositoryRoot, "vercel-preview");
const snapshotRoot = resolve(previewRoot, "snapshots");
const branchUrl = `https://github.com/aamanbhagat/studywudy-board-solutions/tree/${PREVIEW_BRANCH}`;

const htmlEscape = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

function internalHtmlRoutes(html) {
  const routes = [];
  const pattern = /\bhref=(?:"([^"]+)"|'([^']+)')/giu;
  for (const match of html.matchAll(pattern)) {
    const href = (match[1] || match[2] || "").replaceAll("&amp;", "&");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    let url;
    try {
      url = new URL(href, sourceOrigin);
    } catch {
      continue;
    }
    if (url.origin !== sourceOrigin.origin) continue;
    routes.push(normalizePreviewRoute(url.pathname));
  }
  return routes;
}

function previewHeadMarkup() {
  return `<meta name="studywudy-preview" content="static-vercel-qa"><style data-studywudy-preview="banner">.studywudy-preview-banner{position:fixed;right:12px;bottom:12px;z-index:2147483647;max-width:min(360px,calc(100vw - 24px));padding:9px 12px;border:1px solid #17211d;border-radius:10px;background:#17211d;color:#fff;font:700 12px/1.4 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.25)}.studywudy-preview-banner a{color:#bfe8d0;text-decoration:underline}.studywudy-preview-banner span{color:#d6ddd9;font-weight:500}</style>`;
}

function previewBodyMarkup() {
  return `<aside class="studywudy-preview-banner" aria-label="Preview environment">Static Vercel QA preview<br><span>No production data writes · </span><a href="${htmlEscape(branchUrl)}">review branch</a></aside><script data-studywudy-preview="forms">document.addEventListener("submit",function(event){event.preventDefault();window.alert("Forms are disabled in this static QA preview. No data was sent.")})</script>`;
}

function makePreviewSafe(html) {
  const robots = '<meta name="robots" content="noindex, nofollow, noarchive">';
  const googlebot = '<meta name="googlebot" content="noindex, nofollow, noarchive">';
  let transformed = html
    .replace(/<meta\b[^>]*\bname=(?:"robots"|'robots')[^>]*>/giu, robots)
    .replace(/<meta\b[^>]*\bname=(?:"googlebot"|'googlebot')[^>]*>/giu, googlebot);

  if (!/name=(?:"robots"|'robots')/iu.test(transformed)) {
    transformed = transformed.replace(/<\/head>/iu, `${robots}${googlebot}</head>`);
  }
  transformed = transformed.replace(/<\/head>/iu, `${previewHeadMarkup()}</head>`);
  transformed = transformed.replace(/(<body\b[^>]*>)/iu, `$1${previewBodyMarkup()}`);
  return transformed;
}

async function fetchHtml(route) {
  const url = new URL(route, sourceOrigin);
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "StudyWudy-Vercel-Preview-Generator/1.0",
    },
  });
  const contentType = response.headers.get("content-type") || "";
  if (response.status !== 200 || !contentType.includes("text/html")) {
    throw new Error(`${route} returned ${response.status} ${contentType || "without content type"}`);
  }
  return response.text();
}

async function discoverRoutes() {
  const [chapterHtml, searchHtml] = await Promise.all([
    fetchHtml(ELECTROSTATICS_BASE),
    fetchHtml("/search"),
  ]);
  const discovered = new Set(CORE_PREVIEW_ROUTES);

  for (const route of internalHtmlRoutes(chapterHtml)) {
    const suffix = route.slice(PHYSICS_BOOK_BASE.length + 1);
    const isBookChapter = route.startsWith(`${PHYSICS_BOOK_BASE}/`) && suffix && !suffix.includes("/");
    if (isBookChapter || route.startsWith(`${ELECTROSTATICS_BASE}/`)) discovered.add(route);
  }

  let questionBankSamples = 0;
  for (const route of internalHtmlRoutes(searchHtml)) {
    if (!route.includes("/questions/q-")) continue;
    if (!discovered.has(route)) questionBankSamples += 1;
    discovered.add(route);
    if (questionBankSamples >= 16) break;
  }

  return [...discovered].map(normalizePreviewRoute).sort((a, b) => a.localeCompare(b));
}

async function main() {
  const routes = await discoverRoutes();
  await rm(snapshotRoot, { recursive: true, force: true });
  await mkdir(snapshotRoot, { recursive: true });

  const records = [];
  for (const [index, route] of routes.entries()) {
    const html = makePreviewSafe(await fetchHtml(route));
    const compressed = gzipSync(html, { level: 9 });
    const relativePath = previewSnapshotRelativePath(route, true);
    const outputPath = resolve(snapshotRoot, relativePath);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, compressed);
    records.push({
      route,
      sha256: createHash("sha256").update(html).digest("hex"),
      htmlBytes: Buffer.byteLength(html),
      gzipBytes: compressed.byteLength,
    });
    process.stdout.write(`\rRendered ${index + 1}/${routes.length}`);
  }
  process.stdout.write("\n");

  const manifest = {
    format: "studywudy-static-vercel-preview-v1",
    branch: PREVIEW_BRANCH,
    source: "local-workerd-with-backup-d1",
    cloudflareProductionBindingsUsed: false,
    robotsPolicy: "noindex, nofollow, noarchive",
    routeCount: records.length,
    routes: records,
  };
  await writeFile(resolve(previewRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Static preview snapshots ready: ${records.length} routes`);
}

await main();
