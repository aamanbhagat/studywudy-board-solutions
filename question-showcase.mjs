import { contentToText } from "./answer-completeness.mjs";
import {
  normalizedChoiceContent,
  questionHasDuplicateOptions,
} from "./choice-quality.mjs";
import { evaluatePostGenerationAnswerQuality } from "./answer-semantic-quality.mjs";
import { questionHasVerifiedDiagramEvidence } from "./question-classification.mjs";

export { normalizedChoiceContent, questionHasDuplicateOptions };

export const QUESTION_SHOWCASE_POLICY_VERSION = "quality-screened-v5-semantic";
export const QUESTION_SHOWCASE_COUNT = 16;
export const QUESTION_SHOWCASE_MAX_COMPRESSED_BYTES = 128 * 1024;
export const QUESTION_SHOWCASE_MAX_JSON_BYTES = 768 * 1024;
export const QUESTION_SHOWCASE_MAX_QUESTION_CHARACTERS = 64 * 1024;
export const QUESTION_SHOWCASE_MAX_TEXT_CHARACTERS = 4 * 1024;
export const QUESTION_SHOWCASE_BOARDS = Object.freeze([
  "maharashtra-board",
  "cbse",
  "cisce",
  "tamil-nadu-board",
]);
export const QUESTION_SHOWCASE_PREFERRED_QUESTION_IDS = Object.freeze([
  "q-cbse-ncert-accountancy-company-accounts-and-analysis-of-financial-statements-class-12-1-001",
]);

const UNRESOLVED_CONTENT = /(?:\b(?:todo|tbd|lorem ipsum|answer goes here|not available|missing required checks|awaiting (?:content|answer|review))\b|\[insert[^\]]*\]|\{\{(?!blank-\d+\}\})[^}]+\}\})/iu;
const DISPLAY_PLACEHOLDER = /(?:_{3,}|\{\{blank-\d+\}\}|\[\s*(?:blank)?\s*\]|\bblanks?\b)/iu;
const BROKEN_SOURCE_MARKUP = /(?:<br\s*\/?>|\ufffd|\u0000|\|)/iu;
const DEVANAGARI_LETTER = /\p{Script=Devanagari}/gu;
const DEVANAGARI_DEPENDENT_MARK = /[\u093a-\u094d\u0951-\u0957\u0962-\u0963]/gu;

export function questionHasUnresolvedContent(question) {
  return UNRESOLVED_CONTENT.test(JSON.stringify(question ?? {}));
}

function normalizedDisplayText(value) {
  return contentToText(value)
    .normalize("NFC")
    .replace(/\*\*|__/gu, "")
    .replace(/<[^>]*>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function corruptedDevanagariTitle(value) {
  const letters = String(value || "").match(DEVANAGARI_LETTER) || [];
  if (letters.length < 5) return false;
  const marks = String(value || "").match(DEVANAGARI_DEPENDENT_MARK) || [];
  return marks.length / letters.length < 0.08;
}

export function evaluateQuestionShowcaseContent(question, metadata = {}) {
  const rawPrompt = contentToText(question?.prompt ?? metadata.prompt_text);
  const prompt = normalizedDisplayText(rawPrompt);
  const chapterTitle = normalizedDisplayText(metadata.chapterTitle ?? metadata.chapter_title);
  const failures = [];
  if (prompt.length < 24) failures.push("question prompt is too short to be a polished sample");
  if (DISPLAY_PLACEHOLDER.test(rawPrompt) || question?.type === "fill_blank") {
    failures.push("question contains a public fill-in placeholder");
  }
  if (BROKEN_SOURCE_MARKUP.test(rawPrompt)) failures.push("question contains broken imported markup");
  if (/[:;]\s*$/u.test(prompt)) failures.push("question prompt ends as an incomplete card fragment");
  if (/\b(?:a|an|the|of|in|to|for|with|at|by|from)\s*[.?!]?$/iu.test(prompt)) {
    failures.push("question prompt ends with an incomplete phrase");
  }
  if (/\ba\s+[aeiou][\p{L}-]*/iu.test(prompt)) failures.push("question prompt contains an obvious article error");
  if (/\bdefine\s+the\s+term\s+of\b|[‘“]\s+/iu.test(prompt)) failures.push("question prompt contains an obvious wording defect");
  if (!chapterTitle) failures.push("chapter title is missing");
  if (/\p{Ll}\p{Lu}/u.test(chapterTitle)) failures.push("chapter title contains joined words");
  const nativeScriptValidationPassed = !/[\p{Script=Devanagari}\p{Script=Tamil}]/u.test(chapterTitle);
  if (!nativeScriptValidationPassed) {
    failures.push("native-script chapter title has not been separately approved for the public showroom");
  }
  if (/^\p{Script=Devanagari}+$/u.test(chapterTitle) && [...chapterTitle].length < 9) {
    failures.push("short unreviewed Devanagari chapter title is unsafe for the public showroom");
  }
  if (corruptedDevanagariTitle(chapterTitle)) failures.push("chapter title has a likely OCR-corrupt Devanagari shape");
  const semanticAnswerQuality = evaluatePostGenerationAnswerQuality(question);
  if (!semanticAnswerQuality.complete) {
    failures.push(`post-generation answer quality failed: ${semanticAnswerQuality.failures.join(", ")}`);
  }
  return Object.freeze({
    pass: failures.length === 0,
    failures: Object.freeze(failures),
    prompt,
    chapterTitle,
    nativeScriptValidationPassed,
    semanticAnswerQuality,
  });
}

export function questionHasDiagramEvidence(question, metadata = {}) {
  return questionHasVerifiedDiagramEvidence(question, metadata);
}

export function questionRuntimePayloadIsSafe(question) {
  let serialized;
  try {
    serialized = JSON.stringify(question ?? {});
  } catch {
    return false;
  }
  if (serialized.length > QUESTION_SHOWCASE_MAX_QUESTION_CHARACTERS) return false;
  const pending = [question];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === "string") {
      if (value.length > QUESTION_SHOWCASE_MAX_TEXT_CHARACTERS) return false;
    } else if (Array.isArray(value)) {
      pending.push(...value);
    } else if (value && typeof value === "object") {
      pending.push(...Object.values(value));
    }
  }
  return true;
}

