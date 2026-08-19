#!/usr/bin/env node

import { gunzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);

const root = resolve(import.meta.dirname, "..");
const baseUrl = (args.get("--base-url") || "http://localhost:8794").replace(/\/$/, "");
const canonicalOrigin = (args.get("--canonical-origin") || "https://studywudy-board-solutions.amanbhagat17089.workers.dev").replace(/\/$/, "");
const outputPath = resolve(root, args.get("--output") || "audits/phase-3/runtime-audit.json");
const database = new DatabaseSync(resolve(root, args.get("--db") || "cloudflare-backup-2026-08-17/d1/studywudy-content.sqlite3"), { readOnly: true });

async function fetchWithRetry(url, options = {}) {
  let lastResponse;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    lastResponse = await fetch(url, { signal: AbortSignal.timeout(45_000), ...options });
    if (![429, 500, 502, 503, 504].includes(lastResponse.status) || attempt === 2) return lastResponse;
    await lastResponse.body?.cancel();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 300 * (attempt + 1)));
  }
  return lastResponse;
}

function matchOne(html, expression) {
  return html.match(expression)?.[1] || null;
}

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

function schemaTypes(schemas) {
  return schemas.flatMap((schema) => schema["@graph"]?.map((entry) => entry["@type"]) || [schema["@type"]]).filter(Boolean);
}

function validateBreadcrumb(schema) {
  const errors = [];
  if (!Array.isArray(schema?.itemListElement) || schema.itemListElement.length === 0) errors.push("itemListElement must be non-empty");
  for (const [index, item] of (schema?.itemListElement || []).entries()) {
    if (item["@type"] !== "ListItem") errors.push(`item ${index + 1} must be ListItem`);
    if (item.position !== index + 1) errors.push(`item ${index + 1} has a non-sequential position`);
    if (!String(item.name || "").trim()) errors.push(`item ${index + 1} has no name`);
  }
  return errors;
}

async function fetchText(path, options = {}) {
  const response = await fetchWithRetry(`${baseUrl}${path}`, {
    redirect: options.redirect || "follow",
    headers: { accept: "text/html", ...(options.headers || {}) },
  });
  const text = await response.text();
  return { response, text };
}

const templateRoutes = [
  ["home", "/"],
  ["boards", "/boards"],
  ["board", "/maharashtra-board"],
  ["class", "/maharashtra-board/class-12"],
  ["subject", "/maharashtra-board/class-12/physics"],
  ["book", "/maharashtra-board/class-12/physics/balbharati-physics-standard-12"],
  ["chapter", "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics"],
  ["chapter-pagination", "/cbse/class-12/mathematics/rd-sharma-maths-class-12/indefinite-integrals?page=2"],
  ["question", "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-001"],
  ["stream", "/maharashtra-board/class-12/streams/science"],
  ["course", "/maharashtra-board/class-12/streams/science/hsc-science-general"],
  ["stream-subject", "/maharashtra-board/class-12/streams/science/hsc-science-general/physics"],
  ["search", "/search?q=rotational+dynamics"],
];

const templateResults = [];
for (const [template, path] of templateRoutes) {
  const { response, text } = await fetchText(path);
  const schemas = response.ok ? jsonLd(text) : [];
  const types = schemaTypes(schemas);
  const breadcrumbs = schemas.filter((schema) => schema["@type"] === "BreadcrumbList");
  const errors = [];
  const warnings = [];
  if (!response.ok) errors.push(`HTTP ${response.status}`);
  if (!matchOne(text, /<title>([^<]+)<\/title>/)) errors.push("missing title");
  if (!matchOne(text, /<meta name="description" content="([^"]+)"/)) errors.push("missing description");
  if (!matchOne(text, /<link rel="canonical" href="([^"]+)"/)) errors.push("missing canonical");
  if (breadcrumbs.length !== 1) errors.push(`expected one BreadcrumbList, found ${breadcrumbs.length}`);
  else errors.push(...validateBreadcrumb(breadcrumbs[0]));
  if (template === "home") {
    const graph = schemas.flatMap((schema) => schema["@graph"] || []);
    const organization = graph.find((schema) => schema["@type"] === "Organization");
    const website = graph.find((schema) => schema["@type"] === "WebSite");
    if (!organization?.name || !organization?.url || !organization?.logo?.url) errors.push("invalid Organization graph node");
    if (website?.potentialAction?.["@type"] !== "SearchAction") errors.push("missing WebSite SearchAction");
    if (!website?.potentialAction?.target?.urlTemplate?.includes("{search_term_string}")) errors.push("invalid SearchAction target");
  }
  if (template === "question") {
    const webpage = schemas.find((schema) => schema["@type"] === "WebPage" && schema.mainEntity?.["@type"] === "Question");
    if (!webpage) errors.push("missing WebPage/Question schema");
    if (webpage?.mainEntity?.acceptedAnswer?.["@type"] !== "Answer" || !String(webpage.mainEntity.acceptedAnswer.text || "").trim()) errors.push("missing accepted Answer text");
  }
  if (template === "chapter" || template === "chapter-pagination") {
    if (!schemas.some((schema) => schema["@type"] === "LearningResource")) errors.push("missing LearningResource schema");
  }
  if (template === "search" && !matchOne(text, /<meta name="robots" content="([^"]*noindex[^"]*)"/)) errors.push("search page must be noindex");
  templateResults.push({
    template,
    path,
    status: response.status,
    title: matchOne(text, /<title>([^<]+)<\/title>/),
    canonical: matchOne(text, /<link rel="canonical" href="([^"]+)"/),
    schemaTypes: types,
    breadcrumbItems: (breadcrumbs[0]?.itemListElement || []).map((item) => ({
      position: item.position,
      name: item.name,
      item: item.item || null,
    })),
    errors,
    warnings,
  });
}

