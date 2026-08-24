import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { CHAPTER_PAGE_EXPERIENCE_STYLES } from "../chapter-page-experience.mjs";
import { QUESTION_PAGE_THEME_ALIGNMENT_STYLES } from "../question-page-experience.mjs";
import {
  CORE_PREVIEW_ROUTES,
  ELECTROSTATICS_BASE,
  MATHEMATICAL_LOGIC_BASE,
  MATHEMATICAL_LOGIC_QUESTIONS_BASE,
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
const previewAssetRoot = resolve(previewRoot, "assets");
const localR2Root = resolve(repositoryRoot, "../data/r2/objects");
const branchUrl = `https://github.com/aamanbhagat/studywudy-board-solutions/tree/${PREVIEW_BRANCH}`;
const referencedPreviewMedia = new Set();
const referencedCatalogArtwork = new Set();

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
    .replace(/<meta\b[^>]*\bname=(?:"googlebot"|'googlebot')[^>]*>/giu, googlebot)
    .replace(/<script\b(?=[^>]*\bsrc=(?:"\/monitoring\/[^"]*"|'\/monitoring\/[^']*'))[^>]*>\s*<\/script>/giu, "")
    .replaceAll("/icon-192.png", "/preview-assets/studywudy-preview.svg")
    .replaceAll("/icon-512.png", "/preview-assets/studywudy-preview.svg")
    .replaceAll("/apple-touch-icon.png", "/preview-assets/studywudy-preview.svg")
    .replace(
      /\/catalog-artwork\/books\/(?:cards\/(?:mobile-108x150\/)?|)([a-z0-9-]+)--(class-\d+)--[a-z0-9-]+--([a-z0-9-]+)\.webp/giu,
      "/catalog-artwork/books/covers/$1/$2/$3.webp",
    )
    .replace(
      /\/catalog-artwork\/subjects\/(?:heroes-96x96|cards-128x128)\/([a-z0-9-]+)\.webp/giu,
      (_match, slug) => {
        referencedCatalogArtwork.add(slug);
        return `/preview-assets/catalog/${slug}.svg`;
      },
    );

  for (const match of transformed.matchAll(/\/(?:boardly-media|studywudy-media)\/[^"'()\s<>]+/giu)) {
    const mediaPath = new URL(match[0], "https://preview.invalid").pathname;
    referencedPreviewMedia.add(mediaPath);
  }

  if (!/name=(?:"robots"|'robots')/iu.test(transformed)) {
    transformed = transformed.replace(/<\/head>/iu, `${robots}${googlebot}</head>`);
  }
  transformed = transformed.replace(/<\/head>/iu, `${previewHeadMarkup()}</head>`);
  transformed = transformed.replace(/(<body\b[^>]*>)/iu, `$1${previewBodyMarkup()}`);
  return transformed;
}

function applyLocalRouteUpdates(route, html) {
  const normalizedRoute = normalizePreviewRoute(route);
  if (normalizedRoute !== MATHEMATICAL_LOGIC_BASE
    && !normalizedRoute.startsWith(`${MATHEMATICAL_LOGIC_QUESTIONS_BASE}/`)) return html;

  const themed = normalizedRoute === MATHEMATICAL_LOGIC_BASE
    ? html.replace(
      /<style id="chapter-page-experience-styles">[\s\S]*?<\/style>/u,
      CHAPTER_PAGE_EXPERIENCE_STYLES,
    )
    : html;

  const aligned = normalizedRoute.startsWith(`${MATHEMATICAL_LOGIC_QUESTIONS_BASE}/`)
    ? themed
      .replace(/<style id="question-page-theme-alignment-styles">[\s\S]*?<\/style>/u, "")
      .replace(/<\/head>/iu, `${QUESTION_PAGE_THEME_ALIGNMENT_STYLES}</head>`)
    : themed;

  return aligned
    .replaceAll("Brief answer", "Problem")
    .replaceAll("brief answer", "problem")
    .replaceAll("<small>brief</small>", "<small>Problem</small>");
}

function catalogArtworkSvg(slug) {
  const label = slug
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
  const initials = label
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 3);
  const hue = Number.parseInt(createHash("sha256").update(slug).digest("hex").slice(0, 4), 16) % 90 + 155;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title desc"><title id="title">${htmlEscape(label)}</title><desc id="desc">StudyWudy ${htmlEscape(label)} subject artwork</desc><defs><linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 52% 94%)"/><stop offset="1" stop-color="hsl(${hue} 44% 82%)"/></linearGradient><pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0v16" fill="none" stroke="hsl(${hue} 32% 55% / .22)"/></pattern></defs><rect width="128" height="128" rx="24" fill="url(#paper)"/><rect width="128" height="128" rx="24" fill="url(#grid)"/><path d="M26 33h76v69H26z" fill="#fffdf8" stroke="hsl(${hue} 42% 34%)" stroke-width="3"/><path d="M38 48h52M38 60h38M38 84h52M38 94h38" stroke="hsl(${hue} 38% 50%)" stroke-width="3" stroke-linecap="round"/><circle cx="84" cy="67" r="14" fill="hsl(${hue} 62% 38%)"/><text x="84" y="72" fill="white" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12" font-weight="800" text-anchor="middle">${htmlEscape(initials)}</text></svg>`;
}

function previewMarkSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title desc"><title id="title">StudyWudy preview</title><desc id="desc">An open study book with a verification check</desc><rect width="128" height="128" rx="26" fill="#17211d"/><path d="M22 34c17-5 31-1 42 8v58c-11-9-25-13-42-8V34Zm84 0c-17-5-31-1-42 8v58c11-9 25-13 42-8V34Z" fill="#f8f4e9" stroke="#bfe8d0" stroke-width="4" stroke-linejoin="round"/><path d="m76 67 8 8 18-22" fill="none" stroke="#1a8054" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

async function writePreviewAssets({ reset = true } = {}) {
  if (reset) await rm(previewAssetRoot, { recursive: true, force: true });
  await mkdir(resolve(previewAssetRoot, "preview-assets/catalog"), { recursive: true });
  await writeFile(
    resolve(previewAssetRoot, "preview-assets/studywudy-preview.svg"),
    previewMarkSvg(),
  );

  for (const slug of [...referencedCatalogArtwork].sort()) {
    await writeFile(
      resolve(previewAssetRoot, `preview-assets/catalog/${slug}.svg`),
      catalogArtworkSvg(slug),
    );
  }

  for (const mediaPath of [...referencedPreviewMedia].sort()) {
    const publicPrefix = mediaPath.startsWith("/studywudy-media/")
      ? "/studywudy-media"
      : "/boardly-media";
    const source = resolve(localR2Root, `.${mediaPath.slice(publicPrefix.length)}`);
    const destination = resolve(previewAssetRoot, `.${mediaPath}`);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
}

async function countFiles(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    count += entry.isDirectory() ? await countFiles(resolve(directory, entry.name)) : 1;
  }
  return count;
}

async function fetchHtml(route) {
  const url = new URL(route, sourceOrigin);
  const maxAttempts = 4;
  let lastFailure = "request did not complete";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "StudyWudy-Vercel-Preview-Generator/1.0",
        },
        signal: AbortSignal.timeout(12_000),
      });
      const contentType = response.headers.get("content-type") || "";
      if (response.status === 200 && contentType.includes("text/html")) {
        return applyLocalRouteUpdates(route, await response.text());
      }
      lastFailure = `${response.status} ${contentType || "without content type"}`;
      await response.body?.cancel();
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    if (attempt < maxAttempts) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 350 * attempt));
    }
  }

  throw new Error(`${route} returned ${lastFailure} after ${maxAttempts} attempts`);
}

