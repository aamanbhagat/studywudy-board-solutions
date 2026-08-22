import { explicitlyRequiresStudentDiagram, questionHasRenderedDiagram } from "./question-classification.mjs";

const EMPTY_RESULT = Object.freeze({ complete: false, checks: Object.freeze({}), missing: Object.freeze([]) });

export const SUPPORTED_ANSWER_TYPES = Object.freeze([
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
]);

export function contentToText(value) {
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

export function renderedAnswerText(question) {
  if (["mcq_single", "mcq_multi", "assertion_reason"].includes(question?.type)) {
    const correctIds = new Set(question.correctChoiceIds || (question.correctChoiceId ? [question.correctChoiceId] : []));
    const selected = (question.choices || [])
      .filter((choice) => correctIds.has(choice.id))
      .map((choice) => contentToText(choice.content))
      .join(" ");
    return `${selected} ${contentToText(question.explanation)}`.trim();
  }
  if (question?.type === "numerical") {
    return `${(question.steps || []).map((step) => contentToText(step.content)).join(" ")} ${contentToText(question.finalAnswer)}`.trim();
  }
  if (question?.result) {
    return `${question.result.value ? "True" : "False"} ${contentToText(question.result.correction)} ${contentToText(question.explanation)}`.trim();
  }
  if (question?.blanks) {
    return `${question.blanks.map((blank) => contentToText(blank.answer)).join(" ")} ${contentToText(question.explanation)}`.trim();
  }
  if (question?.comparison) {
    return `${(question.comparison.rows || []).map((row) => `${contentToText(row.left)} ${contentToText(row.right)}`).join(" ")} ${contentToText(question.explanation)}`.trim();
  }
  if (question?.matches) {
    const matches = question.matches.map((match) => {
      const left = question.left?.find((item) => item.id === match.leftId);
      const right = question.right?.find((item) => item.id === match.rightId);
      return `${contentToText(left?.content || match.leftId)} ${contentToText(right?.content || match.rightId)}`;
    }).join(" ");
    return `${matches} ${contentToText(question.explanation)}`.trim();
  }
  if (question?.type === "passage" && question.subQuestions) return question.subQuestions.map(renderedAnswerText).join(" ");
  return `${contentToText(question?.answer)} ${contentToText(question?.answers)} ${contentToText(question?.finalAnswer)} ${contentToText(question?.explanation)} ${(question?.steps || []).map((step) => contentToText(step.content)).join(" ")}`.trim();
}

export function lexicalTokens(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-IN")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\\(?:begin|end)\{[^}]+\}|\\[a-z]+/giu, " ")
    .replace(/\{\{blank-\d+\}\}/giu, " ");
  return normalized.match(/[\p{L}\p{M}\p{N}]+/gu) || [];
}

export function normalizeIntent(value) {
  return lexicalTokens(value).join(" ");
}

function hasUnresolvedContent(value) {
  return /(?:\b(?:todo|tbd|lorem ipsum|answer goes here|not available)\b|\[insert[^\]]*\]|\{\{(?!blank-\d+\}\})[^}]+\}\})/iu.test(String(value || ""));
}

function hasUsefulContext(question, directAnswer = "") {
  const promptTokens = new Set(lexicalTokens(contentToText(question.prompt)));
  const context = `${contentToText(question.explanation)} ${(question.steps || []).map((step) => contentToText(step.content)).join(" ")} ${contentToText(question.finalAnswer)} ${contentToText(question.answer)}`.trim();
  if (!context || hasUnresolvedContent(context)) return false;
  const direct = normalizeIntent(directAnswer);
  if (normalizeIntent(context) === direct) return false;
  return lexicalTokens(context).some((token) => !promptTokens.has(token));
}

function hasSentenceContext(value) {
  const text = String(value || "").trim();
  return /[.!?;:]\s*$|\b(?:because|therefore|means|refers to|so that|which|whereas|hence)\b/iu.test(text);
}

