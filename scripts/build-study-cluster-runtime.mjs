#!/usr/bin/env node

import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { academicBreadcrumbItems } from "../breadcrumbs.mjs";
import {
  buildChapterPageExperience,
  findChapterPageContext,
  renderChapterPageExperience,
} from "../chapter-page-experience.mjs";
import { PHASE3_QUESTION_SEO } from "../phase3-question-seo-manifest.mjs";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { isQuestionPubliclyEligible } from "../public-question-eligibility.mjs";
import { chapterQuestions, chapterSearchMetadata } from "../search-metadata.mjs";
import { applyKnownPayloadRepairs } from "../multilingual-text-quality.mjs";
import {
  buildStudyClusterModel,
  matchStudyClusterRoute,
  renderStudyClusterPage,
  STUDY_CLUSTER_BASE,
  STUDY_CLUSTER_INDEXABLE_PATHS,
  STUDY_CLUSTER_PYQ_PATH,
  STUDY_CLUSTER_QBANK_BOOK,
} from "../study-cluster.mjs";

const root = resolve(import.meta.dirname, "..");
const outputPath = resolve(root, "study-cluster-runtime.mjs");
const primaryBookId = "maharashtra-board::class-12::physics::balbharati-physics-standard-12";
const questionBankBookId = `maharashtra-board::class-12::physics::${STUDY_CLUSTER_QBANK_BOOK}`;
const primaryRoute = Object.freeze({
  boardSlug: "maharashtra-board",
  classNumber: 12,
  subjectSlug: "physics",
  textbookSlug: "balbharati-physics-standard-12",
  chapterSlug: "electrostatics",
});

function loadPayload(database, bookId) {
  const rows = database.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index").all(bookId);
  if (!rows.length) throw new Error(`Missing source payload: ${bookId}`);
  const payload = JSON.parse(gunzipSync(Buffer.concat(rows.map((row) => Buffer.from(row.content_chunk)))));
  const repaired = applyKnownPayloadRepairs(bookId, payload);
  const eligibleQuestionIds = new Set(database.prepare(
    "SELECT row_id, question_id FROM catalog_questions WHERE book_id = ?",
  ).all(bookId)
    .filter((row) => isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, Number(row.row_id)))
    .map((row) => row.question_id));
  for (const chapter of repaired.chapters || []) {
    for (const exercise of chapter.exercises || []) {
      exercise.questions = (exercise.questions || []).filter((question) => eligibleQuestionIds.has(question.id));
    }
  }
  return repaired;
}

function runtimeSource() {
  const database = new DatabaseSync(resolve(root, "../data/d1/studywudy-content.sqlite3"), { readOnly: true });
  try {
    const primaryPayload = loadPayload(database, primaryBookId);
    const questionBankPayload = loadPayload(database, questionBankBookId);
    const catalog = database.prepare(`SELECT b.id AS book_id, b.title AS book_title,
      bo.name AS board_name, bo.short_name AS board_short_name,
      g.label AS grade_label, g.class_number, s.name AS subject_name,
      c.number AS chapter_number, c.title AS chapter_title, c.question_count
      FROM catalog_books b
      JOIN catalog_boards bo ON bo.slug = b.board_slug
      JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
      JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
        AND s.slug = b.subject_slug
      JOIN catalog_chapters c ON c.book_id = b.id
      WHERE b.id = ? AND c.slug = 'electrostatics' LIMIT 1`).get(primaryBookId);
    if (!catalog) throw new Error("Electrostatics catalog record is missing");

    const chapter = findChapterPageContext(primaryPayload, primaryRoute.chapterSlug);
    const chapterModel = buildChapterPageExperience({
      payload: primaryPayload,
      chapter,
      route: primaryRoute,
      catalog,
      reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
    });
    const chapterRuntime = {
      pathname: STUDY_CLUSTER_BASE,
      experience: renderChapterPageExperience(chapterModel),
      searchMetadata: chapterSearchMetadata({
        ...catalog,
        board_slug: primaryRoute.boardSlug,
        class_number: primaryRoute.classNumber,
        subject_slug: primaryRoute.subjectSlug,
        // Same shelf mark the Worker stamps on this chapter's question pages, so
        // the prerendered cluster page and the live route agree byte for byte.
        book_code: PHASE3_QUESTION_SEO.bookTitleCodes[primaryBookId],
        chapter,
      }, chapterQuestions(chapter)),
      breadcrumbs: academicBreadcrumbItems({
        ...catalog,
        board_slug: primaryRoute.boardSlug,
        grade_slug: `class-${primaryRoute.classNumber}`,
        subject_slug: primaryRoute.subjectSlug,
        book_slug: primaryRoute.textbookSlug,
        chapter_slug: primaryRoute.chapterSlug,
      }),
    };

    const model = buildStudyClusterModel({
      primaryPayload,
      questionBankPayload,
      catalog,
      reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
    });
    const pages = Object.fromEntries([...STUDY_CLUSTER_INDEXABLE_PATHS, STUDY_CLUSTER_PYQ_PATH].map((pathname) => {
      const page = renderStudyClusterPage(model, matchStudyClusterRoute(pathname));
      if (!page) throw new Error(`Could not render ${pathname}`);
      return [pathname, page];
    }));
    const runtime = { schemaVersion: 1, chapter: chapterRuntime, pages };
    return `// Generated by scripts/build-study-cluster-runtime.mjs. Do not edit by hand.\n`
      + `const runtime = ${JSON.stringify(runtime)};\n`
      + `export const STUDY_CLUSTER_CHAPTER_RUNTIME = Object.freeze(runtime.chapter);\n`
      + `export const STUDY_CLUSTER_RUNTIME_PAGES = Object.freeze(runtime.pages);\n`;
  } finally {
    database.close();
  }
}

const mode = process.argv[2];
const source = runtimeSource();
if (mode === "--write") {
  writeFileSync(outputPath, source);
  console.log(`Wrote ${outputPath} (${Buffer.byteLength(source)} bytes)`);
} else if (mode === "--check") {
  const existing = readFileSync(outputPath, "utf8");
  if (existing !== source) throw new Error("study-cluster-runtime.mjs is stale; run pnpm build:study-cluster-runtime");
  console.log(`PASS: study-cluster-runtime.mjs matches the reviewed source data (${Buffer.byteLength(source)} bytes)`);
} else {
  throw new Error("Usage: node scripts/build-study-cluster-runtime.mjs --write|--check");
}
