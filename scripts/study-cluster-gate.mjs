#!/usr/bin/env node

import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { isLegacyQuestionId } from "../question-routes.mjs";
import {
  buildStudyClusterModel,
  matchStudyClusterRoute,
  renderStudyClusterPage,
  STUDY_CLUSTER_INDEXABLE_PATHS,
  STUDY_CLUSTER_PYQ_PATH,
  STUDY_CLUSTER_QBANK_BOOK,
} from "../study-cluster.mjs";

const root = resolve(import.meta.dirname, "..");
const database = new DatabaseSync(resolve(root, "../data/d1/studywudy-content.sqlite3"), { readOnly: true });
const primaryBookId = "maharashtra-board::class-12::physics::balbharati-physics-standard-12";
const questionBankBookId = `maharashtra-board::class-12::physics::${STUDY_CLUSTER_QBANK_BOOK}`;

function loadPayload(bookId) {
  const rows = database.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index").all(bookId);
  if (!rows.length) throw new Error(`Missing source payload: ${bookId}`);
  return JSON.parse(gunzipSync(Buffer.concat(rows.map((row) => Buffer.from(row.content_chunk)))));
}

const catalog = database.prepare(`SELECT b.title AS book_title, bo.name AS board_name, g.label AS grade_label,
  s.name AS subject_name, c.number AS chapter_number, c.title AS chapter_title
  FROM catalog_books b JOIN catalog_boards bo ON bo.slug = b.board_slug
  JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
  JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug AND s.slug = b.subject_slug
  JOIN catalog_chapters c ON c.book_id = b.id WHERE b.id = ? AND c.slug = 'electrostatics'`).get(primaryBookId);
const model = buildStudyClusterModel({
  primaryPayload: loadPayload(primaryBookId),
  questionBankPayload: loadPayload(questionBankBookId),
  catalog,
  reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
});

const catalogQuestionPaths = new Set(database.prepare(`SELECT '/' || b.board_slug || '/' || b.grade_slug || '/' ||
  b.subject_slug || '/' || b.slug || '/' || q.chapter_slug || '/questions/' || q.question_id AS pathname
  FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id`).all().map((row) => row.pathname));
const pageReports = [];
const errors = [];
const titleSet = new Set();
const descriptionSet = new Set();

for (const pathname of [...STUDY_CLUSTER_INDEXABLE_PATHS, STUDY_CLUSTER_PYQ_PATH]) {
  const route = matchStudyClusterRoute(pathname);
  const page = renderStudyClusterPage(model, route);
  if (!page) {
    errors.push(`${pathname}: render failed`);
    continue;
  }
  const links = [...page.body.matchAll(/href="([^"]+)"/gu)].map((match) => match[1].replaceAll("&amp;", "&"));
  const questionLinks = links.filter((href) => href.includes("/questions/"));
  const missing = questionLinks.filter((href) => !catalogQuestionPaths.has(new URL(href, "https://example.test").pathname));
  const legacy = questionLinks.filter((href) => isLegacyQuestionId(href.split("/").at(-1)));
  if (missing.length) errors.push(`${pathname}: ${missing.length} linked questions missing from database`);
  if (legacy.length) errors.push(`${pathname}: ${legacy.length} legacy question IDs`);
  if (page.canonical !== `https://studywudy-board-solutions.amanbhagat17089.workers.dev${pathname}`) {
    errors.push(`${pathname}: canonical mismatch`);
  }
  if (pathname === STUDY_CLUSTER_PYQ_PATH ? page.robots !== "noindex, follow" : page.robots !== "index, follow") {
    errors.push(`${pathname}: incorrect robots policy`);
  }
  if (pathname !== STUDY_CLUSTER_PYQ_PATH) {
    if (titleSet.has(page.title)) errors.push(`${pathname}: duplicate title`);
    if (descriptionSet.has(page.description)) errors.push(`${pathname}: duplicate description`);
    titleSet.add(page.title);
    descriptionSet.add(page.description);
  }
  pageReports.push({ pathname, indexable: route.indexable, linkCount: links.length, questionLinkCount: questionLinks.length });
}

if (model.evidence.textbookQuestionCount !== 21) errors.push("Electrostatics textbook question count changed from reviewed 21");
if (model.evidence.questionBankQuestionCount !== 30) errors.push("Electrostatics question-bank count changed from reviewed 30");
if (model.evidence.hasVerifiedPaperMetadata || model.evidence.verifiedPaperCount !== 0) errors.push("Unverified PYQ evidence was published");
if (model.concepts.length !== 8) errors.push("Concept library must contain eight reviewed guides");
if (!model.concepts.every((concept) => concept.textbookQuestions.length && concept.questionBankQuestions.length)) {
  errors.push("Every concept guide must link textbook and question-bank practice");
}

const runtime = readFileSync(resolve(root, "comparison/after-assets/study-cluster.js"), "utf8");
if (!runtime.includes("localStorage") || /\b(?:fetch|XMLHttpRequest|sendBeacon)\s*\(/u.test(runtime)) {
  errors.push("Practice progress must use browser-only storage and make no network writes");
}

const hierarchyXml = gunzipSync(readFileSync(resolve(root, "comparison/after-assets/sitemaps/hierarchy.xml.gz")), "utf8");
for (const pathname of STUDY_CLUSTER_INDEXABLE_PATHS) {
  if (!hierarchyXml.includes(pathname)) errors.push(`${pathname}: missing from hierarchy sitemap`);
}
if (hierarchyXml.includes(STUDY_CLUSTER_PYQ_PATH)) errors.push("Noindex PYQ evidence desk must not appear in sitemap");

const report = {
  generatedAt: new Date().toISOString(),
  pass: errors.length === 0,
  sourceCounts: model.evidence,
  indexableResourceCount: STUDY_CLUSTER_INDEXABLE_PATHS.length,
  conceptCount: model.concepts.length,
  importantQuestionCount: model.important.length,
  practiceQuestionCount: model.practiceQuestions.length,
  pages: pageReports,
  errors,
};
mkdirSync(resolve(root, "audits/phase-4"), { recursive: true });
writeFileSync(resolve(root, "audits/phase-4/study-cluster-gate.json"), `${JSON.stringify(report, null, 2)}\n`);
database.close();
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