export function questionShowcaseLanguage(question, bookId, catalogLanguage = null) {
  if (catalogLanguage) return catalogLanguage;
  const source = `${bookId || ""} ${contentToText(question?.prompt)}`;
  if (/\p{Script=Tamil}/u.test(source)) return "ta";
  if (/\p{Script=Devanagari}/u.test(source)) {
    if (/(?:^|[-_:])marathi(?:[-_:]|$)/iu.test(String(bookId || ""))) return "mr";
    if (/(?:^|[-_:])sanskrit(?:[-_:]|$)/iu.test(String(bookId || ""))) return "sa";
    return "hi";
  }
  return "en";
}

export function questionShowcaseDiversity(entries) {
  const values = Array.isArray(entries) ? entries : [];
  const distinct = (key) => new Set(values.map((entry) => entry?.[key]).filter(Boolean));
  const boardCounts = Object.fromEntries(QUESTION_SHOWCASE_BOARDS.map((board) => [
    board,
    values.filter((entry) => entry?.boardSlug === board).length,
  ]));
  return Object.freeze({
    count: values.length,
    boardCounts: Object.freeze(boardCounts),
    boards: distinct("boardSlug").size,
    classes: distinct("gradeSlug").size,
    subjects: distinct("subjectSlug").size,
    types: distinct("type").size,
    languages: distinct("language").size,
    books: distinct("bookId").size,
    diagram: values.filter((entry) => entry?.hasDiagram === true).length,
    nonDiagram: values.filter((entry) => entry?.hasDiagram === false).length,
  });
}

export function validateQuestionShowcase(entries) {
  const values = Array.isArray(entries) ? entries : [];
  const diversity = questionShowcaseDiversity(values);
  const failures = [];
  const rowIds = values.map(({ rowId }) => Number(rowId));
  if (diversity.count !== QUESTION_SHOWCASE_COUNT) failures.push(`expected ${QUESTION_SHOWCASE_COUNT} entries, found ${diversity.count}`);
  if (new Set(rowIds).size !== rowIds.length) failures.push("row ids are not unique");
  for (const [index, questionId] of QUESTION_SHOWCASE_PREFERRED_QUESTION_IDS.entries()) {
    if (values[index]?.questionId !== questionId) failures.push(`${questionId}: preferred verified sample is missing from position ${index + 1}`);
  }
  for (const entry of values) {
    if (entry?.internalMappingConsistent !== true) failures.push(`${entry?.questionId || "unknown"}: internal source mapping is inconsistent`);
    if (entry?.knownAuthoritativeMappingMismatch !== false) failures.push(`${entry?.questionId || "unknown"}: authoritative mapping mismatch is unresolved`);
    if (entry?.nativeScriptValidationPassed !== true) failures.push(`${entry?.questionId || "unknown"}: native-script validation did not pass`);
    if (entry?.searchExcerptClean !== true) failures.push(`${entry?.questionId || "unknown"}: search excerpt did not pass`);
    if (entry?.automatedGatePassed !== true) failures.push(`${entry?.questionId || "unknown"}: automated gate did not pass`);
    if (entry?.finalPublishingGatePassed !== true) failures.push(`${entry?.questionId || "unknown"}: final publishing gate did not pass`);
    if (entry?.unresolvedContent !== false) failures.push(`${entry?.questionId || "unknown"}: unresolved content remains`);
    if (entry?.brokenMedia !== false) failures.push(`${entry?.questionId || "unknown"}: media is broken or unverified`);
    if (entry?.duplicateOptions !== false) failures.push(`${entry?.questionId || "unknown"}: duplicate options remain`);
    if (entry?.runtimePayloadSafe !== true) failures.push(`${entry?.questionId || "unknown"}: answer payload is not runtime-safe`);
    if (entry?.contentQualityPassed !== true) failures.push(`${entry?.questionId || "unknown"}: public content-quality gate did not pass`);
  }
  for (const board of QUESTION_SHOWCASE_BOARDS) {
    if (diversity.boardCounts[board] !== 4) failures.push(`${board}: expected 4 entries, found ${diversity.boardCounts[board]}`);
  }
  if (diversity.classes < 8) failures.push(`expected at least 8 classes, found ${diversity.classes}`);
  if (diversity.subjects < 8) failures.push(`expected at least 8 subjects, found ${diversity.subjects}`);
  if (diversity.types < 6) failures.push(`expected at least 6 question types, found ${diversity.types}`);
  if (diversity.languages < 2) failures.push(`expected at least 2 languages, found ${diversity.languages}`);
  if (diversity.books < 12) failures.push(`expected at least 12 books, found ${diversity.books}`);
  if (diversity.diagram < 4 || diversity.nonDiagram < 4) failures.push("diagram and non-diagram coverage must each contain at least 4 entries");
  return Object.freeze({ pass: failures.length === 0, failures: Object.freeze(failures), diversity });
}
