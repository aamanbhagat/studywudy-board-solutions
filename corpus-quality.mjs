import { questionHasDuplicateOptions } from "./choice-quality.mjs";
import {
  MARATHI_ANTARBHARATI_BOOK_ID,
  MARATHI_ANTARBHARATI_CORRUPT_CHAPTER,
  authoritativeSourceMappingStatus,
} from "./source-mapping-quality.mjs";

export const CORPUS_QUALITY_POLICY_VERSION = "provenance-classified-v3-reviewed-import-repairs";

export const CORPUS_QUALITY_CLASSIFICATIONS = Object.freeze([
  "verified source wording",
  "source typo retained with note",
  "OCR/import corruption",
  "metadata typo",
  "answer-generation defect",
  "equation-rendering defect",
]);

const FINDINGS = Object.freeze({
  "q-cbse-ncert-exemplar-chemistry-exemplar-class-12-1-042": Object.freeze({
    code: "ncert-positvely-source-typo",
    classification: "source typo retained with note",
    status: "retained",
    searchEligible: false,
    snippetEligible: false,
    indexEligible: true,
    title: "Verified source typo retained",
    detail: "The official NCERT Exemplar prints a nonstandard spelling in this option. StudyWudy retains the quotation, labels it here, and does not use it in search excerpts.",
    evidenceUrl: "https://ncert.nic.in/pdf/publication/exemplarproblem/classXII/chemistry/leep501.pdf",
    evidenceLabel: "NCERT Chemistry Exemplar, Unit 1, question 42",
  }),
  "q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-29-031": Object.freeze({
    code: "hc-verma-rfrom-import-corruption",
    classification: "OCR/import corruption",
    status: "source-review-required",
    searchEligible: false,
    snippetEligible: false,
    indexEligible: false,
    title: "Imported wording under source review",
    detail: "The import contains a joined-word defect. No verified source page is attached, so the quotation has not been silently rewritten; this page is excluded from search and indexing pending source review.",
  }),
  "q-cisce-frank-mathematics-part-2-class-10-6-042": Object.freeze({
    code: "frank-mathematics-hrfrom-import-corruption",
    classification: "OCR/import corruption",
    status: "source-review-required",
    searchEligible: false,
    snippetEligible: false,
    indexEligible: false,
    title: "Imported wording under source review",
    detail: "The imported speed unit and following word were joined together. Without a verified source page, the quotation is retained and excluded from search and indexing pending source review.",
  }),
  "q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-6-052": Object.freeze({
    code: "hc-verma-bye-the-import-corruption",
    classification: "OCR/import corruption",
    status: "source-review-required",
    searchEligible: false,
    snippetEligible: false,
    indexEligible: false,
    title: "Imported wording under source review",
    detail: "The imported hint contains a likely transcription defect and its source page is not verified. The quotation remains unchanged, while the page is excluded from search and indexing until source review.",
  }),
  "q-msb-balbharati-physics-standard-12-8-005": Object.freeze({
    code: "balbharati-i-mm-import-corruption",
    classification: "OCR/import corruption",
    status: "reviewed-display-repair",
    searchEligible: true,
    snippetEligible: true,
    indexEligible: true,
    title: "Reviewed import repair applied",
    detail: "A Latin capital I introduced during import was corrected to the numeral 1 in the public plate-separation value. The stored source payload remains unchanged for auditability.",
  }),
  "q-msb-balbharati-physics-standard-12-8-002": Object.freeze({
    code: "balbharati-capacitor-epsilon-rendering",
    classification: "equation-rendering defect",
    status: "resolved",
    searchEligible: true,
    snippetEligible: true,
    indexEligible: true,
    title: "Equation rendering repair applied",
    detail: "Malformed epsilon terms in the intermediate capacitance derivation are repaired by the semantic-math source normalizer before MathML, spoken text and plain text are generated.",
  }),
  "q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-30-039": Object.freeze({
    code: "hc-verma-duplicated-rho-import",
    classification: "OCR/import corruption",
    status: "reviewed-display-repair",
    searchEligible: true,
    snippetEligible: true,
    indexEligible: true,
    title: "Reviewed import repair applied",
    detail: "A duplicated rho introduced during import was reduced to the single volume-charge-density symbol required by the question and its worked solution. The stored source payload remains unchanged for auditability.",
  }),
  "q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-45-013": Object.freeze({
    code: "hc-verma-charge-carriers-import",
    classification: "OCR/import corruption",
    status: "reviewed-display-repair",
    searchEligible: true,
    snippetEligible: true,
    indexEligible: true,
    title: "Reviewed import repair applied",
    detail: "The semiconductor term charge carriers and the adjacent variables n and v were separated using the terminology and symbols repeated in the choices and explanation. The stored source payload remains unchanged for auditability.",
  }),
  "q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-45-028": Object.freeze({
    code: "hc-verma-charge-carriers-import-2",
    classification: "OCR/import corruption",
    status: "reviewed-display-repair",
    searchEligible: true,
    snippetEligible: true,
    indexEligible: true,
    title: "Reviewed import repair applied",
    detail: "A noun-ending import error was corrected to the standard semiconductor term charge carriers. The stored source payload remains unchanged for auditability.",
  }),
  "q-cbse-ncert-exemplar-physics-exemplar-class-12-1-017": Object.freeze({
    code: "ncert-elecric-import",
    classification: "OCR/import corruption",
    status: "reviewed-display-repair",
    searchEligible: true,
    snippetEligible: true,
    indexEligible: true,
    title: "Reviewed import repair applied",
    detail: "An omitted letter in the imported wording was restored to electric, matching the repeated term in the second sentence and the worked answer. The stored source payload remains unchanged for auditability.",
  }),
});

