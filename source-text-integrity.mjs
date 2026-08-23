import { contentToText, renderedAnswerText } from "./answer-completeness.mjs";
import { POLICY_VERSION as CORRECTION_LEDGER_VERSION, sourceCorrectionForKey } from "./source-correction-ledger.mjs";

const POLICY_VERSION = "source-text-integrity-v1";
const NUMERIC_TYPES = new Set(["numerical"]);
const DISCRETE_NOUNS = "coins?|shots?|bullets?|bottles?|people|persons?|students?|workers?|books?|pens?|pencils?|balls?|marbles?|cards?|objects?|items?|cubes?|spheres?|bricks?|tiles?|trees?|plants?|animals?|days?|hours?";
const NUMBER_PATTERN = /[+−-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)/gu;
const bitsetCache = new WeakMap();

function sourceIntegrityBitset(manifest) {
  if (bitsetCache.has(manifest)) return bitsetCache.get(manifest);
  const encoded = String(manifest?.indexabilityBitsetBase64 || "");
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  bitsetCache.set(manifest, bytes);
  return bytes;
}

function isSourceTextIntegrityRowPassed(manifest, rowId) {
  const numericRowId = Number(rowId);
  if (!Number.isInteger(numericRowId) || numericRowId <= 0 || numericRowId > Number(manifest?.maximumRowId || 0)) return false;
  const bytes = sourceIntegrityBitset(manifest);
  return Boolean(bytes[numericRowId >> 3] & (1 << (numericRowId & 7)));
}

function canonicalNumber(value) {
  const source = String(value || "").replaceAll("−", "-").replace(/^\+/u, "");
  if (/^-?\d{1,3}(?:,\d{3})+$/u.test(source)) return source.replaceAll(",", "").replace(/^(-?)0+(?=\d)/u, "$1");
  const decimal = source.replace(",", ".");
  const number = Number(decimal);
  if (!Number.isFinite(number)) return decimal;
  return String(number);
}

function extractNumericTokens(value) {
  return [...String(value || "").matchAll(NUMBER_PATTERN)].map((match) => canonicalNumber(match[0]));
}

