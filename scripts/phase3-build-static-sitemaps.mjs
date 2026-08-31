#!/usr/bin/env node

import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS, CORPUS_QUALITY_MANIFEST } from "../corpus-quality-manifest.mjs";
import { isBookQuarantined } from "../multilingual-text-quality.mjs";
import {
  PUBLIC_QUESTION_SITEMAP_ELIGIBILITY_POLICY_VERSION,
  questionSitemapEligibility,
} from "../public-question-eligibility.mjs";
import { streamsFor, subjectsFor } from "../comparison/stream-taxonomy.js";
import { STUDY_CLUSTER_INDEXABLE_PATHS } from "../study-cluster.mjs";
import { TRUST_POLICY_UPDATED_AT, TRUST_TRANSPARENCY_PATHS } from "../trust-transparency.mjs";

const root = resolve(import.meta.dirname, "..");
const databasePath = resolve(root, process.argv[2] || "../data/d1/studywudy-content.sqlite3");
const outputDirectory = resolve(root, process.argv[3] || "comparison/after-assets/sitemaps");
const origin = (() => {
  const value = process.env.STUDYWUDY_CANONICAL_ORIGIN
    || "https://studywudy-board-solutions.amanbhagat17089.workers.dev";
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("STUDYWUDY_CANONICAL_ORIGIN must use HTTP or HTTPS");
  return parsed.origin;
})();
const blockSize = 10_000;
const contentPublishedAt = "2026-08-15T03:30:10Z";
const contentPublishedEpoch = Math.floor(Date.parse(contentPublishedAt) / 1_000);
const methodologyEpoch = Number(PHASE4_GATE_MANIFEST.reviewedAt);
const policyEpoch = Math.floor(Date.parse("2026-08-18T00:00:00+05:30") / 1_000);
const trustPolicyEpoch = Math.floor(Date.parse(TRUST_POLICY_UPDATED_AT) / 1_000);
const priorityQuestionPilotPath = "/maharashtra-board/class-12/biology/balbharati-biology-standard-12/reproduction-in-lower-and-higher-plants/questions/q-msb-balbharati-biology-standard-12-1-001";
const priorityQuestionPilotUpdatedAt = Math.floor(Date.parse("2026-08-24T00:00:00+05:30") / 1_000);

function xmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function epoch(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return contentPublishedEpoch;
  return numeric > 1e12 ? Math.floor(numeric / 1_000) : Math.floor(numeric);
}

function lastmod(...values) {
  return new Date(1_000 * Math.max(contentPublishedEpoch, ...values.map(epoch)))
    .toISOString().replace(/\.000Z$/, "Z");
}

function urlEntry(pathname, updatedAt) {
  return `  <url><loc>${xmlEscape(new URL(pathname, `${origin}/`).toString())}</loc><lastmod>${lastmod(updatedAt)}</lastmod></url>`;
}

function writeGzip(name, entries) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
  const compressed = gzipSync(xml, { level: 9, mtime: 0 });
  writeFileSync(resolve(outputDirectory, name), compressed);
  return { compressedBytes: compressed.byteLength, uncompressedBytes: Buffer.byteLength(xml), urlCount: entries.length };
}

function streamPathsFromWorker() {
  const worker = readFileSync(resolve(root, "worker.js"), "utf8");
  const match = worker.match(/var PHASE3_STREAM_PATHS = (\[[\s\S]*?\n\]);/);
  if (!match) throw new Error("PHASE3_STREAM_PATHS was not found in worker.js");
  return JSON.parse(match[1]);
}

// The full-depth stream route resolves whether or not the taxonomy lists that
// subject under that stream, but the stream navigation is generated from the
// taxonomy, so a pair the taxonomy does not know is unreachable by clicking.
// Submitting an unlinkable URL is the orphan pattern in its smallest form, so
// the taxonomy decides what is submitted and the route stays reachable directly.
function streamPathMatchesTaxonomy(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 4 || segments[2] !== "streams") return true;
  const [board, grade, , streamId] = segments;
  if (!streamsFor(board, grade).some((stream) => stream.id === streamId)) return true;
  if (segments.length < 6) return true;
  return subjectsFor(board, grade, streamId).includes(segments[5]);
}

