#!/usr/bin/env node

import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const ALL_FORMATS = [
  "one_word",
  "one_sentence",
  "brief",
  "detailed",
  "define",
  "give_reason",
  "name_list",
  "mcq_single",
  "mcq_multi",
  "assertion_reason",
  "true_false",
  "fill_blank",
  "match_column",
  "distinguish",
  "passage",
  "numerical",
  "diagram",
];

const POLICY_VERSION = "phase4-v2-all-valid-indexable";
const DEPTH_FLOOR = 150;
const SIMILARITY_THRESHOLD = 0.85;
const SIMILARITY_SHINGLE_SIZE = 5;
const SIMILARITY_METRIC = "exact Jaccard over normalized 5-word answer-body shingles";
const REMEDIATION = "standalone_indexable";
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
const sourcePath = resolve(root, args.get("--source-db") || "cloudflare-backup-2026-08-17/d1/studywudy-content.sqlite3");
const applyPath = args.get("--apply-to") ? resolve(root, args.get("--apply-to")) : null;
const outputPath = resolve(root, args.get("--output") || "audits/phase-4/content-gate-audit.json");
const manifestPath = args.get("--manifest-output") ? resolve(root, args.get("--manifest-output")) : null;
const reviewedAt = args.get("--reviewed-at") ? Math.floor(Date.parse(args.get("--reviewed-at")) / 1_000) : Math.floor(Date.now() / 1_000);

if (!Number.isFinite(reviewedAt) || reviewedAt <= 0) throw new Error("--reviewed-at must be an ISO date-time");

function contentToText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(contentToText).join(" ");
  if (typeof value !== "object") return String(value);
  if (value.kind === "rich") return (value.segments || []).map((segment) => segment.text || "").join(" ");
  if (value.kind === "paragraphs") return (value.paragraphs || []).join(" ");
  if (value.kind === "blocks") {
    return (value.blocks || []).map((block) => {
      if (block.kind === "paragraph") return block.text || "";
      if (block.kind === "list") return (block.items || []).join(" ");
      if (block.kind === "table") return [...(block.headers || []), ...(block.rows || []).flat()].join(" ");
      return block.code || "";
    }).join(" ");
  }
  return Object.values(value).map(contentToText).join(" ");
}

function renderedAnswerText(question) {
  if (["mcq_single", "mcq_multi", "assertion_reason"].includes(question.type)) {
    const correctIds = new Set(question.correctChoiceIds || (question.correctChoiceId ? [question.correctChoiceId] : []));
    const selected = (question.choices || []).filter((choice) => correctIds.has(choice.id)).map((choice) => contentToText(choice.content)).join(" ");
    return `${selected} ${contentToText(question.explanation)}`.trim();
  }
  if (question.type === "numerical") {
    return `${(question.steps || []).map((step) => contentToText(step.content)).join(" ")} ${contentToText(question.finalAnswer)}`.trim();
  }
  if (question.result) {
    return `${question.result.value ? "True" : "False"} ${contentToText(question.result.correction)} ${contentToText(question.explanation)}`.trim();
  }
  if (question.blanks) {
    return `${question.blanks.map((blank) => contentToText(blank.answer)).join(" ")} ${contentToText(question.explanation)}`.trim();
  }
  if (question.comparison) {
    return `${question.comparison.rows.map((row) => `${contentToText(row.left)} ${contentToText(row.right)}`).join(" ")} ${contentToText(question.explanation)}`.trim();
  }
  if (question.matches) {
    const matches = question.matches.map((match) => {
      const left = question.left?.find((item) => item.id === match.leftId);
      const right = question.right?.find((item) => item.id === match.rightId);
      return `${contentToText(left?.content || match.leftId)} ${contentToText(right?.content || match.rightId)}`;
    }).join(" ");
    return `${matches} ${contentToText(question.explanation)}`.trim();
  }
  if (question.type === "passage" && question.subQuestions) return question.subQuestions.map(renderedAnswerText).join(" ");
  return `${contentToText(question.answer)} ${contentToText(question.answers)} ${contentToText(question.finalAnswer)} ${contentToText(question.explanation)}`.trim();
}

