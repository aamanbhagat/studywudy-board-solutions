#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";

import {
  CORPUS_QUALITY_CHAPTER_FINDINGS,
  CORPUS_QUALITY_CLASSIFICATIONS,
  CORPUS_QUALITY_FINDINGS,
  CORPUS_QUALITY_POLICY_VERSION,
  corpusQuestionIndexEligible,
} from "../corpus-quality.mjs";
import { questionHasDuplicateOptions } from "../question-showcase.mjs";
import { isQuestionRowIndexable } from "../answer-completeness.mjs";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";

const root = resolve(import.meta.dirname, "..");
const databasePath = resolve(root, "../data/d1/studywudy-content.sqlite3");
const auditPath = resolve(root, "audits/phase-4/corpus-quality-sweep.json");
const manifestPath = resolve(root, "corpus-quality-manifest.mjs");

const REQUESTED_PATTERNS = Object.freeze([
  Object.freeze({ id: "Gausss", expression: /Gausss/gu }),
  Object.freeze({ id: "Quadatric", expression: /Quadatric/gu }),
  Object.freeze({ id: "elecric", expression: /elecric/gu }),
  Object.freeze({ id: "positvely", expression: /positvely/gu }),
  Object.freeze({ id: "charge carries", expression: /charge carries/gu }),
  Object.freeze({ id: "rfrom", expression: /rfrom/gu }),
  Object.freeze({ id: "bye the", expression: /bye the/gu }),
  Object.freeze({ id: "ρρ", expression: /ρρ/gu }),
  Object.freeze({ id: "I mm", expression: /\bI mm\b/gu }),
  Object.freeze({ id: "4_{0}", expression: /4_\{0\}/gu }),
  Object.freeze({ id: "k_{0}", expression: /k_\{0\}/gu }),
  Object.freeze({ id: "<br>", expression: /<br\s*\/?>/giu, markup: true }),
  Object.freeze({ id: "**", expression: /\*\*/gu, markup: true }),
  Object.freeze({ id: "$$", expression: /\$\$/gu, markup: true }),
]);

const EXPECTED_QUESTION_FINDING_BY_PATTERN = Object.freeze({
  elecric: new Set(["q-cbse-ncert-exemplar-physics-exemplar-class-12-1-017"]),
  positvely: new Set(["q-cbse-ncert-exemplar-chemistry-exemplar-class-12-1-042"]),
  "charge carries": new Set([
    "q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-45-013",
    "q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-45-028",
  ]),
  rfrom: new Set([
    "q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-29-031",
    "q-cisce-frank-mathematics-part-2-class-10-6-042",
  ]),
  "bye the": new Set(["q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-6-052"]),
  "I mm": new Set(["q-msb-balbharati-physics-standard-12-8-005"]),
  "ρρ": new Set(["q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-30-039"]),
});

const LEGITIMATE_K_ZERO_QUESTION = "q-cbse-ncert-exemplar-physics-exemplar-class-12-10-022";

function loadPayload(database, bookId) {
  const rows = database.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index").all(bookId);
  if (!rows.length) return null;
  return JSON.parse(gunzipSync(Buffer.concat(rows.map((row) => Buffer.from(row.content_chunk)))));
}

function nestedQuestions(question) {
  if (!question || typeof question !== "object") return [];
  return [question, ...(question.subQuestions || []).flatMap(nestedQuestions)];
}

function countMatches(value, expression) {
  return [...String(value ?? "").matchAll(expression)].length;
}

