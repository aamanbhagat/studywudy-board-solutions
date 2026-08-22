#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";

import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { questionPublicEligibility } from "../public-question-eligibility.mjs";
import {
  applyKnownPayloadRepairs,
  isBookQuarantined,
  languageForBookId,
} from "../multilingual-text-quality.mjs";
import { getQuestionUrl, questionRecordFromCatalogRow } from "../question-routes.mjs";
import {
  QUESTION_SHOWCASE_BOARDS,
  QUESTION_SHOWCASE_COUNT,
  QUESTION_SHOWCASE_MAX_COMPRESSED_BYTES,
  QUESTION_SHOWCASE_MAX_JSON_BYTES,
  QUESTION_SHOWCASE_POLICY_VERSION,
  QUESTION_SHOWCASE_PREFERRED_QUESTION_IDS,
  evaluateQuestionShowcaseContent,
  questionHasDiagramEvidence,
  questionHasDuplicateOptions,
  questionHasUnresolvedContent,
  questionRuntimePayloadIsSafe,
  questionShowcaseLanguage,
  validateQuestionShowcase,
} from "../question-showcase.mjs";
import { sourceMappingReleaseEligibility } from "../source-mapping-quality.mjs";
import { evaluateSearchExcerptSource } from "../search-excerpt.mjs";

const root = resolve(import.meta.dirname, "..");
const databasePath = resolve(root, "../data/d1/studywudy-content.sqlite3");
const mediaRoot = resolve(root, "../data/r2/objects");
const outputPath = resolve(root, "question-showcase-manifest.mjs");

function loadPayload(database, bookId) {
  const chunks = database.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index").all(bookId);
  if (!chunks.length) throw new Error(`Missing source payload: ${bookId}`);
  const compressed = Buffer.concat(chunks.map((row) => Buffer.from(row.content_chunk)));
  const json = gunzipSync(compressed);
  const payload = applyKnownPayloadRepairs(bookId, JSON.parse(json));
  return Object.freeze({ payload, compressedBytes: compressed.byteLength, jsonBytes: json.byteLength });
}

function collectMediaReferences(value, output = [], key = "") {
  if (value == null) return output;
  if (Array.isArray(value)) {
    for (const item of value) collectMediaReferences(item, output, key);
    return output;
  }
  if (typeof value === "string") {
    if (["src", "imageUrl", "diagramUrl", "promptMedia", "solutionMedia"].includes(key)) output.push(value);
    return output;
  }
  if (typeof value !== "object") return output;
  for (const [nestedKey, nested] of Object.entries(value)) collectMediaReferences(nested, output, nestedKey);
  return output;
}

