#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";

import { contentToText } from "../answer-completeness.mjs";
import { applyKnownPayloadRepairs } from "../multilingual-text-quality.mjs";
import { normalizedQuestionType } from "../question-classification.mjs";
import {
  POLICY_VERSION,
  evaluateSourceTextIntegrity,
  numericNearDuplicateTemplate,
  suspiciousDroppedOrDuplicatedDigit,
} from "../source-text-integrity.mjs";

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
const outputPath = resolve(root, args.get("--output") || "audits/source-integrity/source-text-integrity-audit.json");
const manifestPath = resolve(root, args.get("--manifest-output") || "source-text-integrity-manifest.mjs");
const reviewedAt = args.get("--reviewed-at") ? Math.floor(Date.parse(args.get("--reviewed-at")) / 1_000) : Math.floor(Date.now() / 1_000);
if (!Number.isFinite(reviewedAt) || reviewedAt <= 0) throw new Error("--reviewed-at must be an ISO date-time");

const source = new DatabaseSync(sourcePath, { readOnly: true });
const metadataRows = source.prepare(`SELECT q.row_id, q.book_id, q.chapter_slug, q.question_id,
  q.updated_at AS question_updated_at, b.updated_at AS book_updated_at, c.updated_at AS chapter_updated_at
  FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id
  JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
  ORDER BY q.row_id`).all();
const metadataByKey = new Map(metadataRows.map((row) => [`${row.book_id}:${row.chapter_slug}:${row.question_id}`, row]));
const maximumRowId = metadataRows.reduce((maximum, row) => Math.max(maximum, Number(row.row_id)), 0);
const intrinsicPassByRow = new Uint8Array(maximumRowId + 1);
const failureByRow = new Map();
const fingerprintGroups = new Map();
const seenKeys = new Set();

let normalizedQuestionVerifiedCount = 0;
let numericChainApplicableCount = 0;
let numericChainPassedCount = 0;
let discreteResultApplicableCount = 0;
let discreteResultFailedCount = 0;
let correctionReviewPendingCount = 0;
let importedAnomalyCount = 0;
let normalizedAnomalyCount = 0;

function compactFailure(key, evaluation) {
  return {
    key,
    failures: [...evaluation.failures],
    correctionCode: evaluation.correctionCode,
    correctionDisposition: evaluation.correctionDisposition,
    importedAnomalies: evaluation.importedAnomalies.map(({ code }) => code),
    normalizedAnomalies: evaluation.normalizedAnomalies.map(({ code }) => code),
    peers: [],
  };
}

function addFingerprint(record, template) {
  if (!template.signature || template.numbers.length < 2) return;
  const signatureHash = createHash("sha256").update(template.signature).digest("base64url").slice(0, 16);
  for (let index = 0; index < template.numbers.length; index += 1) {
    const otherNumbers = template.numbers.map((number, numberIndex) => numberIndex === index ? "?" : number).join("|");
    const fingerprint = `${signatureHash}\0${template.numbers.length}\0${index}\0${otherNumbers}`;
    const group = fingerprintGroups.get(fingerprint) || [];
    group.push({ ...record, value: template.numbers[index] });
    fingerprintGroups.set(fingerprint, group);
  }
}

const bookIds = source.prepare("SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id").all();
const chunksForBook = source.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index");
for (const { book_id: bookId } of bookIds) {
  const chunks = chunksForBook.all(bookId).map((row) => Buffer.from(row.content_chunk));
  const importedPayload = JSON.parse(gunzipSync(Buffer.concat(chunks)).toString("utf8"));
  const normalizedPayload = applyKnownPayloadRepairs(bookId, structuredClone(importedPayload));
  const importedByKey = new Map();
  for (const chapter of importedPayload.chapters || []) {
    for (const exercise of chapter.exercises || []) {
      for (const question of exercise.questions || []) importedByKey.set(`${chapter.slug}:${question.id}`, question);
    }
  }
  for (const chapter of normalizedPayload.chapters || []) {
    for (const exercise of chapter.exercises || []) {
      for (const question of exercise.questions || []) {
        const key = `${bookId}:${chapter.slug}:${question.id}`;
        if (seenKeys.has(key)) throw new Error(`Duplicate normalized source question: ${key}`);
        seenKeys.add(key);
        const metadata = metadataByKey.get(key);
        const rowId = Number(metadata?.row_id || 0);
        if (!rowId) throw new Error(`Source question is missing catalog metadata: ${key}`);
        const importedQuestion = importedByKey.get(`${chapter.slug}:${question.id}`);
        if (!importedQuestion) throw new Error(`Normalized question is missing its imported source: ${key}`);
        const normalizedType = normalizedQuestionType(question);
        const qualityQuestion = normalizedType === question.type ? question : { ...question, type: normalizedType };
        const evaluation = evaluateSourceTextIntegrity({ key, importedQuestion, normalizedQuestion: qualityQuestion, normalizedType });

        if (evaluation.sourceTextIntegrityPassed) intrinsicPassByRow[rowId] = 1;
        else failureByRow.set(rowId, compactFailure(key, evaluation));
        if (evaluation.normalizedQuestionVerified) normalizedQuestionVerifiedCount += 1;
        if (evaluation.numericChain.applicable) {
          numericChainApplicableCount += 1;
          if (evaluation.numericChain.complete) numericChainPassedCount += 1;
        }
        if (evaluation.discreteResult.applicable) discreteResultApplicableCount += 1;
        if (!evaluation.discreteResult.complete) discreteResultFailedCount += 1;
        if (evaluation.correctionRecorded && !evaluation.correctionPublishApproved) correctionReviewPendingCount += 1;
        importedAnomalyCount += evaluation.importedAnomalies.length;
        normalizedAnomalyCount += evaluation.normalizedAnomalies.length;

        if (normalizedType === "numerical") {
          addFingerprint(
            { rowId, key },
            numericNearDuplicateTemplate(contentToText(importedQuestion.prompt)),
          );
        }
      }
    }
  }
}

