#!/usr/bin/env node

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsRoot = path.join(repoRoot, "comparison", "after-assets");
const origin = (process.env.PHASE2_ORIGIN || "http://localhost:8789").replace(/\/$/, "");
const outputPath = path.join(repoRoot, "comparison", "phase2-runtime-audit.json");
const routes = [
  ["homepage", "/"],
  ["board", "/maharashtra-board"],
  ["class", "/maharashtra-board/class-12"],
  ["subject", "/maharashtra-board/class-12/physics"],
  ["chapter", "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics"],
  ["question-mcq", "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-001"],
  ["question-numerical", "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-027"],
  ["question-written", "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-008"],
];

function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
    .map((match) => [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? ""]));
}

function stripInlineScripts(html) {
  return html.replace(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi, "");
}

async function assetBytes(urlPath) {
  const filePath = path.join(assetsRoot, urlPath.split("?")[0].replace(/^\//, ""));
  try {
    return (await stat(filePath)).size;
  } catch {
    return null;
  }
}

async function auditRoute([name, route]) {
  const response = await fetch(`${origin}${route}`);
  const html = await response.text();
  const documentHtml = stripInlineScripts(html);
  const imageTags = [...documentHtml.matchAll(/<img\b[^>]*>/gi)].map((match) => attributes(match[0]));
  const scriptTags = [...documentHtml.matchAll(/<script\b[^>]*\bsrc=[^>]*>/gi)].map((match) => attributes(match[0]));
  const activeScriptTags = scriptTags.filter((item) => !("nomodule" in item));
  const scriptSources = [...new Set(activeScriptTags.map((item) => item.src).filter(Boolean))];
  const scriptSizes = await Promise.all(scriptSources.map(async (src) => ({ src, bytes: await assetBytes(src) })));
  const blockingScripts = scriptTags
    .filter((item) => !("async" in item) && !("defer" in item) && !("nomodule" in item))
    .map((item) => item.src);
  const fontPreloads = [...documentHtml.matchAll(/<link\b[^>]*\brel="preload"[^>]*\bas="font"[^>]*>/gi)]
    .map((match) => attributes(match[0]).href)
    .filter(Boolean);
  const rocketLoaderMatches = html.match(/rocket-loader|data-cfasync|cf-rocket-loader/gi) || [];
  return {
    name,
    route,
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    nextCache: response.headers.get("x-nextjs-cache"),
    fontPreloads,
    images: {
      count: imageTags.length,
      explicitDimensions: imageTags.filter((item) => item.width && item.height).length,
      lazy: imageTags.filter((item) => item.loading === "lazy").length,
      eager: imageTags.filter((item) => item.loading === "eager").length,
      modernSources: imageTags.filter((item) => /\.(?:avif|webp)(?:\?|$)/i.test(item.src || "")).length,
      missingDimensions: imageTags.filter((item) => !item.width || !item.height).map((item) => item.src || "(no src)"),
    },
    scripts: {
      count: scriptSources.length,
      bytes: scriptSizes.reduce((total, item) => total + (item.bytes || 0), 0),
      sources: scriptSizes,
      blocking: blockingScripts,
      legacyNomodule: scriptTags.filter((item) => "nomodule" in item).map((item) => item.src),
    },
    katexSsr: {
      katexMarkup: html.includes('class="katex"'),
      mathMl: /<math(?:\s|>)/.test(html),
    },
    rocketLoaderMatches: rocketLoaderMatches.length,
  };
}

async function filesUnder(directory, extension) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await filesUnder(filePath, extension));
    else if (entry.isFile() && entry.name.endsWith(extension)) found.push(filePath);
  }
  return found;
}

const routeAudits = [];
for (const route of routes) routeAudits.push(await auditRoute(route));

const scriptRouteFrequency = new Map();
for (const route of routeAudits) {
  for (const script of route.scripts.sources) {
    scriptRouteFrequency.set(script.src, (scriptRouteFrequency.get(script.src) || 0) + 1);
  }
}
const sharedScriptSources = [...scriptRouteFrequency.entries()]
  .filter(([, count]) => count === routeAudits.length)
  .map(([src]) => src)
  .sort();
const searchResponse = await fetch(`${origin}/search`);
const searchHtml = await searchResponse.text();
const searchDocumentHtml = stripInlineScripts(searchHtml);
const searchScripts = [...searchDocumentHtml.matchAll(/<script\b[^>]*\bsrc=[^>]*>/gi)]
  .map((match) => attributes(match[0]))
  .filter((item) => !("nomodule" in item))
  .map((item) => item.src)
  .filter(Boolean);