const canonicalCases = [
  ["/?utm_source=a&filter=popular", "/"],
  ["/boards?sort=name", "/boards"],
  ["/maharashtra-board/class-12?filter=science", "/maharashtra-board/class-12"],
  ["/maharashtra-board/class-12/physics?stream=science&utm_source=a", "/maharashtra-board/class-12/physics"],
  ["/maharashtra-board/class-12/physics/balbharati-physics-standard-12?filter=popular", "/maharashtra-board/class-12/physics/balbharati-physics-standard-12"],
  ["/cbse/class-12/mathematics/rd-sharma-maths-class-12/indefinite-integrals?page=2&sort=new&utm_source=a", "/cbse/class-12/mathematics/rd-sharma-maths-class-12/indefinite-integrals?page=2"],
  ["/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-001?preview=1&utm_source=a", "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-001"],
  ["/maharashtra-board/class-12/streams/science/hsc-science-general/physics?filter=popular", "/maharashtra-board/class-12/streams/science/hsc-science-general/physics"],
  ["/search?q=physics&page=9", "/search"],
];

const canonicalResults = [];
for (const [path, expectedPath] of canonicalCases) {
  const { response, text } = await fetchText(path);
  const actual = matchOne(text, /<link rel="canonical" href="([^"]+)"/);
  const expected = `${canonicalOrigin}${expectedPath}`;
  canonicalResults.push({ path, status: response.status, actual, expected, pass: response.ok && actual && new URL(actual).href === new URL(expected).href });
}

const pageOne = await fetchWithRetry(`${baseUrl}/cbse/class-12/mathematics/rd-sharma-maths-class-12/indefinite-integrals?page=1&utm_source=a`, { redirect: "manual", headers: { accept: "text/html" } });
canonicalResults.push({
  path: "/cbse/class-12/mathematics/rd-sharma-maths-class-12/indefinite-integrals?page=1&utm_source=a",
  status: pageOne.status,
  actual: pageOne.headers.get("location"),
  expected: "/cbse/class-12/mathematics/rd-sharma-maths-class-12/indefinite-integrals",
  pass: [301, 308].includes(pageOne.status) && new URL(pageOne.headers.get("location"), baseUrl).pathname === "/cbse/class-12/mathematics/rd-sharma-maths-class-12/indefinite-integrals",
});

const robots = await fetchText("/robots.txt");
const robotsLines = robots.text.trim().split(/\r?\n/);
const requiredRobotRules = ["Allow: /", "Disallow: /api/", "Disallow: /admin/", "Disallow: /preview/", "Disallow: /search?", "Disallow: /*?*preview=", "Disallow: /*?*draft="];
const robotsAudit = {
  status: robots.response.status,
  lines: robotsLines,
  sitemapDirectives: robotsLines.filter((line) => line.startsWith("Sitemap:")),
  missingRules: requiredRobotRules.filter((rule) => !robotsLines.includes(rule)),
};
robotsAudit.pass = robots.response.ok && robotsAudit.missingRules.length === 0 && robotsAudit.sitemapDirectives.length === 1 && robotsAudit.sitemapDirectives[0].endsWith("/sitemap.xml");

const indexResponse = await fetchWithRetry(`${baseUrl}/sitemap.xml`);
const indexXml = await indexResponse.text();
const childUrls = [...indexXml.matchAll(/<sitemap><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod><\/sitemap>/g)].map((match) => ({ url: match[1], lastmod: match[2] }));
const childResults = [];
let sitemapUrlTotal = 0;
for (const child of childUrls) {
  const localUrl = new URL(child.url);
  localUrl.protocol = new URL(baseUrl).protocol;
  localUrl.host = new URL(baseUrl).host;
  const response = await fetchWithRetry(localUrl);
  const fetched = Buffer.from(await response.arrayBuffer());
  // Node fetch transparently decodes Content-Encoding:gzip while retaining the
  // response header; local Miniflare returns the raw bytes. Accept either form
  // so the same independent audit validates both live and local runtimes.
  const isGzip = fetched.length >= 2 && fetched[0] === 0x1f && fetched[1] === 0x8b;
  const xmlBuffer = isGzip ? gunzipSync(fetched) : fetched;
  const xml = xmlBuffer.toString("utf8");
  const compressedBytes = Number(response.headers.get("content-length")) || fetched.length;
  const urlCount = (xml.match(/<url>/g) || []).length;
  const lastmodCount = (xml.match(/<lastmod>/g) || []).length;
  sitemapUrlTotal += urlCount;
  childResults.push({
    path: localUrl.pathname,
    status: response.status,
    compressedBytes,
    uncompressedBytes: xmlBuffer.length,
    urlCount,
    lastmodCount,
    pass: response.ok && urlCount > 0 && urlCount <= 50000 && urlCount === lastmodCount && xmlBuffer.length < 50_000_000,
  });
}

