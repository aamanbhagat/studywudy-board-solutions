#!/usr/bin/env node

import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS, CORPUS_QUALITY_MANIFEST } from "../corpus-quality-manifest.mjs";
import { isBookQuarantined } from "../multilingual-text-quality.mjs";
import {
  PUBLIC_QUESTION_SITEMAP_ELIGIBILITY_POLICY_VERSION,
  questionSitemapEligibility,
} from "../public-question-eligibility.mjs";
import { STUDY_CLUSTER_INDEXABLE_PATHS } from "../study-cluster.mjs";
import { TRUST_TRANSPARENCY_PATHS } from "../trust-transparency.mjs";
import { CONTENT_PUBLISHED_AT, contentRevisionEpochs } from "../content-revisions.mjs";
import {
  priorityQuestionPilotReviewedAt,
  streamPathMatchesTaxonomy,
  streamPathsFromWorker,
} from "./sitemap-route-sources.mjs";

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
const contentPublishedEpoch = Math.floor(Date.parse(CONTENT_PUBLISHED_AT) / 1_000);
const priorityQuestionPilotPath = "/maharashtra-board/class-12/biology/balbharati-biology-standard-12/reproduction-in-lower-and-higher-plants/questions/q-msb-balbharati-biology-standard-12-1-001";

function xmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function lastmod(epochSeconds) {
  return new Date(1_000 * epochSeconds).toISOString().replace(/\.000Z$/, "Z");
}

// Every lastmod now comes from catalog_content_revisions, which records the
// first build at which a page's rendered content took its current form. The
// previous shape - MAX(q.updated_at, c.updated_at, b.updated_at) clamped up to a
// published-at floor - could not do better than the floor, because every one of
// those columns is null on every row in this corpus. A URL with no revision row
// is a build failure rather than a silent fallback: falling back is what made
// one date cover 104,703 URLs and read like a working generator.
//
// A Set rather than a counter, because revisionEpoch runs twice for a question
// URL - once for its <url> entry, once for its block's index lastmod - and a
// counter would report every miss twice.
const missingRevisions = new Set();
const revisionEpoch = (pathname) => {
  const value = revisions.get(pathname);
  if (Number.isFinite(value) && value > 0) return value;
  missingRevisions.add(pathname);
  return contentPublishedEpoch;
};

function urlEntry(pathname, updatedAt = revisionEpoch(pathname)) {
  return `  <url><loc>${xmlEscape(new URL(pathname, `${origin}/`).toString())}</loc><lastmod>${lastmod(updatedAt)}</lastmod></url>`;
}

function writeGzip(name, entries) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
  const compressed = gzipSync(xml, { level: 9, mtime: 0 });
  writeFileSync(resolve(outputDirectory, name), compressed);
  return { compressedBytes: compressed.byteLength, uncompressedBytes: Buffer.byteLength(xml), urlCount: entries.length };
}

mkdirSync(outputDirectory, { recursive: true });
const database = new DatabaseSync(databasePath, { readOnly: true });
const revisions = contentRevisionEpochs(database);
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

// The LEFT JOIN onto catalog_questions this query used to carry existed only to
// compute MAX(q.updated_at), a column that is null on all 299,458 rows. Dropping
// it leaves the row order byte-identical (verified against the joined form) and
// takes the query from 82 ms to 10 ms.
const hierarchyRows = database.prepare(`SELECT b.id AS book_id, b.board_slug, b.grade_slug, b.subject_slug,
  b.slug AS book_slug, c.slug AS chapter_slug
  FROM catalog_chapters c JOIN catalog_books b ON b.id = c.book_id
  ORDER BY b.board_slug, b.grade_slug, b.subject_slug, b.slug, c.position`).all()
  .filter((row) => !isBookQuarantined(row.book_id));