const jsRouteSplit = {
  sharedScriptSources,
  routes: routeAudits.map((route) => ({
    name: route.name,
    bytes: route.scripts.bytes,
    routeScopedSources: route.scripts.sources
      .filter((script) => !sharedScriptSources.includes(script.src))
      .map((script) => script.src),
  })),
  search: {
    status: searchResponse.status,
    serverGetForm: /<form\b[^>]*\baction="\/search"/i.test(searchDocumentHtml),
    scriptSources: [...new Set(searchScripts)],
    dedicatedScriptSources: [...new Set(searchScripts)].filter((src) => !sharedScriptSources.includes(src)),
  },
};

const clientChunks = await filesUnder(path.join(assetsRoot, "_next", "static", "chunks"), ".js");
const clientKatexRenderers = [];
for (const filePath of clientChunks) {
  const source = await readFile(filePath, "utf8");
  if (/katex\.(?:render|renderToString)|renderMathInElement/.test(source)) {
    clientKatexRenderers.push(path.relative(repoRoot, filePath));
  }
}

const appCss = await readFile(path.join(assetsRoot, "_next", "static", "chunks", "1j8ahw0e9ui5v.css"), "utf8");
const katexCss = await readFile(path.join(assetsRoot, "_next", "static", "chunks", "3c4-ozf1dxam2.css"), "utf8");
const assetHeaderPaths = [
  "/_next/static/media/ibm-plex-sans-latin-v23.woff2",
  "/_next/static/chunks/1j8ahw0e9ui5v.css",
  "/theme.js?v=20260818-phase2",
  "/catalog-artwork/boards/logos/maharashtra-board-384.webp",
];
const cacheHeaders = [];
for (const assetPath of assetHeaderPaths) {
  const response = await fetch(`${origin}${assetPath}`);
  await response.body?.cancel();
  cacheHeaders.push({ path: assetPath, status: response.status, cacheControl: response.headers.get("cache-control") });
}
const [namedLatinFont, recoveredPreloadFont] = await Promise.all([
  readFile(path.join(assetsRoot, "_next", "static", "media", "ibm-plex-sans-latin-v23.woff2")),
  readFile(path.join(assetsRoot, "_next", "static", "media", "a343f882a40d2cc9-s.p.1sj6eobyi31rd.woff2")),
]);
const conditionalHtmlResponse = await fetch(`${origin}/maharashtra-board`, {
  headers: { accept: "text/html", "if-none-match": "*" },
});
const conditionalHtmlBody = await conditionalHtmlResponse.text();
const conditionalHtml = {
  status: conditionalHtmlResponse.status,
  etag: conditionalHtmlResponse.headers.get("etag"),
  phase2Markup: conditionalHtmlBody.includes("quick-find.css?v=20260818-phase2")
    && conditionalHtmlBody.includes('data-studywudy-theme="inline"'),
};

const report = {
  generatedAt: new Date().toISOString(),
  origin,
  routes: routeAudits,
  assertions: {
    allRoutesOk: routeAudits.every((route) => route.status === 200),
    allImagesHaveDimensions: routeAudits.every((route) => route.images.missingDimensions.length === 0),
    allExternalScriptsNonBlocking: routeAudits.every((route) => route.scripts.blocking.length === 0),
    singleIbmPlexPreload: namedLatinFont.equals(recoveredPreloadFont)
      && routeAudits.every((route) => route.fontPreloads.length === 1 && route.fontPreloads[0].includes("a343f882a40d2cc9")),
    ibmPlexCss: appCss.includes('font-family:"IBM Plex Sans"') && !appCss.includes("font-family:Manrope"),
    katexSsrOnNumerical: routeAudits.find((route) => route.name === "question-numerical")?.katexSsr.katexMarkup === true,
    noClientKatexRenderer: clientKatexRenderers.length === 0,
    katexFontSwap: !katexCss.includes("font-display:block") && katexCss.includes("font-display:swap"),
    rocketLoaderAbsent: routeAudits.every((route) => route.rocketLoaderMatches === 0),
    immutableStaticAssets: cacheHeaders.every((asset) => asset.cacheControl?.includes("immutable")),
    conditionalHtmlReturnsFreshPhase2Markup: conditionalHtml.status === 200
      && conditionalHtml.etag === null
      && conditionalHtml.phase2Markup,
    routeSplittingPresent: jsRouteSplit.routes.some((route) => route.routeScopedSources.length > 0),
    searchServerRenderedWithoutDedicatedChunk: jsRouteSplit.search.status === 200
      && jsRouteSplit.search.serverGetForm
      && jsRouteSplit.search.dedicatedScriptSources.length === 0,
  },
  clientKatexRenderers,
  cacheHeaders,
  conditionalHtml,
  jsRouteSplit,
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (Object.values(report.assertions).some((value) => value !== true)) process.exitCode = 1;
