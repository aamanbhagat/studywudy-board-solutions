import { contentToText } from "./answer-completeness.mjs";
import { normalizedQuestionType } from "./question-classification.mjs";

const STEP_BY_STEP_TYPES = new Set(["numerical", "derivation"]);

function questionPromptText(question) {
  return contentToText(question?.prompt ?? question?.prompt_text)
    .normalize("NFKC")
    .replace(/<[^>]*>/gu, " ")
    .replace(/[*_`]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function questionNeedsStepByStepSolution(question, route = {}) {
  const subject = String(
    route.subject
      ?? route.subjectSlug
      ?? question?.subject_slug
      ?? question?.subjectSlug
      ?? question?.subject_name
      ?? "",
  ).normalize("NFKC").toLocaleLowerCase("en-IN");
  if (/\b(?:math|maths|mathematics)\b/u.test(subject)) return true;
  if (STEP_BY_STEP_TYPES.has(normalizedQuestionType(question))) return true;
  if (Array.isArray(question?.steps) && question.steps.length > 0) return true;

  const prompt = questionPromptText(question);
  if (/\bstep[- ]by[- ]step\b/iu.test(prompt)) return true;
  return /^(?:calculate|compute|solve|derive|prove|show\s+that|evaluate|simplify|factor(?:ise|ize)|construct|plot|work\s+out)\b/iu.test(prompt);
}

export function questionSolutionLabel(question, route = {}) {
  return questionNeedsStepByStepSolution(question, route) ? "Step-by-step solution" : "Solution";
}
