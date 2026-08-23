import {
  NORMALIZED_QUESTION_TYPE_SQL,
  explicitlyRequiresStudentDiagram,
  normalizedQuestionType,
} from "./question-classification.mjs";

const QUESTION_TYPE_LABELS = Object.freeze({
  one_word: "One-word questions",
  one_sentence: "One-sentence questions",
  brief: "Brief-answer questions",
  detailed: "Detailed-answer questions",
  define: "Definition questions",
  give_reason: "Give-reason questions",
  name_list: "Name-and-list questions",
  mcq_single: "Single-choice MCQs",
  mcq_multi: "Multiple-choice MCQs",
  assertion_reason: "Assertion–reason questions",
  true_false: "True-or-false questions",
  fill_blank: "Fill-in-the-blank questions",
  match_column: "Match-the-columns questions",
  distinguish: "Distinguish-between questions",
  passage: "Passage-based questions",
  numerical: "Numerical questions",
  diagram: "Diagram questions",
});

const BOARD_LABELS = Object.freeze({
  "maharashtra-board": "Maharashtra Board",
  cbse: "CBSE",
  cisce: "CISCE",
  "tamil-nadu-board": "Tamil Nadu Board",
});

export const SEARCH_FILTER_RELEASE = "structured-ranking-v11-reviewed-source-aliases";

const REVIEWED_SOURCE_SEARCH_ALIASES = Object.freeze({
  "charge carriers": "charge carries",
  "electric field": "elecric field",
  "gauss's law": "gausss law",
  "gauss’s law": "gausss law",
  "quadratic equations": "quadatric euation",
});

const NORMALIZED_PROMPT_SQL = `lower(' ' || replace(replace(replace(replace(replace(replace(q.prompt_text, '<br>', ' '), '<br/>', ' '), '.', ' '), ',', ' '), ':', ' '), ';', ' ') || ' ')`;

export const DIAGRAM_EVIDENCE_SQL = `(
  (${NORMALIZED_PROMPT_SQL} LIKE '% labelled diagram %'
    OR ${NORMALIZED_PROMPT_SQL} LIKE '% labeled diagram %'
    OR ${NORMALIZED_PROMPT_SQL} LIKE '% schematic diagram %'
    OR ${NORMALIZED_PROMPT_SQL} LIKE '% circuit diagram %'
    OR ${NORMALIZED_PROMPT_SQL} LIKE '% ray diagram %'
    OR ${NORMALIZED_PROMPT_SQL} LIKE '% floral diagram %')
  OR ((${NORMALIZED_PROMPT_SQL} LIKE '% draw %'
      OR ${NORMALIZED_PROMPT_SQL} LIKE '% sketch %'
      OR ${NORMALIZED_PROMPT_SQL} LIKE '% plot %'
      OR ${NORMALIZED_PROMPT_SQL} LIKE '% construct %')
    AND (${NORMALIZED_PROMPT_SQL} LIKE '% diagram %'
      OR ${NORMALIZED_PROMPT_SQL} LIKE '% figure %'
      OR ${NORMALIZED_PROMPT_SQL} LIKE '% graph %'
      OR ${NORMALIZED_PROMPT_SQL} LIKE '% curve %'
      OR ${NORMALIZED_PROMPT_SQL} LIKE '% circle %'
      OR ${NORMALIZED_PROMPT_SQL} LIKE '% triangle %'
      OR ${NORMALIZED_PROMPT_SQL} LIKE '% ray %'
      OR ${NORMALIZED_PROMPT_SQL} LIKE '% field line %'
      OR ${NORMALIZED_PROMPT_SQL} LIKE '% structure %'))
)`;

