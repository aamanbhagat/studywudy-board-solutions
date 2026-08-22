import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CORPUS_QUALITY_CHAPTER_FINDINGS,
  CORPUS_QUALITY_CLASSIFICATIONS,
  CORPUS_QUALITY_FINDINGS,
  corpusQualityFindingForQuestion,
  corpusQuestionIndexEligible,
  corpusQuestionReviewedSearchException,
  corpusQuestionSearchEligible,
  renderCorpusQualityNote,
} from "../corpus-quality.mjs";
import {
  CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS,
  CORPUS_QUALITY_MANIFEST,
} from "../corpus-quality-manifest.mjs";
import { extractCrawlerVisibleText } from "../crawler-visible-text.mjs";
import {
  NCERT_CLASS_10_MATHEMATICS_EXEMPLAR_BOOK_ID,
  repairKnownText,
  reviewedChapterTitle,
} from "../multilingual-text-quality.mjs";
import { QUESTION_SHOWCASE_ENTRIES } from "../question-showcase-manifest.mjs";
import {
  MARATHI_ANTARBHARATI_BOOK_ID,
  authoritativeSourceMappingStatus,
} from "../source-mapping-quality.mjs";
import {
  CORPUS_QUALITY_SMOKE_CASES,
  inspectCorpusQualityHtml,
} from "../scripts/corpus-quality-smoke.mjs";

const chemistrySourceTypoId = "q-cbse-ncert-exemplar-chemistry-exemplar-class-12-1-042";
const hcVermaImportId = "q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-29-031";

test("every reviewed occurrence uses the requested provenance classification vocabulary", () => {
  for (const finding of [
    ...Object.values(CORPUS_QUALITY_FINDINGS),
    ...Object.values(CORPUS_QUALITY_CHAPTER_FINDINGS),
  ]) {
    assert.ok(CORPUS_QUALITY_CLASSIFICATIONS.includes(finding.classification));
  }
  assert.equal(CORPUS_QUALITY_FINDINGS[chemistrySourceTypoId].classification, "source typo retained with note");
  assert.equal(CORPUS_QUALITY_FINDINGS[hcVermaImportId].classification, "OCR/import corruption");
});

test("NCERT's correct chapter PDF title repairs public metadata without changing the legacy slug", () => {
  assert.equal(
    reviewedChapterTitle(NCERT_CLASS_10_MATHEMATICS_EXEMPLAR_BOOK_ID, "quadatric-euation", "Quadatric Euation"),
    "Quadratic Equations",
  );
  assert.equal(
    repairKnownText(NCERT_CLASS_10_MATHEMATICS_EXEMPLAR_BOOK_ID, "Study Quadatric Euation"),
    "Study Quadratic Equations",
  );
  assert.equal(repairKnownText(NCERT_CLASS_10_MATHEMATICS_EXEMPLAR_BOOK_ID, "quadatric-euation"), "quadatric-euation");
});

test("uncertain imports and duplicate options fail search and indexing closed", () => {
  assert.equal(corpusQuestionSearchEligible({ question_id: hcVermaImportId, row_id: 61425 }), false);
  assert.equal(corpusQuestionIndexEligible({ questionId: hcVermaImportId, rowId: 61425 }), false);
  const duplicateRowId = CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS[0];
  assert.equal(corpusQuestionSearchEligible({ question_id: "clean", row_id: duplicateRowId }, CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS), false);
  assert.equal(corpusQuestionIndexEligible({ questionId: "clean", rowId: duplicateRowId, duplicateRowIds: CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS }), false);
  assert.equal(CORPUS_QUALITY_MANIFEST.runtimeDuplicateChoiceCount, CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS.length);
  assert.ok(CORPUS_QUALITY_MANIFEST.duplicateChoiceCount >= CORPUS_QUALITY_MANIFEST.runtimeDuplicateChoiceCount);
  assert.ok(CORPUS_QUALITY_MANIFEST.duplicateChoiceCount > 0);
  assert.equal(QUESTION_SHOWCASE_ENTRIES.some(({ rowId }) => CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS.includes(rowId)), false);
  assert.equal(corpusQuestionReviewedSearchException("q-msb-balbharati-physics-standard-12-8-005"), true);
  assert.equal(corpusQuestionReviewedSearchException(hcVermaImportId), false);
});

test("the authoritative Marathi chapter mismatch is separate from internal route consistency", () => {
  const questionId = "q-msb-balbharati-marathi-composite-antarbharati-standard-10-11-001";
  const row = {
    question_id: questionId,
    row_id: 190697,
    book_id: MARATHI_ANTARBHARATI_BOOK_ID,
    chapter_slug: "chapter-11",
  };
  const mapping = authoritativeSourceMappingStatus({ bookId: row.book_id, chapterSlug: row.chapter_slug });
  assert.equal(mapping.status, "mismatch");
  assert.equal(mapping.expectedChapterNumber, 10);
  assert.equal(mapping.expectedChapterTitle, "डासपीटिका");
  assert.equal(mapping.followingChapterTitle, "हा देश माझा");
  assert.equal(corpusQuestionSearchEligible(row), false);
  assert.equal(corpusQuestionIndexEligible({ questionId, rowId: row.row_id }), false);
  assert.equal(QUESTION_SHOWCASE_ENTRIES.some((entry) => entry.questionId === questionId), false);
});

