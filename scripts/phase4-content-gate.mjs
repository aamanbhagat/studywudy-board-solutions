#!/usr/bin/env node

import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  SUPPORTED_ANSWER_TYPES,
  contentToText,
  encodeFlagBitset,
  encodeIndexabilityBitset,
  equationsAreReadable,
  evaluateAnswerCompleteness,
  lexicalTokens,
  normalizeIntent,
  renderedAnswerText,
  simpleArithmeticIsAccurate,
} from "../answer-completeness.mjs";
import {
  ANSWER_SEMANTIC_QUALITY_POLICY_VERSION,
  evaluatePostGenerationAnswerQuality,
} from "../answer-semantic-quality.mjs";
import { conciseDirectAnswer } from "../question-page-experience.mjs";
import { normalizedQuestionType, questionHasRenderedDiagram } from "../question-classification.mjs";
import { getQuestionUrl, questionRecordFromCatalogRow } from "../question-routes.mjs";
import { evaluateQuestionFormulaAccessibility } from "../semantic-math.mjs";
import {
  POLICY_VERSION as MULTILINGUAL_POLICY_VERSION,
  applyKnownPayloadRepairs,
  isBookQuarantined,
} from "../multilingual-text-quality.mjs";
import { sourceMappingReleaseEligibility } from "../source-mapping-quality.mjs";

const POLICY_VERSION = "phase4-v11-semantic-operator-equivalence";
const QUESTION_PAGE_EXPERIENCE_VERSION = "question-specific-trust-v2";
const SIMILARITY_THRESHOLD = 0.85;
const SIMILARITY_SHINGLE_SIZE = 5;
const SIMILARITY_METRIC = "exact Jaccard over normalized 5-word answer shingles within duplicate-intent groups";
const STATIC_NOINDEX_KEYS = new Set([
  "tamil-nadu-board::class-4::mathematics::samacheer-kalvi-mathematics-term-1-class-4:patterns:q-tn-samacheer-kalvi-mathematics-term-1-class-4-3-001",
  "tamil-nadu-board::class-4::mathematics::samacheer-kalvi-mathematics-term-1-class-4:patterns:q-tn-samacheer-kalvi-mathematics-term-1-class-4-3-002",
  "tamil-nadu-board::class-4::mathematics::samacheer-kalvi-mathematics-term-1-class-4:patterns:q-tn-samacheer-kalvi-mathematics-term-1-class-4-3-005",
  "tamil-nadu-board::class-4::mathematics::samacheer-kalvi-mathematics-term-2-class-4:patterns:q-tn-samacheer-kalvi-mathematics-term-2-class-4-3-011",
  "tamil-nadu-board::class-4::mathematics::samacheer-kalvi-mathematics-term-2-class-4:patterns:q-tn-samacheer-kalvi-mathematics-term-2-class-4-3-012",
  "tamil-nadu-board::class-4::mathematics::samacheer-kalvi-mathematics-term-2-class-4:patterns:q-tn-samacheer-kalvi-mathematics-term-2-class-4-3-015",
  "tamil-nadu-board::class-4::mathematics::samacheer-kalvi-mathematics-term-2-class-4:patterns:q-tn-samacheer-kalvi-mathematics-term-2-class-4-3-016",
  "tamil-nadu-board::class-4::mathematics::samacheer-kalvi-mathematics-term-2-class-4:patterns:q-tn-samacheer-kalvi-mathematics-term-2-class-4-3-017",
  "tamil-nadu-board::class-4::mathematics::samacheer-kalvi-mathematics-term-2-class-4:patterns:q-tn-samacheer-kalvi-mathematics-term-2-class-4-3-018",
]);

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(argument, next);
    index += 1;
  } else {
    args.set(argument, true);
  }
}