function scanValue(value, location, counts, occurrences) {
  if (value == null) return;
  if (typeof value === "string") {
    for (const pattern of REQUESTED_PATTERNS) {
      const count = countMatches(value, pattern.expression);
      if (!count) continue;
      counts[pattern.id] += count;
      if (!pattern.markup && occurrences.length < 2_000) {
        occurrences.push(Object.freeze({ pattern: pattern.id, count, ...location }));
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanValue(entry, { ...location, field: `${location.field || "root"}[${index}]` }, counts, occurrences));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    scanValue(entry, { ...location, field: location.field ? `${location.field}.${key}` : key }, counts, occurrences);
  }
}

function findingClassification(questionId) {
  return CORPUS_QUALITY_FINDINGS[questionId]?.classification || null;
}

function auditCorpus() {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const metadataRows = database.prepare("SELECT row_id, book_id, chapter_slug, question_id, prompt_text, concept_tags FROM catalog_questions ORDER BY row_id").all();
    const metadataByKey = new Map(metadataRows.map((row) => [`${row.book_id}:${row.chapter_slug}:${row.question_id}`, row]));
    const counts = Object.fromEntries(REQUESTED_PATTERNS.map(({ id }) => [id, 0]));
    const occurrences = [];
    const duplicateRows = [];
    const mappedQuestionIds = new Set();
    const bookIds = database.prepare("SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id").all();

    for (const { book_id: bookId } of bookIds) {
      const payload = loadPayload(database, bookId);
      for (const chapter of payload?.chapters || []) {
        const chapterKey = `${bookId}::${chapter.slug}`;
        scanValue({ title: chapter.title, summary: chapter.summary, keyConcepts: chapter.keyConcepts }, {
          surface: "imported_chapter",
          bookId,
          chapterSlug: chapter.slug,
          chapterFinding: CORPUS_QUALITY_CHAPTER_FINDINGS[chapterKey]?.classification || null,
        }, counts, occurrences);
        for (const exercise of chapter.exercises || []) {
          for (const rootQuestion of exercise.questions || []) {
            for (const question of nestedQuestions(rootQuestion)) {
              const metadata = metadataByKey.get(`${bookId}:${chapter.slug}:${question.id}`);
              const rowId = Number(metadata?.row_id || 0);
              if (metadata) mappedQuestionIds.add(question.id);
              if (rowId && questionHasDuplicateOptions(question)) {
                duplicateRows.push(Object.freeze({ rowId, questionId: question.id, bookId, chapterSlug: chapter.slug }));
              }
              const { subQuestions: _nestedQuestions, ...questionFields } = question;
              scanValue(questionFields, {
                surface: "imported_question",
                rowId,
                questionId: question.id,
                bookId,
                chapterSlug: chapter.slug,
                chapterFinding: CORPUS_QUALITY_CHAPTER_FINDINGS[chapterKey]?.classification || null,
                classification: findingClassification(question.id),
              }, counts, occurrences);
            }
          }
        }
      }
    }

    for (const row of metadataRows) {
      scanValue({ promptText: row.prompt_text, conceptTags: row.concept_tags }, {
        surface: "catalog_question",
        rowId: Number(row.row_id),
        questionId: row.question_id,
        bookId: row.book_id,
        chapterSlug: row.chapter_slug,
        classification: findingClassification(row.question_id),
      }, counts, occurrences);
    }
    const chapterRows = database.prepare("SELECT book_id, slug, title, summary, key_concepts FROM catalog_chapters ORDER BY book_id, slug").all();
    for (const row of chapterRows) {
      const chapterKey = `${row.book_id}::${row.slug}`;
      scanValue(row, {
        surface: "catalog_chapter",
        bookId: row.book_id,
        chapterSlug: row.slug,
        chapterFinding: CORPUS_QUALITY_CHAPTER_FINDINGS[chapterKey]?.classification || null,
      }, counts, occurrences);
    }

    const failures = [];
    for (const [pattern, allowedQuestionIds] of Object.entries(EXPECTED_QUESTION_FINDING_BY_PATTERN)) {
      const unexpected = occurrences.filter((entry) => entry.pattern === pattern
        && entry.questionId
        && !allowedQuestionIds.has(entry.questionId));
      if (unexpected.length) failures.push(`${pattern}: ${unexpected.length} unclassified question occurrences ${JSON.stringify(unexpected.slice(0, 4))}`);
    }
    const unclassifiedQuadatric = occurrences.filter((entry) => entry.pattern === "Quadatric" && entry.chapterFinding !== "metadata typo");
    if (unclassifiedQuadatric.length) failures.push(`Quadatric: ${unclassifiedQuadatric.length} occurrences lack metadata-typo classification ${JSON.stringify(unclassifiedQuadatric.slice(0, 4))}`);
    const unclassifiedGausss = occurrences.filter((entry) => entry.pattern === "Gausss" && entry.chapterFinding !== "metadata typo");
    if (unclassifiedGausss.length) failures.push(`Gausss: ${unclassifiedGausss.length} occurrences lack metadata-typo classification ${JSON.stringify(unclassifiedGausss.slice(0, 4))}`);
    const malformedFourZero = occurrences.filter((entry) => entry.pattern === "4_{0}");
    if (malformedFourZero.length) failures.push(`4_{0}: ${malformedFourZero.length} unresolved stored occurrences`);
    const nonWaveVectorKZero = occurrences.filter((entry) => entry.pattern === "k_{0}" && entry.questionId !== LEGITIMATE_K_ZERO_QUESTION);
    if (nonWaveVectorKZero.length) failures.push(`k_{0}: ${nonWaveVectorKZero.length} unexpected occurrences outside reviewed wave-vector notation`);
    for (const [questionId, finding] of Object.entries(CORPUS_QUALITY_FINDINGS)) {
      if (!mappedQuestionIds.has(questionId)) failures.push(`${questionId}: reviewed finding is not mapped to an imported question`);
      if (!CORPUS_QUALITY_CLASSIFICATIONS.includes(finding.classification)) failures.push(`${questionId}: invalid classification`);
    }
    for (const [chapterKey, finding] of Object.entries(CORPUS_QUALITY_CHAPTER_FINDINGS)) {
      if (!chapterRows.some((row) => `${row.book_id}::${row.slug}` === chapterKey)) failures.push(`${chapterKey}: reviewed chapter finding is stale`);
      if (!CORPUS_QUALITY_CLASSIFICATIONS.includes(finding.classification)) failures.push(`${chapterKey}: invalid classification`);
    }

    const duplicateRowIds = [...new Set(duplicateRows.map(({ rowId }) => rowId))].sort((left, right) => left - right);
    // The publishing manifest says a row may be indexed; corpus quality can still
    // veto it, and the Worker applies both before emitting `index, follow`
    // (comparison/after-worker.js:1799-1812). Counting the overlap here is what
    // lets the sitemap builder, the sitemap gate header and the runtime audits
    // agree on how many URLs are actually submittable without each re-deriving it.
    const runtimeDuplicateRowIds = duplicateRowIds.filter((rowId) => isQuestionRowIndexable(PHASE4_GATE_MANIFEST, rowId));
    const sitemapExcludedIndexableRowIds = metadataRows
      .map((row) => ({ rowId: Number(row.row_id), questionId: row.question_id }))
      .filter(({ rowId }) => isQuestionRowIndexable(PHASE4_GATE_MANIFEST, rowId))
      .filter(({ rowId, questionId }) => !corpusQuestionIndexEligible({ questionId, rowId, duplicateRowIds: runtimeDuplicateRowIds }))
      .map(({ rowId }) => rowId);
    const digest = createHash("sha256").update(JSON.stringify({ counts, duplicateRowIds, occurrences })).digest("hex");
    const report = Object.freeze({
      policyVersion: CORPUS_QUALITY_POLICY_VERSION,
      pass: failures.length === 0,
      failures,
      scope: Object.freeze({
        catalogQuestions: metadataRows.length,
        importedBooks: bookIds.length,
        duplicateChoiceQuestions: duplicateRowIds.length,
      }),
      requestedPatternCounts: counts,
      sourceMarkupClassification: Object.freeze({
        classification: "verified source wording",
        note: "<br>, ** and $$ are supported import syntax. They are prohibited in crawler-visible atomic, chapter and search excerpts by the rendered-surface gate.",
      }),
      reviewedFindings: Object.freeze({
        questions: CORPUS_QUALITY_FINDINGS,
        chapters: CORPUS_QUALITY_CHAPTER_FINDINGS,
        duplicateChoices: Object.freeze({ classification: "OCR/import corruption", count: duplicateRowIds.length, disposition: "retained for source review; excluded from search, snippets and indexing" }),
        kZero: Object.freeze({ classification: "verified source wording", questionId: LEGITIMATE_K_ZERO_QUESTION, note: "k₀ is legitimate free-space wave-number notation in this wave-optics solution." }),
      }),
      digest,
    });
    return Object.freeze({ report, duplicateRowIds, duplicateRows, runtimeDuplicateRowIds, sitemapExcludedIndexableRowIds });
  } finally {
    database.close();
  }
}

