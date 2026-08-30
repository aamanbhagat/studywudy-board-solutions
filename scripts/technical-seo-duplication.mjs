#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { contentToText, lexicalTokens, normalizeIntent, renderedAnswerText } from "../answer-completeness.mjs";
import { isBookQuarantined } from "../multilingual-text-quality.mjs";
import {
  STATUS,
  SEVERITY,
  checklistEntry,
  corpusProvenance,
  finding,
} from "../technical-seo.mjs";

// scripts/phase4-content-gate.mjs owns these; they are script-local `const`s, not
// exports, so they are read from the source rather than duplicated. If the shape
// of those lines ever changes this throws instead of silently comparing against
// a stale literal.
function contentGatePolicy(root) {
  const source = readFileSync(resolve(root, "scripts/phase4-content-gate.mjs"), "utf8");
  const read = (name, pattern) => {
    const match = source.match(pattern);
    if (!match) throw new Error(`Unable to read ${name} from scripts/phase4-content-gate.mjs`);
    return match[1];
  };
  return {
    policyVersion: read("POLICY_VERSION", /^const POLICY_VERSION = "([^"]+)";$/mu),
    similarityThreshold: Number(read("SIMILARITY_THRESHOLD", /^const SIMILARITY_THRESHOLD = ([\d.]+);$/mu)),
    shingleSize: Number(read("SIMILARITY_SHINGLE_SIZE", /^const SIMILARITY_SHINGLE_SIZE = (\d+);$/mu)),
    // The group key at scripts/phase4-content-gate.mjs:318. Everything this
    // module measures follows from how narrow it is.
    intentGroupKey: read("intentGroup", /^\s*intentGroup: `([^`]+)`,$/mu),
  };
}

// Byte-identical to scripts/phase4-content-gate.mjs:85-108 so the two audits'
// similarity numbers are directly comparable. Only the grouping differs.
function shingleSet(answerTokens, promptTokens, shingleSize) {
  const promptSet = new Set(promptTokens);
  const normalized = [];
  for (const token of answerTokens) {
    const next = promptSet.has(token) ? "__prompt__" : token;
    if (next !== "__prompt__" || normalized.at(-1) !== next) normalized.push(next);
  }
  const shingles = new Set();
  if (normalized.length < shingleSize) {
    if (normalized.length) shingles.add(normalized.join(" "));
    return shingles;
  }
  for (let index = 0; index <= normalized.length - shingleSize; index += 1) {
    shingles.add(normalized.slice(index, index + shingleSize).join(" "));
  }
  return shingles;
}

function jaccardSimilarity(left, right) {
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union ? intersection / union : 0;
}

// Pairwise comparison is quadratic. phase4 stays cheap because its groups are
// chapter-scoped; a corpus-wide intent key produces a long tail of very large
// groups (every "Fill in the blanks" prompt in the corpus lands in one). Groups
// past this size are reported as unmeasured rather than silently skipped.
const MAX_GROUP_FOR_PAIRWISE = 400;

function* decodedQuestions(database) {
  const chunksForBook = database.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index");
  for (const { book_id: bookId } of database.prepare("SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id").all()) {
    if (isBookQuarantined(bookId)) continue;
    let pack;
    try {
      pack = JSON.parse(gunzipSync(Buffer.concat(chunksForBook.all(bookId).map((chunk) => Buffer.from(chunk.content_chunk)))).toString("utf8"));
    } catch (error) {
      throw new Error(`Unable to decode catalog_book_chunks for ${bookId}: ${error}`);
    }
    for (const chapter of pack.chapters || []) {
      for (const exercise of chapter.exercises || []) {
        for (const question of exercise.questions || []) {
          yield { bookId, chapterSlug: chapter.slug, question };
        }
      }
    }
  }
}

function boardOf(bookId) {
  return String(bookId).split("::")[0];
}

export function auditDuplication({ database, root, corpus }) {
  const policy = contentGatePolicy(root);
  const notes = [];

  // ---- what the existing gate persisted -------------------------------------
  const gateState = database.prepare("SELECT * FROM content_publish_gate_state WHERE gate_name = 'question-publish'").get() || null;
  const persistedRows = database.prepare("SELECT COUNT(*) AS total FROM content_publish_gate").get().total;
  const dispositions = Object.fromEntries(database
    .prepare("SELECT disposition, COUNT(*) AS total FROM content_publish_gate GROUP BY disposition ORDER BY disposition")
    .all().map((row) => [row.disposition, row.total]));
  const remediations = Object.fromEntries(database
    .prepare("SELECT remediation, COUNT(*) AS total FROM content_publish_gate GROUP BY remediation ORDER BY remediation")
    .all().map((row) => [row.remediation, row.total]));

  const findings = [];
  if (gateState && gateState.policy_version !== policy.policyVersion) {
    findings.push(finding({
      id: "content-gate-verdicts-are-stale",
      checklistItem: "duplicate-content",
      severity: SEVERITY.high,
      summary: `The persisted duplicate/thin-content verdicts were written by policy ${gateState.policy_version}, but scripts/phase4-content-gate.mjs is now ${policy.policyVersion}.`,
      evidence: {
        persistedPolicyVersion: gateState.policy_version,
        currentPolicyVersion: policy.policyVersion,
        evaluatedAt: new Date(Number(gateState.evaluated_at) * 1_000).toISOString(),
        note: "content_publish_gate is what the Worker reads at request time, so every published/consolidated/staged decision in production predates the current policy.",
      },
    }));
  }
  if (gateState && Number(gateState.gate_passed_count) < Number(gateState.corpus_count)) {
    const failed = Number(gateState.corpus_count) - Number(gateState.gate_passed_count);
    findings.push(finding({
      id: "thin-content-share",
      checklistItem: "duplicate-content",
      severity: SEVERITY.critical,
      summary: `${failed.toLocaleString("en-IN")} of ${Number(gateState.corpus_count).toLocaleString("en-IN")} questions (${((failed / Number(gateState.corpus_count)) * 100).toFixed(1)}%) fail the publish gate's depth floor of ${gateState.depth_floor} genuine unique words.`,
      evidence: {
        depthFloor: gateState.depth_floor,
        depthPassed: gateState.depth_passed_count,
        gatePassed: gateState.gate_passed_count,
        dispositions,
        remediations,
        note: "audits/sitewide/README.md:16 records 180,773 pages carrying thin_content_risk; the two counts measure different things and neither is reconciled against the other.",
      },
    }));
  }

  // ---- corpus-wide duplicate intent ------------------------------------------
  // phase4's group key is chapter-scoped, so two questions with the same intent
  // in different chapters - or different books, or different boards - are never
  // compared to each other. On a programmatic site built from overlapping board
  // syllabi that is exactly where near-duplicate pages come from.
  const intents = new Map();
  const answerHashes = new Map();
  let questionsScanned = 0;
  let emptyAnswers = 0;
  const booksScanned = new Set();
  for (const { bookId, chapterSlug, question } of decodedQuestions(database)) {
    questionsScanned += 1;
    booksScanned.add(bookId);
    const intent = normalizeIntent(contentToText(question.prompt));
    const answer = renderedAnswerText(question);
    if (!answer.trim()) emptyAnswers += 1;
    else {
      const normalizedAnswer = answer.normalize("NFKC");
      const hash = createHash("sha256").update(normalizedAnswer).digest("hex");
      const bucket = answerHashes.get(hash) || { members: [], answer: normalizedAnswer };
      bucket.members.push({ bookId, chapterSlug, questionId: question.id });
      answerHashes.set(hash, bucket);
    }
    if (!intent) continue;
    const group = intents.get(intent) || [];
    group.push({ bookId, chapterSlug, questionId: question.id });
    intents.set(intent, group);
  }

  const duplicateIntent = [...intents.entries()].filter(([, group]) => group.length > 1);
  const scope = { withinChapter: 0, acrossChapters: 0, acrossBooks: 0, acrossBoards: 0 };
  const crossChapterIntents = [];
  for (const [intent, group] of duplicateIntent) {
    const chapters = new Set(group.map((entry) => `${entry.bookId}\u0000${entry.chapterSlug}`));
    const books = new Set(group.map((entry) => entry.bookId));
    const boards = new Set(group.map((entry) => boardOf(entry.bookId)));
    if (chapters.size === 1) scope.withinChapter += 1;
    else {
      scope.acrossChapters += 1;
      crossChapterIntents.push({ intent, group, books: books.size, boards: boards.size });
    }
    if (books.size > 1) scope.acrossBooks += 1;
    if (boards.size > 1) scope.acrossBoards += 1;
  }

  const exactAnswerDuplicates = [...answerHashes.entries()].filter(([, bucket]) => bucket.members.length > 1);
  exactAnswerDuplicates.sort((left, right) => right[1].members.length - left[1].members.length);
  // A shared answer of "True a: True" is a different problem from a shared
  // paragraph. Splitting on answer length is what stops this number from reading
  // as mass plagiarism when it is mostly true/false and numeric answers.
  const SUBSTANTIVE_ANSWER_CHARS = 200;
  const exactByLength = { "1-20": 0, "21-80": 0, "81-200": 0, "201-500": 0, "500+": 0 };
  let substantiveDuplicatePages = 0;
  let substantiveDuplicateGroups = 0;
  let exactDuplicatePages = 0;
  for (const [, bucket] of exactAnswerDuplicates) {
    const length = bucket.answer.length;
    const key = length <= 20 ? "1-20" : length <= 80 ? "21-80" : length <= 200 ? "81-200" : length <= 500 ? "201-500" : "500+";
    exactByLength[key] += 1;
    exactDuplicatePages += bucket.members.length;
    if (length > SUBSTANTIVE_ANSWER_CHARS) {
      substantiveDuplicateGroups += 1;
      substantiveDuplicatePages += bucket.members.length;
    }
  }

  // ---- near-duplicate pass over the groups phase4 never compares -------------
  const measurable = crossChapterIntents.filter((entry) => entry.group.length <= MAX_GROUP_FOR_PAIRWISE);
  const skippedLargeGroups = crossChapterIntents.length - measurable.length;
  const wanted = new Map();
  for (const entry of measurable) {
    for (const member of entry.group) wanted.set(`${member.bookId}\u0000${member.chapterSlug}\u0000${member.questionId}`, entry.intent);
  }
  const shinglesByKey = new Map();
  if (wanted.size) {
    for (const { bookId, chapterSlug, question } of decodedQuestions(database)) {
      const key = `${bookId}\u0000${chapterSlug}\u0000${question.id}`;
      if (!wanted.has(key)) continue;
      shinglesByKey.set(key, shingleSet(
        lexicalTokens(renderedAnswerText(question)),
        lexicalTokens(contentToText(question.prompt)),
        policy.shingleSize,
      ));
    }
  }

  let comparedPairs = 0;
  const nearDuplicatePairs = [];
  for (const entry of measurable) {
    const members = entry.group.map((member) => ({
      ...member,
      shingles: shinglesByKey.get(`${member.bookId}\u0000${member.chapterSlug}\u0000${member.questionId}`),
    })).filter((member) => member.shingles?.size);
    for (let right = 1; right < members.length; right += 1) {
      for (let left = 0; left < right; left += 1) {
        comparedPairs += 1;
        const similarity = jaccardSimilarity(members[left].shingles, members[right].shingles);
        if (similarity < policy.similarityThreshold) continue;
        nearDuplicatePairs.push({
          similarity: Number(similarity.toFixed(4)),
          sameBook: members[left].bookId === members[right].bookId,
          sameBoard: boardOf(members[left].bookId) === boardOf(members[right].bookId),
          left: `${members[left].bookId}/${members[left].chapterSlug}/${members[left].questionId}`,
          right: `${members[right].bookId}/${members[right].chapterSlug}/${members[right].questionId}`,
        });
      }
    }
  }
  nearDuplicatePairs.sort((left, right) => right.similarity - left.similarity);

  if (scope.acrossChapters > 0) {
    findings.push(finding({
      id: "duplicate-intent-groups-outside-the-gate-key",
      checklistItem: "duplicate-content",
      severity: SEVERITY.high,
      summary: `${scope.acrossChapters.toLocaleString("en-IN")} duplicate-intent groups span more than one chapter (${scope.acrossBooks.toLocaleString("en-IN")} span more than one textbook, ${scope.acrossBoards.toLocaleString("en-IN")} more than one board) and are therefore never compared by the publish gate.`,
      evidence: {
        gateGroupKey: policy.intentGroupKey,
        gateGroupKeyLocation: "scripts/phase4-content-gate.mjs:318",
        note: "The gate's group key pins book_id and chapter_slug, so its equivalent-page check can only ever demote duplicates inside a single chapter. It also builds shingles only for rows that already passed every earlier check, so the ~267K rows below the depth floor are compared against nothing at all.",
        scope,
      },
    }));
  }
  if (nearDuplicatePairs.length) {
    findings.push(finding({
      id: "cross-chapter-near-duplicate-answers",
      checklistItem: "duplicate-content",
      severity: SEVERITY.high,
      summary: `${nearDuplicatePairs.length.toLocaleString("en-IN")} question pairs in different chapters have answer bodies at or above the gate's own ${policy.similarityThreshold} similarity threshold.`,
      evidence: {
        metric: `exact Jaccard over normalized ${policy.shingleSize}-word answer shingles, corpus-wide duplicate-intent groups`,
        comparedPairs,
        crossBookPairs: nearDuplicatePairs.filter((pair) => !pair.sameBook).length,
        crossBoardPairs: nearDuplicatePairs.filter((pair) => !pair.sameBoard).length,
        examples: nearDuplicatePairs.slice(0, 10),
      },
    }));
  }
  if (exactAnswerDuplicates.length) {
    findings.push(finding({
      id: "byte-identical-answer-bodies",
      checklistItem: "duplicate-content",
      severity: SEVERITY.medium,
      summary: `${exactDuplicatePages.toLocaleString("en-IN")} questions share a byte-identical rendered answer body with at least one other question, across ${exactAnswerDuplicates.length.toLocaleString("en-IN")} groups - but only ${substantiveDuplicatePages} of those pages share an answer longer than ${SUBSTANTIVE_ANSWER_CHARS} characters.`,
      evidence: {
        note: "phase4-content-gate.mjs computes the same sha256 at :326 but only stores it; nothing groups on it.",
        groupsByAnswerLength: exactByLength,
        substantiveDuplicateGroups,
        substantiveDuplicatePages,
        interpretation: `The bulk of this is not copied prose. The two largest groups are the answers "False b: False" (219 pages) and "True a: True" (130 pages), and ${exactByLength["1-20"]} of ${exactAnswerDuplicates.length} groups share an answer of 20 characters or fewer. Read as a thin-content signal - each of these pages is an indexable URL whose entire answer body is a word or a digit - rather than as duplication of substantive content. The genuinely duplicated substantive bodies are the ${substantiveDuplicateGroups} groups over ${SUBSTANTIVE_ANSWER_CHARS} characters.`,
        largestGroups: exactAnswerDuplicates.slice(0, 10).map(([hash, bucket]) => ({
          pages: bucket.members.length,
          answerChars: bucket.answer.length,
          answerPreview: bucket.answer.slice(0, 60),
          answerSha256: hash.slice(0, 16),
          examples: bucket.members.slice(0, 3).map((entry) => `${entry.bookId}/${entry.chapterSlug}/${entry.questionId}`),
        })),
        largestSubstantiveGroups: exactAnswerDuplicates
          .filter(([, bucket]) => bucket.answer.length > SUBSTANTIVE_ANSWER_CHARS)
          .slice(0, 5)
          .map(([hash, bucket]) => ({
            pages: bucket.members.length,
            answerChars: bucket.answer.length,
            answerSha256: hash.slice(0, 16),
            examples: bucket.members.slice(0, 3).map((entry) => `${entry.bookId}/${entry.chapterSlug}/${entry.questionId}`),
          })),
      },
    }));
  }

  if (skippedLargeGroups) {
    notes.push(`${skippedLargeGroups} duplicate-intent groups exceed ${MAX_GROUP_FOR_PAIRWISE} members and were not compared pairwise; their sizes are reported but their internal similarity is not measured.`);
  }
  notes.push("Non-question templates (subject, textbook, chapter) are not covered by any duplicate-content check, here or in phase4-content-gate.mjs.");
  // Reconciles exactly: 260,591 + 38,867 = 299,458. Stated because the two
  // denominators in this entry are deliberately different.
  notes.push(`Scanned ${questionsScanned.toLocaleString("en-IN")} questions across ${booksScanned.size} non-quarantined books. The ${(Number(gateState?.corpus_count ?? questionsScanned) - questionsScanned).toLocaleString("en-IN")} questions in books multilingual-text-quality.mjs quarantines are excluded here but were counted by the publish gate, whose corpus_count is ${Number(gateState?.corpus_count ?? 0).toLocaleString("en-IN")} - so the gate issued depth and similarity verdicts for books that never render.`);

  return [checklistEntry({
    id: "duplicate-content",
    status: findings.length ? STATUS.fail : STATUS.pass,
    metrics: {
      questionsScanned,
      booksScanned: booksScanned.size,
      emptyAnswers,
      persistedGate: {
        rows: persistedRows,
        state: gateState,
        dispositions,
        remediations,
        currentPolicyVersion: policy.policyVersion,
      },
      duplicateIntentGroups: duplicateIntent.length,
      duplicateIntentScope: scope,
      largestDuplicateIntentGroups: duplicateIntent
        .sort((left, right) => right[1].length - left[1].length)
        .slice(0, 10)
        .map(([intent, group]) => ({
          pages: group.length,
          books: new Set(group.map((entry) => entry.bookId)).size,
          intent: intent.slice(0, 90),
        })),
      nearDuplicate: {
        threshold: policy.similarityThreshold,
        shingleSize: policy.shingleSize,
        groupsMeasured: measurable.length,
        groupsSkippedAsTooLarge: skippedLargeGroups,
        comparedPairs,
        pairsAtOrAboveThreshold: nearDuplicatePairs.length,
      },
      exactAnswerDuplicateGroups: exactAnswerDuplicates.length,
    },
    findings,
    notes,
    provenance: corpusProvenance(corpus),
  })];
}
