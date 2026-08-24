import { contentToText } from "./answer-completeness.mjs";

// Imported textbooks represent blanks with underscores, dot leaders, ellipses,
// or an explicit "blank" token. This runs only for records already classified
// as fill-in-the-blank questions, so dot leaders are safe to interpret here.
const BLANK_MARKER = /_{2,}|\[\s*blank\s*\]|\(\s*blank\s*\)|\.{2,}|(?:\.\s+){2,}|…+/giu;
const INSTRUCTION = /^\s*(?:\*\*\s*fill\s+in\s+the\s+blanks?\s*:?\s*\*\*|__\s*fill\s+in\s+the\s+blanks?\s*:?\s*__|fill\s+in\s+the\s+blanks?\s*:?)\s*/iu;

function plainAnswerText(value) {
  return contentToText(value)
    .replace(/\*\*|__/gu, "")
    .replace(/(?<!\w)[*_](?=\S)|(?<=\S)[*_](?!\w)/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function correctChoiceAnswer(question) {
  const ids = new Set(
    (question?.correctChoiceIds || (question?.correctChoiceId ? [question.correctChoiceId] : []))
      .map((id) => String(id).toLocaleLowerCase("en-IN")),
  );
  const choice = (question?.choices || []).find((item) => ids.has(String(item?.id || "").toLocaleLowerCase("en-IN")));
  return choice?.content ?? "";
}

function flexibleLiteral(value) {
  return String(value || "")
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")
    .replace(/\s+/gu, "\\s+");
}

function answersFromCompletedSentence(parts, answerText) {
  if (!answerText || parts.length < 2) return [];
  let pattern = "^\\s*";
  for (let index = 0; index < parts.length; index += 1) {
    const literal = flexibleLiteral(parts[index]);
    if (literal) pattern += literal;
    if (index < parts.length - 1) pattern += "\\s*(.+?)\\s*";
  }
  pattern += "\\s*$";
  const match = answerText.match(new RegExp(pattern, "iu"));
  return match ? match.slice(1).map((value) => value.trim()).filter(Boolean) : [];
}

function storedAnswers(question, blankCount, rawAnswer, answerText, parts) {
  const completed = answersFromCompletedSentence(parts, answerText);
  if (completed.length === blankCount) return completed;

  const emphasized = [...contentToText(rawAnswer).matchAll(/\*\*([^*]+?)\*\*|__([^_]+?)__/gu)]
    .map((match) => plainAnswerText(match[1] || match[2]));
  if (emphasized.length === blankCount) return emphasized;

  const structured = (question?.blanks || []).map((blank) => plainAnswerText(blank?.answer ?? blank)).filter(Boolean);
  if (structured.length >= blankCount) return structured.slice(0, blankCount);
  const listed = (question?.answers || []).map(plainAnswerText).filter(Boolean);
  if (listed.length >= blankCount) return listed.slice(0, blankCount);

  if (blankCount === 1 && answerText && answerText.split(/\s+/u).length <= 12) return [answerText];
  if (blankCount > 1 && answerText) {
    const split = answerText
      .replace(/^answers?\s*:\s*/iu, "")
      .split(/\s*(?:,|;|\|)\s*/u)
      .map((value) => value.replace(/^and\s+/iu, "").trim())
      .filter(Boolean);
    if (split.length >= blankCount) return split.slice(0, blankCount);
  }
  return [];
}

function wordCharacter(value, fromEnd = false) {
  const source = String(value || "");
  const character = fromEnd ? source.trimEnd().at(-1) : source.trimStart().at(0);
  return Boolean(character && /[\p{L}\p{N}]/u.test(character));
}

export function buildCompletedFillBlank(question) {
  const prompt = contentToText(question?.prompt ?? question?.prompt_text).replace(INSTRUCTION, "").trim();
  const blankCount = (prompt.match(BLANK_MARKER) || []).length;
  if (!prompt || !blankCount) return null;

  const directAnswer = question?.answer ?? question?.finalAnswer ?? "";
  const rawAnswer = plainAnswerText(directAnswer) ? directAnswer : correctChoiceAnswer(question);
  const answerText = plainAnswerText(rawAnswer);
  const parts = prompt.split(BLANK_MARKER);
  const answers = storedAnswers(question, blankCount, rawAnswer, answerText, parts);
  if (answers.length !== blankCount || answers.some((answer) => !answer)) return null;

  const repairedParts = [...parts];
  for (let index = 0; index < answers.length; index += 1) {
    if (!/\s$/u.test(repairedParts[index]) && wordCharacter(repairedParts[index], true) && wordCharacter(answers[index])) repairedParts[index] += " ";
    if (!/^\s/u.test(repairedParts[index + 1]) && wordCharacter(answers[index], true) && wordCharacter(repairedParts[index + 1])) repairedParts[index + 1] = ` ${repairedParts[index + 1]}`;
  }

  return Object.freeze({
    parts: Object.freeze(repairedParts),
    answers: Object.freeze(answers),
  });
}