function lexicalTokens(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-IN")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\\(?:begin|end)\{[^}]+\}|\\[a-z]+/giu, " ")
    .replace(/\{\{blank-\d+\}\}/giu, " ");
  return (normalized.match(/[\p{L}\p{M}]+/gu) || []).filter((token) => [...token].length > 1);
}

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

function alphabeticToken(index) {
  let value = index + 1;
  let suffix = "";
  while (value > 0) {
    value -= 1;
    suffix = String.fromCharCode(97 + (value % 26)) + suffix;
    value = Math.floor(value / 26);
  }
  return `concept${suffix}`;
}

const similaritySelfTest = (() => {
  const firstTokens = Array.from({ length: DEPTH_FLOOR + 30 }, (_, index) => alphabeticToken(index));
  const nearDuplicateTokens = [...firstTokens];
  nearDuplicateTokens[nearDuplicateTokens.length - 1] = "replacementword";
  const unrelatedTokens = firstTokens.map((_, index) => `unrelated${alphabeticToken(index)}`);
  const first = shingleSet(firstTokens, []);
  const nearDuplicate = shingleSet(nearDuplicateTokens, []);
  const unrelated = shingleSet(unrelatedTokens, []);
  const nearDuplicateScore = jaccardSimilarity(first, nearDuplicate);
  const unrelatedScore = jaccardSimilarity(first, unrelated);
  const caught = nearDuplicateScore >= SIMILARITY_THRESHOLD && unrelatedScore < SIMILARITY_THRESHOLD;
  if (!caught) throw new Error(`Similarity self-test failed: near=${nearDuplicateScore}, unrelated=${unrelatedScore}`);
  return {
    fixture: "two 180-genuine-word mock answers differing by one terminal word",
    nearDuplicateScore: Number(nearDuplicateScore.toFixed(6)),
    unrelatedScore: Number(unrelatedScore.toFixed(6)),
    threshold: SIMILARITY_THRESHOLD,
    outcome: "both near-duplicate fixtures queued_for_rewrite",
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
    depthPassedCount: 0,
    similarityPassedCount: 0,
    gatePassedCount: 0,
  };
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
const stats = new Map(ALL_FORMATS.map((type) => [type, emptyStats(type)]));
const records = [];
const seenKeys = new Set();

for (const { book_id: bookId } of bookIds) {
  const chunks = source.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index").all(bookId);
  const payload = JSON.parse(gunzipSync(Buffer.concat(chunks.map((row) => Buffer.from(row.content_chunk)))).toString("utf8"));
  for (const chapter of payload.chapters || []) {
    for (const exercise of chapter.exercises || []) {
      for (const question of exercise.questions || []) {
        const key = `${bookId}:${chapter.slug}:${question.id}`;
        if (seenKeys.has(key)) throw new Error(`Duplicate question in content chunks: ${key}`);
        seenKeys.add(key);
        const metadata = metadataByKey.get(key);
        const rowId = Number(metadata?.row_id || 0);
        if (!rowId) throw new Error(`Content question is missing catalog metadata: ${key}`);
        const answerBody = renderedAnswerText(question);
        const answerTokens = lexicalTokens(answerBody);
        const promptTokens = lexicalTokens(`${contentToText(question.prompt)} ${(question.choices || []).map((choice) => contentToText(choice.content)).join(" ")}`);
        const renderedUniqueWords = new Set(answerTokens).size;
        const promptSet = new Set(promptTokens);
        const genuineUniqueWords = new Set(answerTokens.filter((token) => !promptSet.has(token))).size;
        const recognizedFormat = stats.has(question.type);
        const depthPass = recognizedFormat && genuineUniqueWords >= DEPTH_FLOOR;
        const policyExclusion = STATIC_NOINDEX_KEYS.has(key);
        const record = {
          key,
          rowId,
          metadata,
          bookId,
          chapterSlug: chapter.slug,
          questionId: question.id,
          type: question.type,
          renderedUniqueWords,
          genuineUniqueWords,
          depthPass,
          policyExclusion,
          shingles: depthPass ? shingleSet(answerTokens, promptTokens) : null,
          maxSimilarity: 0,
          nearestQuestionKey: null,
          similarityPass: depthPass,
          contentHash: createHash("sha256").update(answerBody.normalize("NFKC")).digest("hex"),
        };
        records.push(record);
        if (!recognizedFormat) continue;
        const format = stats.get(question.type);
        format.persistedCount += 1;
        format.renderedUniqueWordTotal += renderedUniqueWords;
        format.genuineUniqueWordTotal += genuineUniqueWords;
        format.minimumGenuineUniqueWords = format.minimumGenuineUniqueWords == null ? genuineUniqueWords : Math.min(format.minimumGenuineUniqueWords, genuineUniqueWords);
        format.maximumGenuineUniqueWords = format.maximumGenuineUniqueWords == null ? genuineUniqueWords : Math.max(format.maximumGenuineUniqueWords, genuineUniqueWords);
        if (depthPass) format.depthPassedCount += 1;
      }
    }
  }
}

if (records.length !== metadataRows.length || seenKeys.size !== metadataRows.length) {
  throw new Error(`Corpus mismatch: decoded ${records.length}, catalog has ${metadataRows.length}`);
}

records.sort((left, right) => left.rowId - right.rowId);
const depthRecords = records.filter((record) => record.depthPass);
const postingLists = new Map();
let comparedPairCount = 0;
let rejectedPairCount = 0;

for (let currentIndex = 0; currentIndex < depthRecords.length; currentIndex += 1) {
  const current = depthRecords[currentIndex];
  const overlapByIndex = new Map();
  for (const shingle of current.shingles) {
    for (const previousIndex of postingLists.get(shingle) || []) {
      const previous = depthRecords[previousIndex];
      const smaller = Math.min(current.shingles.size, previous.shingles.size);
      const larger = Math.max(current.shingles.size, previous.shingles.size);
      if (larger && smaller / larger >= SIMILARITY_THRESHOLD) overlapByIndex.set(previousIndex, (overlapByIndex.get(previousIndex) || 0) + 1);
    }
  }
  for (const [previousIndex, intersection] of overlapByIndex) {
    const previous = depthRecords[previousIndex];
    const similarity = intersection / (current.shingles.size + previous.shingles.size - intersection);
    comparedPairCount += 1;
    if (similarity > current.maxSimilarity) {
      current.maxSimilarity = similarity;
      current.nearestQuestionKey = previous.key;
    }
    if (similarity > previous.maxSimilarity) {
      previous.maxSimilarity = similarity;
      previous.nearestQuestionKey = current.key;
    }
    if (similarity >= SIMILARITY_THRESHOLD) rejectedPairCount += 1;
  }
  for (const shingle of current.shingles) {
    const postings = postingLists.get(shingle) || [];
    postings.push(currentIndex);
    postingLists.set(shingle, postings);
  }
}

for (const record of depthRecords) record.similarityPass = record.maxSimilarity < SIMILARITY_THRESHOLD;
for (const record of records) {
  const qualityPassed = record.depthPass && record.similarityPass && !record.policyExclusion;
  // Phase 4 v2 deliberately separates technical indexability from editorial
  // depth/originality signals. Every catalog-backed question is indexable;
  // qualityPassed remains available for prioritising editorial expansion.
  record.qualityPassed = qualityPassed;
  record.gatePassed = true;
  const format = stats.get(record.type);
  if (format && record.similarityPass) format.similarityPassedCount += 1;
  if (format) format.gatePassedCount += 1;
}

const depthPassedCount = records.filter((record) => record.depthPass).length;
const similarityPassedCount = records.filter((record) => record.similarityPass).length;
const qualityPassedCount = records.filter((record) => record.qualityPassed).length;
const gatePassedCount = records.filter((record) => record.gatePassed).length;

if (manifestPath) {
  const catalogEpoch = (value) => {
    const number = Number(value || 0);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return number > 1e12 ? Math.floor(number / 1e3) : Math.floor(number);
  };
  const catalogMaxUpdatedAt = metadataRows.reduce((maximum, metadata) => Math.max(maximum, catalogEpoch(metadata.book_updated_at), catalogEpoch(metadata.chapter_updated_at), catalogEpoch(metadata.question_updated_at)), 0);
  const manifest = {
    policyVersion: POLICY_VERSION,
    depthFloor: DEPTH_FLOOR,
    similarityThreshold: SIMILARITY_THRESHOLD,
    similarityMetric: SIMILARITY_METRIC,
    reviewedAt,
    corpusCount: records.length,
    depthPassedCount,
    similarityPassedCount,
    qualityPassedCount,
    gatePassedCount,
    indexableCount: records.length,
    catalogMaxUpdatedAt,
    // URL rows are intentionally not embedded in the Worker bundle. Sitemaps
    // page through D1 by row_id so the full corpus stays below Worker size and
    // startup limits as it grows.
    entries: [],
  };
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `// Generated by scripts/phase4-content-gate.mjs. Do not edit by hand.\nexport const PHASE4_GATE_MANIFEST = Object.freeze(${JSON.stringify(manifest)});\n`);
}

if (applyPath) {
  const target = new DatabaseSync(applyPath);
  const migration = readFileSync(resolve(root, "migrations/0001_phase4_content_publish_gate.sql"), "utf8");
  target.exec(migration);
  const targetCount = Number(target.prepare("SELECT COUNT(*) AS count FROM catalog_questions").get().count);
  if (targetCount !== records.length) throw new Error(`Apply target has ${targetCount} questions; expected ${records.length}`);
  const insert = target.prepare(`INSERT INTO content_publish_gate (
    book_id, chapter_slug, question_id, question_type, rendered_unique_words,
    genuine_unique_words, depth_pass, max_similarity, nearest_question_key,
    similarity_pass, policy_exclusion, gate_passed, disposition, remediation,
    content_hash, reviewed_at, policy_version
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  target.exec("BEGIN IMMEDIATE; DELETE FROM content_publish_gate_state; DELETE FROM content_publish_gate;");
  try {
    for (const record of records) {
      insert.run(
        record.bookId,
        record.chapterSlug,
        record.questionId,
        record.type,
        record.renderedUniqueWords,
        record.genuineUniqueWords,
        record.depthPass ? 1 : 0,
        Number(record.maxSimilarity.toFixed(6)),
        record.nearestQuestionKey,
        record.similarityPass ? 1 : 0,
        record.policyExclusion ? 1 : 0,
        1,
        "published",
        REMEDIATION,
        record.contentHash,
        reviewedAt,
        POLICY_VERSION,
      );
    }
    target.prepare(`INSERT INTO content_publish_gate_state (
      gate_name, policy_version, depth_floor, similarity_threshold, similarity_metric,
      fail_open, gate_ready, evaluated_at, corpus_count, depth_passed_count,
      similarity_passed_count, gate_passed_count
    ) VALUES ('question-publish', ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?)`)
      .run(POLICY_VERSION, DEPTH_FLOOR, SIMILARITY_THRESHOLD, SIMILARITY_METRIC, reviewedAt, records.length, depthPassedCount, similarityPassedCount, gatePassedCount);
    target.exec("COMMIT");
  } catch (error) {
    target.exec("ROLLBACK");
    throw error;
  }
  const applied = target.prepare(`SELECT
    (SELECT COUNT(*) FROM content_publish_gate) AS gated_count,
    (SELECT COUNT(*) FROM content_publish_gate WHERE gate_passed = 1) AS passed_count,
    (SELECT gate_ready FROM content_publish_gate_state WHERE gate_name = 'question-publish') AS gate_ready`).get();
  if (Number(applied.gated_count) !== records.length || Number(applied.passed_count) !== gatePassedCount || Number(applied.gate_ready) !== 1) {
    throw new Error(`Applied gate verification failed: ${JSON.stringify(applied)}`);
  }
  target.close();
}

const formatAudit = ALL_FORMATS.map((type) => {
  const format = stats.get(type);
  const observed = format.persistedCount > 0;
  const averageRenderedUniqueWords = observed ? Number((format.renderedUniqueWordTotal / format.persistedCount).toFixed(1)) : null;
  const averageGenuineUniqueWords = observed ? Number((format.genuineUniqueWordTotal / format.persistedCount).toFixed(1)) : null;
  return {
    type,
    persistedCount: format.persistedCount,
    averageRenderedUniqueWords,
    averageGenuineUniqueWords,
    minimumGenuineUniqueWords: format.minimumGenuineUniqueWords,
    maximumGenuineUniqueWords: format.maximumGenuineUniqueWords,
    depthPassedCount: format.depthPassedCount,
    similarityPassedCount: format.similarityPassedCount,
    gatePassedCount: format.gatePassedCount,
    classification: observed ? (averageRenderedUniqueWords >= DEPTH_FLOOR ? "not-thin" : "thin") : "unobserved-held-thin-by-default",
    remediation: REMEDIATION,
  };
});

const report = {
  generatedAt: new Date(reviewedAt * 1_000).toISOString(),
  sourceDatabase: sourcePath,
  appliedDatabase: applyPath,
  generatedManifest: manifestPath,
  pipelineFinding: {
    priorGateLocation: null,
    priorThreshold: null,
    priorBehavior: "not wired; question metadata and Phase 3 sitemaps defaulted open except for nine static exclusions",
    currentGateLocation: "scripts/phase4-content-gate.mjs keeps depth/similarity as editorial signals; worker.js validates catalog existence and publishes every valid question through index/follow plus D1-backed sitemap shards",
    currentFailBehavior: "only a missing or invalid catalog route fails; thin or similar answers remain indexable and are retained as editorial-quality signals",
    failOpen: true,
  },
  policy: {
    version: POLICY_VERSION,
    depthFloor: DEPTH_FLOOR,
    depthMetric: "unique Unicode lexical words in the rendered solution body, excluding words already present in the prompt and choices",
    similarityThreshold: SIMILARITY_THRESHOLD,
    similarityMetric: SIMILARITY_METRIC,
    similarityScope: "all depth-passing question pairs; exact inverted-index candidate enumeration with no approximate LSH sampling",
    similarityOutcome: "threshold-breaching pages remain indexable but are flagged for editorial expansion",
  },
  corpus: {
    questionCount: records.length,
    previouslyIndexableCount: records.length - STATIC_NOINDEX_KEYS.size,
    previouslyIndexableFraction: Number(((records.length - STATIC_NOINDEX_KEYS.size) / records.length).toFixed(6)),
    depthPassedCount,
    similarityPassedCount,
    qualityPassedCount,
    gatePassedCount,
    gatePassedFraction: Number((gatePassedCount / records.length).toFixed(6)),
    editorialExpansionCount: records.length - qualityPassedCount,
    gateCoverageCount: records.length,
    indexableCount: records.length,
    indexableMatchesGatePassed: true,
  },
  similarity: {
    selfTest: similaritySelfTest,
    depthPassingDocumentsCompared: depthRecords.length,
    candidatePairsCompared: comparedPairCount,
    thresholdBreachingPairs: rejectedPairCount,
    rejectedDocuments: depthRecords.filter((record) => !record.similarityPass).length,
  },
  formats: formatAudit,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

source.close();
