#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import {
  QUESTION_PROMPT_OVERRIDES,
  questionDescription,
  questionDocumentTitle,
} from "../question-seo.mjs";
import { contentToText } from "../answer-completeness.mjs";
import { ACCOUNTANCY_SAMPLE_TITLE } from "../public-title-quality.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(argument, next);
    index += 1;
  } else args.set(argument, true);
}

const root = resolve(import.meta.dirname, "..");
const sourcePath = resolve(root, args.get("--source-db") || "cloudflare-backup-2026-08-17/d1/studywudy-content.sqlite3");
const manifestPath = resolve(root, args.get("--manifest-output") || "phase3-question-seo-manifest.mjs");
const outputPath = resolve(root, args.get("--output") || "audits/phase-3/question-seo-full-corpus.json");
const database = new DatabaseSync(sourcePath, { readOnly: true });
const rows = database.prepare(`SELECT q.row_id, q.display_label, q.type, q.prompt_text, q.question_id,
  q.concept_tags, b.title AS book_title, b.board_slug, b.grade_slug, b.subject_slug,
  bo.name AS board_name, bo.short_name AS board_short_name,
  g.class_number, g.label AS grade_label, s.name AS subject_name,
  c.number AS chapter_number, c.title AS chapter_title
  FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id
  JOIN catalog_boards bo ON bo.slug = b.board_slug
  JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
  JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
    AND s.slug = b.subject_slug
  JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
  ORDER BY q.row_id`).all();

// `catalog_questions.prompt_text` is a flattened copy of the prompt written
// before the content repair and never rewritten by it, so it disagrees with the
// chunk on roughly 20,000 rows. The Worker reconciles the two before it builds a
// title (comparison/after-worker.js, standaloneQuestionResponse), so a
// collision set computed from the column alone describes text that never ships:
// it both disambiguates pages that are already unique and misses pages that
// collide only after the repair. Reconcile here the same way.
const chunksForBook = database.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index");
let reconciledPromptCount = 0;
{
  const repairedPromptText = new Map();
  for (const { book_id: bookId } of database.prepare("SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id").all()) {
    let pack;
    try {
      pack = JSON.parse(gunzipSync(Buffer.concat(chunksForBook.all(bookId).map((chunk) => Buffer.from(chunk.content_chunk)))).toString("utf8"));
    } catch (error) {
      throw new Error(`Unable to decode catalog_book_chunks for ${bookId}: ${error}`);
    }
    for (const chapter of pack.chapters || [])
      for (const exercise of chapter.exercises || [])
        for (const question of exercise.questions || []) {
          const text = contentToText(question.prompt);
          if (text.trim()) repairedPromptText.set(question.id, text);
        }
  }
  for (const row of rows) {
    const repaired = repairedPromptText.get(row.question_id);
    if (!repaired || repaired === row.prompt_text) continue;
    row.prompt_text = repaired;
    reconciledPromptCount += 1;
  }
}