test("source quotations can be retained while excluded from crawler snippets", () => {
  const finding = corpusQualityFindingForQuestion(chemistrySourceTypoId);
  const html = `<main><section data-nosnippet>Electron moves towards the positvely charged plate.</section>${renderCorpusQualityNote(finding)}</main>`;
  const text = extractCrawlerVisibleText(html);
  assert.doesNotMatch(text, /positvely/u);
  assert.match(text, /Verified source typo retained/u);
  assert.match(html, /data-content-quality-classification="source typo retained with note"/u);
});

test("the Worker applies the manifest to atomic, chapter and search surfaces", async () => {
  const source = await readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8");
  assert.match(source, /corpusQuestionSearchEligible\(row, CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS\)/u);
  assert.match(source, /corpusQuestionIndexEligible\(\{/u);
  assert.match(source, /if \(!experience\.snippetEligible\) element\.setAttribute\("data-nosnippet", ""\)/u);
  assert.match(source, /experience\.snippetExcludedQuestionIds/u);
  assert.match(source, /createPlainSearchText\(repairKnownText\(row\.book_id, row\.prompt_text\)\)/u);
  assert.match(source, /const prompt = truncateSearchExcerpt\(plainPrompt\)/u);
  assert.match(source, /data-search-description="plain-v2"/u);
  assert.match(source, /staticCorpusPageResponse/u);
  assert.match(source, /pages\/corpus-quality\/quadratic-equations/u);
  assert.deepEqual(new Set(CORPUS_QUALITY_SMOKE_CASES.map(({ surface }) => surface)), new Set(["atomic", "chapter", "search"]));
  const inspected = inspectCorpusQualityHtml(
    { excludes: /rfrom/u, classification: "OCR/import corruption", snippetExcluded: true, noindex: true },
    '<main><section data-nosnippet>distance rfrom the origin</section><aside data-content-quality-classification="OCR/import corruption">Imported wording under source review</aside></main>',
    new Headers({ "x-robots-tag": "noindex, follow" }),
  );
  assert.deepEqual(inspected.failures, []);
});

test("the corrected Quadratic Equations fallback is compact, clean and complete", async () => {
  const html = await readFile(new URL("../comparison/after-assets/pages/corpus-quality/quadratic-equations/index.html", import.meta.url), "utf8");
  const text = extractCrawlerVisibleText(html);
  assert.equal((html.match(/data-question-id=/gu) || []).length, 56);
  assert.match(text, /Quadratic Equations/u);
  assert.doesNotMatch(text, /Quadatric|\*\*|\$\$|\\frac|<br\s*\/?>/u);
});

test("unverified imported wording is retained only inside noindex source-review pages", async () => {
  const cases = [
    ["127683", /rfrom/u, /Imported wording under source review/u],
    ["59639", /bye the/u, /Imported wording under source review/u],
    ["61425", /rfrom/u, /Imported wording under source review/u],
    ["998", /\*\*|\$\$|<br\s*\/?>/u, /Duplicate options under source review/u],
  ];

  for (const [rowId, excluded, note] of cases) {
    const html = await readFile(
      new URL(`../comparison/after-assets/pages/corpus-quality/source-review-${rowId}/index.html`, import.meta.url),
      "utf8",
    );
    const text = extractCrawlerVisibleText(html);
    assert.match(html, /<meta name="robots" content="noindex, follow">/u);
    assert.match(html, /class="source-question" data-nosnippet/u);
    assert.match(html, /data-content-quality-classification="OCR\/import corruption"/u);
    assert.match(text, note);
    assert.doesNotMatch(text, excluded);
  }
});

test("affected chapter registers stay readable without exposing classified source defects", async () => {
  const cases = [
    ["chapter-solid-states", /positvely/u],
    ["chapter-electric-field-and-potential", /rfrom/u],
    ["chapter-friction", /bye the/u],
  ];
  for (const [asset, excluded] of cases) {
    const html = await readFile(
      new URL(`../comparison/after-assets/pages/corpus-quality/${asset}/index.html`, import.meta.url),
      "utf8",
    );
    const text = extractCrawlerVisibleText(html);
    assert.match(html, /class="question-link source-review"[^>]*data-nosnippet/u);
    assert.doesNotMatch(text, excluded);
    assert.doesNotMatch(text, /\*\*|\$\$|\\frac|<br\s*\/?>/u);
  }
});
