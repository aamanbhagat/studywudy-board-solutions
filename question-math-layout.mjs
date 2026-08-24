const MATRIX_MARKUP = /\\begin\{(?:[bBpvV]?matrix|array)\}/gu;
const MATRIX_ASSIGNMENT = /(?<!\n)[ \t]+((?:and[ \t]+)?)(?=[A-Z][A-Za-z0-9]*[ \t]*=[ \t]*\$\{\\left\[)/gu;
const CONCLUDING_QUESTION = /[ \t]+((?:What do you (?:conclude|observe)\?|Find the addition\b[\s\S]*))$/iu;

function normalizeMatrixOperationSpacing(value) {
  return value
    .replace(/\)(?=and\b)/giu, ") ")
    .replace(/\)(?=What\b)/gu, ") ")
    .replace(/\)\s*\+\s*/gu, ") + ");
}

function normalizeMatrixPromptText(value) {
  const source = String(value ?? "");
  const matrixCount = [...source.matchAll(MATRIX_MARKUP)].length;
  if (!matrixCount) return { content: source, enhanced: false };
  let content = normalizeMatrixOperationSpacing(source);
  if (matrixCount > 1) {
    content = content
      .replace(MATRIX_ASSIGNMENT, "\n$1")
      .replace(CONCLUDING_QUESTION, "\n$1");
  }
  return { content, enhanced: content !== source || matrixCount > 1 };
}

function normalizeValue(value) {
  if (typeof value === "string") return normalizeMatrixPromptText(value);
  if (value == null || typeof value !== "object") return { content: value, enhanced: false };
  if (Array.isArray(value)) {
    let enhanced = false;
    const content = value.map((item) => {
      const normalized = normalizeValue(item);
      enhanced ||= normalized.enhanced;
      return normalized.content;
    });
    return { content, enhanced };
  }

  let enhanced = false;
  const content = { ...value };
  for (const key of ["text", "blocks", "paragraphs", "items"]) {
    if (!(key in content)) continue;
    const normalized = normalizeValue(content[key]);
    content[key] = normalized.content;
    enhanced ||= normalized.enhanced;
  }
  return { content, enhanced };
}

export function normalizeQuestionMathLayout(value) {
  return normalizeValue(value);
}

export const QUESTION_MATH_LAYOUT_POLICY_VERSION = "question-math-layout-v1";