if (seenKeys.size !== metadataRows.length) throw new Error(`Source-integrity corpus mismatch: decoded ${seenKeys.size}, catalog has ${metadataRows.length}`);

const suspiciousPairKeys = new Set();
const suspiciousRows = new Set();
for (const candidates of fingerprintGroups.values()) {
  const candidatesByValue = new Map();
  for (const candidate of candidates) {
    const group = candidatesByValue.get(candidate.value) || [];
    group.push(candidate);
    candidatesByValue.set(candidate.value, group);
  }
  const values = [...candidatesByValue.keys()];
  for (let rightIndex = 1; rightIndex < values.length; rightIndex += 1) {
    const rightValue = values[rightIndex];
    for (let leftIndex = 0; leftIndex < rightIndex; leftIndex += 1) {
      const leftValue = values[leftIndex];
      if (!suspiciousDroppedOrDuplicatedDigit(leftValue, rightValue)) continue;
      for (const left of candidatesByValue.get(leftValue)) {
        for (const right of candidatesByValue.get(rightValue)) {
          if (left.rowId === right.rowId) continue;
          const pairKey = left.rowId < right.rowId ? `${left.rowId}:${right.rowId}` : `${right.rowId}:${left.rowId}`;
          if (suspiciousPairKeys.has(pairKey)) continue;
          suspiciousPairKeys.add(pairKey);
          for (const [record, peer] of [[left, right], [right, left]]) {
            intrinsicPassByRow[record.rowId] = 0;
            suspiciousRows.add(record.rowId);
            const failure = failureByRow.get(record.rowId) || {
              key: record.key,
              failures: [],
              correctionCode: null,
              correctionDisposition: null,
              importedAnomalies: [],
              normalizedAnomalies: [],
              peers: [],
            };
            if (!failure.failures.includes("suspicious-near-duplicate-number")) failure.failures.push("suspicious-near-duplicate-number");
            if (failure.peers.length < 8 && !failure.peers.includes(peer.key)) failure.peers.push(peer.key);
            failureByRow.set(record.rowId, failure);
          }
        }
      }
    }
  }
}

const indexabilityBytes = new Uint8Array(Math.ceil((maximumRowId + 1) / 8));
let gatePassedCount = 0;
for (let rowId = 1; rowId <= maximumRowId; rowId += 1) {
  if (!intrinsicPassByRow[rowId]) continue;
  indexabilityBytes[rowId >> 3] |= 1 << (rowId & 7);
  gatePassedCount += 1;
}

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
const failureCounts = new Map();
for (const failure of failureByRow.values()) {
  for (const code of new Set(failure.failures)) failureCounts.set(code, (failureCounts.get(code) || 0) + 1);
}

const manifest = {
  policyVersion: POLICY_VERSION,
  reviewedAt,
  corpusCount: metadataRows.length,
  gatePassedCount,
  reviewRequiredCount: metadataRows.length - gatePassedCount,
  normalizedQuestionVerifiedCount,
  numericChainApplicableCount,
  numericChainPassedCount,
  discreteResultApplicableCount,
  discreteResultFailedCount,
  correctionReviewPendingCount,
  importedAnomalyCount,
  normalizedAnomalyCount,
  suspiciousNearDuplicatePairCount: suspiciousPairKeys.size,
  suspiciousNearDuplicateQuestionCount: suspiciousRows.size,
  maximumRowId,
  catalogMaxUpdatedAt,
  indexabilityBitsetBase64: Buffer.from(indexabilityBytes).toString("base64"),
};
const report = {
  generatedAt: new Date(reviewedAt * 1_000).toISOString(),
  sourceDatabase: sourcePath,
  policy: {
    version: POLICY_VERSION,
    ordering: "source input integrity precedes answer, equation and publishing gates",
    numericChain: "imported question → normalized displayed question → Given → substitutions → final answer",
    failOpen: false,
  },
  corpus: manifest,
  failureCounts: [...failureCounts].sort((left, right) => right[1] - left[1]).map(([code, count]) => ({ code, count })),
  sampleFailures: [...failureByRow.entries()]
    .sort(([left], [right]) => left - right)
    .slice(0, 80)
    .map(([rowId, failure]) => ({ rowId, ...failure })),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(manifestPath, `// Generated by scripts/source-text-integrity-gate.mjs. Do not edit by hand.\nexport const SOURCE_TEXT_INTEGRITY_MANIFEST = Object.freeze(${JSON.stringify(manifest)});\n`);
const { indexabilityBitsetBase64: _indexabilityBitsetBase64, ...consoleCorpus } = manifest;
console.log(JSON.stringify({ policy: report.policy, corpus: consoleCorpus, failureCounts: report.failureCounts }, null, 2));
source.close();
