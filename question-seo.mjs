import { boardSearchName } from "./search-metadata.mjs";

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
    .replace(/<\/?[A-Za-z][^<>]*>/gu, " ")
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

const QUESTION_TOPIC_PATTERNS = Object.freeze([
  Object.freeze({ pattern: /\bslab\b[\s\S]{0,140}\bsame area\b[\s\S]{0,160}\bthickness\b|\bsame area\b[\s\S]{0,100}\bslab\b[\s\S]{0,160}\bthickness\b/iu, label: "Dielectric Slab Capacitor", forceType: "Numerical" }),
  Object.freeze({ pattern: /\bdielectric\b[\s\S]{0,100}\bslab\b|\bslab\b[\s\S]{0,100}\bdielectric\b/iu, label: "Parallel Plate Capacitor with Dielectric Slab", forceType: "Numerical" }),
  Object.freeze({ pattern: /\bequivalent capacitance\b/iu, label: "Equivalent Capacitance" }),
  Object.freeze({ pattern: /\bparallel[- ]plate capacitor\b/iu, label: "Parallel Plate Capacitor" }),
  Object.freeze({ pattern: /\benergy (?:stored|lost)[\s\S]{0,80}\bcapacitor\b|\bcapacitor\b[\s\S]{0,80}\benergy\b/iu, label: "Capacitor Energy" }),
  Object.freeze({ pattern: /\belectric potential\b[\s\S]{0,80}\bproton\b|\bproton\b[\s\S]{0,80}\belectric potential\b/iu, label: "Electric Potential and Proton Work" }),
  Object.freeze({ pattern: /\bpotential\b[\s\S]{0,80}\b(?:liquid )?drops?\b|\b(?:liquid )?drops?\b[\s\S]{0,80}\bpotential\b/iu, label: "Potential of a Charged Drop" }),
  Object.freeze({ pattern: /\bdipole\b[\s\S]{0,100}\bwork\b|\bwork\b[\s\S]{0,100}\bdipole\b/iu, label: "Electric Dipole Work" }),
  Object.freeze({ pattern: /\belectric flux\b/iu, label: "Electric Flux" }),
  Object.freeze({ pattern: /\bspherical capacitor\b/iu, label: "Spherical Capacitor" }),
  Object.freeze({ pattern: /\blightning\b/iu, label: "Lightning Safety" }),
]);

const QUESTION_TYPE_SEARCH_LABELS = Object.freeze({
  one_word: "Answer",
  one_sentence: "Answer",
  brief: "Answer",
  detailed: "Long Answer",
  define: "Definition",
  give_reason: "Give Reason Answer",
  name_list: "Answer",
  mcq_single: "MCQ Solution",
  mcq_multi: "MCQ Solution",
  assertion_reason: "Assertion–Reason Solution",
  true_false: "True or False Answer",
  fill_blank: "Fill in the Blank Answer",
  match_column: "Match the Columns Answer",
  distinguish: "Distinguish Between Answer",
  passage: "Passage Answer",
  numerical: "Numerical",
  derivation: "Derivation",
  diagram: "Diagram Answer",
});

const QUESTION_TITLE_TYPE_LABELS = Object.freeze({
  one_word: "Answer",
  one_sentence: "Answer",
  brief: "Answer",
  detailed: "Long Answer",
  define: "Definition",
  give_reason: "Give Reason",
  name_list: "Answer",
  mcq_single: "MCQ Solution",
  mcq_multi: "MCQ Solution",
  assertion_reason: "Assertion–Reason",
  true_false: "True/False",
  fill_blank: "Fill Blank",
  match_column: "Matching",
  distinguish: "Comparison",
  passage: "Passage Answer",
  numerical: "Numerical",
  derivation: "Derivation",
  diagram: "Diagram",
});

function questionClassNumber(record) {
  const direct = Number(record.class_number);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const routeNumber = Number(String(record.grade_slug || "").replace(/^class-/u, ""));
  return Number.isFinite(routeNumber) && routeNumber > 0 ? routeNumber : null;
}

function questionSubject(record) {
  const value = plainText(record.subject_name || record.subject_slug);
  return value.replace(/\b\w/gu, (character) => character.toLocaleUpperCase("en-IN"));
}

function questionTopic(record) {
  const prompt = questionPrompt(record);
  const match = QUESTION_TOPIC_PATTERNS.find((candidate) => candidate.pattern.test(prompt));
  if (match) return match;
  const withoutInstruction = prompt
    .replace(/^(?:choose the correct(?: option| answer)?|answer in brief|find|calculate|determine|state|explain|justify|derive)\s*:?\s*/iu, "")
    .replace(/^(?:A|An|The)\s+/iu, "")
    .replace(/[.?!].*$/u, "")
    .trim();
  return { label: compactText(withoutInstruction || prompt, 44), forceType: null };
}

function questionSearchType(record, topic) {
  return topic.forceType || QUESTION_TYPE_SEARCH_LABELS[record.type] || "Textbook Answer";
}

function questionSocialTitle(record, disambiguate = false) {
  const topic = questionTopic(record);
  const type = topic.forceType || QUESTION_TITLE_TYPE_LABELS[record.type] || "Answer";
  const grade = questionClassNumber(record);
  const subject = questionSubject(record);
  const titleSubject = compactText(subject, disambiguate ? 12 : 25);
  const context = grade && subject
    ? `Class ${grade} ${titleSubject} ${disambiguate ? "Ch" : "Chapter"} ${record.chapter_number}`
    : `Chapter ${record.chapter_number}`;
  const qualifier = disambiguate
    ? ` · Q${compactText(record.display_label, 6)} · ${record.row_id}`
    : "";
  const fixed = `${type} – ${context}${qualifier}`;
  const topicBudget = Math.max(6, 72 - [...fixed].length - 1);
  return `${compactText(topic.label, topicBudget)} ${fixed}`;
}

function questionDocumentTitle(record, disambiguate = false) {
  return `${questionSocialTitle(record, disambiguate)} | StudyWudy`;
}

function questionDescription(record, disambiguate = false) {
  const topic = questionTopic(record);
  const type = questionSearchType(record, topic).toLocaleLowerCase("en-IN");
  const grade = questionClassNumber(record);
  const subject = questionSubject(record);
  const board = boardSearchName(record);
  const context = grade && subject ? `${board} Class ${grade} ${subject}` : compactText(record.book_title, 48);
  const reference = disambiguate ? ` Question ${record.display_label}, catalogue reference ${record.row_id}.` : "";
  const lead = `Step-by-step ${type} for ${topic.label}.${reference} From ${compactText(record.book_title, 40)} in ${context}, Chapter ${record.chapter_number} ${compactText(record.chapter_title, 32)}.`;
  const candidate = [...plainText(lead)].length >= 130 ? lead : `${lead} ${questionPrompt(record)}`;
  return compactText(candidate, 158);
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