function result(kind, checks) {
  const missing = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { kind, complete: missing.length === 0, checks, missing };
}

export function equationsAreReadable(question) {
  const text = JSON.stringify(question ?? {});
  if (hasUnresolvedContent(text)) return false;
  const paired = [
    ["$$", "$$"],
    ["\\(", "\\)"],
    ["\\[", "\\]"],
  ];
  for (const [open, close] of paired) {
    const openings = text.split(open).length - 1;
    const closings = text.split(close).length - 1;
    if (open === close ? openings % 2 !== 0 : openings !== closings) return false;
  }
  let braces = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] === "{") braces += 1;
    if (text[index] === "}") braces -= 1;
    if (braces < 0) return false;
  }
  return braces === 0;
}

export function simpleArithmeticIsAccurate(question) {
  const text = contentToText(question).replaceAll(",", "").replaceAll("×", "*").replaceAll("÷", "/");
  const calculations = [...text.matchAll(/(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)\s*=\s*(-?\d+(?:\.\d+)?)/gu)];
  return calculations.every((match) => {
    const left = Number(match[1]);
    const right = Number(match[3]);
    const statedLiteral = match[4];
    const stated = Number(statedLiteral);
    let calculated;
    if (match[2] === "+") calculated = left + right;
    else if (match[2] === "-") calculated = left - right;
    else if (match[2] === "*") calculated = left * right;
    else calculated = right === 0 ? Number.NaN : left / right;
    const statedDecimals = statedLiteral.includes(".") ? statedLiteral.split(".")[1].length : 0;
    const roundingTolerance = statedDecimals > 0 ? 0.5 * (10 ** -statedDecimals) : 0;
    const tolerance = Math.max(1e-9, Math.abs(calculated) * 1e-6, roundingTolerance + 1e-12);
    return Number.isFinite(calculated) && Math.abs(calculated - stated) <= tolerance;
  });
}

function correctChoiceState(question) {
  const choices = question.choices || [];
  const correctIds = question.correctChoiceIds || (question.correctChoiceId ? [question.correctChoiceId] : []);
  const knownIds = new Set(choices.map((choice) => choice.id));
  return {
    choices,
    correctIds,
    valid: choices.length > 1 && correctIds.length > 0 && correctIds.every((id) => knownIds.has(id)),
  };
}

function hasDistractorReasoning(question, choiceState) {
  const incorrect = choiceState.choices.filter((choice) => !choiceState.correctIds.includes(choice.id));
  if (incorrect.some((choice) => contentToText(choice.explanation || choice.reason))) return true;
  if (question.distractorExplanations && Object.keys(question.distractorExplanations).length) return true;
  const explanation = contentToText(question.explanation);
  if (/\b(?:incorrect|not correct|not applicable|unlike|whereas|however|rather than|tempting|confus|distractor)\w*\b/iu.test(explanation)) return true;
  return incorrect.some((choice) => {
    const choiceText = normalizeIntent(contentToText(choice.content));
    return choiceText && normalizeIntent(explanation).includes(choiceText);
  });
}

export function checkCorrectChoiceReasoningAndDistractors(question) {
  const choiceState = correctChoiceState(question);
  const explanation = contentToText(question.explanation);
  return result(question.type, {
    correctChoice: choiceState.valid,
    governingPrincipleAndReasoning: Boolean(explanation) && hasUsefulContext(question, choiceState.correctIds.join(" ")) && hasSentenceContext(explanation),
    distractorReasoning: hasDistractorReasoning(question, choiceState),
    readableEquations: equationsAreReadable(question),
  });
}

function directAnswer(question) {
  if (question.blanks) return question.blanks.map((blank) => contentToText(blank.answer)).join(" ");
  return `${contentToText(question.answer)} ${contentToText(question.answers)} ${contentToText(question.finalAnswer)}`.trim();
}

