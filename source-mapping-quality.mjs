export const SOURCE_MAPPING_POLICY_VERSION = "internal-vs-authoritative-v1";

export const MARATHI_ANTARBHARATI_BOOK_ID = "maharashtra-board::class-10::marathi::balbharati-marathi-composite-antarbharati-standard-10";
export const MARATHI_ANTARBHARATI_CORRUPT_CHAPTER = "chapter-11";

const AUTHORITATIVE_REVIEWS = Object.freeze([
  Object.freeze({
    bookId: MARATHI_ANTARBHARATI_BOOK_ID,
    importedChapterSlug: MARATHI_ANTARBHARATI_CORRUPT_CHAPTER,
    status: "mismatch",
    authoritativeTextbookMappingVerified: false,
    expectedChapterNumber: 10,
    expectedChapterTitle: "डासपीटिका",
    followingChapterNumber: 11,
    followingChapterTitle: "हा देश माझा",
    importedChapterTitle: "डसपटक",
    evidenceUrl: "https://books.ebalbharati.in/pdfs/1001030030.pdf",
    evidenceLabel: "Official eBalbharati Marathi Antarbharati Standard 10 contents page",
    detail: "The imported chapter-11 payload contains chapter-10 डासपीटिका material. The official contents list डासपीटिका as chapter 10 and हा देश माझा as chapter 11.",
  }),
]);

export function authoritativeSourceMappingStatus({ bookId, chapterSlug } = {}) {
  const reviewed = AUTHORITATIVE_REVIEWS.find((candidate) => (
    candidate.bookId === String(bookId || "")
    && candidate.importedChapterSlug === String(chapterSlug || "")
  ));
  if (reviewed) return reviewed;
  return Object.freeze({
    bookId: String(bookId || ""),
    importedChapterSlug: String(chapterSlug || ""),
    status: "not-reviewed",
    authoritativeTextbookMappingVerified: false,
    detail: "The catalog route and imported payload may agree internally, but no authoritative textbook comparison is recorded.",
  });
}
export function sourceMappingReleaseEligibility(input = {}) {
  const authoritative = authoritativeSourceMappingStatus(input);
  return Object.freeze({
    internalMappingConsistent: input.internalMappingConsistent === true,
    authoritative,
    knownAuthoritativeMismatch: authoritative.status === "mismatch",
    indexEligible: input.internalMappingConsistent === true && authoritative.status !== "mismatch",
    searchEligible: input.internalMappingConsistent === true && authoritative.status !== "mismatch",
  });
}