mkdirSync(outputDirectory, { recursive: true });
const database = new DatabaseSync(databasePath, { readOnly: true });
const count = Number(database.prepare("SELECT COUNT(*) AS count FROM catalog_questions").get().count);
const children = [];
const report = {
  generatedAt: new Date().toISOString(),
  origin,
  policyVersion: PHASE4_GATE_MANIFEST.policyVersion,
  sitemapEligibilityPolicyVersion: PUBLIC_QUESTION_SITEMAP_ELIGIBILITY_POLICY_VERSION,
  catalogQuestionCount: count,
  expectedIndexableQuestionCount: Number(PHASE4_GATE_MANIFEST.indexableCount),
  blockSize,
  children: [],
};

const hierarchyRows = database.prepare(`SELECT b.id AS book_id, b.board_slug, b.grade_slug, b.subject_slug,
  b.slug AS book_slug, b.updated_at AS book_updated_at, c.slug AS chapter_slug,
  c.updated_at AS chapter_updated_at, c.question_count, MAX(q.updated_at) AS question_updated_at
  FROM catalog_chapters c JOIN catalog_books b ON b.id = c.book_id
  LEFT JOIN catalog_questions q ON q.book_id = c.book_id AND q.chapter_slug = c.slug
  GROUP BY c.id ORDER BY b.board_slug, b.grade_slug, b.subject_slug, b.slug, c.position`).all()
  .filter((row) => !isBookQuarantined(row.book_id));
const timestamps = new Map([
  ["/", contentPublishedEpoch], ["/boards", contentPublishedEpoch],
  ["/about/methodology", methodologyEpoch], ["/privacy", policyEpoch],
  ["/terms", policyEpoch], ["/contact", policyEpoch],
]);
const record = (pathname, ...values) => {
  const timestamp = Math.max(contentPublishedEpoch, ...values.map(epoch));
  timestamps.set(pathname, Math.max(timestamps.get(pathname) || 0, timestamp));
};
const streamPaths = streamPathsFromWorker();
const streamPathsOutsideTaxonomy = streamPaths.filter((pathname) => !streamPathMatchesTaxonomy(pathname));
for (const pathname of streamPaths) {
  if (!streamPathMatchesTaxonomy(pathname)) continue;
  record(pathname, contentPublishedEpoch);
}
for (const pathname of STUDY_CLUSTER_INDEXABLE_PATHS) record(pathname, methodologyEpoch);
for (const pathname of TRUST_TRANSPARENCY_PATHS) record(pathname, trustPolicyEpoch);
for (const row of hierarchyRows) {
  const board = `/${row.board_slug}`;
  const grade = `${board}/${row.grade_slug}`;
  const subject = `${grade}/${row.subject_slug}`;
  const book = `${subject}/${row.book_slug}`;
  const chapter = `${book}/${row.chapter_slug}`;
  const descendantsUpdated = Math.max(epoch(row.book_updated_at), epoch(row.chapter_updated_at), epoch(row.question_updated_at));
  record(board, descendantsUpdated);
  record(grade, descendantsUpdated);
  record(subject, descendantsUpdated);
  record(book, descendantsUpdated);
  record(chapter, row.book_updated_at, row.chapter_updated_at, row.question_updated_at);
}
const hierarchy = writeGzip("hierarchy.xml.gz", [...timestamps].map(([pathname, timestamp]) => urlEntry(pathname, timestamp)));
children.push({ pathname: "/sitemaps/hierarchy.xml.gz", updatedAt: Math.max(...timestamps.values()) });
report.children.push({ kind: "hierarchy", pathname: "/sitemaps/hierarchy.xml.gz", ...hierarchy });

const questionStatement = database.prepare(`SELECT q.row_id, q.book_id, q.chapter_slug, q.question_id,
  q.updated_at AS question_updated_at, b.board_slug, b.grade_slug, b.subject_slug,
  b.slug AS book_slug, b.updated_at AS book_updated_at, c.updated_at AS chapter_updated_at
  FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id
  JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
  WHERE q.row_id >= ? AND q.row_id < ? ORDER BY q.row_id`);