function normalizeSimilarity(value) {
  return value.normalize("NFKC").toLocaleLowerCase("en-IN").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function collisionRows(generator, normalizer = (value) => value) {
  const firstRowByValue = new Map();
  const collisions = new Set();
  for (const row of rows) {
    const value = normalizer(generator(row, false));
    const first = firstRowByValue.get(value);
    if (first == null) firstRowByValue.set(value, Number(row.row_id));
    else {
      collisions.add(first);
      collisions.add(Number(row.row_id));
    }
  }
  return collisions;
}

const titleCollisionRows = collisionRows(questionDocumentTitle);
const descriptionCollisionRows = collisionRows(questionDescription);
const normalizedTitleCollisionRows = collisionRows(questionDocumentTitle, normalizeSimilarity);
const normalizedDescriptionCollisionRows = collisionRows(questionDescription, normalizeSimilarity);
const disambiguatedRows = new Set([
  ...titleCollisionRows,
  ...descriptionCollisionRows,
  ...normalizedTitleCollisionRows,
  ...normalizedDescriptionCollisionRows,
]);
const finalTitles = new Set();
const finalDescriptions = new Set();
const finalNormalizedTitles = new Set();
const finalNormalizedDescriptions = new Set();
let minimumTitleLength = Infinity;
let maximumTitleLength = 0;
let minimumDescriptionLength = Infinity;
let maximumDescriptionLength = 0;
const metadataArtifacts = {
  titleRawMathDelimiter: 0,
  titleLatexBackslash: 0,
  titleTablePipe: 0,
  titleLatexBrace: 0,
  descriptionRawMathDelimiter: 0,
  descriptionLatexBackslash: 0,
  descriptionTablePipe: 0,
  descriptionLatexBrace: 0,
};
const publicTitleQuality = {
  privateRowIdDisambiguators: 0,
  catalogueReferences: 0,
  lowercaseTitleOpenings: 0,
  overlongTitles: 0,
  accountancySampleMatches: false,
};

for (const row of rows) {
  const disambiguate = disambiguatedRows.has(Number(row.row_id));
  const title = questionDocumentTitle(row, disambiguate);
  const description = questionDescription(row, disambiguate);
  const searchTitle = title.replace(/\s+\|\s+StudyWudy$/u, "");
  const artifactTitle = searchTitle.replace(/\s+\|\s+(?=Class\b)/gu, " ");
  if (/\$/u.test(searchTitle)) metadataArtifacts.titleRawMathDelimiter += 1;
  if (/\\/u.test(searchTitle)) metadataArtifacts.titleLatexBackslash += 1;
  if (/\|/u.test(artifactTitle)) metadataArtifacts.titleTablePipe += 1;
  if (/[{}]/u.test(searchTitle)) metadataArtifacts.titleLatexBrace += 1;
  if (/\$/u.test(description)) metadataArtifacts.descriptionRawMathDelimiter += 1;
  if (/\\/u.test(description)) metadataArtifacts.descriptionLatexBackslash += 1;
  if (/\|/u.test(description)) metadataArtifacts.descriptionTablePipe += 1;
  if (/[{}]/u.test(description)) metadataArtifacts.descriptionLatexBrace += 1;
  if (new RegExp(`·\\s*${String(row.row_id)}(?:\\s|\\||$)`, "u").test(title)) publicTitleQuality.privateRowIdDisambiguators += 1;
  if (/\bcatalogue reference\b/iu.test(`${title} ${description}`)) publicTitleQuality.catalogueReferences += 1;
  if (/^[a-z]/u.test(title)) publicTitleQuality.lowercaseTitleOpenings += 1;
  if ([...title].length > 160) publicTitleQuality.overlongTitles += 1;
  if (Number(row.row_id) === 39_148) publicTitleQuality.accountancySampleMatches = title === ACCOUNTANCY_SAMPLE_TITLE;
  if (finalTitles.has(title)) throw new Error(`Duplicate final title remains for row ${row.row_id}`);
  if (finalDescriptions.has(description)) throw new Error(`Duplicate final description remains for row ${row.row_id}`);
  const normalizedTitle = normalizeSimilarity(title);
  const normalizedDescription = normalizeSimilarity(description);
  if (finalNormalizedTitles.has(normalizedTitle)) throw new Error(`Similar final title remains for row ${row.row_id}`);
  if (finalNormalizedDescriptions.has(normalizedDescription)) throw new Error(`Similar final description remains for row ${row.row_id}`);
  finalTitles.add(title);
  finalDescriptions.add(description);
  finalNormalizedTitles.add(normalizedTitle);
  finalNormalizedDescriptions.add(normalizedDescription);
  minimumTitleLength = Math.min(minimumTitleLength, [...title].length);
  maximumTitleLength = Math.max(maximumTitleLength, [...title].length);
  minimumDescriptionLength = Math.min(minimumDescriptionLength, [...description].length);
  maximumDescriptionLength = Math.max(maximumDescriptionLength, [...description].length);
}

for (const questionId of Object.keys(QUESTION_PROMPT_OVERRIDES)) {
  if (!rows.some((row) => row.question_id === questionId)) throw new Error(`SEO override does not match a catalog question: ${questionId}`);
}

const generatedAt = new Date().toISOString();
const manifest = {
  generatedAt,
  corpusCount: rows.length,
  titleCollisionCount: titleCollisionRows.size,
  descriptionCollisionCount: descriptionCollisionRows.size,
  normalizedTitleCollisionCount: normalizedTitleCollisionRows.size,
  normalizedDescriptionCollisionCount: normalizedDescriptionCollisionRows.size,
  disambiguatedCount: disambiguatedRows.size,
  disambiguatedRowIds: [...disambiguatedRows].sort((left, right) => left - right),
};
const report = {
  generatedAt,
  sourceDatabase: sourcePath,
  corpusCount: rows.length,
  reconciledPromptCount,
  promptOverrides: Object.keys(QUESTION_PROMPT_OVERRIDES).length,
  initialTitleCollisionRows: titleCollisionRows.size,
  initialDescriptionCollisionRows: descriptionCollisionRows.size,
  initialNormalizedTitleCollisionRows: normalizedTitleCollisionRows.size,
  initialNormalizedDescriptionCollisionRows: normalizedDescriptionCollisionRows.size,
  finalDuplicateTitleGroups: rows.length - finalTitles.size,
  finalDuplicateDescriptionGroups: rows.length - finalDescriptions.size,
  finalSimilarTitleGroups: rows.length - finalNormalizedTitles.size,
  finalSimilarDescriptionGroups: rows.length - finalNormalizedDescriptions.size,
  titleLength: { minimum: minimumTitleLength, maximum: maximumTitleLength },
  descriptionLength: { minimum: minimumDescriptionLength, maximum: maximumDescriptionLength },
  metadataArtifacts,
  publicTitleQuality,
  pass: finalTitles.size === rows.length
    && finalDescriptions.size === rows.length
    && finalNormalizedTitles.size === rows.length
    && finalNormalizedDescriptions.size === rows.length
    && Object.values(metadataArtifacts).every((count) => count === 0)
    && publicTitleQuality.privateRowIdDisambiguators === 0
    && publicTitleQuality.catalogueReferences === 0
    && publicTitleQuality.lowercaseTitleOpenings === 0
    && publicTitleQuality.overlongTitles === 0
    && publicTitleQuality.accountancySampleMatches,
};

mkdirSync(dirname(manifestPath), { recursive: true });
writeFileSync(manifestPath, `// Generated by scripts/phase3-build-question-seo.mjs. Do not edit by hand.\nexport const PHASE3_QUESTION_SEO = Object.freeze(${JSON.stringify(manifest)});\n`);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
database.close();
