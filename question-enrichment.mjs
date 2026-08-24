import { contentToText } from "./answer-completeness.mjs";

export const QUESTION_ENRICHMENT_POLICY_VERSION = "source-bounded-supplement-v1";

function cleanText(value, maximum = 8_000) {
  const text = contentToText(value)
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t ]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  return [...text].slice(0, maximum).join("").trim();
}

function cleanList(value, maximumItems, maximumLength) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maximumLength))
    .filter(Boolean)
    .filter((item, index, values) => values.indexOf(item) === index)
    .slice(0, maximumItems);
}

function choiceExplanationEntries(value) {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.entries(value).map(([choiceId, explanation]) => ({ choice_id: choiceId, explanation }))
      : [];
  const seen = new Set();
  return entries.flatMap((entry) => {
    const choiceId = cleanText(entry?.choice_id ?? entry?.choiceId ?? entry?.id, 48).toLocaleLowerCase("en-IN");
    const explanation = cleanText(entry?.explanation ?? entry?.reason ?? entry?.content, 1_200);
    if (!choiceId || !explanation || seen.has(choiceId)) return [];
    seen.add(choiceId);
    return [{ choiceId, explanation }];
  }).slice(0, 12);
}

export function normalizeQuestionEnrichment(value) {
  if (!value || typeof value !== "object") return null;
  const normalized = {
    conceptExplanation: cleanText(value.concept_explanation ?? value.conceptExplanation, 8_000),
    reasoningSteps: cleanList(value.reasoning_steps ?? value.reasoningSteps, 12, 1_200),
    choiceExplanations: choiceExplanationEntries(value.choice_explanations ?? value.choiceExplanations),
    commonMistake: cleanText(value.common_mistake ?? value.commonMistake, 1_500),
    examTip: cleanText(value.exam_tip ?? value.examTip, 1_500),
    confidence: Number(value.confidence ?? 0),
    provenance: cleanText(value.provenance, 240),
  };
  if (!Number.isFinite(normalized.confidence)) normalized.confidence = 0;
  normalized.confidence = Math.max(0, Math.min(1, normalized.confidence));
  const hasContent = normalized.conceptExplanation
    || normalized.reasoningSteps.length
    || normalized.choiceExplanations.length
    || normalized.commonMistake
    || normalized.examTip;
  return hasContent ? Object.freeze(normalized) : null;
}

function joinedExplanation(question, enrichment) {
  const original = cleanText(question?.explanation);
  const supplement = enrichment?.conceptExplanation || "";
  if (!supplement) return question?.explanation;
  if (!original) return supplement;
  if (original.includes(supplement) || supplement.includes(original)) return original.length >= supplement.length ? original : supplement;
  return `${original}\n\n${supplement}`;
}

export function applyQuestionEnrichmentForQuality(question, rawEnrichment) {
  const enrichment = normalizeQuestionEnrichment(rawEnrichment);
  if (!question || !enrichment) return question;
  const choiceExplanationMap = new Map(enrichment.choiceExplanations.map((entry) => [entry.choiceId, entry.explanation]));
  const choices = Array.isArray(question.choices)
    ? question.choices.map((choice) => {
      const explanation = choiceExplanationMap.get(String(choice.id || "").toLocaleLowerCase("en-IN"));
      return explanation && !cleanText(choice.explanation || choice.reason)
        ? { ...choice, explanation }
        : choice;
    })
    : question.choices;
  const existingSteps = Array.isArray(question.steps) ? question.steps : [];
  const supplementalSteps = enrichment.reasoningSteps.map((content, index) => ({
    id: `supplement-${index + 1}`,
    label: `Reasoning ${index + 1}`,
    content,
    supplemental: true,
  }));
  const distractorExplanations = Object.fromEntries(enrichment.choiceExplanations.map((entry) => [entry.choiceId, entry.explanation]));
  return {
    ...question,
    choices,
    explanation: joinedExplanation(question, enrichment),
    steps: supplementalSteps.length ? [...existingSteps, ...supplementalSteps] : question.steps,
    distractorExplanations: Object.keys(distractorExplanations).length
      ? { ...(question.distractorExplanations || {}), ...distractorExplanations }
      : question.distractorExplanations,
    commonMistake: question.commonMistake || enrichment.commonMistake || undefined,
    examTip: question.examTip || enrichment.examTip || undefined,
    studywudySupplement: enrichment,
  };
}

export function questionEnrichmentHasPublishableContent(rawEnrichment) {
  const enrichment = normalizeQuestionEnrichment(rawEnrichment);
  return Boolean(
    enrichment
    && enrichment.confidence >= 0.88
    && (enrichment.conceptExplanation || enrichment.reasoningSteps.length || enrichment.choiceExplanations.length)
  );
}
