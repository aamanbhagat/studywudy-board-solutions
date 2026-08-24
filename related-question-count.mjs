export const MIN_RELATED_QUESTIONS = 8;
export const MAX_RELATED_QUESTIONS = 20;

function stableTextHash(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

export function relatedQuestionTargetCount({ rowId, questionId } = {}) {
  const numericRowId = Number(rowId);
  const identity = Number.isSafeInteger(numericRowId) && numericRowId > 0
    ? numericRowId
    : stableTextHash(questionId);
  const range = MAX_RELATED_QUESTIONS - MIN_RELATED_QUESTIONS + 1;
  return MIN_RELATED_QUESTIONS + (identity % range);
}