// Insertion order is the emitted URL order, so it is load-bearing: statics,
// streams, cluster, trust, then board -> grade -> subject -> book -> chapter as
// the hierarchy query returns them. Set-once rather than the old max-merge - an
// entity's revision epoch already describes that entity, and rolling a chapter
// edit up into its board page was the part of the old shape that claimed more
// than it knew.
const timestamps = new Map();
const record = (pathname) => {
  if (!timestamps.has(pathname)) timestamps.set(pathname, revisionEpoch(pathname));
};
for (const pathname of ["/", "/boards", "/about/methodology", "/privacy", "/terms", "/contact"]) record(pathname);
const streamPaths = streamPathsFromWorker(root);
const streamPathsOutsideTaxonomy = streamPaths.filter((pathname) => !streamPathMatchesTaxonomy(pathname));
for (const pathname of streamPaths) {
  if (!streamPathMatchesTaxonomy(pathname)) continue;
  record(pathname);
}
for (const pathname of STUDY_CLUSTER_INDEXABLE_PATHS) record(pathname);
for (const pathname of TRUST_TRANSPARENCY_PATHS) record(pathname);
for (const row of hierarchyRows) {
  const board = `/${row.board_slug}`;
  const grade = `${board}/${row.grade_slug}`;
  const subject = `${grade}/${row.subject_slug}`;
  const book = `${subject}/${row.book_slug}`;
  record(board);
  record(grade);
  record(subject);
  record(book);
  record(`${book}/${row.chapter_slug}`);
}
const hierarchy = writeGzip("hierarchy.xml.gz", [...timestamps].map(([pathname, timestamp]) => urlEntry(pathname, timestamp)));
children.push({ pathname: "/sitemaps/hierarchy.xml.gz", updatedAt: Math.max(...timestamps.values()) });
report.children.push({ kind: "hierarchy", pathname: "/sitemaps/hierarchy.xml.gz", ...hierarchy });

const questionStatement = database.prepare(`SELECT q.row_id, q.book_id, q.chapter_slug, q.question_id,
  b.board_slug, b.grade_slug, b.subject_slug, b.slug AS book_slug
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
  const paths = rows.map((row) => `/${row.board_slug}/${row.grade_slug}/${row.subject_slug}/${row.book_slug}/${row.chapter_slug}/questions/${row.question_id}`);
  const name = `questions-${cursor}.xml.gz`;
  const child = writeGzip(name, paths.map((pathname) => urlEntry(pathname)));
  // The index entry is the newest URL in the block, so a block containing one
  // rewritten answer moves without pretending its other 9,999 URLs changed.
  children.push({ pathname: `/sitemaps/${name}`, updatedAt: Math.max(...paths.map(revisionEpoch)) });
  report.children.push({ kind: "question", pathname: `/sitemaps/${name}`, ...child });
}

// The one URL whose lastmod is a review date rather than a content hash: the
// pilot is published on the strength of a human source check, so when that
// check happened is what changed about it. Read from the Worker, which serves
// this path itself under run_worker_first and so owns the value.
const priorityQuestionPilotName = "priority-question-pilot.xml";
const priorityQuestionPilotUpdatedAt = priorityQuestionPilotReviewedAt(root);
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
report.revisionRowCount = revisions.size;
report.missingRevisionCount = missingRevisions.size;
report.missingRevisionExamples = [...missingRevisions].slice(0, 25);
const lastmodDistribution = {};
for (const timestamp of timestamps.values()) {
  const value = lastmod(timestamp);
  lastmodDistribution[value] = (lastmodDistribution[value] || 0) + 1;
}
report.hierarchyLastmodDistribution = lastmodDistribution;
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
// Fail closed on a URL with no revision row. The silent fallback is what this
// change exists to remove: a missing row means the log and the sitemap disagree
// about which pages exist, and the honest answer to "when did this change" is
// then unknown - not the publication date.
const revisionsComplete = missingRevisions.size === 0;
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
  revisionRowCount: revisions.size,
  missingRevisionCount: missingRevisions.size,
  missingRevisionExamples: report.missingRevisionExamples.slice(0, 5),
  distinctLastmodValues: new Set([
    ...Object.keys(lastmodDistribution),
    ...children.map((child) => lastmod(child.updatedAt)),
  ]).size,
  revisionsComplete,
  pass: questionUrlCount === expectedSitemapQuestionCount
    && corpusQualityManifestAgrees
    && priorityQuestionPilotUrlCount === 1
    && revisionsComplete,
}, null, 2));
if (questionUrlCount !== expectedSitemapQuestionCount
  || !corpusQualityManifestAgrees
  || priorityQuestionPilotUrlCount !== 1
  || !revisionsComplete) process.exitCode = 1;