export function checkDirectAnswerAndShortContext(question) {
  const answer = directAnswer(question);
  const context = `${contentToText(question.explanation)} ${(question.steps || []).map((step) => contentToText(step.content)).join(" ")}`.trim();
  return result(question.type, {
    directAnswer: Boolean(answer) && !hasUnresolvedContent(answer),
    shortContext: Boolean(context) ? hasUsefulContext(question, answer) : hasSentenceContext(answer) && hasUsefulContext(question),
    readableEquations: equationsAreReadable(question),
  });
}

export function checkRequiredPointsAndTerminology(question) {
  const answer = directAnswer(question) || renderedAnswerText(question);
  const requiresReason = question.type === "give_reason" || /^\s*(?:why|give reasons?|justify|explain why)\b/iu.test(contentToText(question.prompt));
  const combined = `${answer} ${(question.steps || []).map((step) => contentToText(step.content)).join(" ")}`;
  const causal = /\b(?:because|therefore|thereby|thus|hence|owing to|due to|as a result|so that)\b/iu.test(combined);
  return result(question.type, {
    directAnswer: Boolean(answer) && !hasUnresolvedContent(answer),
    requiredPoints: hasUsefulContext(question, answer) || hasSentenceContext(answer),
    terminology: lexicalTokens(answer).some((token) => !new Set(lexicalTokens(contentToText(question.prompt))).has(token)),
    reasoning: !requiresReason || causal,
    readableEquations: equationsAreReadable(question),
  });
}

export function checkFormulaSubstitutionUnitsArithmeticAndFinal(question) {
  const steps = (question.steps || []).map((step) => contentToText(step.content)).join(" ");
  const finalAnswer = contentToText(question.finalAnswer);
  const combined = `${steps} ${finalAnswer}`;
  const formula = /(?:\$|\\(?:frac|sqrt|times|div|cdot)|[A-Za-z][A-Za-z\d_]*\s*=)/u.test(combined);
  const substitution = /\d(?:[\d.,]*)(?:\s*[+\-*/×÷^=]|\s*\\(?:times|div|cdot|frac))/u.test(steps);
  const units = /(?:\d[\d.,]*\s*(?:°[CF]|%|(?:m|cm|mm|km|kg|g|mg|s|ms|min|h|K|mol|A|V|W|J|N|Pa|Hz|C|L|mL|rad|sr)(?:\^?\d+|[²³])?(?:\s*[/·]\s*(?:s|m|cm|kg|mol)(?:\^?\d+|[²³])?)?\b))/u.test(combined);
  const arithmetic = /(?:=\s*[-+]?\d|\d\s*[+\-*/×÷^]\s*\d)/u.test(steps);
  return result(question.type, {
    formula,
    substitution,
    units,
    arithmetic,
    arithmeticAccuracy: simpleArithmeticIsAccurate(question),
    finalAnswer: Boolean(finalAnswer) && !hasUnresolvedContent(finalAnswer),
    readableEquations: equationsAreReadable(question),
  });
}

export function checkAssumptionsStepsEquationsAndConclusion(question) {
  const steps = question.steps || [];
  const text = `${steps.map((step) => contentToText(step.content)).join(" ")} ${contentToText(question.finalAnswer)}`;
  return result("derivation", {
    assumptions: /\b(?:assume|assuming|given|let|condition|where)\b/iu.test(text),
    orderedSteps: steps.length >= 2,
    equations: /(?:\$|\\(?:frac|sqrt|begin)|=|→|⇒)/u.test(text),
    conclusion: Boolean(contentToText(question.finalAnswer)) || /\b(?:therefore|thus|hence|proved|derived|conclusion)\b/iu.test(text),
    readableEquations: equationsAreReadable(question),
  });
}

function diagramObjects(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) diagramObjects(item, output);
    return output;
  }
  if (value.kind === "image" || value.src || value.imageUrl || value.diagramUrl
    || (value.url && (value.alt || value.caption || value.width || value.height || value.fallbackUrl))) output.push(value);
  for (const nested of Object.values(value)) diagramObjects(nested, output);
  return output;
}

