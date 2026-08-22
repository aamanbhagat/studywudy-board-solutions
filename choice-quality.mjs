import { contentToText } from "./answer-completeness.mjs";
import { createSearchExcerpt } from "./search-excerpt.mjs";

export function normalizedChoiceContent(choice) {
  return createSearchExcerpt(contentToText(choice?.content))
    .normalize("NFKC")
    .toLocaleLowerCase("en-IN")
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function questionHasDuplicateOptions(question) {
  const choices = Array.isArray(question?.choices) ? question.choices : [];
  if (choices.length < 2) return false;
  const normalized = choices.map(normalizedChoiceContent);
  return normalized.some((choice) => !choice) || new Set(normalized).size !== normalized.length;
}