export const CORPUS_QUALITY_FINDINGS = FINDINGS;

export const CORPUS_QUALITY_CHAPTER_FINDINGS = Object.freeze({
  "cbse::class-12::physics::hc-verma-concepts-of-physics-volume-1-and-2-class-12::gausss-law": Object.freeze({
    code: "gauss-law-metadata-import",
    classification: "metadata typo",
    status: "reviewed-display-repair",
    source: "Gausss Law",
    replacement: "Gauss’s Law",
    searchEligible: true,
    snippetEligible: true,
    indexEligible: true,
    detail: "The duplicated s in the imported chapter title is corrected on public surfaces while the original stored metadata remains available for audit.",
  }),
  "cbse::class-10::mathematics::ncert-exemplar-mathematics-exemplar-class-10::quadatric-euation": Object.freeze({
    code: "quadratic-equations-metadata-import",
    classification: "metadata typo",
    status: "reviewed-display-repair",
    source: "Quadatric Euation",
    replacement: "Quadratic Equations",
    evidenceUrl: "https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep204.pdf",
    evidenceLabel: "NCERT Mathematics Exemplar, Chapter 4",
  }),
  [`${MARATHI_ANTARBHARATI_BOOK_ID}::${MARATHI_ANTARBHARATI_CORRUPT_CHAPTER}`]: Object.freeze({
    code: "balbharati-marathi-antarbharati-chapter-mismatch",
    classification: "metadata typo",
    status: "source-review-required",
    source: "Chapter 11: डसपटक",
    replacement: "Chapter 10: डासपीटिका",
    searchEligible: false,
    snippetEligible: false,
    indexEligible: false,
    evidenceUrl: "https://books.ebalbharati.in/pdfs/1001030030.pdf",
    evidenceLabel: "Official eBalbharati Marathi Antarbharati Standard 10 contents page",
    detail: "The imported route and payload agree with each other but conflict with the authoritative textbook contents: डासपीटिका is chapter 10 and हा देश माझा is chapter 11.",
  }),
});

