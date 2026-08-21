#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import {
  getQuestionUrl,
  isLegacyQuestionId,
  questionIdFromUrl,
  questionRecordFromCatalogRow,
} from "../question-routes.mjs";

const root = resolve(import.meta.dirname, "..");
const argumentsList = process.argv.slice(2);

function option(name, fallback = null) {
  const inline = argumentsList.find((entry) => entry.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argumentsList.indexOf(name);
  if (index >= 0 && argumentsList[index + 1] && !argumentsList[index + 1].startsWith("--")) return argumentsList[index + 1];
  return fallback;
}

function hasFlag(name) {
  return argumentsList.includes(name);
}

const originInput = option("--origin", process.env.STUDYWUDY_LINK_GATE_ORIGIN || null);
const origin = originInput ? new URL(originInput).origin : null;
const canonicalOrigin = new URL(option(
  "--canonical-origin",
  process.env.STUDYWUDY_CANONICAL_ORIGIN || "https://studywudy-board-solutions.amanbhagat17089.workers.dev",
)).origin;
const internalOrigins = new Set([origin, canonicalOrigin].filter(Boolean));
const concurrency = Math.max(1, Number(option("--concurrency", process.env.STUDYWUDY_LINK_GATE_CONCURRENCY || 20)) || 20);
const maximumPages = Number(option("--max-pages", process.env.STUDYWUDY_LINK_GATE_MAX_PAGES || "Infinity"));
const outputPath = resolve(root, option("--output", ".wrangler/reports/release-link-integrity.json"));
const configuredDatabase = option("--database", process.env.STUDYWUDY_LINK_GATE_DATABASE || null);
const databaseCandidates = [
  configuredDatabase,
  resolve(root, "../data/d1/studywudy-content.sqlite3"),
  resolve(root, "cloudflare-backup-2026-08-17/d1/studywudy-content.sqlite3"),
].filter(Boolean);
const databasePath = databaseCandidates.find(existsSync) || null;

const failures = [];
const sourceChecks = {};

function fail(code, detail) {
  failures.push({ code, ...detail });
}

const expectedExample = "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electrostatics/questions/q-msb-balbharati-physics-standard-12-8-001";
sourceChecks.canonicalHelperExample = getQuestionUrl({
  boardSlug: "maharashtra-board",
  classNumber: 12,
  subjectSlug: "physics",
  textbookSlug: "balbharati-physics-standard-12",
  chapterSlug: "electrostatics",
  publicQuestionId: "q-msb-balbharati-physics-standard-12-8-001",
}) === expectedExample;

const workerSource = readFileSync(resolve(root, "comparison/after-worker.js"), "utf8");
sourceChecks.questionBankUsesCanonicalHelper = /searchQuestionCardMarkup[\s\S]*getQuestionUrl\(questionRecordFromCatalogRow\(row\)\)/u.test(workerSource);
sourceChecks.quickFindUsesCanonicalHelper = /href:\s*getQuestionUrl\(questionRecordFromCatalogRow\(item\)\)/u.test(workerSource);
sourceChecks.chapterControlBecomesAnchor = /const currentQuestionUrl\s*=\s*publicQuestionId[\s\S]*getQuestionUrl\([\s\S]*href:\s*currentQuestionUrl[\s\S]*element\.tagName\s*=\s*"a"[\s\S]*element\.setAttribute\("href", currentQuestion\.href\)/u.test(workerSource);
sourceChecks.legacyQuestionRequestsFailClosed = /isLegacyQuestionId\(routedQuestion\.question\)[\s\S]*status:\s*404/u.test(workerSource);
sourceChecks.noSqlQuestionUrlConcatenation = !/["'`]\/questions\/["'`]\s*\|\|\s*q\.question_id/u.test(workerSource);
for (const [name, passed] of Object.entries(sourceChecks)) {
  if (!passed) fail("source_contract_failed", { check: name });
}

let database = null;
let databaseSummary = { available: false, path: databasePath };
let canonicalQuestionPaths = null;

if (databasePath) {
  database = new DatabaseSync(databasePath, { readOnly: true });
  const integrity = database.prepare("PRAGMA quick_check").get();
  const orphanQuestions = database.prepare(`SELECT COUNT(*) AS count
    FROM catalog_questions q
    LEFT JOIN catalog_books b ON b.id = q.book_id
    LEFT JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
    WHERE b.id IS NULL OR c.id IS NULL`).get().count;
  const duplicateRoutes = database.prepare(`SELECT COUNT(*) AS count FROM (
    SELECT b.board_slug, b.grade_slug, b.subject_slug, b.slug, q.chapter_slug, q.question_id
    FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id
    GROUP BY b.board_slug, b.grade_slug, b.subject_slug, b.slug, q.chapter_slug, q.question_id
    HAVING COUNT(*) > 1
  )`).get().count;
  const legacyDatabaseIds = database.prepare(`SELECT COUNT(*) AS count
    FROM catalog_questions WHERE question_id GLOB 'q-physics-*' OR question_id GLOB 'q-bio-*'`).get().count;
  canonicalQuestionPaths = new Set();
  let invalidQuestionRecords = 0;
  const rows = database.prepare(`SELECT q.question_id, b.board_slug, b.grade_slug,
    b.subject_slug, b.slug AS book_slug, q.chapter_slug
    FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id`).iterate();
  for (const row of rows) {
    try {
      const path = getQuestionUrl(questionRecordFromCatalogRow(row));
      if (canonicalQuestionPaths.has(path)) invalidQuestionRecords += 1;
      canonicalQuestionPaths.add(path);
    } catch {
      invalidQuestionRecords += 1;
    }
  }
  databaseSummary = {
    available: true,
    path: databasePath,
    quickCheck: integrity.quick_check,
    questionCount: canonicalQuestionPaths.size,
    orphanQuestions,
    duplicateRoutes,
    legacyDatabaseIds,
    invalidQuestionRecords,
  };
  if (integrity.quick_check !== "ok") fail("database_integrity_failed", { result: integrity.quick_check });
  if (orphanQuestions) fail("orphan_questions", { count: orphanQuestions });
  if (duplicateRoutes) fail("duplicate_question_routes", { count: duplicateRoutes });
  if (legacyDatabaseIds) fail("legacy_question_ids_in_database", { count: legacyDatabaseIds });
  if (invalidQuestionRecords) fail("invalid_canonical_question_records", { count: invalidQuestionRecords });
}

function decodeHtml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function anchorHrefs(html, pageUrl) {
  const links = [];
  for (const match of html.matchAll(/<a\b([^>]*)>/giu)) {
    const hrefMatch = match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/iu);
    if (!hrefMatch) continue;
    const rawHref = decodeHtml(hrefMatch[1] ?? hrefMatch[2]);
    if (!rawHref || rawHref.startsWith("#") || /^(?:mailto|tel|javascript|data):/iu.test(rawHref)) continue;
    try {
      const resolved = new URL(rawHref, pageUrl);
      if (!internalOrigins.has(resolved.origin)) continue;
      resolved.hash = "";
      links.push(`${resolved.pathname}${resolved.search}`);
    } catch {
      fail("malformed_internal_href", { page: pageUrl, href: rawHref });
    }
  }
  return [...new Set(links)];
}

function isIndexableHtml(response, html) {
  if (response.status < 200 || response.status >= 300) return false;
  const headerRobots = response.headers.get("x-robots-tag") || "";
  let metaRobots = "";
  for (const match of html.matchAll(/<meta\b([^>]*)>/giu)) {
    const attributes = match[1];
    const name = attributes.match(/\bname\s*=\s*["']([^"']*)["']/iu)?.[1] || "";
    if (name.toLowerCase() !== "robots") continue;
    metaRobots = attributes.match(/\bcontent\s*=\s*["']([^"']*)["']/iu)?.[1] || "";
    break;
  }
  return !/\bnoindex\b/iu.test(`${headerRobots} ${metaRobots}`);
}

function chapterPath(pathname) {
  return /^\/(?:maharashtra-board|cbse|cisce|tamil-nadu-board)\/class-\d+\/[^/]+\/[^/]+\/[^/]+\/?$/u.test(pathname);
}

function verifyVisibleSolutionAnchors(html, pathname) {
  if (!chapterPath(pathname)) return { controls: 0, invalid: 0 };
  let controls = 0;
  let invalid = 0;
  for (const match of html.matchAll(/<(a|span|button)\b([^>]*\bclass\s*=\s*["'][^"']*\bsolution-page-button\b[^"']*["'][^>]*)>[\s\S]*?View solution[\s\S]*?<\/\1>/giu)) {
    controls += 1;
    if (match[1].toLowerCase() !== "a" || !/\bhref\s*=\s*["'][^"']+["']/iu.test(match[2])) invalid += 1;
  }
  if (/View solution/iu.test(html) && controls === 0) invalid += 1;
  return { controls, invalid };
}

async function bodyText(response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return gunzipSync(bytes).toString("utf8");
  return new TextDecoder().decode(bytes);
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        headers: { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
        signal: AbortSignal.timeout(45_000),
      });
      if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
        await response.body?.cancel();
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250 * (attempt + 1)));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolvePromise) => setTimeout(resolvePromise, 250 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function crawlOrigin() {
  const pending = ["/", "/boards", "/search", "/sitemap.xml"];
  const queued = new Set(pending);
  const results = new Map();
  const sourcesByTarget = new Map();
  let solutionControls = 0;
  let invalidSolutionControls = 0;

  async function inspect(path) {
    const pageUrl = new URL(path, origin).href;
    try {
      const response = await fetchWithRetry(pageUrl);
      const status = response.status;
      const location = response.headers.get("location");
      const contentType = response.headers.get("content-type") || "";
      const text = await bodyText(response);
      const result = { status, location, contentType, indexable: false, links: [] };
      if (status === 404) fail("internal_link_404", { href: path, sources: [...(sourcesByTarget.get(path) || [])].slice(0, 5) });
      else if (status >= 400) fail("internal_link_http_error", { href: path, status, sources: [...(sourcesByTarget.get(path) || [])].slice(0, 5) });
      if (status >= 300 && status < 400 && location) {
        const target = new URL(location, pageUrl);
        if (internalOrigins.has(target.origin)) {
          const targetPath = `${target.pathname}${target.search}`;
          if (!queued.has(targetPath)) {
            queued.add(targetPath);
            pending.push(targetPath);
          }
        }
      }
      if (contentType.includes("xml") || path.endsWith(".xml")) {
        for (const match of text.matchAll(/<loc>([\s\S]*?)<\/loc>/giu)) {
          const target = new URL(decodeHtml(match[1]), pageUrl);
          const targetPath = `${target.pathname}${target.search}`;
          if (!queued.has(targetPath)) {
            queued.add(targetPath);
            pending.push(targetPath);
          }
        }
      } else if (contentType.includes("text/html")) {
        result.indexable = isIndexableHtml(response, text);
        result.links = anchorHrefs(text, pageUrl);
        const solutionCheck = verifyVisibleSolutionAnchors(text, new URL(pageUrl).pathname);
        solutionControls += solutionCheck.controls;
        invalidSolutionControls += solutionCheck.invalid;
        if (solutionCheck.invalid) fail("non_anchor_view_solution", { page: path, invalid: solutionCheck.invalid });
        for (const targetPath of result.links) {
          if (!sourcesByTarget.has(targetPath)) sourcesByTarget.set(targetPath, new Set());
          sourcesByTarget.get(targetPath).add(path);
          const questionId = questionIdFromUrl(new URL(targetPath, origin).pathname);
          if (questionId && isLegacyQuestionId(questionId)) fail("legacy_question_link", { page: path, href: targetPath });
          if (questionId && canonicalQuestionPaths && !canonicalQuestionPaths.has(new URL(targetPath, origin).pathname.replace(/\/+$/u, ""))) {
            fail("linked_question_missing_from_database", { page: path, href: targetPath });
          }
          if (!queued.has(targetPath)) {
            queued.add(targetPath);
            pending.push(targetPath);
          }
        }
      }
      results.set(path, result);
    } catch (error) {
      results.set(path, { status: null, error: String(error), indexable: false, links: [] });
      fail("internal_link_transport_error", { href: path, error: String(error), sources: [...(sourcesByTarget.get(path) || [])].slice(0, 5) });
    }
  }

  while (pending.length && results.size < maximumPages) {
    const batch = pending.splice(0, Math.min(concurrency, maximumPages - results.size));
    await Promise.all(batch.map(inspect));
    if (results.size && results.size % 500 === 0) process.stdout.write(`link gate crawled ${results.size} pages\n`);
  }
  if (pending.length) fail("crawl_truncated", { maximumPages, remaining: pending.length });

  const primarilyBadPages = [];
  for (const [path, result] of results) {
    if (!result.indexable || !result.links.length) continue;
    const bad = result.links.filter((target) => {
      const targetResult = results.get(target);
      return !targetResult || targetResult.status >= 300;
    });
    if (bad.length > result.links.length / 2) {
      primarilyBadPages.push({ page: path, bad: bad.length, total: result.links.length });
      fail("indexable_page_primarily_links_to_dead_or_redirected_routes", {
        page: path,
        bad: bad.length,
        total: result.links.length,
      });
    }
  }
  return {
    pagesCrawled: results.size,
    internalTargetsDiscovered: sourcesByTarget.size,
    indexablePages: [...results.values()].filter((result) => result.indexable).length,
    redirects: [...results.values()].filter((result) => result.status >= 300 && result.status < 400).length,
    notFound: [...results.values()].filter((result) => result.status === 404).length,
    questionMembershipMethod: canonicalQuestionPaths
      ? "exact canonical-path membership in the D1 snapshot plus HTTP transport"
      : "HTTP response from the preview Worker backed by its D1 binding",
    solutionControls,
    invalidSolutionControls,
    primarilyBadPages,
  };
}

let crawlSummary = null;
if (origin) crawlSummary = await crawlOrigin();
else if (hasFlag("--require-origin")) fail("crawl_origin_required", {});

database?.close();

const report = {
  generatedAt: new Date().toISOString(),
  pass: failures.length === 0,
  mode: origin ? "exhaustive-runtime-crawl" : "release-source-and-database",
  origin,
  canonicalOrigin,
  sourceChecks,
  database: databaseSummary,
  crawl: crawlSummary,
  failures,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  pass: report.pass,
  mode: report.mode,
  databaseQuestions: databaseSummary.questionCount || null,
  pagesCrawled: crawlSummary?.pagesCrawled || 0,
  failures: failures.length,
  output: outputPath,
}, null, 2));
if (!report.pass) process.exitCode = 1;
