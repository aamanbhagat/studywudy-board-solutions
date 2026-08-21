#!/usr/bin/env node

import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildQuestionSemanticGraph,
  renderQuestionSemanticGraph,
  renderSemanticPromotion,
  semanticPromotionForPath,
} from "../semantic-link-graph.mjs";
import { isLegacyQuestionId } from "../question-routes.mjs";
import { STUDY_CLUSTER_BASE, STUDY_CLUSTER_INDEXABLE_PATHS, STUDY_CLUSTER_QBANK_BOOK } from "../study-cluster.mjs";

const root = resolve(import.meta.dirname, "..");
const database = new DatabaseSync(resolve(root, "../data/d1/studywudy-content.sqlite3"), { readOnly: true });
const primaryBookId = "maharashtra-board::class-12::physics::balbharati-physics-standard-12";
const questionBankBookId = `maharashtra-board::class-12::physics::${STUDY_CLUSTER_QBANK_BOOK}`;

function payload(bookId) {
  const rows = database.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index").all(bookId);
  if (!rows.length) throw new Error(`Missing payload ${bookId}`);
  return JSON.parse(gunzipSync(Buffer.concat(rows.map((row) => Buffer.from(row.content_chunk)))));
}

function questionsFor(source) {
  const chapter = source.chapters.find((item) => item.slug === "electrostatics");
  return chapter.exercises.flatMap((exercise) => exercise.questions).filter((question) => question.id);
}

const primaryPayload = payload(primaryBookId);
const questionBankPayload = payload(questionBankBookId);
const questions = questionsFor(primaryPayload);
const catalogQuestionPaths = new Set(database.prepare(`SELECT '/' || b.board_slug || '/' || b.grade_slug || '/' ||
  b.subject_slug || '/' || b.slug || '/' || q.chapter_slug || '/questions/' || q.question_id AS pathname
  FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id`).all().map((row) => row.pathname));
const allowedStaticPaths = new Set([
  ...STUDY_CLUSTER_INDEXABLE_PATHS,
  ...STUDY_CLUSTER_INDEXABLE_PATHS.map((pathname) => `${pathname}#core-relation`),
]);
const errors = [];
const relationCounts = new Map();
const graphQuestionLinks = new Set();
const anchorLabels = [];

for (const question of questions) {
  const graph = buildQuestionSemanticGraph({ primaryPayload, questionBankPayload, questionId: question.id });
  if (!graph) {
    errors.push(`${question.id}: graph missing`);
    continue;
  }
  if (graph.links.length !== 7) errors.push(`${question.id}: expected 7 linked relationships, found ${graph.links.length}`);
  if (graph.previousYear !== null || !graph.previousYearStatus.includes("No verified paper-year")) {
    errors.push(`${question.id}: PYQ relationship did not fail closed`);
  }
  const rendered = renderQuestionSemanticGraph(graph);
  if (!rendered.includes('data-semantic-link-graph="electrostatics-v1"')) errors.push(`${question.id}: server-rendered graph missing`);
  for (const link of graph.links) {
    relationCounts.set(link.relation, (relationCounts.get(link.relation) || 0) + 1);
    anchorLabels.push(link.label);
    const target = new URL(link.href, "https://example.test").pathname;
    if (link.href.includes("/questions/")) {
      graphQuestionLinks.add(target);
      const questionId = target.split("/").at(-1);
      if (!catalogQuestionPaths.has(target)) errors.push(`${question.id}: missing question target ${target}`);
      if (isLegacyQuestionId(questionId)) errors.push(`${question.id}: legacy question target ${questionId}`);
    } else if (!allowedStaticPaths.has(target) && !STUDY_CLUSTER_INDEXABLE_PATHS.includes(target)) {
      errors.push(`${question.id}: non-published study target ${target}`);
    }
  }
}

const requiredRelations = [
  "Formula used", "Concept explanation", "Similar textbook problem", "Easier prerequisite",
  "Harder problem", "Chapter test", "Revision note",
];
for (const relation of requiredRelations) {
  if (relationCounts.get(relation) !== 21) errors.push(`${relation}: expected 21 edges, found ${relationCounts.get(relation) || 0}`);
}
const genericAnchor = /^(?:view solution|open answer|read more|view full solution|see the mapped worked solution|open resource)$/iu;
for (const label of anchorLabels) {
  if (genericAnchor.test(label.trim())) errors.push(`Generic semantic anchor: ${label}`);
  if (label.trim().length < 12) errors.push(`Underspecified semantic anchor: ${label}`);
}

const promotionSources = [
  "/", "/maharashtra-board", "/maharashtra-board/class-12", "/maharashtra-board/class-12/physics",
  "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/current-electricity",
  "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/magnetic-fields-due-to-electric-current",
  "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electromagnetic-induction",
];
const inbound = new Map();
for (const source of promotionSources) {
  const promotion = semanticPromotionForPath(source);
  if (!promotion) {
    errors.push(`${source}: promotion missing`);
    continue;
  }
  const markup = renderSemanticPromotion(promotion);
  if (!markup.includes('data-semantic-promotion="electrostatics-v1"')) errors.push(`${source}: crawlable promotion markup missing`);
  for (const link of promotion.links) {
    inbound.set(link.href, (inbound.get(link.href) || 0) + 1);
    if (!markup.includes(`<a href="${link.href}">`)) errors.push(`${source}: promotion is not a direct anchor to ${link.href}`);
    if (genericAnchor.test(link.label.trim())) errors.push(`${source}: generic promotion anchor ${link.label}`);
  }
}
for (const target of [`${STUDY_CLUSTER_BASE}/study`, `${STUDY_CLUSTER_BASE}/revision`, `${STUDY_CLUSTER_BASE}/practice`]) {
  if (inbound.get(target) !== promotionSources.length) errors.push(`${target}: expected ${promotionSources.length} promoted inbound links`);
}

const workerSource = readFileSync(resolve(root, "comparison/after-worker.js"), "utf8");
if (!workerSource.includes("buildQuestionSemanticGraph")) errors.push("Worker does not build question semantic graphs");
if (!workerSource.includes("semanticPromotionResponse")) errors.push("Worker does not render hierarchy promotions");
if (!workerSource.includes("descriptiveQuestionAnchor")) errors.push("Chapter question cards do not use descriptive anchors");

const report = {
  generatedAt: new Date().toISOString(),
  pass: errors.length === 0,
  questionNodeCount: questions.length,
  relationEdgeCount: [...relationCounts.values()].reduce((total, count) => total + count, 0),
  relationCounts: Object.fromEntries(relationCounts),
  uniqueQuestionTargets: graphQuestionLinks.size,
  promotionSourceCount: promotionSources.length,
  promotedInboundCounts: Object.fromEntries(inbound),
  previousYearPolicy: "No PYQ edge is emitted without verified paper-year and source metadata.",
  errors,
};
mkdirSync(resolve(root, "audits/phase-4"), { recursive: true });
writeFileSync(resolve(root, "audits/phase-4/semantic-link-graph-gate.json"), `${JSON.stringify(report, null, 2)}\n`);
database.close();
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