const root = resolve(import.meta.dirname, "..");
const sourcePath = resolve(root, args.get("--source-db") || "../data/d1/studywudy-content.sqlite3");
const applyPath = args.get("--apply-to") ? resolve(root, args.get("--apply-to")) : null;
const outputPath = resolve(root, args.get("--output") || "audits/phase-4/content-gate-audit.json");
const manifestPath = args.get("--manifest-output") ? resolve(root, args.get("--manifest-output")) : null;
const reviewedAt = args.get("--reviewed-at") ? Math.floor(Date.parse(args.get("--reviewed-at")) / 1_000) : Math.floor(Date.now() / 1_000);
if (!Number.isFinite(reviewedAt) || reviewedAt <= 0) throw new Error("--reviewed-at must be an ISO date-time");

function shingleSet(answerTokens, promptTokens) {
  const promptSet = new Set(promptTokens);
  const normalized = [];
  for (const token of answerTokens) {
    const next = promptSet.has(token) ? "__prompt__" : token;
    if (next !== "__prompt__" || normalized.at(-1) !== next) normalized.push(next);
  }
  const shingles = new Set();
  if (normalized.length < SIMILARITY_SHINGLE_SIZE) {
    if (normalized.length) shingles.add(normalized.join(" "));
    return shingles;
  }
  for (let index = 0; index <= normalized.length - SIMILARITY_SHINGLE_SIZE; index += 1) {
    shingles.add(normalized.slice(index, index + SIMILARITY_SHINGLE_SIZE).join(" "));
  }
  return shingles;
}

function jaccardSimilarity(left, right) {
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
}

const similaritySelfTest = (() => {
  const firstTokens = Array.from({ length: 30 }, (_, index) => `concept${String.fromCharCode(97 + index)}`);
  const nearDuplicateTokens = [...firstTokens];
  nearDuplicateTokens[nearDuplicateTokens.length - 1] = "replacement";
  const first = shingleSet(firstTokens, []);
  const nearDuplicate = shingleSet(nearDuplicateTokens, []);
  const unrelated = shingleSet(firstTokens.map((token) => `unrelated${token}`), []);
  const nearDuplicateScore = jaccardSimilarity(first, nearDuplicate);
  const unrelatedScore = jaccardSimilarity(first, unrelated);
  if (nearDuplicateScore < SIMILARITY_THRESHOLD || unrelatedScore >= SIMILARITY_THRESHOLD) {
    throw new Error(`Similarity self-test failed: near=${nearDuplicateScore}, unrelated=${unrelatedScore}`);
  }
  return {
    fixture: "short, complete mock answers with and without substantial equivalence",
    nearDuplicateScore: Number(nearDuplicateScore.toFixed(6)),
    unrelatedScore: Number(unrelatedScore.toFixed(6)),
    threshold: SIMILARITY_THRESHOLD,
    pass: true,
  };
})();

function emptyStats(type) {
  return {
    type,
    persistedCount: 0,
    renderedUniqueWordTotal: 0,
    genuineUniqueWordTotal: 0,
    minimumGenuineUniqueWords: null,
    maximumGenuineUniqueWords: null,
    completenessPassedCount: 0,
    gatePassedCount: 0,
    missingChecks: new Map(),
  };
}

function recordMissingChecks(stats, completeness) {
  for (const check of completeness.missing) stats.missingChecks.set(check, (stats.missingChecks.get(check) || 0) + 1);
}

const source = new DatabaseSync(sourcePath, { readOnly: true });
const bookIds = source.prepare("SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id").all();
const metadataRows = source.prepare(`SELECT q.row_id, q.book_id, q.chapter_slug, q.question_id,
  q.updated_at AS question_updated_at, b.board_slug, b.grade_slug, b.subject_slug,
  b.slug AS book_slug, b.updated_at AS book_updated_at, c.updated_at AS chapter_updated_at
  FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id
  JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
  ORDER BY q.row_id`).all();
const metadataByKey = new Map(metadataRows.map((row) => [`${row.book_id}:${row.chapter_slug}:${row.question_id}`, row]));
const stats = new Map(SUPPORTED_ANSWER_TYPES.map((type) => [type, emptyStats(type)]));
const records = [];
const seenKeys = new Set();