export const NUMERICAL_EVIDENCE_SQL = `(
  (
    lower(q.prompt_text) LIKE '%calculate%'
    OR lower(q.prompt_text) LIKE '%compute%'
    OR lower(q.prompt_text) LIKE '%evaluate%'
    OR lower(q.prompt_text) LIKE '%solve%'
    OR lower(q.prompt_text) LIKE '%find the value%'
    OR lower(q.prompt_text) LIKE '%find the values%'
    OR lower(q.prompt_text) LIKE '%find the angle%'
    OR lower(q.prompt_text) LIKE '%find the distance%'
    OR lower(q.prompt_text) LIKE '%find the equation%'
    OR lower(q.prompt_text) LIKE '%find the ratio%'
    OR lower(q.prompt_text) LIKE '%find the mean%'
    OR lower(q.prompt_text) LIKE '%find the probability%'
    OR lower(q.prompt_text) LIKE '%find the time%'
    OR lower(q.prompt_text) LIKE '%find the temperature%'
    OR lower(q.prompt_text) LIKE '%find x%'
    OR lower(q.prompt_text) LIKE '%find y%'
    OR lower(q.prompt_text) LIKE '%how much%'
    OR lower(q.prompt_text) LIKE '%how many%'
    OR lower(q.prompt_text) LIKE '%estimate%'
    OR lower(q.prompt_text) LIKE '%determine the%'
    OR lower(q.prompt_text) LIKE '%what is the value%'
    OR lower(q.prompt_text) LIKE '%what are the values%'
    OR lower(q.prompt_text) LIKE '%at what temperature%'
  )
  AND lower(q.prompt_text) NOT LIKE '%write a program%'
  AND lower(q.prompt_text) NOT LIKE '%student project database%'
  AND lower(q.prompt_text) NOT LIKE '%structured query language%'
  AND lower(q.prompt_text) NOT LIKE '%write sql quer%'
  AND lower(q.prompt_text) NOT LIKE '%identify the acid and base%'
  AND lower(q.prompt_text) NOT LIKE '%which theory explains%'
  AND lower(q.prompt_text) NOT LIKE '%aandb%'
  AND lower(q.prompt_text) NOT LIKE '%*a*and*b*%'
  AND lower(q.prompt_text) NOT LIKE '%bhas%'
  AND lower(q.prompt_text) NOT LIKE '%negligble%'
  AND lower(q.prompt_text) NOT LIKE '%vertical place%'
  AND (
    q.prompt_text GLOB '*[0-9]*'
    OR q.prompt_text LIKE '%=%'
    OR q.prompt_text LIKE '%\\frac%'
    OR lower(q.prompt_text) LIKE '%equation%'
    OR lower(q.prompt_text) LIKE '%integral%'
    OR lower(q.prompt_text) LIKE '%deriv%'
    OR lower(q.prompt_text) LIKE '%value of x%'
    OR lower(q.prompt_text) LIKE '%value of y%'
  )
)`;