export function renderableWorkedSteps(question) {
  return (question?.steps || []).filter((step) => Boolean(contentToText(step?.content).trim()));
}

function structuredComparisonHasBothSidesAndDimensions(question) {
  const rows = question?.comparison?.rows || [];
  if (rows.length >= 2 && rows.every((row) => contentToText(row.left).trim() && contentToText(row.right).trim())) return true;
  const values = [question?.answer, question?.finalAnswer, question?.explanation];
  return values.some((value) => value?.kind === "blocks" && (value.blocks || []).some((block) => (
    block.kind === "table"
    && (block.headers || []).length >= 2
    && (block.rows || []).length >= 2
    && block.rows.every((row) => (row || []).filter((cell) => contentToText(cell).trim()).length >= 2)
  )));
}

export function evaluatePromptRequirements(question) {
  const prompt = contentToText(question?.prompt);
  const answerText = renderedAnswerText(question);
  const steps = renderableWorkedSteps(question);
  const stepTexts = steps.map((step) => contentToText(step.content));
  const requestsDiagram = explicitlyRequiresStudentDiagram(question);
  const requestsWorking = /\b(?:show|give|write)\s+(?:all\s+|the\s+|your\s+)?work(?:ing|ings)\b/iu.test(prompt);
  const requestsComparison = /\b(?:compare|distinguish|differentiate)\b/iu.test(prompt);
  const requestsReason = question?.type === "give_reason" || /\b(?:give|state|write)\s+(?:a\s+|the\s+)?reasons?\b|^\s*why\b/iu.test(prompt);
  const requestsDerivation = /\b(?:derive|derivation|prove|show\s+that|deduce)\b/iu.test(prompt);
  const calculationStepCount = stepTexts.filter((text) => (
    /(?:=|→|⇒)/u.test(text)
    && /(?:\d|\\(?:frac|sqrt|int)|[+\-*/×÷^])/u.test(text)
  )).length;
  const derivationEquationCount = [...stepTexts, contentToText(question?.finalAnswer)]
    .filter((text) => /(?:=|→|⇒|\\(?:frac|sqrt|int|sum))/u.test(text)).length;
  const causal = /\b(?:because|therefore|thereby|thus|hence|owing to|due to|as a result|so that|consequently)\b/iu.test(answerText);
  const conclusion = Boolean(contentToText(question?.finalAnswer).trim())
    || /\b(?:therefore|thus|hence|proved|derived|as required|conclusion)\b/iu.test(answerText);
  const checks = {
    renderedWorkedStepCountMatchesSource: steps.length === (question?.steps || []).length,
    promptDiagramRendered: !requestsDiagram || questionHasRenderedDiagram(question),
    promptWorkingHasMultipleCalculations: !requestsWorking || calculationStepCount >= 2,
    promptComparisonCoversBothSidesAndDimensions: !requestsComparison || structuredComparisonHasBothSidesAndDimensions(question),
    promptReasonIsCausal: !requestsReason || causal,
    promptDerivationIsOrdered: !requestsDerivation || steps.length >= 2,
    promptDerivationHasEquationSequence: !requestsDerivation || derivationEquationCount >= 2,
    promptDerivationHasConclusion: !requestsDerivation || conclusion,
  };
  const missing = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return Object.freeze({
    complete: missing.length === 0,
    checks: Object.freeze(checks),
    missing: Object.freeze(missing),
    requested: Object.freeze({ diagram: requestsDiagram, working: requestsWorking, comparison: requestsComparison, reason: requestsReason, derivation: requestsDerivation }),
    renderedWorkedStepCount: steps.length,
  });
}