for (const { book_id: bookId } of bookIds) {
  const chunks = source.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index").all(bookId);
  const payload = applyKnownPayloadRepairs(
    bookId,
    JSON.parse(gunzipSync(Buffer.concat(chunks.map((row) => Buffer.from(row.content_chunk)))).toString("utf8")),
  );
  const sourceRevisionPass = Boolean(String(payload.sourceChecksum || payload.sourceVersion || "").trim());
  const sourceEditionRecorded = Boolean(String(
    payload.catalog?.book?.edition
      || payload.catalog?.edition
      || payload.textbookEdition
      || payload.sourceEdition
      || "",
  ).trim());
  for (const chapter of payload.chapters || []) {
    for (const exercise of chapter.exercises || []) {
      for (const question of exercise.questions || []) {
        const key = `${bookId}:${chapter.slug}:${question.id}`;
        if (seenKeys.has(key)) throw new Error(`Duplicate question in content chunks: ${key}`);
        seenKeys.add(key);
        const metadata = metadataByKey.get(key);
        const rowId = Number(metadata?.row_id || 0);
        if (!rowId) throw new Error(`Content question is missing catalog metadata: ${key}`);

        const normalizedType = normalizedQuestionType(question);
        const qualityQuestion = normalizedType === question.type ? question : { ...question, type: normalizedType };
        const answerBody = renderedAnswerText(qualityQuestion);
        const answerTokens = lexicalTokens(answerBody);
        const promptText = contentToText(question.prompt);
        const promptTokens = lexicalTokens(`${promptText} ${(question.choices || []).map((choice) => contentToText(choice.content)).join(" ")}`);
        const promptSet = new Set(promptTokens);
        const renderedUniqueWords = new Set(answerTokens).size;
        const genuineUniqueWords = new Set(answerTokens.filter((token) => !promptSet.has(token))).size;
        const completeness = evaluateAnswerCompleteness(qualityQuestion);
        const semanticAnswerQuality = evaluatePostGenerationAnswerQuality(qualityQuestion);
        const recognizedFormat = stats.has(normalizedType);
        const textbookMappingPass = Boolean(
          metadata
          && metadata.book_id === bookId
          && metadata.chapter_slug === chapter.slug
          && question.exerciseId
          && (!exercise.id || exercise.id === question.exerciseId),
        );
        const sourceMapping = sourceMappingReleaseEligibility({
          bookId,
          chapterSlug: chapter.slug,
          internalMappingConsistent: textbookMappingPass,
        });
        let canonicalPath = null;
        let canonicalPass = false;
        try {
          canonicalPath = getQuestionUrl(questionRecordFromCatalogRow(metadata));
          canonicalPass = canonicalPath.endsWith(`/questions/${question.id}`);
        } catch {
          canonicalPass = false;
        }
        const equationPass = equationsAreReadable(question) && simpleArithmeticIsAccurate(question);
        const formulaEvaluation = evaluateQuestionFormulaAccessibility(question, { includeRepresentations: false });
        const formulaAccessibility = {
          complete: formulaEvaluation.complete,
          formulaCount: formulaEvaluation.formulaCount,
          missing: formulaEvaluation.missing,
          failures: formulaEvaluation.failures,
        };
        const formulaAccessibilityPass = formulaAccessibility.complete;
        const equationReviewPending = formulaAccessibility.formulaCount > 0 && (!equationPass || !formulaAccessibilityPass);
        const renderedDiagramAvailable = questionHasRenderedDiagram(qualityQuestion);
        const usefulContextPass = answerTokens.some((token) => !promptSet.has(token));
        const distinctIntentPass = Boolean(normalizeIntent(promptText));
        const directAnswerPass = Boolean(conciseDirectAnswer(qualityQuestion));
        const exactQuestionContextPass = Boolean(
          question.displayLabel != null
          && String(question.displayLabel).trim()
          && exercise.id
          && question.exerciseId === exercise.id
          && chapter.title
          && payload.catalog?.book?.title,
        );
        const questionPageExperiencePass = directAnswerPass && exactQuestionContextPass && sourceRevisionPass;
        const policyExclusion = STATIC_NOINDEX_KEYS.has(key);
        const languageQualityPass = !isBookQuarantined(bookId);
        const eligibleBeforeEquivalence = recognizedFormat
          && completeness.complete
          && semanticAnswerQuality.complete
          && textbookMappingPass
          && sourceMapping.indexEligible
          && canonicalPass
          && equationPass
          && formulaAccessibilityPass
          && usefulContextPass
          && distinctIntentPass
          && questionPageExperiencePass
          && languageQualityPass
          && !policyExclusion;
        const record = {
          key,
          rowId,
          bookId,
          chapterSlug: chapter.slug,
          questionId: question.id,
          type: normalizedType,
          importedType: question.type,
          answerKind: completeness.kind,
          completeness,
          semanticAnswerQuality,
          renderedUniqueWords,
          genuineUniqueWords,
          textbookMappingPass,
          authoritativeTextbookMappingVerified: sourceMapping.authoritative.authoritativeTextbookMappingVerified,
          authoritativeMappingStatus: sourceMapping.authoritative.status,
          authoritativeMappingPass: sourceMapping.indexEligible,
          canonicalPass,
          canonicalPath,
          equationPass,
          formulaAccessibilityPass,
          formulaAccessibility,
          equationReviewPending,
          renderedDiagramAvailable,
          usefulContextPass,
          distinctIntentPass,
          directAnswerPass,
          exactQuestionContextPass,
          sourceRevisionPass,
          sourceEditionRecorded,
          questionPageExperiencePass,
          languageQualityPass,
          sameExerciseNavigationAvailable: (exercise.questions || []).length > 1,
          explicitCommonMistakeAvailable: Boolean(question.commonStudentMistake || question.commonMistake || question.examinerWarning || question.mistakeToAvoid),
          explicitAlternativeMethodAvailable: Boolean(question.alternativeMethod || question.alternativeMethods || question.otherMethod),
          previousYearMetadataAvailable: Boolean(question.previousYear || question.examYear || question.year || question.boardExamYear || question.exam?.year),
          policyExclusion,
          eligibleBeforeEquivalence,
          intentGroup: `${bookId}:${chapter.slug}:${normalizeIntent(promptText)}`,
          shingles: shingleSet(answerTokens, promptTokens),
          maxSimilarity: 0,
          nearestQuestionKey: null,
          equivalentPagePass: true,
          contentHash: createHash("sha256").update(answerBody.normalize("NFKC")).digest("hex"),
        };
        records.push(record);

        if (!recognizedFormat) continue;
        const format = stats.get(normalizedType);
        format.persistedCount += 1;
        format.renderedUniqueWordTotal += renderedUniqueWords;
        format.genuineUniqueWordTotal += genuineUniqueWords;
        format.minimumGenuineUniqueWords = format.minimumGenuineUniqueWords == null ? genuineUniqueWords : Math.min(format.minimumGenuineUniqueWords, genuineUniqueWords);
        format.maximumGenuineUniqueWords = format.maximumGenuineUniqueWords == null ? genuineUniqueWords : Math.max(format.maximumGenuineUniqueWords, genuineUniqueWords);
        if (completeness.complete) format.completenessPassedCount += 1;
        else recordMissingChecks(format, completeness);
      }
    }
  }
}