function sameNumericSequence(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sequenceMatchesCorrection(importedNumbers, normalizedNumbers, correction) {
  return Boolean(
    correction
    && sameNumericSequence(importedNumbers, correction.importedNumbers || [])
    && sameNumericSequence(normalizedNumbers, correction.normalizedNumbers || []),
  );
}

function detectSourceTextAnomalies(value, { numericContext = false } = {}) {
  const text = String(value || "").normalize("NFC");
  const findings = [];
  const add = (code, match) => findings.push(Object.freeze({ code, match: String(match || "") }));
  const first = (pattern) => text.match(pattern)?.[0] || "";

  const ambiguousHundred = first(/\b(?:loo|l00|I00)\b/u);
  if (ambiguousHundred && numericContext) add("ambiguous-hundred-ocr", ambiguousHundred);
  const cmBlank = first(/cm\s*blank\b/iu);
  if (cmBlank) add("cmblank-token", cmBlank);
  const attachedPlaceholder = first(/(?:\d(?:[\p{L}%°]+)?_{2,}|_{2,}\d)/u);
  if (attachedPlaceholder) add("numeric-placeholder-attached", attachedPlaceholder);
  const letterOQuantity = first(/(?<![\p{L}\d])(?:\d*0\d*[Oo]\d*|\d*[Oo]\d*0\d*)(?![\p{L}\d])/u);
  if (letterOQuantity) add("letter-o-inside-numeric-quantity", letterOQuantity);
  const letterIQuantity = first(/(?<![\p{L}\d])(?:[Il]\d{2,}|\d[Il]\d*0\d*)(?![\p{L}\d])/u);
  if (letterIQuantity) add("letter-i-inside-numeric-quantity", letterIQuantity);
  const malformedDecimal = first(/(?:\d+\.\.(?!\.)\d+|\d+,,(?!,)\d+)/u);
  if (malformedDecimal) add("malformed-decimal-separator", malformedDecimal);
  const brokenUnitBoundary = first(/\d(?:mm|cm|km|mg|kg|ms|hz|pa)(?=[A-Za-z_])/iu);
  if (brokenUnitBoundary) add("broken-unit-boundary", brokenUnitBoundary);
  const detachedUnit = first(/\d\s{2,}(?:mm|cm|m|km|mg|g|kg|ms|s|A|V|W|J|N|Pa|Hz)\b/u);
  if (detachedUnit) add("detached-unit-boundary", detachedUnit);

  return Object.freeze(findings);
}

function numbersAppearInText(numbers, text) {
  const available = new Set(extractNumericTokens(text));
  return numbers.every((number) => available.has(number));
}

function evaluateNumericChain(question, normalizedPromptText, normalizedType) {
  const promptNumbers = extractNumericTokens(normalizedPromptText);
  if (!NUMERIC_TYPES.has(normalizedType) || promptNumbers.length === 0) {
    return Object.freeze({
      applicable: false,
      complete: true,
      promptNumbers,
      normalizedQuestionToGivenPass: true,
      givenToSubstitutionPass: true,
      finalAnswerLinkedPass: true,
      missing: Object.freeze([]),
    });
  }

  const stepTexts = (question.steps || []).map((step) => contentToText(step?.content)).filter(Boolean);
  const explicitGiven = stepTexts.filter((text) => /(?:^|\b)(?:given|data)(?:\b|$)/iu.test(text));
  const givenText = (explicitGiven.length ? explicitGiven : stepTexts.slice(0, 1)).join(" ");
  const substitutionText = `${stepTexts.slice(explicitGiven.length ? 0 : 1).join(" ")} ${contentToText(question.finalAnswer)}`;
  const finalAnswerText = contentToText(question.finalAnswer);
  const answerText = renderedAnswerText(question);
  const finalNumbers = extractNumericTokens(finalAnswerText);
  const normalizedQuestionToGivenPass = numbersAppearInText(promptNumbers, givenText);
  const givenToSubstitutionPass = numbersAppearInText(promptNumbers, `${givenText} ${substitutionText}`);
  const finalAnswerLinkedPass = finalNumbers.length > 0 && numbersAppearInText(finalNumbers, answerText);
  const missing = [];
  if (!normalizedQuestionToGivenPass) missing.push("normalized-question-to-given-number-mismatch");
  if (!givenToSubstitutionPass) missing.push("given-to-substitution-number-mismatch");
  if (!finalAnswerLinkedPass) missing.push("final-answer-not-linked-to-worked-solution");
  return Object.freeze({
    applicable: true,
    complete: missing.length === 0,
    promptNumbers,
    normalizedQuestionToGivenPass,
    givenToSubstitutionPass,
    finalAnswerLinkedPass,
    missing: Object.freeze(missing),
  });
}

function discreteResultEvaluation(question, normalizedPromptText) {
  const applicable = new RegExp(`\\bhow\\s+many\\s+(?:${DISCRETE_NOUNS})\\b`, "iu").test(normalizedPromptText);
  if (!applicable) return Object.freeze({ applicable: false, complete: true, nonIntegralResult: false, explicitCompleteObjectRule: false });
  const finalAnswer = contentToText(question.finalAnswer);
  const answerText = renderedAnswerText(question);
  let nonIntegralResult = false;
  for (const match of finalAnswer.matchAll(/(?:\d+\s*)?\\frac\s*\{\s*(\d+)\s*\}\s*\{\s*(\d+)\s*\}/gu)) {
    const numerator = Number(match[1]);
    const denominator = Number(match[2]);
    if (denominator && numerator % denominator !== 0) nonIntegralResult = true;
  }
  if (/\b\d+\.\d+\b/u.test(finalAnswer)) nonIntegralResult = true;
  if (/\b(?:non[ -]?integral|fractional|not (?:a )?whole|does not give a whole-number)\b/iu.test(finalAnswer)) nonIntegralResult = true;
  const explicitCompleteObjectRule = /\b(?:complete|whole)\s+(?:coins?|shots?|bullets?|bottles?|people|persons?|objects?|items?|cubes?|spheres?)\b/iu.test(answerText)
    || /\b(?:round(?:ed)? down|floor|only complete objects?)\b/iu.test(answerText);
  const finalHasIntegralCount = new RegExp(`\\b\\d+\\s*(?:${DISCRETE_NOUNS})\\b`, "iu").test(finalAnswer)
    && !nonIntegralResult;
  return Object.freeze({
    applicable: true,
    complete: !nonIntegralResult || (explicitCompleteObjectRule && finalHasIntegralCount),
    nonIntegralResult,
    explicitCompleteObjectRule,
  });
}

function evaluateSourceTextIntegrity({ key, importedQuestion, normalizedQuestion, normalizedType }) {
  const importedPromptText = contentToText(importedQuestion?.prompt);
  const normalizedPromptText = contentToText(normalizedQuestion?.prompt);
  const importedNumbers = extractNumericTokens(importedPromptText);
  const normalizedNumbers = extractNumericTokens(normalizedPromptText);
  const numericContext = NUMERIC_TYPES.has(normalizedType) || importedNumbers.length >= 2;
  const importedAnomalies = detectSourceTextAnomalies(importedPromptText, { numericContext });
  const normalizedAnomalies = detectSourceTextAnomalies(normalizedPromptText, { numericContext });
  const correction = sourceCorrectionForKey(key);
  const normalizationChanged = importedPromptText !== normalizedPromptText;
  const correctionRecorded = sequenceMatchesCorrection(importedNumbers, normalizedNumbers, correction)
    || Boolean(correction && !normalizationChanged);
  const normalizedQuestionVerified = sameNumericSequence(importedNumbers, normalizedNumbers) || correctionRecorded;
  const numericChain = evaluateNumericChain(normalizedQuestion, normalizedPromptText, normalizedType);
  const discreteResult = discreteResultEvaluation(normalizedQuestion, normalizedPromptText);
  const correctionPublishApproved = !correction || correction.publishApproved === true;
  const importedAnomalyPass = importedAnomalies.length === 0 || (correctionRecorded && correctionPublishApproved);
  const sourceTextIntegrityPassed = importedAnomalyPass
    && normalizedAnomalies.length === 0
    && normalizedQuestionVerified
    && numericChain.complete
    && discreteResult.complete
    && correctionPublishApproved;
  const failures = [
    ...(!importedAnomalyPass ? importedAnomalies.map((finding) => `imported:${finding.code}`) : []),
    ...normalizedAnomalies.map((finding) => `normalized:${finding.code}`),
    ...(!normalizedQuestionVerified ? ["normalized-question-unverified"] : []),
    ...numericChain.missing,
    ...(!discreteResult.complete ? ["non-integral-discrete-result"] : []),
    ...(!correctionPublishApproved ? ["recorded-correction-pending-primary-source-review"] : []),
  ];
  return Object.freeze({
    policyVersion: POLICY_VERSION,
    correctionLedgerVersion: CORRECTION_LEDGER_VERSION,
    sourceTextIntegrityPassed,
    normalizedQuestionVerified,
    correctionRecorded,
    correctionPublishApproved,
    importedAnomalyPass,
    correctionCode: correction?.code || null,
    correctionDisposition: correction?.disposition || null,
    importedPromptText,
    normalizedPromptText,
    importedNumbers,
    normalizedNumbers,
    importedAnomalies,
    normalizedAnomalies,
    numericChain,
    discreteResult,
    failures: Object.freeze([...new Set(failures)]),
  });
}

function numericNearDuplicateTemplate(value) {
  const numbers = [];
  let normalized = String(value || "").normalize("NFKC").toLowerCase()
    .replace(/<[^>]*>/gu, " ")
    .replace(/\\times|×/gu, " x ")
    .replace(/\$+/gu, " ")
    .replace(/_{2,}/gu, " ")
    .replace(/(?<=\d)(?=\p{L})|(?<=\p{L})(?=\d)/gu, " ");
  normalized = normalized.replace(NUMBER_PATTERN, (match) => {
    numbers.push(canonicalNumber(match));
    return " # ";
  });
  const signature = normalized
    .replace(/\bdimensions\b/gu, "dimension")
    .replace(/\b(?:and|x|times)\b/gu, " ")
    .replace(/[^#\p{L}\p{M}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return Object.freeze({ signature, numbers: Object.freeze(numbers) });
}

function suspiciousDroppedOrDuplicatedDigit(left, right) {
  if (left === right) return false;
  const leftDigits = String(left).replace(/[^\d]/gu, "");
  const rightDigits = String(right).replace(/[^\d]/gu, "");
  if (!leftDigits || !rightDigits) return false;
  if (leftDigits === rightDigits && String(left) !== String(right)) return true;
  const shorter = leftDigits.length < rightDigits.length ? leftDigits : rightDigits;
  const longer = leftDigits.length < rightDigits.length ? rightDigits : leftDigits;
  if (longer.length !== shorter.length + 1 || longer.length > 5) return false;
  for (let index = 0; index < longer.length; index += 1) {
    if (`${longer.slice(0, index)}${longer.slice(index + 1)}` === shorter) return true;
  }
  return false;
}

export {
  POLICY_VERSION,
  detectSourceTextAnomalies,
  discreteResultEvaluation,
  evaluateNumericChain,
  evaluateSourceTextIntegrity,
  extractNumericTokens,
  isSourceTextIntegrityRowPassed,
  numericNearDuplicateTemplate,
  suspiciousDroppedOrDuplicatedDigit,
};
