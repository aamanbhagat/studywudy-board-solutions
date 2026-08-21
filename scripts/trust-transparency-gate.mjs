#!/usr/bin/env node

import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";

import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { handlePhase5Request } from "../phase5-compliance.mjs";
import {
  buildQuestionPageExperience,
  findQuestionPageContext,
  renderQuestionPageExperience,
} from "../question-page-experience.mjs";
import {
  MANUAL_REVIEWER_PROFILES,
  QUESTION_CORRECTIONS,
  QUESTION_MANUAL_REVIEWS,
  TRUST_TRANSPARENCY_PATHS,
  validateCorrectionRecord,
  validateManualReview,
  validateReviewerProfile,
} from "../trust-transparency.mjs";

const root = resolve(import.meta.dirname, "..");
const database = new DatabaseSync(resolve(root, "../data/d1/studywudy-content.sqlite3"), { readOnly: true });
const errors = [];
const fail = (message) => errors.push(message);

if (MANUAL_REVIEWER_PROFILES.some((profile) => !validateReviewerProfile(profile))) fail("Reviewer registry contains an invalid profile");
if (QUESTION_MANUAL_REVIEWS.some((review) => !validateManualReview(review))) fail("Manual-review registry contains an unverified review");
if (QUESTION_CORRECTIONS.some((correction) => !validateCorrectionRecord(correction))) fail("Corrections ledger contains an invalid record");

const bookId = "maharashtra-board::class-12::physics::balbharati-physics-standard-12";
const chunks = database.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index").all(bookId);
const payload = JSON.parse(gunzipSync(Buffer.concat(chunks.map((row) => Buffer.from(row.content_chunk)))));
const route = {
  board: "maharashtra-board",
  grade: "class-12",
  subject: "physics",
  book: "balbharati-physics-standard-12",
  chapter: "electrostatics",
  question: "q-msb-balbharati-physics-standard-12-8-001",
};
const catalogStatement = database.prepare(`SELECT q.row_id, q.book_id, q.display_label, q.type,
  b.title AS book_title, bo.name AS board_name, bo.short_name AS board_short_name,
  g.label AS grade_label, g.class_number, s.name AS subject_name,
  c.number AS chapter_number, c.title AS chapter_title, c.book_pages
  FROM catalog_questions q
  JOIN catalog_books b ON b.id = q.book_id
  JOIN catalog_boards bo ON bo.slug = b.board_slug
  JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
  JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug AND s.slug = b.subject_slug
  JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
  WHERE q.book_id = ? AND q.chapter_slug = ? AND q.question_id = ?`);
const catalog = catalogStatement.get(bookId, route.chapter, route.question);
const context = findQuestionPageContext(payload, route.chapter, route.question);
const model = buildQuestionPageExperience({
  payload,
  context,
  route,
  catalog,
  reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
});
const markup = renderQuestionPageExperience(model);
if (!model?.ready || !markup) fail("Question trust experience did not build from the production source record");
if (!model?.trust?.sourceMappingVerified) fail("Production sample lacks verified source mapping");
if (model?.trust?.manualReview) fail("Production sample claims a manual review without registry evidence");
if (!markup?.trust.includes("Editorial review pending")) fail("Question page does not disclose pending human review");
if (!markup?.trust.includes("Report an academic error")) fail("Question page lacks the academic-error action");
if (!markup?.trust.includes("Not recorded in source data")) fail("Question page does not disclose missing edition, year or page metadata");
if (markup?.trust.includes("StudyWudy Editorial Team") || markup?.trust.includes("Reviewed by")) fail("Question page contains an unsupported reviewer credit");

const numericalRoute = { ...route, question: "q-msb-balbharati-physics-standard-12-8-006" };
const numericalCatalog = catalogStatement.get(bookId, numericalRoute.chapter, numericalRoute.question);
const numericalContext = findQuestionPageContext(payload, numericalRoute.chapter, numericalRoute.question);
const numericalModel = buildQuestionPageExperience({
  payload,
  context: numericalContext,
  route: numericalRoute,
  catalog: numericalCatalog,
  reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
});
const numericalMarkup = renderQuestionPageExperience(numericalModel);
if (!numericalModel?.trust?.automatedArithmeticChecksPassed) fail("Production numerical sample does not pass its arithmetic evidence check");
if (!numericalMarkup?.trust.includes("Automated arithmetic checks passed")) fail("Production numerical page lacks its precise automated arithmetic label");

const pageChecks = [];
for (const pathname of TRUST_TRANSPARENCY_PATHS) {
  const response = await handlePhase5Request(new Request(`https://studywudy.example${pathname}`), {});
  const html = await response.text();
  pageChecks.push({ pathname, status: response.status, bytes: html.length });
  if (response.status !== 200) fail(`${pathname} did not return 200`);
  if (!html.includes(`rel="canonical" href="https://studywudy.example${pathname}"`)) fail(`${pathname} lacks a self-canonical URL`);
  if (!html.includes('aria-label="Breadcrumb"')) fail(`${pathname} lacks crawlable breadcrumbs`);
}

const reviewersHtml = await (await handlePhase5Request(new Request("https://studywudy.example/reviewers"), {})).text();
const correctionsHtml = await (await handlePhase5Request(new Request("https://studywudy.example/corrections"), {})).text();
if (!reviewersHtml.includes("0</strong><span>verified named academic reviewer profiles")) fail("Reviewer registry does not show the honest zero-reviewer state");
if (!reviewersHtml.includes("Question pages therefore do not show a “Reviewed by” claim")) fail("Reviewer registry does not explain its fail-closed label");
if (!correctionsHtml.includes("No dated academic answer corrections recorded")) fail("Corrections ledger does not show its honest empty state");

for (const relative of ["question-page-experience.mjs", "chapter-page-experience.mjs", "study-cluster.mjs", "comparison/after-worker.js"]) {
  const source = readFileSync(resolve(root, relative), "utf8");
  if (source.includes('reviewer: "StudyWudy Editorial Team"')) fail(`${relative} still assigns a generic team as reviewer`);
  if (source.includes("Last publishing review:")) fail(`${relative} still labels an automated date as a review date`);
}

database.close();
const report = {
  generatedAt: new Date().toISOString(),
  policyVersion: "question-trust-v1",
  registries: {
    reviewerProfiles: MANUAL_REVIEWER_PROFILES.length,
    manualQuestionReviews: QUESTION_MANUAL_REVIEWS.length,
    answerCorrections: QUESTION_CORRECTIONS.length,
  },
  productionQuestionSample: {
    questionId: route.question,
    sourceMappingVerified: model?.trust?.sourceMappingVerified || false,
    automatedAnswerGatePassed: model?.trust?.automatedAnswerGatePassed || false,
    manualReviewStatus: model?.trust?.manualReview ? "reviewed" : "pending",
    textbookEdition: model?.trust?.edition || null,
    academicYear: model?.trust?.academicYear || null,
    sourcePages: model?.trust?.sourcePages || null,
  },
  productionNumericalSample: {
    questionId: numericalRoute.question,
    automatedArithmeticChecksPassed: numericalModel?.trust?.automatedArithmeticChecksPassed || false,
    manualReviewStatus: numericalModel?.trust?.manualReview ? "reviewed" : "pending",
  },
  transparencyPages: pageChecks,
  errors,
  pass: errors.length === 0,
};
writeFileSync(resolve(root, "audits/phase-4/trust-transparency-gate.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