if (records.length !== metadataRows.length || seenKeys.size !== metadataRows.length) {
  throw new Error(`Corpus mismatch: decoded ${records.length}, catalog has ${metadataRows.length}`);
}

records.sort((left, right) => left.rowId - right.rowId);
const intentGroups = new Map();
for (const record of records.filter((candidate) => candidate.eligibleBeforeEquivalence)) {
  const group = intentGroups.get(record.intentGroup) || [];
  group.push(record);
  intentGroups.set(record.intentGroup, group);
}

let comparedPairCount = 0;
let rejectedPairCount = 0;
for (const group of intentGroups.values()) {
  if (group.length < 2) continue;
  for (let rightIndex = 1; rightIndex < group.length; rightIndex += 1) {
    const right = group[rightIndex];
    for (let leftIndex = 0; leftIndex < rightIndex; leftIndex += 1) {
      const left = group[leftIndex];
      const similarity = jaccardSimilarity(left.shingles, right.shingles);
      comparedPairCount += 1;
      if (similarity > right.maxSimilarity) {
        right.maxSimilarity = similarity;
        right.nearestQuestionKey = left.key;
      }
      if (similarity > left.maxSimilarity) {
        left.maxSimilarity = similarity;
        left.nearestQuestionKey = right.key;
      }
      if (similarity >= SIMILARITY_THRESHOLD) rejectedPairCount += 1;
    }
    right.equivalentPagePass = false;
    right.distinctIntentPass = false;
  }
}