function manifestSource(result) {
  const { runtimeDuplicateRowIds, sitemapExcludedIndexableRowIds } = result;
  const metadata = {
    policyVersion: CORPUS_QUALITY_POLICY_VERSION,
    duplicateChoiceCount: result.duplicateRowIds.length,
    runtimeDuplicateChoiceCount: runtimeDuplicateRowIds.length,
    // Pinned against the publishing manifest this was built from, so a phase-4
    // regeneration that is not followed by a corpus-quality rebuild fails
    // `check:corpus-quality` instead of silently shipping a stale URL count.
    publishManifestPolicyVersion: PHASE4_GATE_MANIFEST.policyVersion,
    publishManifestIndexableCount: Number(PHASE4_GATE_MANIFEST.indexableCount),
    sitemapExcludedIndexableCount: sitemapExcludedIndexableRowIds.length,
    sitemapIndexableCount: Number(PHASE4_GATE_MANIFEST.indexableCount) - sitemapExcludedIndexableRowIds.length,
    digest: result.report.digest,
  };
  return `// Generated by scripts/corpus-quality-gate.mjs. Do not edit by hand.\n`
    + `const duplicateChoiceRowIds = ${JSON.stringify(runtimeDuplicateRowIds)};\n`
    + `export const CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS = Object.freeze(duplicateChoiceRowIds);\n`
    + `export const CORPUS_QUALITY_MANIFEST = Object.freeze(${JSON.stringify(metadata)});\n`;
}

const mode = process.argv[2];
const result = auditCorpus();
if (!result.report.pass) throw new Error(`Corpus quality gate failed: ${result.report.failures.join("; ")}`);
const auditSource = `${JSON.stringify(result.report, null, 2)}\n`;
const generatedManifest = manifestSource(result);
if (mode === "--write") {
  mkdirSync(dirname(auditPath), { recursive: true });
  writeFileSync(auditPath, auditSource);
  writeFileSync(manifestPath, generatedManifest);
  console.log(`Wrote corpus quality audit and ${result.duplicateRowIds.length} duplicate-choice row quarantines`);
} else if (mode === "--check") {
  if (readFileSync(auditPath, "utf8") !== auditSource) throw new Error("Corpus quality audit is stale; run pnpm build:corpus-quality");
  if (readFileSync(manifestPath, "utf8") !== generatedManifest) throw new Error("Corpus quality manifest is stale; run pnpm build:corpus-quality");
  console.log(`PASS: ${result.report.scope.catalogQuestions} questions; ${result.duplicateRowIds.length} duplicate-choice rows classified and quarantined`);
} else {
  throw new Error("Usage: node scripts/corpus-quality-gate.mjs --write|--check");
}
