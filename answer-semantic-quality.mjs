export const ANSWER_SEMANTIC_QUALITY_POLICY_VERSION = "post-generation-semantic-v1";

function textContent(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textContent).join(" ");
  if (typeof value !== "object") return String(value);
  if (value.kind === "rich") return (value.segments || []).map((segment) => segment?.text || "").join(" ");
  if (value.kind === "paragraphs") return (value.paragraphs || []).join(" ");
  if (value.kind === "blocks") {
    return (value.blocks || []).map((block) => {
      if (block?.kind === "paragraph") return block.text || "";
      if (block?.kind === "list") return (block.items || []).join(" ");
      if (block?.kind === "table") return [...(block.headers || []), ...(block.rows || []).flat()].join(" ");
      return block?.code || "";
    }).join(" ");
  }
  return Object.values(value).map(textContent).join(" ");
}

function normalize(value) {
  return textContent(value)
    .normalize("NFKC")
    .replace(/<[^>]*>/gu, " ")
    .replace(/[*_`$]/gu, " ")
    .replace(/\\[A-Za-z]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function tokens(value) {
  return normalize(value).toLocaleLowerCase("en-IN").match(/[\p{L}\p{M}\p{N}]+/gu) || [];
}

function mcqChoiceState(question) {
  const choices = Array.isArray(question?.choices) ? question.choices : [];
  const correctIds = new Set(question?.correctChoiceIds || (question?.correctChoiceId ? [question.correctChoiceId] : []));
  const correct = choices.filter((choice) => correctIds.has(choice?.id));
  const incorrect = choices.filter((choice) => !correctIds.has(choice?.id));
  return { choices, correct, incorrect };
}

function selectedChoiceIsExplained(question, explanation) {
  const { correct } = mcqChoiceState(question);
  if (!correct.length) return false;
  const explanationTokens = new Set(tokens(explanation));
  return correct.every((choice) => {
    const choiceTokens = tokens(choice?.content).filter((token) => token.length > 1);
    return choiceTokens.length === 0 || choiceTokens.some((token) => explanationTokens.has(token));
  });
}

function hasOptionSpecificReasoning(question, explanation) {
  const explanationTokens = tokens(explanation);
  if (explanationTokens.length < 8 || !selectedChoiceIsExplained(question, explanation)) return false;
  const sourceTokens = new Set(tokens(`${normalize(question?.prompt)} ${(question?.choices || []).map((choice) => normalize(choice?.content)).join(" ")}`));
  const additional = new Set(explanationTokens.filter((token) => !sourceTokens.has(token)));
  return additional.size >= 4 && /[.!?]\s*$|\b(?:because|since|therefore|whereas|while|so|means|located|inside|outside|unlike)\b/iu.test(explanation);
}

function hasRepeatedOrJoinedClause(value) {
  const text = normalize(value).toLocaleLowerCase("en-IN");
  if (!text) return true;
  if (/\b([\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+){2,7})\s+\1\b/iu.test(text)) return true;
  const rawClauses = text.split(/[.!?;]|\b(?:while|whereas|however|but|because|since|therefore)\b/gu);
  if (rawClauses.some((clause) => /\b(?:is|are|was|were)\s+(?:an?\s+)?[^,]{1,54}\s+\b(?:is|are|was|were)\s+(?:an?\s+)?/u.test(clause))) return true;
  const clauses = rawClauses
    .map((clause) => clause.replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").replace(/\s+/gu, " ").trim())
    .filter((clause) => clause.split(" ").length >= 4);
  return clauses.some((clause, index) => clauses.slice(index + 1).some((other) => clause === other));
}

function hasContradictoryPredicate(value) {
  const text = normalize(value).toLocaleLowerCase("en-IN");
  const contradictions = [
    ["internal", "external"],
    ["inside", "outside"],
    ["true", "false"],
    ["increases", "decreases"],
    ["positive", "negative"],
  ];
  return contradictions.some(([left, right]) => (
    new RegExp(`\\b${left}\\b[^.!?]{0,34}\\b(?:is|are|means|becomes)\\b[^.!?]{0,18}\\b${right}\\b`, "iu").test(text)
    || new RegExp(`\\b${right}\\b[^.!?]{0,34}\\b(?:is|are|means|becomes)\\b[^.!?]{0,18}\\b${left}\\b`, "iu").test(text)
  ));
}

function hasDuplicatedEnding(value) {
  const words = tokens(value);
  for (let length = 2; length <= Math.min(10, Math.floor(words.length / 2)); length += 1) {
    if (words.slice(-length).join(" ") === words.slice(-(length * 2), -length).join(" ")) return true;
  }
  return false;
}

function basicGrammarAndReadability(value) {
  const text = normalize(value);
  if (tokens(text).length < 5) return false;
  if (/(?:\b(?:undefined|nan)\b|\[object object\]|\.{4,}|\?{3,}|!{3,})/iu.test(text)) return false;
  if (/\b(?:a|an|the|of|in|to|for|with|at|by|from)\s*[.?!]?$/iu.test(text)) return false;
  if (/\ba\s+[aeiou][\p{L}-]*/iu.test(text)) return false;
  return true;
}

function answerText(question) {
  if (["mcq_single", "mcq_multi", "assertion_reason"].includes(question?.type)) return normalize(question?.explanation);
  return normalize(`${textContent(question?.answer)} ${textContent(question?.answers)} ${textContent(question?.finalAnswer)} ${textContent(question?.explanation)} ${(question?.steps || []).map((step) => textContent(step?.content)).join(" ")}`);
}

export function evaluatePostGenerationAnswerQuality(question) {
  const answer = answerText(question);
  const isMcq = ["mcq_single", "mcq_multi", "assertion_reason"].includes(question?.type);
  const checks = Object.freeze({
    repeatedOrJoinedClauses: !hasRepeatedOrJoinedClause(answer),
    contradictoryPredicates: !hasContradictoryPredicate(answer),
    duplicatedEnding: !hasDuplicatedEnding(answer),
    basicGrammarAndReadability: basicGrammarAndReadability(answer),
    selectedAnswerConsistency: !isMcq || selectedChoiceIsExplained(question, answer),
    optionSpecificReasoning: !isMcq || hasOptionSpecificReasoning(question, answer),
  });
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return Object.freeze({
    policyVersion: ANSWER_SEMANTIC_QUALITY_POLICY_VERSION,
    complete: failures.length === 0,
    checks,
    failures: Object.freeze(failures),
    normalizedAnswer: answer,
  });
}