async function discoverRoutes() {
  const [chapterHtml, mathematicalLogicHtml, searchHtml] = await Promise.all([
    fetchHtml(ELECTROSTATICS_BASE),
    fetchHtml(MATHEMATICAL_LOGIC_BASE),
    fetchHtml("/search"),
  ]);
  const discovered = new Set(CORE_PREVIEW_ROUTES);

  for (const route of internalHtmlRoutes(chapterHtml)) {
    const suffix = route.slice(PHYSICS_BOOK_BASE.length + 1);
    const isBookChapter = route.startsWith(`${PHYSICS_BOOK_BASE}/`) && suffix && !suffix.includes("/");
    if (isBookChapter || route.startsWith(`${ELECTROSTATICS_BASE}/`)) discovered.add(route);
  }

  for (const route of internalHtmlRoutes(mathematicalLogicHtml)) {
    if (route.startsWith(`${MATHEMATICAL_LOGIC_QUESTIONS_BASE}/q-`)) discovered.add(route);
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
  const requestedRoutes = String(process.env.STUDYWUDY_PREVIEW_ROUTES || "")
    .split(",")
    .map((route) => route.trim())
    .filter(Boolean)
    .map(normalizePreviewRoute);
  const incremental = requestedRoutes.length > 0;
  const routes = incremental ? requestedRoutes : await discoverRoutes();
  if (!incremental) await rm(snapshotRoot, { recursive: true, force: true });
  await mkdir(snapshotRoot, { recursive: true });

  const existingManifest = incremental
    ? JSON.parse(await readFile(resolve(previewRoot, "manifest.json"), "utf8"))
    : null;
  const recordsByRoute = new Map(
    (existingManifest?.routes || []).map((record) => [normalizePreviewRoute(record.route), record]),
  );
  for (const [index, route] of routes.entries()) {
    const html = makePreviewSafe(await fetchHtml(route));
    const compressed = gzipSync(html, { level: 9 });
    const relativePath = previewSnapshotRelativePath(route, true);
    const outputPath = resolve(snapshotRoot, relativePath);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, compressed);
    recordsByRoute.set(route, {
      route,
      sha256: createHash("sha256").update(html).digest("hex"),
      htmlBytes: Buffer.byteLength(html),
      gzipBytes: compressed.byteLength,
    });
    process.stdout.write(`\rRendered ${index + 1}/${routes.length}`);
  }
  process.stdout.write("\n");

  await writePreviewAssets({ reset: !incremental });

  const records = [...recordsByRoute.values()]
    .sort((left, right) => left.route.localeCompare(right.route));

  const manifest = {
    ...(existingManifest || {}),
    format: "studywudy-static-vercel-preview-v1",
    branch: PREVIEW_BRANCH,
    source: incremental ? "static-snapshots-with-local-fixtures" : "local-workerd-with-backup-d1",
    cloudflareProductionBindingsUsed: false,
    robotsPolicy: "noindex, nofollow, noarchive",
    routeCount: records.length,
    assetCount: await countFiles(previewAssetRoot),
    routes: records,
  };
  await writeFile(resolve(previewRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Static preview snapshots ready: ${records.length} routes`);
}

await main();
