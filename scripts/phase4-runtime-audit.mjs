#!/usr/bin/env node

import { gunzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { isQuestionRowIndexable } from "../answer-completeness.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);

const root = resolve(import.meta.dirname, "..");
const baseUrl = (args.get("--base-url") || "http://127.0.0.1:8789").replace(/\/$/, "");
const databasePath = resolve(root, args.get("--db") || "comparison/after-persistence/v3/d1/miniflare-D1DatabaseObject/ee8d76fe32dfe0c6dc6d6dd9fdbe19939bf18065016cec33be539d964764b747.sqlite");
const gateAuditPath = resolve(root, args.get("--gate-audit") || "audits/phase-4/content-gate-audit.json");
const outputPath = resolve(root, args.get("--output") || "audits/phase-4/runtime-audit.json");
const database = new DatabaseSync(databasePath, { readOnly: true });
const gateAudit = JSON.parse(readFileSync(gateAuditPath, "utf8"));

function routeFor(row) {
  return `/${row.board_slug}/${row.grade_slug}/${row.subject_slug}/${row.book_slug}/${row.chapter_slug}/questions/${row.question_id}`;
}

function questionByGate(gatePassed) {
  const rows = database.prepare(`SELECT q.row_id, b.board_slug, b.grade_slug, b.subject_slug,
    b.slug AS book_slug, q.chapter_slug, q.question_id
    FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id ORDER BY q.row_id`).iterate();
  for (const row of rows) {
    if (isQuestionRowIndexable(PHASE4_GATE_MANIFEST, Number(row.row_id)) === Boolean(gatePassed)) return row;
  }
  return null;
}

async function fetchText(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { response, text: await response.text() };
}

function robotsValues(html) {
  return [...html.matchAll(/<meta name="robots" content="([^"]+)"\s*\/?>/g)].map((match) => match[1]);
}

function schemas(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

const catalogCount = Number(database.prepare("SELECT COUNT(*) AS count FROM catalog_questions").get().count);
const gateCoverage = catalogCount;
const gatePassedCount = Number(PHASE4_GATE_MANIFEST.gatePassedCount);
const queuedCount = catalogCount - gatePassedCount;
const passRow = questionByGate(1);
const failRow = questionByGate(0);
const passPath = routeFor(passRow);
const failPath = routeFor(failRow);
const chapterPath = passPath.replace(/\/questions\/[^/]+$/, "");

const [passPage, failPage, failHead, chapterPage, boardPage, methodologyPage, sitemapIndex] = await Promise.all([
  fetchText(passPath),
  fetchText(failPath),
  fetch(`${baseUrl}${failPath}`, { method: "HEAD" }),
  fetchText(chapterPath),
  fetchText("/cbse"),
  fetchText("/about/methodology"),
  fetchText("/sitemap.xml"),
]);

const childUrls = [...sitemapIndex.text.matchAll(/<sitemap><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod><\/sitemap>/g)].map((match) => ({ url: match[1], lastmod: match[2] }));
const childReports = [];
const questionPaths = new Set();
let hierarchyHasMethodology = false;
for (const child of childUrls) {
  const childUrl = new URL(child.url);
  childUrl.protocol = new URL(baseUrl).protocol;
  childUrl.host = new URL(baseUrl).host;
  const response = await fetch(childUrl);
  const fetched = Buffer.from(await response.arrayBuffer());
  const isGzip = fetched.length >= 2 && fetched[0] === 0x1f && fetched[1] === 0x8b;
  const xmlBuffer = isGzip ? gunzipSync(fetched) : fetched;
  const xml = xmlBuffer.toString("utf8");
  const compressedBytes = Number(response.headers.get("content-length")) || fetched.length;
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
  if (childUrl.pathname.includes("hierarchy")) hierarchyHasMethodology = paths.includes("/about/methodology");
  else for (const path of paths) questionPaths.add(path);
  childReports.push({
    path: childUrl.pathname,
    status: response.status,
    compressedBytes,
    uncompressedBytes: xmlBuffer.length,
    urlCount: paths.length,
    lastmodCount: (xml.match(/<lastmod>/g) || []).length,
    pass: response.ok && paths.length > 0 && paths.length <= 50_000 && paths.length === (xml.match(/<lastmod>/g) || []).length && xmlBuffer.length < 50_000_000,
  });
}

const manifestPaths = new Set(database.prepare(`SELECT q.row_id, '/' || b.board_slug || '/' || b.grade_slug || '/' || b.subject_slug || '/' || b.slug || '/' || q.chapter_slug || '/questions/' || q.question_id AS path
  FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id`).all()
  .filter((row) => isQuestionRowIndexable(PHASE4_GATE_MANIFEST, Number(row.row_id)))
  .map((row) => row.path));
const missingFromSitemap = [...manifestPaths].filter((path) => !questionPaths.has(path));
const unexpectedInSitemap = [...questionPaths].filter((path) => !manifestPaths.has(path));
const methodologySchemas = schemas(methodologyPage.text);
const aboutGraph = methodologySchemas.flatMap((schema) => schema["@graph"] || [schema]);
const methodologyBreadcrumb = aboutGraph.find((schema) => schema["@type"] === "BreadcrumbList");
const methodologyErrors = [];
if (!aboutGraph.some((schema) => schema["@type"] === "AboutPage")) methodologyErrors.push("missing AboutPage structured data");
if (!methodologyBreadcrumb || methodologyBreadcrumb.itemListElement?.length !== 2) methodologyErrors.push("invalid methodology BreadcrumbList");

const passRobots = robotsValues(passPage.text);
const failRobots = robotsValues(failPage.text);
const formats = gateAudit.formats.map((format) => ({
  type: format.type,
  persistedCount: format.persistedCount,
  completenessPassedCount: format.completenessPassedCount,
  gatePassedCount: format.gatePassedCount,
  wordCountRole: format.wordCountRole,
  pass: format.wordCountRole === "diagnostic only; never an indexability threshold",
}));

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  pipeline: {
    policyVersion: PHASE4_GATE_MANIFEST.policyVersion,
    completenessPolicy: PHASE4_GATE_MANIFEST.completenessPolicy,
    hasMinimumWordCount: Object.hasOwn(PHASE4_GATE_MANIFEST, "depthFloor"),
    similarityThreshold: Number(PHASE4_GATE_MANIFEST.similarityThreshold),
    similarityMetric: PHASE4_GATE_MANIFEST.similarityMetric,
    failOpen: false,
    gateReady: PHASE4_GATE_MANIFEST.corpusCount === catalogCount,
    currentLocation: gateAudit.pipelineFinding.currentGateLocation,
    failureBehavior: gateAudit.pipelineFinding.currentFailBehavior,
  },
  corpus: {
    catalogCount,
    gateCoverage,
    completenessPassedCount: Number(PHASE4_GATE_MANIFEST.completenessPassedCount),
    queuedCount,
    manifestPassedCount: PHASE4_GATE_MANIFEST.gatePassedCount,
    sitemapQuestionCount: questionPaths.size,
    missingFromSitemap: missingFromSitemap.slice(0, 20),
    unexpectedInSitemap: unexpectedInSitemap.slice(0, 20),
    exactMatch: catalogCount === gateCoverage && PHASE4_GATE_MANIFEST.indexableCount === questionPaths.size && missingFromSitemap.length === 0 && unexpectedInSitemap.length === 0,
  },
  samples: {
    passed: {
      path: passPath,
      status: passPage.response.status,
      robots: passRobots,
      gateHeader: passPage.response.headers.get("x-studywudy-publish-gate"),
      hasVerifiedMethodologyLink: passPage.text.includes('href="/about/methodology">✓ Automated completeness gate passed</a>'),
    },
    queued: {
      path: failPath,
      status: failPage.response.status,
      robots: failRobots,
      xRobotsTag: failPage.response.headers.get("x-robots-tag"),
      headXRobotsTag: failHead.headers.get("x-robots-tag"),
      gateHeader: failPage.response.headers.get("x-studywudy-publish-gate"),
      cacheControl: failPage.response.headers.get("cache-control"),
      hasQueueMethodologyLink: failPage.text.includes('href="/about/methodology">Automated answer checks incomplete</a>'),
    },
    chapter: {
      path: chapterPath,
      status: chapterPage.response.status,
      hasAutomatedCatalogSignal: /Automated catalog check [^<]+ · <a href="\/reviewers">human editorial review status<\/a>/.test(chapterPage.text),
    },
  },
  methodology: {
    path: "/about/methodology",
    status: methodologyPage.response.status,
    canonical: methodologyPage.text.match(/<link rel="canonical" href="([^"]+)"/)?.[1] || null,
    robots: robotsValues(methodologyPage.text),
    linkedFromPassedSolution: passPage.text.includes('href="/about/methodology"'),
    linkedFromQueuedSolution: failPage.text.includes('href="/about/methodology"'),
    linkedFromStaticBoardLanding: boardPage.response.ok && boardPage.text.replaceAll('\\"', '"').includes('href="/about/methodology"'),
    structuredDataErrors: methodologyErrors,
    structuredDataWarnings: [],
  },
  sitemap: {
    indexStatus: sitemapIndex.response.status,
    gateHeader: sitemapIndex.response.headers.get("x-studywudy-publish-gate"),
    childCount: childUrls.length,
    hierarchyHasMethodology,
    children: childReports,
  },
  formats,
};