function localMediaPath(reference) {
  let pathname;
  try {
    const parsed = new URL(reference, "https://studywudy.invalid");
    if (parsed.origin !== "https://studywudy.invalid") return null;
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  const relative = pathname.startsWith("/boardly-media/")
    ? pathname.slice("/boardly-media/".length)
    : pathname.replace(/^\/+/, "");
  const resolved = resolve(mediaRoot, relative);
  return resolved === mediaRoot || resolved.startsWith(`${mediaRoot}${sep}`) ? resolved : null;
}

function mediaIsBroken(reference) {
  const value = String(reference || "").trim();
  if (!value) return true;
  if (/^data:image\/(?:avif|gif|jpeg|png|svg\+xml|webp)(?:;|,)/iu.test(value)) return false;
  const path = localMediaPath(value);
  return !path || !existsSync(path);
}

function sourceMappingIsVerified({ metadata, bookId, chapter, exercise, question }) {
  if (!metadata || metadata.book_id !== bookId || metadata.chapter_slug !== chapter.slug) return false;
  if (!question.exerciseId || (exercise.id && exercise.id !== question.exerciseId)) return false;
  try {
    return getQuestionUrl(questionRecordFromCatalogRow(metadata)).endsWith(`/questions/${question.id}`);
  } catch {
    return false;
  }
}

function stableTieBreak(candidate) {
  return createHash("sha256")
    .update(`${QUESTION_SHOWCASE_POLICY_VERSION}:${candidate.rowId}:${candidate.questionId}`)
    .digest("hex");
}

function candidateScore(candidate, selected) {
  const seen = (key) => new Set(selected.map((entry) => entry[key]));
  let score = 0;
  if (selected.filter(({ hasDiagram }) => hasDiagram === candidate.hasDiagram).length < 4) score += 1_600;
  if (!seen("language").has(candidate.language)) score += 1_000;
  if (!seen("hasDiagram").has(candidate.hasDiagram)) score += 700;
  if (!seen("gradeSlug").has(candidate.gradeSlug)) score += 520;
  if (!seen("subjectSlug").has(candidate.subjectSlug)) score += 480;
  if (!seen("type").has(candidate.type)) score += 440;
  if (!seen("bookId").has(candidate.bookId)) score += 220;
  if (!seen("chapterSlug").has(candidate.chapterSlug)) score += 80;
  const boardEntries = selected.filter(({ boardSlug }) => boardSlug === candidate.boardSlug);
  if (!boardEntries.some(({ hasDiagram }) => hasDiagram === candidate.hasDiagram)) score += 300;
  if (!boardEntries.some(({ gradeSlug }) => gradeSlug === candidate.gradeSlug)) score += 180;
  if (!boardEntries.some(({ subjectSlug }) => subjectSlug === candidate.subjectSlug)) score += 160;
  if (!boardEntries.some(({ type }) => type === candidate.type)) score += 140;
  return score;
}

function selectShowcase(candidates) {
  const selected = [];
  const selectedRowIds = new Set();
  const byBoard = Map.groupBy(candidates, ({ boardSlug }) => boardSlug);
  const targetPerBoard = QUESTION_SHOWCASE_COUNT / QUESTION_SHOWCASE_BOARDS.length;
  for (const questionId of QUESTION_SHOWCASE_PREFERRED_QUESTION_IDS) {
    const choice = candidates.find((candidate) => candidate.questionId === questionId);
    if (!choice) throw new Error(`Preferred showcase question is missing or ineligible: ${questionId}`);
    if (selectedRowIds.has(choice.rowId)) throw new Error(`Preferred showcase row is duplicated: ${choice.rowId}`);
    if (selected.filter(({ boardSlug }) => boardSlug === choice.boardSlug).length >= targetPerBoard) {
      throw new Error(`Preferred showcase questions exceed the ${choice.boardSlug} allocation`);
    }
    selected.push(choice);
    selectedRowIds.add(choice.rowId);
  }
  while (selected.length < QUESTION_SHOWCASE_COUNT) {
    let added = false;
    for (const board of QUESTION_SHOWCASE_BOARDS) {
      if (selected.length >= QUESTION_SHOWCASE_COUNT) break;
      if (selected.filter(({ boardSlug }) => boardSlug === board).length >= targetPerBoard) continue;
      const available = (byBoard.get(board) || []).filter(({ rowId }) => !selectedRowIds.has(rowId));
      if (!available.length) throw new Error(`No eligible showcase candidate remains for ${board}`);
      available.sort((left, right) => {
        const score = candidateScore(right, selected) - candidateScore(left, selected);
        return score || left.tieBreak.localeCompare(right.tieBreak);
      });
      const choice = available[0];
      selected.push(choice);
      selectedRowIds.add(choice.rowId);
      added = true;
    }
    if (!added) throw new Error("Could not fill the verified question showcase allocation");
  }
  return selected.map(({ tieBreak, ...entry }) => Object.freeze(entry));
}

function createManifestSource(entries) {
  return `// Generated by scripts/build-question-showcase.mjs. Do not edit by hand.\n`
    + `const entries = ${JSON.stringify(entries)};\n`
    + `export const QUESTION_SHOWCASE_ENTRIES = Object.freeze(entries.map((entry) => Object.freeze(entry)));\n`
    + `export const QUESTION_SHOWCASE_SOURCE_GATE = Object.freeze(${JSON.stringify({
      policyVersion: QUESTION_SHOWCASE_POLICY_VERSION,
      answerGatePolicyVersion: PHASE4_GATE_MANIFEST.policyVersion,
      reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
    })});\n`;
}

function buildShowcase() {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const metadataRows = database.prepare(`SELECT q.row_id, q.book_id, q.chapter_slug, q.question_id,
      q.display_label, q.type, q.prompt_text, q.concept_tags,
      b.board_slug, b.grade_slug, b.subject_slug, b.slug AS book_slug,
      c.title AS chapter_title
      FROM catalog_questions q
      JOIN catalog_books b ON b.id = q.book_id
      JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
      ORDER BY q.row_id`).all();
    const metadataByKey = new Map(metadataRows.map((row) => [`${row.book_id}:${row.chapter_slug}:${row.question_id}`, row]));
    const candidates = [];
    const bookIds = database.prepare("SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id").all();
    for (const { book_id: bookId } of bookIds) {
      if (isBookQuarantined(bookId)) continue;
      const loaded = loadPayload(database, bookId);
      const bookPayloadSafe = loaded.compressedBytes <= QUESTION_SHOWCASE_MAX_COMPRESSED_BYTES
        && loaded.jsonBytes <= QUESTION_SHOWCASE_MAX_JSON_BYTES;
      if (!bookPayloadSafe) continue;
      const { payload } = loaded;
      for (const chapter of payload.chapters || []) {
        for (const exercise of chapter.exercises || []) {
          for (const question of exercise.questions || []) {
            const metadata = metadataByKey.get(`${bookId}:${chapter.slug}:${question.id}`);
            const rowId = Number(metadata?.row_id || 0);
            const internalMappingConsistent = sourceMappingIsVerified({ metadata, bookId, chapter, exercise, question });
            const sourceMapping = sourceMappingReleaseEligibility({
              bookId,
              chapterSlug: chapter.slug,
              internalMappingConsistent,
            });
            const unresolvedContent = questionHasUnresolvedContent(question);
            const publishingEligibility = questionPublicEligibility(PHASE4_GATE_MANIFEST, rowId, {
              authoritativeMappingConflict: sourceMapping.knownAuthoritativeMismatch,
              unresolvedContent,
            });
            if (!publishingEligibility.eligible) continue;
            const automatedGatePassed = publishingEligibility.checks.overallPublishingGatePassed;
            const duplicateOptions = questionHasDuplicateOptions(question);
            const mediaReferences = collectMediaReferences(question);
            const brokenMedia = mediaReferences.some(mediaIsBroken);
            if (!sourceMapping.searchEligible || unresolvedContent || duplicateOptions || brokenMedia) continue;
            const runtimePayloadSafe = bookPayloadSafe && questionRuntimePayloadIsSafe(question);
            if (!runtimePayloadSafe) continue;
            const contentQuality = evaluateQuestionShowcaseContent(question, metadata);
            if (!contentQuality.pass) continue;
            const searchExcerptClean = evaluateSearchExcerptSource(metadata.prompt_text).pass;
            if (!searchExcerptClean) continue;
            candidates.push(Object.freeze({
              rowId,
              questionId: question.id,
              bookId,
              chapterSlug: chapter.slug,
              boardSlug: metadata.board_slug,
              gradeSlug: metadata.grade_slug,
              subjectSlug: metadata.subject_slug,
              type: question.type,
              language: questionShowcaseLanguage(question, bookId, languageForBookId(bookId)),
              hasDiagram: questionHasDiagramEvidence(question, metadata),
              internalMappingConsistent,
              authoritativeTextbookMappingVerified: sourceMapping.authoritative.authoritativeTextbookMappingVerified,
              knownAuthoritativeMappingMismatch: sourceMapping.knownAuthoritativeMismatch,
              nativeScriptValidationPassed: contentQuality.nativeScriptValidationPassed,
              searchExcerptClean,
              automatedGatePassed,
              finalPublishingGatePassed: publishingEligibility.eligible,
              unresolvedContent,
              brokenMedia,
              duplicateOptions,
              runtimePayloadSafe,
              contentQualityPassed: true,
              tieBreak: stableTieBreak({ rowId, questionId: question.id }),
            }));
          }
        }
      }
    }
    const entries = selectShowcase(candidates);
    const validation = validateQuestionShowcase(entries);
    if (!validation.pass) throw new Error(`Generated showcase failed: ${validation.failures.join("; ")}`);
    return Object.freeze({ source: createManifestSource(entries), entries, candidates: candidates.length, validation });
  } finally {
    database.close();
  }
}

const mode = process.argv[2];
const result = buildShowcase();
if (mode === "--write") {
  writeFileSync(outputPath, result.source);
  console.log(`Wrote ${outputPath} with ${result.entries.length} entries from ${result.candidates} quality-screened candidates`);
} else if (mode === "--check") {
  if (readFileSync(outputPath, "utf8") !== result.source) {
    throw new Error("question-showcase-manifest.mjs is stale; run pnpm build:question-showcase");
  }
  console.log(`PASS: ${result.entries.length} quality-screened showcase questions; ${JSON.stringify(result.validation.diversity)}`);
} else {
  throw new Error("Usage: node scripts/build-question-showcase.mjs --write|--check");
}
