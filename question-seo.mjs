const QUESTION_PROMPT_OVERRIDES = Object.freeze({
  "q-tn-samacheer-kalvi-mathematics-term-1-class-4-3-001": {
    prompt: "Complete the repeating shape pattern with the next three shapes.",
    answer: "Pentagon, triangle and square.",
  },
  "q-tn-samacheer-kalvi-mathematics-term-1-class-4-3-002": {
    prompt: "Draw the next pattern by increasing the number of triangles and rectangles.",
    answer: "Four yellow triangles followed by four orange rectangles.",
  },
  "q-tn-samacheer-kalvi-mathematics-term-1-class-4-3-005": {
    prompt: "Complete the repeating sequence with the next four shapes.",
    answer: "Semicircle, circle, hexagon and triangle.",
  },
  "q-tn-samacheer-kalvi-mathematics-term-2-class-4-3-011": {
    prompt: "Complete the clockwise arrow pattern with the next two directions.",
    answer: "A left arrow followed by an up arrow.",
  },
  "q-tn-samacheer-kalvi-mathematics-term-2-class-4-3-012": {
    prompt: "Complete the pattern as the unshaded square moves clockwise.",
    answer: "The unshaded square moves to the top-left and then the top-right.",
  },
  "q-tn-samacheer-kalvi-mathematics-term-2-class-4-3-015": {
    prompt: "Complete the alternating circle-and-triangle pattern.",
    answer: "A triangle containing a circle, then a circle containing a triangle.",
  },
  "q-tn-samacheer-kalvi-mathematics-term-2-class-4-3-016": {
    prompt: "Complete the alternating vertical-and-horizontal strip pattern.",
    answer: "A vertical strip followed by a horizontal strip.",
  },
  "q-tn-samacheer-kalvi-mathematics-term-2-class-4-3-017": {
    prompt: "Complete the shaded-quarter pattern in the next two circles.",
    answer: "First shade all four quarters, then shade one quarter.",
  },
  "q-tn-samacheer-kalvi-mathematics-term-2-class-4-3-018": {
    prompt: "Complete the repeating triangle, square and pentagon pattern.",
    answer: "Pentagon followed by triangle.",
  },
});

function plainText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/<[^>]+>/gu, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&amp;|&#38;/giu, " and ")
    .replace(/&lt;|&#60;/giu, " less than ")
    .replace(/&gt;|&#62;/giu, " greater than ")
    .replace(/&quot;|&#34;/giu, '"')
    .replace(/&apos;|&#39;/giu, "'")
    .replace(/\{\{blank-\d+\}\}/giu, "blank")
    .replace(/\\begin\{[^}]+\}(?:\{[^}]*\})?/giu, " ")
    .replace(/\\end\{[^}]+\}/giu, " ")
    .replace(/\\(?:d?frac|tfrac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/giu, "$1 divided by $2")
    .replace(/\\sqrt\s*\{([^{}]*)\}/giu, "square root of $1")
    .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|overline|underline)\s*\{([^{}]*)\}/giu, "$1")
    .replace(/\^\s*\{?2\}?/gu, " squared ")
    .replace(/\^\s*\{?3\}?/gu, " cubed ")
    .replace(/\^\s*\{([^{}]+)\}/gu, " to the power $1 ")
    .replace(/_\s*\{([^{}]+)\}/gu, " $1 ")
    .replace(/_([\p{L}\p{N}]+)/gu, " $1")
    .replace(/\\(?:times|cdot)\b/giu, " multiplied by ")
    .replace(/\\div\b/giu, " divided by ")
    .replace(/\\pm\b/giu, " plus or minus ")
    .replace(/\\(?:leq|le)\b/giu, " less than or equal to ")
    .replace(/\\(?:geq|ge)\b/giu, " greater than or equal to ")
    .replace(/\\(?:neq|ne)\b/giu, " not equal to ")
    .replace(/\\infty\b/giu, " infinity ")
    .replace(/\\alpha\b/giu, " alpha ")
    .replace(/\\beta\b/giu, " beta ")
    .replace(/\\gamma\b/giu, " gamma ")
    .replace(/\\delta\b/giu, " delta ")
    .replace(/\\theta\b/giu, " theta ")
    .replace(/\\lambda\b/giu, " lambda ")
    .replace(/\\mu\b/giu, " mu ")
    .replace(/\\pi\b/giu, " pi ")
    .replace(/\\sigma\b/giu, " sigma ")
    .replace(/\\omega\b/giu, " omega ")
    .replace(/\\(?:left|right)\b/giu, " ")
    .replace(/\\([A-Za-z]+)\b/gu, "$1")
    .replace(/\\[;,!:\s]+/gu, " ")
    .replace(/\\+/gu, " ")
    .replace(/\$+/gu, " ")
    .replace(/[{}]/gu, " ")
    .replace(/\s*\|+\s*/gu, "; ")
    .replace(/\s*&\s*/gu, " and ")
    .replace(/(?:^|\s)[-:]{3,}(?=\s|$)/gu, " ")
    .replace(/[*_#`~]+/gu, " ")
    .replace(/(?:\s*;\s*){2,}/gu, "; ")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/\s+/gu, " ")
    .replace(/^[,.;:\s]+|[,.;:\s]+$/gu, "")
    .trim();
}

function compactText(value, maximum) {
  const normalized = plainText(value);
  if ([...normalized].length <= maximum) return normalized;
  const clipped = [...normalized].slice(0, Math.max(1, maximum - 1)).join("");
  const wordBoundary = clipped.replace(/\s+\S*$/u, "").trim();
  return `${wordBoundary || clipped.trimEnd()}…`;
}

function questionPrompt(record) {
  return QUESTION_PROMPT_OVERRIDES[record.question_id]?.prompt || plainText(record.prompt_text) || `Textbook Question ${record.display_label}`;
}

function questionAnswerOverride(record) {
  return QUESTION_PROMPT_OVERRIDES[record.question_id]?.answer || null;
}

function questionSocialTitle(record, disambiguate = false) {
  const prefix = `Q${record.display_label}: `;
  const chapter = ` — Ch${record.chapter_number}`;
  const reference = disambiguate ? ` · SW${record.row_id}` : "";
  const maximum = 48;
  const promptBudget = Math.max(12, maximum - [...prefix, ...chapter, ...reference].length);
  return `${prefix}${compactText(questionPrompt(record), promptBudget)}${chapter}${reference}`;
}

function questionDocumentTitle(record, disambiguate = false) {
  return `${questionSocialTitle(record, disambiguate)} | StudyWudy`;
}

function questionDescription(record, disambiguate = false) {
  const reference = disambiguate ? ` Reference SW${record.row_id}.` : "";
  const lead = `Textbook solution for Question ${record.display_label}, Chapter ${record.chapter_number} (${compactText(record.chapter_title, 34)}), in ${compactText(record.book_title, 48)}.${reference}`;
  return compactText(`${lead} ${questionPrompt(record)}`, 158);
}

export {
  QUESTION_PROMPT_OVERRIDES,
  compactText,
  plainText,
  questionAnswerOverride,
  questionDescription,
  questionDocumentTitle,
  questionPrompt,
  questionSocialTitle,
};