export function questionHasNumericalEvidence(value) {
  const prompt = String(value?.prompt_text ?? value?.prompt ?? value ?? "")
    .normalize("NFKC")
    .replace(/<[^>]*>/gu, " ")
    .replace(/[*_`]/gu, "")
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-IN");
  if (!prompt) return false;
  if (/\b(?:write\s+a\s+program|student\s+project\s+database|structured\s+query\s+language|write\s+sql\s+quer\w*)\b/u.test(prompt)) return false;
  if (/\bidentify\s+the\s+acid\s+and\s+base\b|\bwhich\s+theory\s+explains\b/u.test(prompt)) return false;
  if (/\b(?:aandb|bhas|negligble)\b|\bvertical\s+place\b/u.test(prompt)) return false;
  const asksForCalculatedValue = /\b(?:calculate|compute|evaluate|solve|estimate)\b/u.test(prompt)
    || /\bfind\s+(?:[xy]\b|the\s+(?:value|values|angle|distance|equation|ratio|mean|mode|variance|probability|time|temperature|speed|velocity|acceleration|area|volume|mass|force|energy|power|current|potential|capacitance|resistance|frequency|wavelength|number|sum|product|roots?))/u.test(prompt)
    || /\bhow\s+(?:much|many)\b/u.test(prompt)
    || /\bdetermine\s+the\s+(?:value|values|amount|number|ratio|mass|distance|time|temperature|speed|velocity|force|energy|power|current|potential|capacitance|resistance)\b/u.test(prompt)
    || /\bwhat\s+(?:is|are)\s+the\s+values?\b/u.test(prompt)
    || /\bat\s+what\s+temperature\b/u.test(prompt);
  const hasCalculationOrDerivation = /\d|=|\\(?:frac|sqrt|int|sum)|\b(?:equation|integral|deriv\w*|substitut\w*|ratio|percentage|value\s+of\s+[xy])\b/u.test(prompt);
  const hasQuantitativeEvidence = /\d|[=+×÷^]|\\(?:frac|sqrt|int|sum|times|div)|\b(?:numeric(?:al)?\s+value|arithmetic|formula|equation|integral|value\s+of\s+[xy])\b/u.test(prompt);
  return asksForCalculatedValue && hasCalculationOrDerivation && hasQuantitativeEvidence;
}

export function questionHasDiagramEvidence(value) {
  return explicitlyRequiresStudentDiagram(value);
}

const POPULAR_FILTERS = Object.freeze([
  Object.freeze({ key: "type", value: "numerical", href: "/search?type=numerical", label: "Numericals" }),
  Object.freeze({ key: "hasDiagram", value: true, href: "/search?hasDiagram=true", label: "Rendered diagrams" }),
  Object.freeze({ key: "type", value: "mcq_single", href: "/search?type=mcq_single", label: "Single-choice MCQs" }),
  Object.freeze({ key: "board", value: "maharashtra-board", href: "/search?board=maharashtra-board", label: "Maharashtra Board" }),
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function bounded(value, maximum) {
  return [...String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim()].slice(0, maximum).join("");
}

function invalidParameter(errors, name, value) {
  errors.push(`${name}=${bounded(value, 80) || "(empty)"}`);
}

export function parseQuestionSearchCriteria(searchParams) {
  const query = bounded(searchParams.get("q"), 80);
  const rawType = searchParams.get("type");
  const rawDiagram = searchParams.get("hasDiagram");
  const rawBoard = searchParams.get("board");
  const errors = [];

  let type = null;
  if (rawType != null) {
    const candidate = bounded(rawType, 40);
    if (Object.hasOwn(QUESTION_TYPE_LABELS, candidate)) type = candidate;
    else invalidParameter(errors, "type", rawType);
  }

  let hasDiagram = null;
  if (rawDiagram != null) {
    if (rawDiagram === "true") hasDiagram = true;
    else if (rawDiagram === "false") hasDiagram = false;
    else invalidParameter(errors, "hasDiagram", rawDiagram);
  }

  let board = null;
  if (rawBoard != null) {
    const candidate = bounded(rawBoard, 40);
    if (Object.hasOwn(BOARD_LABELS, candidate)) board = candidate;
    else invalidParameter(errors, "board", rawBoard);
  }

  const hasFilters = type != null || hasDiagram != null || board != null;
  return Object.freeze({
    query,
    type,
    hasDiagram,
    board,
    hasFilters,
    hasCriteria: Boolean(query) || hasFilters,
    errors: Object.freeze(errors),
  });
}

function escapeLike(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function searchTokens(query) {
  const tokens = query.toLocaleLowerCase("en-IN")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2)
    .slice(0, 8);
  return tokens.length ? tokens : [query.toLocaleLowerCase("en-IN")];
}

function exactConceptOrTitleSql() {
  return `(
    lower(c.title) = search_input.query
    OR lower(b.title) = search_input.query
    OR EXISTS (
      SELECT 1
      FROM json_each(CASE WHEN json_valid(q.concept_tags) THEN q.concept_tags ELSE '[]' END) AS concept
      WHERE replace(lower(CAST(concept.value AS TEXT)), '-', ' ') = search_input.query
    )
  )`;
}

function exactQuestionPhraseSql() {
  return `(lower(q.prompt_text) LIKE search_input.phrase ESCAPE '\\'
    OR lower(q.prompt_text) LIKE search_input.source_phrase ESCAPE '\\')`;
}

function textbookOrChapterSql() {
  return `(
    lower(b.title) LIKE search_input.phrase ESCAPE '\\'
    OR lower(c.title) LIKE search_input.phrase ESCAPE '\\'
    OR lower(b.title) LIKE search_input.source_phrase ESCAPE '\\'
    OR lower(c.title) LIKE search_input.source_phrase ESCAPE '\\'
  )`;
}

function generalBodySql(tokenColumns) {
  const searchable = `lower(
    q.prompt_text || ' ' || q.concept_tags || ' ' || c.summary || ' ' || b.description
  )`;
  return tokenColumns.map((column) => `${searchable} LIKE search_input.${column} ESCAPE '\\'`).join(" AND ");
}

export function buildQuestionSearchPlan(criteria, projection) {
  if (!criteria?.hasCriteria) return null;
  const bindings = [];
  const filters = [];

  if (criteria.type) {
    filters.push(`${NORMALIZED_QUESTION_TYPE_SQL} = ?`);
    bindings.push(criteria.type);
    if (criteria.type === "numerical") filters.push(NUMERICAL_EVIDENCE_SQL);
  }
  // The prompt predicate only narrows positive diagram searches. The final
  // rendered-diagram decision comes from the publishing manifest in the Worker.
  if (criteria.hasDiagram === true) filters.push(DIAGRAM_EVIDENCE_SQL);
  if (criteria.board) {
    filters.push("b.board_slug = ?");
    bindings.push(criteria.board);
  }

  let cte = "";
  let textWhere = "";
  let textPriority = "9";
  let matchReason = "'structured-filter'";
  const inputBindings = [];
  if (criteria.query) {
    const normalizedQuery = criteria.query.toLocaleLowerCase("en-IN");
    const reviewedSourceQuery = REVIEWED_SOURCE_SEARCH_ALIASES[normalizedQuery] || normalizedQuery;
    const tokens = searchTokens(criteria.query);
    const tokenColumns = tokens.map((_, index) => `term_${index}`);
    const inputColumns = ["query", "phrase", "source_phrase", ...tokenColumns];
    cte = `WITH search_input(${inputColumns.join(", ")}) AS (VALUES (${inputColumns.map(() => "?").join(", ")}))`;
    inputBindings.push(normalizedQuery, `%${escapeLike(normalizedQuery)}%`, `%${escapeLike(reviewedSourceQuery)}%`, ...tokens.map((token) => `%${escapeLike(token)}%`));
    const exactConcept = exactConceptOrTitleSql();
    const exactQuestion = exactQuestionPhraseSql();
    const textbookChapter = textbookOrChapterSql();
    const generalBody = `(${generalBodySql(tokenColumns)})`;
    textWhere = `(${exactConcept} OR ${exactQuestion} OR ${textbookChapter} OR ${generalBody})`;
    textPriority = `CASE
      WHEN ${exactConcept} THEN 2
      WHEN ${exactQuestion} THEN 3
      WHEN ${textbookChapter} THEN 4
      ELSE 5
    END`;
    matchReason = `CASE
      WHEN ${exactConcept} THEN 'concept-title'
      WHEN ${exactQuestion} THEN 'question-phrase'
      WHEN ${textbookChapter} THEN 'textbook-chapter'
      ELSE 'body-text'
    END`;
  }

  const where = [...filters, textWhere].filter(Boolean);
  const searchPriority = criteria.type ? "1" : textPriority;
  const order = criteria.type && criteria.query
    ? "search_priority, text_priority, q.row_id"
    : "search_priority, q.row_id";
  // Keyword searches are the public dynamic path and stay tightly bounded.
  // The broader structured filters are captured as static launch documents;
  // their larger build-only windows prevent a sparse final publishing bitset
  // from producing an empty page before the Worker applies that final gate.
  const candidateLimit = criteria.query ? 256
    : criteria.type ? 1536
      : criteria.hasDiagram != null ? 512
        : 256;
  const sql = `${cte ? `${cte}\n` : ""}${projection},
    ${DIAGRAM_EVIDENCE_SQL} AS has_diagram,
    ${searchPriority} AS search_priority,
    ${textPriority} AS text_priority,
    ${matchReason} AS search_match
    FROM catalog_questions q
    JOIN catalog_books b ON b.id = q.book_id
    JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
    ${criteria.query ? "CROSS JOIN search_input" : ""}
    WHERE ${where.length ? where.join(" AND ") : "1 = 1"}
    ORDER BY ${order}
    LIMIT ${candidateLimit}`;
  return Object.freeze({ sql, bindings: Object.freeze([...inputBindings, ...bindings]) });
}

export function renderPopularQuestionFilters(criteria) {
  const links = POPULAR_FILTERS.map((filter) => {
    const active = criteria?.[filter.key] === filter.value ? ' aria-current="page"' : "";
    return `<a href="${filter.href}"${active}>${escapeHtml(filter.label)}</a>`;
  }).join("");
  return `<span>Popular filters:</span>${links}`;
}

export function renderActiveSearchFilterInputs(criteria) {
  const values = [
    ["type", criteria?.type],
    ["hasDiagram", criteria?.hasDiagram == null ? null : String(criteria.hasDiagram)],
    ["board", criteria?.board],
  ];
  return values.filter(([, value]) => value != null)
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`)
    .join("");
}

export function questionSearchHeading(criteria) {
  const filters = [];
  if (criteria?.type) filters.push(QUESTION_TYPE_LABELS[criteria.type]);
  if (criteria?.hasDiagram === true) filters.push("Questions with rendered solution diagrams");
  if (criteria?.hasDiagram === false) filters.push("Questions without rendered solution diagrams");
  if (criteria?.board) filters.push(`${BOARD_LABELS[criteria.board]} questions`);
  const filtered = filters.join(" · ");
  if (criteria?.query && filtered) return `${filtered} matching “${criteria.query}”`;
  if (criteria?.query) return `Results for “${criteria.query}”`;
  return filtered || "Quality-screened sample questions";
}

export { BOARD_LABELS as QUESTION_SEARCH_BOARD_LABELS, QUESTION_TYPE_LABELS as QUESTION_SEARCH_TYPE_LABELS };
export { normalizedQuestionType };
