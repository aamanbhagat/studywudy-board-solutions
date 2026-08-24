import { boardSearchName } from "./search-metadata.mjs";
import { normalizedQuestionType } from "./question-classification.mjs";
import { formulaRepresentations } from "./semantic-math.mjs";

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

function semanticPlainMath(value) {
  const source = String(value || "");
  const delimited = source.replace(
    /\$\$([\s\S]*?)\$\$|\$([^$]+?)\$|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/gu,
    (_match, display, inline, parenthesized, bracketed) => ` ${formulaRepresentations(display || inline || parenthesized || bracketed).plainText} `,
  );
  return delimited.replace(
    /\\begin\s*\{([bpvV]?matrix|smallmatrix|array|cases|aligned(?:at)?|align\*?|gathered|split)\}[\s\S]*?\\end\s*\{\1\}/gu,
    (environment) => ` ${formulaRepresentations(environment).plainText} `,
  );
}

function plainText(value) {
  return semanticPlainMath(value)
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

function compactDistinctiveText(value, maximum) {
  const normalized = plainText(value);
  const characters = [...normalized];
  if (characters.length <= maximum) return normalized;
  const available = Math.max(4, maximum - 1);
  const leadingLength = Math.ceil(available * 0.56);
  const trailingLength = available - leadingLength;
  const leading = characters.slice(0, leadingLength).join("").replace(/\s+\S*$/u, "").trimEnd()
    || characters.slice(0, leadingLength).join("").trimEnd();
  const trailing = characters.slice(-trailingLength).join("").replace(/^\S*\s+/u, "").trimStart()
    || characters.slice(-trailingLength).join("").trimStart();
  return `${leading}…${trailing}`;
}

function compactBookTitle(value, maximum) {
  const academicTitle = plainText(value)
    .replace(/^Balbharati\s+/iu, "")
    .replace(/^Samacheer Kalvi\s+/iu, "")
    .replace(/\bInformation Technology\b/giu, "IT")
    .replace(/\bMathematics and Statistics\b/giu, "Maths-Stats")
    .replace(/\bArts and Science\b/giu, "Arts-Science")
    .replace(/\bCompany Accounts and Analysis of Financial Statements\b/giu, "Company Accounts Analysis")
    .replace(/\bStandard\b/giu, "Std")
    .replace(/\bPart\b/giu, "Pt");
  return compactDistinctiveText(academicTitle, maximum);
}

const TITLE_SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of",
  "on", "or", "per", "the", "to", "via", "with",
]);

function titleCase(value) {
  const words = plainText(value).split(/\s+/u).filter(Boolean);
  return words.map((word, index) => {
    const trailing = word.match(/[.,;:!?]+$/u)?.[0] || "";
    const core = trailing ? word.slice(0, -trailing.length) : word;
    if (!core) return word;
    if (/^[A-Z\d][A-Z\d&/()+.-]*$/u.test(core)) return `${core}${trailing}`;
    const lower = core.toLocaleLowerCase("en-IN");
    if (index > 0 && index < words.length - 1 && TITLE_SMALL_WORDS.has(lower)) return `${lower}${trailing}`;
    return `${lower.charAt(0).toLocaleUpperCase("en-IN")}${lower.slice(1)}${trailing}`;
  }).join(" ");
}

