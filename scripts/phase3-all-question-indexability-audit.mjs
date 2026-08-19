#!/usr/bin/env node

import { gunzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { QUESTION_PROMPT_OVERRIDES } from "../question-seo.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const root = resolve(import.meta.dirname, "..");
const baseUrl = (args.get("--base-url") || "http://127.0.0.1:8798").replace(/\/$/, "");
const canonicalOrigin = (args.get("--canonical-origin") || "https://studywudy-board-solutions.amanbhagat17089.workers.dev").replace(/\/$/, "");
const database = new DatabaseSync(resolve(root, args.get("--db") || "cloudflare-backup-2026-08-17/d1/studywudy-content.sqlite3"), { readOnly: true });
const outputPath = resolve(root, args.get("--output") || "audits/phase-3/all-question-indexability.json");

function routeFor(row) {
  return `/${row.board_slug}/${row.grade_slug}/${row.subject_slug}/${row.book_slug}/${row.chapter_slug}/questions/${row.question_id}`;
}

async function fetchWithRetry(url, options = {}) {
  let response;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(90_000), ...options });
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) return response;
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw new Error(`Failed to fetch ${url} after 3 attempts`, { cause: error });
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500 * (attempt + 1)));
  }
  if (lastError) throw lastError;
  return response;
}

function one(html, expression) {
  return html.match(expression)?.[1] || null;
}

function schemas(html) {
  return [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

const rows = database.prepare(`SELECT q.row_id, q.question_id, q.chapter_slug,
  b.board_slug, b.grade_slug, b.subject_slug, b.slug AS book_slug
  FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id ORDER BY q.row_id`).all();
const expectedPaths = new Set(rows.map(routeFor));

const indexResponse = await fetchWithRetry(`${baseUrl}/sitemap.xml`);
const indexXml = await indexResponse.text();
const childUrls = [...indexXml.matchAll(/<sitemap><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod><\/sitemap>/g)]
  .map((match) => ({ url: match[1], lastmod: match[2] }));
const sitemapPaths = new Set();
const duplicateSitemapPaths = [];
const childReports = [];
for (const child of childUrls.filter((entry) => !entry.url.includes("/hierarchy."))) {
  const local = new URL(child.url);
  local.protocol = new URL(baseUrl).protocol;
  local.host = new URL(baseUrl).host;
  const response = await fetchWithRetry(local);
  const bytes = Buffer.from(await response.arrayBuffer());
  const xml = (bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).toString("utf8");
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
  for (const path of paths) {
    if (sitemapPaths.has(path)) duplicateSitemapPaths.push(path);
    sitemapPaths.add(path);
  }
  childReports.push({
    path: local.pathname,
    status: response.status,
    urlCount: paths.length,
    lastmodCount: (xml.match(/<lastmod>/g) || []).length,
    uncompressedBytes: Buffer.byteLength(xml),
    pass: response.ok && paths.length > 0 && paths.length <= 50_000
      && paths.length === (xml.match(/<lastmod>/g) || []).length
      && Buffer.byteLength(xml) < 50_000_000,
  });
}

const missingFromSitemap = [...expectedPaths].filter((path) => !sitemapPaths.has(path));
const unexpectedInSitemap = [...sitemapPaths].filter((path) => !expectedPaths.has(path));
// Do not turn the production verifier itself into a burst-load test. Search
// crawlers pace sitemap expansion and leaf fetches; leave the edge a short
// recovery window before sampling SSR pages.
if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(baseUrl)) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 2_500));
}
const sampleRowIds = new Set([1, rows.length]);
for (let rowId = 1; rowId <= rows.length; rowId += 4_997) sampleRowIds.add(rowId);
for (const questionId of Object.keys(QUESTION_PROMPT_OVERRIDES)) {
  const row = rows.find((candidate) => candidate.question_id === questionId);
  if (row) sampleRowIds.add(Number(row.row_id));
}
const rowById = new Map(rows.map((row) => [Number(row.row_id), row]));
const sampleReports = [];

for (const rowId of [...sampleRowIds].sort((left, right) => left - right)) {
  const row = rowById.get(rowId);
  if (!row) continue;
  const path = routeFor(row);
  const response = await fetchWithRetry(`${baseUrl}${path}`, { headers: { accept: "text/html" } });
  const html = await response.text();
  const title = one(html, /<title>([^<]+)<\/title>/);
  const description = one(html, /<meta name="description" content="([^"]+)"/);
  const robots = one(html, /<meta name="robots" content="([^"]+)"/);
  const canonical = one(html, /<link rel="canonical" href="([^"]+)"/);
  const graph = schemas(html).flatMap((schema) => schema["@graph"] || [schema]);
  const breadcrumb = graph.find((schema) => schema["@type"] === "BreadcrumbList");
  const questionPage = graph.find((schema) => schema["@type"] === "WebPage" && schema.mainEntity?.["@type"] === "Question");
  const errors = [];
  if (!response.ok) errors.push(`HTTP ${response.status}`);
  if (!String(response.headers.get("x-robots-tag") || "").startsWith("index, follow")) errors.push("X-Robots-Tag is not index/follow");
  if (!String(robots || "").startsWith("index, follow") || /noindex/i.test(robots || "")) errors.push("robots meta is not index/follow");
  if (canonical !== `${canonicalOrigin}${path}`) errors.push("canonical mismatch");
  if (!title || [...title].length > 60) errors.push("missing or overlong title");
  if (!description || [...description].length > 158) errors.push("missing or overlong description");
  if (!breadcrumb || breadcrumb.itemListElement?.length !== 7) errors.push("invalid BreadcrumbList");
  if (!questionPage?.mainEntity?.acceptedAnswer?.text) errors.push("missing Question/Answer schema");
  if (!html.includes('aria-label="Question navigation"') || !html.includes("related-questions")) errors.push("missing internal question links");
  sampleReports.push({ rowId, path, status: response.status, title, descriptionLength: [...(description || "")].length, robots, canonical, errors });
  if (!/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(baseUrl)) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  catalogQuestionCount: rows.length,
  sitemap: {
    indexStatus: indexResponse.status,
    questionChildCount: childReports.length,
    questionUrlCount: sitemapPaths.size,
    duplicateUrlCount: duplicateSitemapPaths.length,
    missingCount: missingFromSitemap.length,
    unexpectedCount: unexpectedInSitemap.length,
    missingExamples: missingFromSitemap.slice(0, 20),
    unexpectedExamples: unexpectedInSitemap.slice(0, 20),
    children: childReports,
  },
  runtimeSamples: {
    count: sampleReports.length,
    failures: sampleReports.filter((sample) => sample.errors.length),
    samples: sampleReports,
  },
};
report.pass = indexResponse.ok
  && rows.length === sitemapPaths.size
  && duplicateSitemapPaths.length === 0
  && missingFromSitemap.length === 0
  && unexpectedInSitemap.length === 0
  && childReports.every((child) => child.pass)
  && sampleReports.length >= 60
  && sampleReports.every((sample) => sample.errors.length === 0);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  generatedAt: report.generatedAt,
  catalogQuestionCount: report.catalogQuestionCount,
  sitemap: { ...report.sitemap, children: report.sitemap.children.map(({ path, urlCount, pass }) => ({ path, urlCount, pass })) },
  runtimeSamples: { count: report.runtimeSamples.count, failureCount: report.runtimeSamples.failures.length },
  pass: report.pass,
}, null, 2));
database.close();
if (!report.pass) process.exitCode = 1;