for (const record of records) {
  record.gatePassed = record.eligibleBeforeEquivalence && record.equivalentPagePass;
  const format = stats.get(record.type);
  if (record.gatePassed && format) format.gatePassedCount += 1;
}

const completenessPassedCount = records.filter((record) => record.completeness.complete).length;
const gatePassedCount = records.filter((record) => record.gatePassed).length;
const maximumRowId = records.reduce((maximum, record) => Math.max(maximum, record.rowId), 0);
const catalogEpoch = (value) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number > 1e12 ? Math.floor(number / 1e3) : Math.floor(number);
};
const catalogMaxUpdatedAt = metadataRows.reduce((maximum, metadata) => Math.max(
  maximum,
  catalogEpoch(metadata.book_updated_at),
  catalogEpoch(metadata.chapter_updated_at),
  catalogEpoch(metadata.question_updated_at),
), 0);
const indexabilityBitsetBase64 = encodeIndexabilityBitset(records, maximumRowId);
const equationReviewBitsetBase64 = encodeFlagBitset(records, maximumRowId, "equationReviewPending");
const equationReviewPendingCount = records.filter((record) => record.equationReviewPending).length;
const renderedDiagramBitsetBase64 = encodeFlagBitset(records, maximumRowId, "renderedDiagramAvailable");
const renderedDiagramCount = records.filter((record) => record.renderedDiagramAvailable).length;

if (manifestPath) {
  const manifest = {
    policyVersion: POLICY_VERSION,
    completenessPolicy: "question-type-aware; no minimum word count",
    questionPageExperienceVersion: QUESTION_PAGE_EXPERIENCE_VERSION,
    formulaAccessibilityPolicy: "strict canonical parse plus semantic-token preservation across spoken text, plain text and semantic MathML",
    promptRequirementsPolicy: "draw, working, comparison, reason and derivation instructions must be satisfied by rendered answer structures",
    semanticAnswerQualityPolicy: ANSWER_SEMANTIC_QUALITY_POLICY_VERSION,
    sourceMappingPolicy: "internal mapping consistency is separate from authoritative textbook verification; known mismatches fail closed",
    multilingualTextPolicy: `${MULTILINGUAL_POLICY_VERSION}; unresolved Hindi and Tamil imports are quarantined`,
    similarityThreshold: SIMILARITY_THRESHOLD,
    similarityMetric: SIMILARITY_METRIC,
    reviewedAt,
    corpusCount: records.length,
    completenessPassedCount,
    gatePassedCount,
    indexableCount: gatePassedCount,
    maximumRowId,
    indexabilityBitsetBase64,
    equationReviewPendingCount,
    equationReviewBitsetBase64,
    renderedDiagramCount,
    renderedDiagramBitsetBase64,
    catalogMaxUpdatedAt,
    entries: [],
  };
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `// Generated by scripts/phase4-content-gate.mjs. Do not edit by hand.\nexport const PHASE4_GATE_MANIFEST = Object.freeze(${JSON.stringify(manifest)});\n`);
}