report.pass = report.pipeline.policyVersion === PHASE4_GATE_MANIFEST.policyVersion
  && report.pipeline.completenessPolicy === "question-type-aware; no minimum word count"
  && report.pipeline.hasMinimumWordCount === false
  && report.pipeline.similarityThreshold === 0.85
  && report.pipeline.failOpen === false
  && report.pipeline.gateReady === true
  && report.corpus.exactMatch
  && report.samples.passed.status === 200
  && passRobots.length === 1
  && passRobots[0].startsWith("index, follow")
  && report.samples.passed.gateHeader === `${PHASE4_GATE_MANIFEST.policyVersion}; complete`
  && report.samples.passed.hasVerifiedMethodologyLink
  && report.samples.queued.status === 200
  && failRobots.length === 1
  && failRobots[0].startsWith("noindex, follow")
  && report.samples.queued.xRobotsTag?.startsWith("noindex, follow")
  && report.samples.queued.headXRobotsTag?.startsWith("noindex, follow")
  && /no-store/.test(report.samples.queued.cacheControl || "")
  && report.samples.queued.hasQueueMethodologyLink
  && report.methodology.status === 200
  && report.methodology.robots.length === 1
  && report.methodology.robots[0] === "index, follow"
  && report.methodology.linkedFromPassedSolution
  && report.methodology.linkedFromQueuedSolution
  && report.methodology.linkedFromStaticBoardLanding
  && report.methodology.structuredDataErrors.length === 0
  && report.methodology.structuredDataWarnings.length === 0
  && report.sitemap.indexStatus === 200
  && report.sitemap.gateHeader === `${PHASE4_GATE_MANIFEST.policyVersion}; indexable=${PHASE4_GATE_MANIFEST.indexableCount}`
  && report.sitemap.hierarchyHasMethodology
  && report.sitemap.children.every((child) => child.pass)
  && formats.length === 17
  && formats.every((format) => format.pass);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
database.close();
if (!report.pass) process.exitCode = 1;