export function checkDiagramLabelsAltTextAndExplanation(question) {
  const diagrams = diagramObjects(question?.solutionMedia ?? question?.diagram);
  const labels = question.labels || question.diagram?.labels || question.labelledParts || [];
  return result(question.type, {
    diagram: diagrams.length > 0,
    labels: Array.isArray(labels) && labels.length > 0,
    altText: diagrams.some((diagram) => Boolean(contentToText(diagram.alt || diagram.altText || diagram.description))),
    explanation: hasUsefulContext(question, directAnswer(question)),
    readableEquations: equationsAreReadable(question),
  });
}

function hasStructuredCoverage(question) {
  if ((question.steps || []).length >= 2) return true;
  const values = [question.answer, question.finalAnswer];
  return values.some((value) => value?.kind === "paragraphs" && (value.paragraphs || []).length >= 2)
    || values.some((value) => value?.kind === "blocks" && (value.blocks || []).some((block) => ["list", "table"].includes(block.kind)));
}

export function checkCoverageStructureAccuracyAndExamFit(question) {
  const answer = directAnswer(question) || renderedAnswerText(question);
  return result("long_answer", {
    coverage: hasUsefulContext(question, answer),
    structure: hasStructuredCoverage(question),
    accuracyGuard: Boolean(answer) && !hasUnresolvedContent(answer) && equationsAreReadable(question),
    examFit: Boolean(contentToText(question.finalAnswer)) || hasStructuredCoverage(question),
  });
}

function checkTrueFalse(question) {
  const hasResult = typeof question.result?.value === "boolean";
  const context = `${contentToText(question.result?.correction)} ${contentToText(question.explanation)}`.trim();
  return result(question.type, {
    verdict: hasResult,
    correctionOrReason: Boolean(context) && hasUsefulContext(question, hasResult ? String(question.result.value) : ""),
    readableEquations: equationsAreReadable(question),
  });
}

function checkMatching(question) {
  const leftIds = new Set((question.left || []).map((item) => item.id));
  const rightIds = new Set((question.right || []).map((item) => item.id));
  const matches = question.matches || [];
  return result(question.type, {
    completeMapping: leftIds.size > 0 && matches.length === leftIds.size && matches.every((match) => leftIds.has(match.leftId) && rightIds.has(match.rightId)),
    context: hasUsefulContext(question, renderedAnswerText(question)),
    readableEquations: equationsAreReadable(question),
  });
}

function checkComparison(question) {
  const rows = question.comparison?.rows || [];
  return result(question.type, {
    comparedRows: rows.length > 0 && rows.every((row) => contentToText(row.left) && contentToText(row.right)),
    explanation: hasUsefulContext(question, renderedAnswerText(question)),
    readableEquations: equationsAreReadable(question),
  });
}

function isDerivation(question) {
  return question.type === "detailed" && /\b(?:derive|derivation|prove|show that|deduce)\b/iu.test(contentToText(question.prompt));
}

export function answerKindFor(question) {
  if (!question || typeof question !== "object") return "unknown";
  if (["mcq_single", "mcq_multi", "assertion_reason"].includes(question.type)) return question.type;
  if (question.type === "one_word") return "one_word";
  if (question.type === "fill_blank" || /(?:_{2,}|\{\{blank-\d+\}\})/u.test(contentToText(question.prompt))) return "fill_blank";
  if (["one_sentence", "brief", "define", "name_list"].includes(question.type)) return "short_answer";
  if (question.type === "give_reason") return "give_reason";
  if (question.type === "numerical") return "numerical";
  if (isDerivation(question)) return "derivation";
  if (question.type === "diagram") return "diagram";
  if (question.type === "detailed") return "long_answer";
  return question.type || "unknown";
}