if (applyPath) {
  const target = new DatabaseSync(applyPath);
  target.exec(readFileSync(resolve(root, "migrations/0004_question_type_completeness.sql"), "utf8"));
  const targetCount = Number(target.prepare("SELECT COUNT(*) AS count FROM catalog_questions").get().count);
  if (targetCount !== records.length) throw new Error(`Apply target has ${targetCount} questions; expected ${records.length}`);
  const insert = target.prepare(`INSERT INTO answer_completeness_gate (
    book_id, chapter_slug, question_id, question_type, answer_kind, checks_json,
    completeness_pass, distinct_intent_pass, textbook_mapping_pass, equations_pass,
    useful_context_pass, canonical_pass, equivalent_page_pass, max_similarity,
    nearest_question_key, gate_passed, disposition, content_hash, reviewed_at, policy_version
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  target.exec("BEGIN IMMEDIATE; DELETE FROM answer_completeness_gate_state; DELETE FROM answer_completeness_gate;");
  try {
    for (const record of records) {
      insert.run(
        record.bookId,
        record.chapterSlug,
        record.questionId,
        record.type,
        record.answerKind,
        JSON.stringify({
          answer: record.completeness.checks,
          semanticAnswerQuality: record.semanticAnswerQuality,
          formulaAccessibility: record.formulaAccessibility,
        }),
        record.completeness.complete ? 1 : 0,
        record.distinctIntentPass ? 1 : 0,
        record.textbookMappingPass ? 1 : 0,
        record.equationPass ? 1 : 0,
        record.usefulContextPass ? 1 : 0,
        record.canonicalPass ? 1 : 0,
        record.equivalentPagePass ? 1 : 0,
        Number(record.maxSimilarity.toFixed(6)),
        record.nearestQuestionKey,
        record.gatePassed ? 1 : 0,
        record.gatePassed ? "published" : "review_required",
        record.contentHash,
        reviewedAt,
        POLICY_VERSION,
      );
    }
    target.prepare(`INSERT INTO answer_completeness_gate_state (
      gate_name, policy_version, fail_open, gate_ready, evaluated_at, corpus_count,
      completeness_passed_count, gate_passed_count
    ) VALUES ('question-publish', ?, 0, 1, ?, ?, ?, ?)`)
      .run(POLICY_VERSION, reviewedAt, records.length, completenessPassedCount, gatePassedCount);
    target.exec("COMMIT");
  } catch (error) {
    target.exec("ROLLBACK");
    throw error;
  }
  const applied = target.prepare(`SELECT
    (SELECT COUNT(*) FROM answer_completeness_gate) AS gated_count,
    (SELECT COUNT(*) FROM answer_completeness_gate WHERE gate_passed = 1) AS passed_count,
    (SELECT gate_ready FROM answer_completeness_gate_state WHERE gate_name = 'question-publish') AS gate_ready`).get();
  if (Number(applied.gated_count) !== records.length || Number(applied.passed_count) !== gatePassedCount || Number(applied.gate_ready) !== 1) {
    throw new Error(`Applied gate verification failed: ${JSON.stringify(applied)}`);
  }
  target.close();
}

const formatAudit = SUPPORTED_ANSWER_TYPES.map((type) => {
  const format = stats.get(type);
  const observed = format.persistedCount > 0;
  return {
    type,
    persistedCount: format.persistedCount,
    answerKind: records.find((record) => record.type === type)?.answerKind || null,
    averageRenderedUniqueWords: observed ? Number((format.renderedUniqueWordTotal / format.persistedCount).toFixed(1)) : null,
    averageGenuineUniqueWords: observed ? Number((format.genuineUniqueWordTotal / format.persistedCount).toFixed(1)) : null,
    minimumGenuineUniqueWords: format.minimumGenuineUniqueWords,
    maximumGenuineUniqueWords: format.maximumGenuineUniqueWords,
    completenessPassedCount: format.completenessPassedCount,
    gatePassedCount: format.gatePassedCount,
    mostCommonMissingChecks: [...format.missingChecks]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([check, count]) => ({ check, count })),
    wordCountRole: "diagnostic only; never an indexability threshold",
  };
});

const gateFailureCounts = new Map();
for (const record of records.filter((candidate) => !candidate.gatePassed)) {
  const reasons = [
    ...record.completeness.missing.map((check) => `answer:${check}`),
    ...(!record.semanticAnswerQuality.complete ? record.semanticAnswerQuality.failures.map((check) => `semanticAnswer:${check}`) : []),
    ...(!record.textbookMappingPass ? ["textbookMapping"] : []),
    ...(!record.authoritativeMappingPass ? ["authoritativeTextbookMapping"] : []),
    ...(!record.equationPass ? ["equations"] : []),
    ...(!record.formulaAccessibilityPass ? record.formulaAccessibility.missing.map((check) => `formulaAccessibility:${check}`) : []),
    ...(!record.usefulContextPass ? ["usefulContext"] : []),
    ...(!record.canonicalPass ? ["selfCanonical"] : []),
    ...(!record.distinctIntentPass ? ["distinctIntent"] : []),
    ...(!record.questionPageExperiencePass ? ["questionPageExperience"] : []),
    ...(!record.languageQualityPass ? ["multilingualTextQuality"] : []),
    ...(!record.equivalentPagePass ? ["equivalentPage"] : []),
    ...(record.policyExclusion ? ["policyExclusion"] : []),
  ];
  for (const reason of new Set(reasons)) gateFailureCounts.set(reason, (gateFailureCounts.get(reason) || 0) + 1);
}

const report = {
  generatedAt: new Date(reviewedAt * 1_000).toISOString(),
  sourceDatabase: sourcePath,
  appliedDatabase: applyPath,
  generatedManifest: manifestPath,
  pipelineFinding: {
    currentGateLocation: "scripts/phase4-content-gate.mjs and the generated row-indexability bitset",
    currentFailBehavior: "fail closed for incomplete, unmapped, malformed, non-canonical, non-distinct or substantially equivalent atomic question pages",
    failOpen: false,
  },
  policy: {
    version: POLICY_VERSION,
    minimumWordCount: null,
    completenessPolicy: "question-type-aware",
    wordCountRole: "diagnostic only; a naturally concise complete answer can pass",
    indexRequirements: [
      "distinct search intent",
      "complete answer for its type",
      "internally consistent catalog/source mapping",
      "no known authoritative textbook mapping mismatch",
      "post-generation semantic coherence, selected-answer consistency, grammar and option-specific reasoning",
      "correct and readable equations",
      "matching source, spoken, plain-text and semantic MathML formula representations",
      "useful non-prompt context",
      "self-canonical URL",
      "no substantially equivalent indexed page",
      "complete question-specific answer-page experience",
      "validated native-script language text or an explicit publishing quarantine",
    ],
    similarityThreshold: SIMILARITY_THRESHOLD,
    similarityMetric: SIMILARITY_METRIC,
  },
  corpus: {
    questionCount: records.length,
    completenessPassedCount,
    gatePassedCount,
    gatePassedFraction: Number((gatePassedCount / records.length).toFixed(6)),
    reviewRequiredCount: records.length - gatePassedCount,
    gateCoverageCount: records.length,
    indexableCount: gatePassedCount,
    indexableMatchesGatePassed: true,
    maximumRowId,
  },
  questionPageExperience: {
    version: QUESTION_PAGE_EXPERIENCE_VERSION,
    readyCount: records.filter((record) => record.questionPageExperiencePass).length,
    directAnswerReadyCount: records.filter((record) => record.directAnswerPass).length,
    exactQuestionContextCount: records.filter((record) => record.exactQuestionContextPass).length,
    sourceRevisionRecordedCount: records.filter((record) => record.sourceRevisionPass).length,
    textbookEditionRecordedCount: records.filter((record) => record.sourceEditionRecorded).length,
    editionFallback: "When the source does not name an edition, the page discloses that fact and does not claim edition verification.",
    sameExerciseNavigationAvailableCount: records.filter((record) => record.sameExerciseNavigationAvailable).length,
    explicitCommonMistakeCount: records.filter((record) => record.explicitCommonMistakeAvailable).length,
    explicitAlternativeMethodCount: records.filter((record) => record.explicitAlternativeMethodAvailable).length,
    previousYearMetadataCount: records.filter((record) => record.previousYearMetadataAvailable).length,
    optionalSectionPolicy: "Render only when the current question or mapped exercise contains supporting source data; never synthesize a repeated filler paragraph.",
  },
  semanticAnswerQuality: {
    policyVersion: ANSWER_SEMANTIC_QUALITY_POLICY_VERSION,
    passedCount: records.filter((record) => record.semanticAnswerQuality.complete).length,
    failedCount: records.filter((record) => !record.semanticAnswerQuality.complete).length,
    rejectedChecks: [
      "repeated or accidentally joined clauses",
      "contradictory predicates",
      "duplicated answer endings",
      "basic grammar and readability",
      "MCQ selected-answer consistency",
      "minimum option-specific reasoning",
    ],
  },
  sourceMappingQuality: {
    policy: "Internal mapping consistency and authoritative textbook verification are separate statuses.",
    internallyConsistentCount: records.filter((record) => record.textbookMappingPass).length,
    authoritativeVerifiedCount: records.filter((record) => record.authoritativeTextbookMappingVerified).length,
    knownMismatchCount: records.filter((record) => record.authoritativeMappingStatus === "mismatch").length,
  },
  formulaAccessibility: {
    policy: "Every detected formula is strictly parsed and must preserve canonical semantic identifiers and operators in MathML, spoken text and crawler-visible plain text.",
    questionCountWithFormula: records.filter((record) => record.formulaAccessibility.formulaCount > 0).length,
    formulaCount: records.reduce((total, record) => total + record.formulaAccessibility.formulaCount, 0),
    passedQuestionCount: records.filter((record) => record.formulaAccessibilityPass).length,
    failedQuestionCount: records.filter((record) => !record.formulaAccessibilityPass).length,
    equationReviewPendingCount,
    sampleFailures: records
      .filter((record) => !record.formulaAccessibilityPass)
      .slice(0, 24)
      .map((record) => ({ key: record.key, failures: record.formulaAccessibility.failures.slice(0, 3) })),
    rejectedDefects: [
      "separated numerals",
      "reversed numerator and denominator",
      "missing exponents",
      "hyphen substituted for a mathematical minus",
      "detached units",
      "Latin I confused with numeral 1",
      "semantic identifier or operator loss",
      "empty fraction arguments or equation sides",
      "scripts or integral limits without a valid base operator",
      "unmatched delimiters",
      "raw TeX in crawler-visible plain text",
    ],
  },
  promptRequirements: {
    policy: "Question verbs are release requirements, not descriptive hints.",
    failedQuestionCount: records.filter((record) => record.completeness.missing.some((check) => check.startsWith("prompt") || check === "renderedWorkedStepCountMatchesSource")).length,
    requirements: [
      "draw or diagram requires rendered diagram media",
      "show working requires multiple calculation steps",
      "compare requires both sides across multiple dimensions",
      "give reason requires a causal explanation",
      "derive requires ordered equation steps and a conclusion",
      "displayed worked-step count equals the non-empty rendered step count",
    ],
  },
  multilingualTextQuality: {
    policyVersion: MULTILINGUAL_POLICY_VERSION,
    publishableQuestionCount: records.filter((record) => record.languageQualityPass).length,
    quarantinedQuestionCount: records.filter((record) => !record.languageQualityPass).length,
    disposition: "Unresolved Hindi and Tamil imports remain reachable only through an explicit review hold and are excluded from indexing and sitemaps.",
  },
  similarity: {
    selfTest: similaritySelfTest,
    duplicateIntentGroups: [...intentGroups.values()].filter((group) => group.length > 1).length,
    candidatePairsCompared: comparedPairCount,
    thresholdBreachingPairs: rejectedPairCount,
  },
  gateFailureCounts: [...gateFailureCounts]
    .sort((left, right) => right[1] - left[1])
    .map(([reason, count]) => ({ reason, count })),
  formats: formatAudit,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
source.close();