const sitemapAudit = {
  indexStatus: indexResponse.status,
  indexContentType: indexResponse.headers.get("content-type"),
  childCount: childUrls.length,
  children: childResults,
  totalUrls: sitemapUrlTotal,
  lastmods: [...new Set(childUrls.map((child) => child.lastmod))],
};
// Phase 5 adds Privacy, Terms and Contact to the previously verified hierarchy.
const expectedHierarchyUrls = 12728 + 3;
const QUESTION_SITEMAP_BLOCK_SIZE = 10_000;
const expectedQuestionChildren = Math.ceil(PHASE4_GATE_MANIFEST.indexableCount / QUESTION_SITEMAP_BLOCK_SIZE);
sitemapAudit.pass = indexResponse.ok && childUrls.length === 1 + expectedQuestionChildren && childResults.every((child) => child.pass) && sitemapUrlTotal === expectedHierarchyUrls + PHASE4_GATE_MANIFEST.indexableCount;

const homeHtml = (await fetchText("/")).text;
const subjectHtml = (await fetchText("/cbse/class-12/mathematics")).text;
const chapterPageHtml = (await fetchText("/cbse/class-12/mathematics/rd-sharma-maths-class-12/indefinite-integrals?page=2")).text;
const homeClassLinks = new Set([...homeHtml.matchAll(/href="(\/(?:maharashtra-board|cbse|cisce|tamil-nadu-board)\/class-\d+)"/g)].map((match) => match[1]));
const subjectChapterLinks = new Set([...subjectHtml.matchAll(/href="(\/cbse\/class-12\/mathematics\/[^"?]+\/[^"?]+)"/g)].map((match) => match[1]));
const subjectPaginationLinks = new Set([...subjectHtml.matchAll(/href="(\/cbse\/class-12\/mathematics\/[^"?]+\/[^"?]+\?page=\d+)"/g)].map((match) => match[1]));
const chapterQuestionLinks = new Set([...chapterPageHtml.matchAll(/href="(\/cbse\/class-12\/mathematics\/rd-sharma-maths-class-12\/indefinite-integrals\/questions\/[^"#?]+)"/g)].map((match) => match[1]));
const gradeCount = database.prepare("SELECT COUNT(*) AS count FROM catalog_grades").get().count;
// CISCE Class 11 is a deliberate navigational landing page even though this
// recovered catalog snapshot has no persisted books beneath it yet.
const homepageClassLinkExpected = gradeCount + 1;
const subjectChapterExpected = database.prepare("SELECT COUNT(*) AS count FROM catalog_chapters c JOIN catalog_books b ON b.id = c.book_id WHERE b.board_slug = 'cbse' AND b.grade_slug = 'class-12' AND b.subject_slug = 'mathematics'").get().count;
const subjectPaginationExpected = database.prepare("SELECT COALESCE(SUM(MAX(0, CAST((c.question_count + 39) / 40 AS INTEGER) - 1)), 0) AS count FROM catalog_chapters c JOIN catalog_books b ON b.id = c.book_id WHERE b.board_slug = 'cbse' AND b.grade_slug = 'class-12' AND b.subject_slug = 'mathematics'").get().count;
const internalLinking = {
  homepageClassLinks: homeClassLinks.size,
  homepageClassLinksExpected: homepageClassLinkExpected,
  subjectChapterLinks: subjectChapterLinks.size,
  subjectChapterLinksExpected: subjectChapterExpected,
  subjectPaginationLinks: subjectPaginationLinks.size,
  subjectPaginationLinksExpected: subjectPaginationExpected,
  chapterPageQuestionLinks: chapterQuestionLinks.size,
  calculatedMaxQuestionDepth: 4,
};
internalLinking.pass = internalLinking.homepageClassLinks === homepageClassLinkExpected && internalLinking.subjectChapterLinks === subjectChapterExpected && internalLinking.subjectPaginationLinks === subjectPaginationExpected && internalLinking.chapterPageQuestionLinks > 0 && internalLinking.calculatedMaxQuestionDepth <= 4;

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  canonicalOrigin,
  robots: robotsAudit,
  sitemap: sitemapAudit,
  templates: templateResults,
  canonicalCases: canonicalResults,
  structuredData: {
    errors: templateResults.flatMap((result) => result.errors.map((error) => `${result.template}: ${error}`)),
    warnings: templateResults.flatMap((result) => result.warnings.map((warning) => `${result.template}: ${warning}`)),
  },
  internalLinking,
};
report.pass = robotsAudit.pass && sitemapAudit.pass && templateResults.every((result) => result.errors.length === 0 && result.warnings.length === 0) && canonicalResults.every((result) => result.pass) && internalLinking.pass;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