function trueFalseTopic(prompt) {
  const instruction = /^(?:state|say|write)\s+whether\s+(?:the\s+following\s+)?statements?\s+(?:is|are)\s+(?:true(?:\s+or\s+false)?|false(?:\s+or\s+true)?)\s*[.:;!?-]*\s*/iu;
  if (!instruction.test(prompt)) return null;
  const statement = prompt.replace(instruction, "")
    .replace(/^["“”'‘’\s]+|["“”'‘’\s]+$/gu, "")
    .trim();
  if (!statement) return null;
  return Object.freeze({
    label: titleCase(compactText(statement, 82)),
    forceType: "True or False",
    layout: "true-false",
  });
}

function questionPrompt(record) {
  return QUESTION_PROMPT_OVERRIDES[record.question_id]?.prompt || plainText(record.prompt_text) || `Textbook Question ${record.display_label}`;
}

const MAIN_HEADING_TYPE_PREFIXES = Object.freeze([
  /^(?:fill\s+in\s+the\s+blanks?)\s*[:.?!-]*\s*/iu,
  /^(?:answer(?:\s+the\s+following|\s+each\s+of\s+the\s+following)?\s+in\s+(?:one|a\s+single)\s+(?:word|sentence)|answer\s+in\s+brief)\s*[:.?!-]*\s*/iu,
  /^(?:multiple[\s-]+choice\s+questions?|single[\s-]+choice\s+mcq|mcq)\s*[:.?!-]*\s*/iu,
  /^(?:true\s+or\s+false|state\s+whether\s+(?:the\s+following\s+)?statements?\s+(?:is|are)\s+(?:true\s+or\s+false|false\s+or\s+true))\s*[:.?!-]*\s*/iu,
  /^(?:match\s+the\s+(?:following|columns?|pairs?))\s*[:.?!-]*\s*/iu,
]);

function questionMainHeading(record) {
  const prompt = questionPrompt(record);
  for (const prefix of MAIN_HEADING_TYPE_PREFIXES) {
    if (!prefix.test(prompt)) continue;
    return plainText(prompt.replace(prefix, "")) || "Textbook question";
  }
  return prompt;
}

function questionAnswerOverride(record) {
  return QUESTION_PROMPT_OVERRIDES[record.question_id]?.answer || null;
}

const QUESTION_TOPIC_PATTERNS = Object.freeze([
  Object.freeze({ pattern: /\bslab\b[\s\S]{0,140}\bsame area\b[\s\S]{0,160}\bthickness\b|\bsame area\b[\s\S]{0,100}\bslab\b[\s\S]{0,160}\bthickness\b/iu, label: "Dielectric Slab Capacitor" }),
  Object.freeze({ pattern: /\bdielectric\b[\s\S]{0,100}\bslab\b|\bslab\b[\s\S]{0,100}\bdielectric\b/iu, label: "Parallel Plate Capacitor with Dielectric Slab" }),
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
  const truthStatement = trueFalseTopic(prompt);
  if (truthStatement) return truthStatement;
  const match = QUESTION_TOPIC_PATTERNS.find((candidate) => candidate.pattern.test(prompt));
  if (match) return match;
  const withoutInstruction = prompt
    .replace(/^(?:choose the correct(?: option| answer)?|answer in brief|find|calculate|determine|state|explain|justify|derive)\s*:?\s*/iu, "")
    .replace(/^(?:A|An|The)\s+/iu, "")
    .replace(/[.?!].*$/u, "")
    .trim();
  const label = compactText(withoutInstruction || prompt, 44);
  return {
    label: `${label.charAt(0).toLocaleUpperCase("en-IN")}${label.slice(1)}`,
    forceType: null,
    layout: null,
  };
}

function questionSearchType(record, topic) {
  return topic.forceType || QUESTION_TYPE_SEARCH_LABELS[normalizedQuestionType(record)] || "Textbook Answer";
}

function questionSocialTitle(record, disambiguate = false) {
  const topic = questionTopic(record);
  const type = topic.forceType || QUESTION_TITLE_TYPE_LABELS[normalizedQuestionType(record)] || "Answer";
  const grade = questionClassNumber(record);
  const subject = questionSubject(record);
  if (topic.layout === "true-false") {
    const context = grade && subject ? `Class ${grade} ${subject}` : compactText(record.book_title, 44);
    const qualifier = disambiguate
      ? ` · ${compactText(boardSearchName(record), 16)} · ${compactBookTitle(record.book_title, 36)} · ${compactDistinctiveText(record.chapter_title, 24)} · Q${compactText(record.display_label, 8)}`
      : "";
    const fixed = ` – ${type} | ${context}${qualifier}`;
    const topicBudget = Math.max(18, 154 - [...fixed].length);
    return `${compactText(topic.label, topicBudget)}${fixed}`;
  }
  const titleSubject = compactText(subject, disambiguate ? 12 : 25);
  const context = grade && subject
    ? `Class ${grade} ${titleSubject} ${disambiguate ? "Ch" : "Chapter"} ${record.chapter_number}`
    : `Chapter ${record.chapter_number}`;
  const qualifier = disambiguate
    ? ` · ${compactText(boardSearchName(record), 16)} · ${compactBookTitle(record.book_title, 36)} · ${compactDistinctiveText(record.chapter_title, 24)} · Q${compactText(record.display_label, 8)}`
    : "";
  const fixed = `${type} – ${context}${qualifier}`;
  const topicBudget = Math.max(8, 146 - [...fixed].length - 1);
  return `${compactText(topic.label, topicBudget)} ${fixed}`;
}

function questionDocumentTitle(record, disambiguate = false) {
  const title = questionSocialTitle(record, disambiguate);
  return questionTopic(record).layout === "true-false" ? title : `${title} | StudyWudy`;
}

function questionDescription(record, disambiguate = false) {
  const topic = questionTopic(record);
  const type = questionSearchType(record, topic).toLocaleLowerCase("en-IN");
  const grade = questionClassNumber(record);
  const subject = questionSubject(record);
  const board = boardSearchName(record);
  const context = grade && subject ? `${board} Class ${grade} ${subject}` : compactText(record.book_title, 48);
  if (disambiguate) {
    const publicContext = `${compactText(board, 12)} Class ${grade || plainText(record.grade_label)} ${compactText(subject, 12)}; ${compactText(topic.label, 24)}; ${compactBookTitle(record.book_title, 36)}; Ch ${record.chapter_number} ${compactDistinctiveText(record.chapter_title, 18)}; Q${compactText(record.display_label, 8)}`;
    return compactText(`${publicContext}: ${type} solution.`, 158);
  }
  const lead = `Step-by-step ${type} for ${topic.label}. From ${compactText(record.book_title, 40)} in ${context}, Chapter ${record.chapter_number} ${compactText(record.chapter_title, 32)}.`;
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
  questionMainHeading,
  questionPrompt,
  questionSocialTitle,
};