// Counted separately from the manifest-ineligible rows, which outnumber it a
// thousand to one: a single "excluded" counter would absorb ~204,000 rows the
// gate already rejected and say nothing about the rows this filter exists for.
let corpusQualityExcluded = 0;
for (let cursor = 1; cursor <= count; cursor += blockSize) {
  const rows = questionStatement.all(cursor, cursor + blockSize)
    .filter((row) => {
      if (isBookQuarantined(row.book_id)) return false;
      const verdict = questionSitemapEligibility(PHASE4_GATE_MANIFEST, {
        rowId: Number(row.row_id),
        questionId: row.question_id,
        duplicateRowIds: CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS,
      });
      if (verdict.pageEligible && !verdict.corpusQualityClear) corpusQualityExcluded += 1;
      return verdict.eligible;
    });
  if (!rows.length) continue;
  const entries = rows.map((row) => urlEntry(`/${row.board_slug}/${row.grade_slug}/${row.subject_slug}/${row.book_slug}/${row.chapter_slug}/questions/${row.question_id}`, Math.max(epoch(row.question_updated_at), epoch(row.chapter_updated_at), epoch(row.book_updated_at))));
  const name = `questions-${cursor}.xml.gz`;
  const child = writeGzip(name, entries);
  const updatedAt = Math.max(...rows.map((row) => Math.max(epoch(row.question_updated_at), epoch(row.chapter_updated_at), epoch(row.book_updated_at))));
  children.push({ pathname: `/sitemaps/${name}`, updatedAt });
  report.children.push({ kind: "question", pathname: `/sitemaps/${name}`, ...child });
}

const priorityQuestionPilotName = "priority-question-pilot.xml";
const priorityQuestionPilotXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntry(priorityQuestionPilotPath, priorityQuestionPilotUpdatedAt)}\n</urlset>\n`;
writeFileSync(resolve(outputDirectory, priorityQuestionPilotName), priorityQuestionPilotXml);
children.push({ pathname: `/sitemaps/${priorityQuestionPilotName}`, updatedAt: priorityQuestionPilotUpdatedAt });
report.children.push({
  kind: "source-verified-pilot-question",
  pathname: `/sitemaps/${priorityQuestionPilotName}`,
  compressedBytes: null,
  uncompressedBytes: Buffer.byteLength(priorityQuestionPilotXml),
  urlCount: 1,
});

const indexBody = children.map((child) => `  <sitemap><loc>${xmlEscape(`${origin}${child.pathname}`)}</loc><lastmod>${lastmod(child.updatedAt)}</lastmod></sitemap>`).join("\n");
writeFileSync(resolve(outputDirectory, "..", "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexBody}\n</sitemapindex>\n`);
writeFileSync(resolve(outputDirectory, "..", "robots.txt"), `User-Agent: *\nAllow: /\nDisallow: /api/\n\nHost: ${origin}\nSitemap: ${origin}/sitemap.xml\n`);
report.corpusQualityExcluded = corpusQualityExcluded;
report.streamPathsOutsideTaxonomy = streamPathsOutsideTaxonomy;
report.expectedSitemapQuestionCount = Number(PHASE4_GATE_MANIFEST.indexableCount) - corpusQualityExcluded;
writeFileSync(resolve(root, "audits/phase-3/static-sitemap-build.json"), `${JSON.stringify(report, null, 2)}\n`);
database.close();
const questionUrlCount = report.children
  .filter((child) => child.kind === "question")
  .reduce((sum, child) => sum + child.urlCount, 0);
const priorityQuestionPilotUrlCount = report.children
  .filter((child) => child.kind === "source-verified-pilot-question")
  .reduce((sum, child) => sum + child.urlCount, 0);
const expectedSitemapQuestionCount = Number(PHASE4_GATE_MANIFEST.indexableCount) - corpusQualityExcluded;
// `corpus-quality-gate.mjs` derives the same figure from the catalog rather than
// from this loop, and `build:phase4-gate` now runs it first. Two independent
// derivations agreeing is the check; one of them alone is just an echo.
const corpusQualityManifestAgrees = CORPUS_QUALITY_MANIFEST.publishManifestPolicyVersion === PHASE4_GATE_MANIFEST.policyVersion
  && Number(CORPUS_QUALITY_MANIFEST.sitemapIndexableCount) === expectedSitemapQuestionCount;
console.log(JSON.stringify({
  catalogQuestionCount: count,
  expectedIndexableQuestionCount: Number(PHASE4_GATE_MANIFEST.indexableCount),
  corpusQualityExcluded,
  expectedSitemapQuestionCount,
  corpusQualityManifestSitemapIndexableCount: Number(CORPUS_QUALITY_MANIFEST.sitemapIndexableCount),
  corpusQualityManifestAgrees,
  hierarchyUrlCount: hierarchy.urlCount,
  questionChildCount: report.children.length - 1,
  questionUrlCount,
  priorityQuestionPilotUrlCount,
  pass: questionUrlCount === expectedSitemapQuestionCount
    && corpusQualityManifestAgrees
    && priorityQuestionPilotUrlCount === 1,
}, null, 2));
if (questionUrlCount !== expectedSitemapQuestionCount
  || !corpusQualityManifestAgrees
  || priorityQuestionPilotUrlCount !== 1) process.exitCode = 1;
