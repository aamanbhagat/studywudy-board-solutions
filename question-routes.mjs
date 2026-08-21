const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CLASS_SLUG_PATTERN = /^class-(\d{1,2})$/u;

// These IDs came from the retired in-memory Physics demo. They were never
// public catalog IDs and must not appear in a crawlable question URL.
export const LEGACY_QUESTION_ID_PATTERN = /^q-(?:physics|bio)-\d{1,3}(?:-[a-z])?$/u;

function requiredSlug(value, field) {
  const slug = String(value || "").trim();
  if (!SLUG_PATTERN.test(slug)) throw new TypeError(`Invalid ${field}: ${slug || "(empty)"}`);
  return slug;
}

function requiredClassNumber(value) {
  const classNumber = Number(value);
  if (!Number.isSafeInteger(classNumber) || classNumber < 1 || classNumber > 12) {
    throw new TypeError(`Invalid classNumber: ${String(value)}`);
  }
  return classNumber;
}

/**
 * The only supported public question-route builder.
 *
 * @param {{
 *   boardSlug: string,
 *   classNumber: number,
 *   subjectSlug: string,
 *   textbookSlug: string,
 *   chapterSlug: string,
 *   publicQuestionId: string,
 * }} question
 */
export function getQuestionUrl(question) {
  return [
    "",
    requiredSlug(question.boardSlug, "boardSlug"),
    `class-${requiredClassNumber(question.classNumber)}`,
    requiredSlug(question.subjectSlug, "subjectSlug"),
    requiredSlug(question.textbookSlug, "textbookSlug"),
    requiredSlug(question.chapterSlug, "chapterSlug"),
    "questions",
    requiredSlug(question.publicQuestionId, "publicQuestionId"),
  ].join("/");
}

/** Convert the snake_case D1 projection into the public route contract. */
export function questionRecordFromCatalogRow(row) {
  const gradeSlug = String(row.grade_slug || row.gradeSlug || "");
  const classMatch = CLASS_SLUG_PATTERN.exec(gradeSlug);
  if (!classMatch) throw new TypeError(`Invalid catalog grade slug: ${gradeSlug || "(empty)"}`);
  return {
    boardSlug: row.board_slug ?? row.boardSlug,
    classNumber: Number(classMatch[1]),
    subjectSlug: row.subject_slug ?? row.subjectSlug,
    textbookSlug: row.book_slug ?? row.textbookSlug,
    chapterSlug: row.chapter_slug ?? row.chapterSlug,
    publicQuestionId: row.question_id ?? row.publicQuestionId,
  };
}

export function isLegacyQuestionId(value) {
  return LEGACY_QUESTION_ID_PATTERN.test(String(value || ""));
}

export function questionIdFromUrl(pathname) {
  const match = String(pathname || "").match(/\/questions\/([^/?#]+)\/?$/u);
  return match ? decodeURIComponent(match[1]) : null;
}
