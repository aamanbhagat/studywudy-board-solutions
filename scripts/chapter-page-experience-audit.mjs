#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

import { buildChapterPageExperience } from "../chapter-page-experience.mjs";
import { validateFormulaRepresentations } from "../semantic-math.mjs";

const root = resolve(import.meta.dirname, "..");
const sourcePath = resolve(root, process.argv[2] || "../data/d1/studywudy-content.sqlite3");
const outputPath = resolve(root, process.argv[3] || "audits/phase-4/chapter-page-experience-audit.json");
const reviewedAt = Math.floor(Date.now() / 1_000);

function flattenQuestions(question) {
  if (!question || typeof question !== "object") return [];
  return [question, ...(question.subQuestions || []).flatMap(flattenQuestions)];
}

function questionsFor(chapter) {
  return (chapter.exercises || []).flatMap((exercise) =>
    (exercise.questions || []).flatMap(flattenQuestions)
  ).filter((question) => question.id);
}

const database = new DatabaseSync(sourcePath, { readOnly: true });
const books = database.prepare("SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id").all();
const failures = [];
const stats = {
  bookCount: books.length,
  chapterCount: 0,
  readyChapterCount: 0,
  formulaChapterCount: 0,
  formulaCount: 0,
  formulaQuestionLinkCount: 0,
  groupQuestionLinkCount: 0,
};

for (const { book_id: bookId } of books) {
  const [boardSlug, gradeSlug, subjectSlug, textbookSlug] = bookId.split("::");
  const classNumber = Number(String(gradeSlug).replace(/^class-/u, ""));
  const chunks = database.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index").all(bookId);
  const payload = JSON.parse(gunzipSync(Buffer.concat(chunks.map((row) => Buffer.from(row.content_chunk)))).toString("utf8"));
  for (const chapter of payload.chapters || []) {
    const sourceQuestions = questionsFor(chapter);
    if (!sourceQuestions.length) continue;
    stats.chapterCount += 1;
    const route = { boardSlug, classNumber, subjectSlug, textbookSlug, chapterSlug: chapter.slug };
    const model = buildChapterPageExperience({
      payload,
      chapter,
      route,
      catalog: {
        board_name: boardSlug,
        grade_label: gradeSlug,
        subject_name: subjectSlug,
        book_title: payload.catalog?.book?.title || textbookSlug,
        chapter_number: chapter.number,
        chapter_title: chapter.title,
      },
      reviewedAt,
    });
    const groupedIds = new Set((model?.groups || []).flatMap((group) => group.questions.map((question) => question.id)));
    const missingQuestionIds = sourceQuestions.map((question) => question.id).filter((id) => !groupedIds.has(id));
    const invalidFormulas = (model?.formulas || []).filter((formula) => !validateFormulaRepresentations(formula).complete);
    const invalidLinks = [
      ...(model?.formulas || []).flatMap((formula) => formula.uses),
      ...(model?.groups || []).flatMap((group) => group.questions),
    ].filter((question) => !question.href.endsWith(`/questions/${question.id}`));
    const ready = Boolean(
      model?.ready
      && model.overview.length
      && model.groups.length
      && model.directory.length === (payload.chapters || []).length
      && missingQuestionIds.length === 0
      && invalidFormulas.length === 0
      && invalidLinks.length === 0
    );
    if (ready) stats.readyChapterCount += 1;
    else if (failures.length < 50) failures.push({ bookId, chapterSlug: chapter.slug, missingQuestionIds, invalidFormulaCount: invalidFormulas.length, invalidLinkCount: invalidLinks.length });
    if (model?.formulas.length) stats.formulaChapterCount += 1;
    stats.formulaCount += model?.formulas.length || 0;
    stats.formulaQuestionLinkCount += (model?.formulas || []).reduce((total, formula) => total + formula.uses.length, 0);
    stats.groupQuestionLinkCount += (model?.groups || []).reduce((total, group) => total + group.questions.length, 0);
  }
}
database.close();

const report = {
  generatedAt: new Date(reviewedAt * 1_000).toISOString(),
  sourceDatabase: sourcePath,
  ...stats,
  failureCount: stats.chapterCount - stats.readyChapterCount,
  failures,
  pass: stats.chapterCount > 0 && stats.readyChapterCount === stats.chapterCount,
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