export function evaluateAnswerCompleteness(question) {
  if (!question || typeof question !== "object") return { kind: "unknown", ...EMPTY_RESULT, missing: ["answerRecord"] };
  const kind = answerKindFor(question);
  const asKind = (gateResult) => ({ ...gateResult, kind });
  let gateResult;
  switch (kind) {
    case "mcq_single":
    case "mcq_multi":
    case "assertion_reason":
      gateResult = asKind(checkCorrectChoiceReasoningAndDistractors(question));
      break;
    case "one_word":
    case "fill_blank":
      gateResult = asKind(checkDirectAnswerAndShortContext(question));
      break;
    case "short_answer":
    case "give_reason":
      gateResult = asKind(checkRequiredPointsAndTerminology(question));
      break;
    case "numerical":
      gateResult = asKind(checkFormulaSubstitutionUnitsArithmeticAndFinal(question));
      break;
    case "derivation":
      gateResult = asKind(checkAssumptionsStepsEquationsAndConclusion(question));
      break;
    case "diagram":
      gateResult = asKind(checkDiagramLabelsAltTextAndExplanation(question));
      break;
    case "long_answer":
      gateResult = asKind(checkCoverageStructureAccuracyAndExamFit(question));
      break;
    case "true_false":
      gateResult = asKind(checkTrueFalse(question));
      break;
    case "match_column":
      gateResult = asKind(checkMatching(question));
      break;
    case "distinguish":
      gateResult = asKind(checkComparison(question));
      break;
    case "passage": {
      const subResults = (question.subQuestions || []).map(evaluateAnswerCompleteness);
      gateResult = result(kind, {
        passageContext: Boolean(contentToText(question.passage || question.prompt)),
        subQuestions: subResults.length > 0 && subResults.every((subResult) => subResult.complete),
        readableEquations: equationsAreReadable(question),
      });
      break;
    }
    default:
      gateResult = result(kind, { recognizedAnswerType: false });
  }
  const promptRequirements = evaluatePromptRequirements(question);
  return result(kind, { ...gateResult.checks, ...promptRequirements.checks });
}

export function encodeFlagBitset(records, maximumRowId, flag = "gatePassed") {
  const bytes = new Uint8Array(Math.ceil(Number(maximumRowId) / 8));
  for (const record of records) {
    if (!record[flag]) continue;
    const index = Number(record.rowId) - 1;
    if (!Number.isSafeInteger(index) || index < 0 || index >= Number(maximumRowId)) throw new Error(`Invalid row id for indexability bitset: ${record.rowId}`);
    bytes[index >> 3] |= 1 << (index & 7);
  }
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

export function encodeIndexabilityBitset(records, maximumRowId) {
  return encodeFlagBitset(records, maximumRowId, "gatePassed");
}

const BITSET_CACHE = new WeakMap();

function decodedBitset(manifest, property = "indexabilityBitsetBase64") {
  if (!manifest || typeof manifest !== "object") return null;
  const cached = BITSET_CACHE.get(manifest) || new Map();
  if (cached.has(property)) return cached.get(property);
  const encoded = manifest[property];
  if (typeof encoded !== "string" || !encoded) return null;
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  cached.set(property, bytes);
  BITSET_CACHE.set(manifest, cached);
  return bytes;
}

export function isQuestionRowIndexable(manifest, rowId) {
  const index = Number(rowId) - 1;
  if (!Number.isSafeInteger(index) || index < 0 || index >= Number(manifest?.maximumRowId || 0)) return false;
  const bytes = decodedBitset(manifest);
  return Boolean(bytes && (bytes[index >> 3] & (1 << (index & 7))));
}

export function isQuestionEquationReviewPending(manifest, rowId) {
  const index = Number(rowId) - 1;
  if (!Number.isSafeInteger(index) || index < 0 || index >= Number(manifest?.maximumRowId || 0)) return false;
  const bytes = decodedBitset(manifest, "equationReviewBitsetBase64");
  return Boolean(bytes && (bytes[index >> 3] & (1 << (index & 7))));
}

export function isQuestionRenderedDiagramAvailable(manifest, rowId) {
  const index = Number(rowId) - 1;
  if (!Number.isSafeInteger(index) || index < 0 || index >= Number(manifest?.maximumRowId || 0)) return false;
  const bytes = decodedBitset(manifest, "renderedDiagramBitsetBase64");
  return Boolean(bytes && (bytes[index >> 3] & (1 << (index & 7))));
}