function mappedChapterFinding(questionId, row = null) {
  const authoritative = authoritativeSourceMappingStatus({
    bookId: row?.book_id,
    chapterSlug: row?.chapter_slug,
  });
  const isKnownPrefix = String(questionId || "").startsWith("q-msb-balbharati-marathi-composite-antarbharati-standard-10-11-");
  if (authoritative.status !== "mismatch" && !isKnownPrefix) return null;
  return CORPUS_QUALITY_CHAPTER_FINDINGS[`${MARATHI_ANTARBHARATI_BOOK_ID}::${MARATHI_ANTARBHARATI_CORRUPT_CHAPTER}`];
}

export function corpusQualityFindingForQuestion(questionId, question = null, row = null) {
  const reviewed = FINDINGS[String(questionId || "")];
  if (reviewed) return reviewed;
  const chapterFinding = mappedChapterFinding(questionId, row);
  if (chapterFinding) return chapterFinding;
  if (!questionHasDuplicateOptions(question)) return null;
  return Object.freeze({
    code: "duplicate-mcq-options",
    classification: "OCR/import corruption",
    status: "source-review-required",
    searchEligible: false,
    snippetEligible: false,
    indexEligible: false,
    title: "Duplicate options under source review",
    detail: "At least two normalized options are identical or empty. The choices are retained for source comparison, but the question is excluded from search and indexing until an editor verifies the textbook page.",
  });
}

export function corpusQuestionSearchEligible(row, duplicateRowIds = null) {
  const finding = FINDINGS[String(row?.question_id || "")] || mappedChapterFinding(row?.question_id, row);
  if (finding?.searchEligible === false) return false;
  if (sortedRowIdsInclude(duplicateRowIds, Number(row?.row_id))) return false;
  return true;
}

export function corpusQuestionReviewedSearchException(questionId) {
  const finding = FINDINGS[String(questionId || "")];
  return finding?.searchEligible === true
    && ["reviewed-display-repair", "resolved"].includes(finding.status);
}

export function corpusQuestionIndexEligible({ questionId, rowId, duplicateRowIds = null }) {
  const finding = FINDINGS[String(questionId || "")] || mappedChapterFinding(questionId);
  if (finding?.indexEligible === false) return false;
  if (sortedRowIdsInclude(duplicateRowIds, Number(rowId))) return false;
  return true;
}

function sortedRowIdsInclude(rowIds, target) {
  if (!Array.isArray(rowIds) || !Number.isFinite(target)) return false;
  let left = 0;
  let right = rowIds.length - 1;
  while (left <= right) {
    const middle = (left + right) >> 1;
    const value = rowIds[middle];
    if (value === target) return true;
    if (value < target) left = middle + 1;
    else right = middle - 1;
  }
  return false;
}

export function corpusQuestionSnippetEligible(questionId, question = null) {
  return corpusQualityFindingForQuestion(questionId, question)?.snippetEligible !== false;
}

export function renderCorpusQualityNote(finding) {
  if (!finding) return "";
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const evidence = finding.evidenceUrl
    ? `<a href="${escapeHtml(finding.evidenceUrl)}" rel="noopener">${escapeHtml(finding.evidenceLabel || "View source evidence")} →</a>`
    : "";
  return `<aside class="corpus-quality-note" data-content-quality-classification="${escapeHtml(finding.classification)}" data-content-quality-status="${escapeHtml(finding.status)}"><span>Corpus quality classification</span><h3>${escapeHtml(finding.title)}</h3><p>${escapeHtml(finding.detail)}</p>${evidence}</aside>`;
}

export const CORPUS_QUALITY_STYLES = `<style id="corpus-quality-styles">
.corpus-quality-note{margin:1rem 0;padding:1rem 1.1rem;border:1px solid #b9872d;border-left:5px solid #8a5a08;border-radius:14px;background:#fff8e8;color:#2d261a}.corpus-quality-note>span{display:block;color:#744b08;font-size:.72rem;font-weight:900;letter-spacing:.09em;text-transform:uppercase}.corpus-quality-note h3{margin:.3rem 0 .4rem;font-size:1.05rem}.corpus-quality-note p{max-width:76ch;margin:.3rem 0;line-height:1.58}.corpus-quality-note a{display:inline-block;margin-top:.35rem;color:#174d31;font-weight:800}
</style>`;
