import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compactText,
  plainText,
  questionDescription,
  questionDocumentTitle,
  questionMainHeading,
  questionSocialTitle,
} from "../question-seo.mjs";
import { ACCOUNTANCY_SAMPLE_TITLE } from "../public-title-quality.mjs";
import {
  bookSearchMetadata,
  chapterSearchMetadata,
  subjectSearchMetadata,
} from "../search-metadata.mjs";

const academicContext = Object.freeze({
  board_slug: "maharashtra-board",
  board_name: "Maharashtra State Board of Secondary and Higher Secondary Education",
  board_short_name: "Maharashtra State Board",
  class_number: 12,
  grade_label: "Class 12",
  subject_name: "Physics",
  subject_slug: "physics",
});

function electrostaticsQuestions() {
  return [
    ...Array.from({ length: 5 }, (_, index) => ({
      type: "mcq_single",
      prompt: index === 1 ? "A dielectric slab has the same area as a parallel plate capacitor." : "Choose the correct electrostatics option.",
      bookPage: index === 0 ? 212 : 213,
    })),
    ...Array.from({ length: 8 }, () => ({ type: "brief", prompt: "Answer this electrostatics question in brief.", bookPage: 213 })),
    ...Array.from({ length: 8 }, (_, index) => ({
      type: "numerical",
      prompt: index < 5 ? "Calculate the capacitance or energy of the capacitor." : "Calculate electric potential and dipole work.",
      bookPage: 213,
    })),
  ];
}

test("subject, textbook and chapter titles match real student search language", () => {
  const subject = subjectSearchMetadata({
    ...academicContext,
    book_count: 2,
    chapter_count: 32,
    question_count: 1_038,
  });
  const book = bookSearchMetadata({
    ...academicContext,
    book_title: "Balbharati Physics Standard 12",
    chapter_count: 16,
    question_count: 497,
  });
  const chapter = chapterSearchMetadata({
    ...academicContext,
    book_title: "Balbharati Physics Standard 12",
    chapter_number: 8,
    chapter_title: "Electrostatics",
  }, electrostaticsQuestions());

  assert.equal(subject.documentTitle, "Maharashtra Board Class 12 Physics Solutions and Question Bank | StudyWudy");
  assert.equal(book.documentTitle, "Balbharati Physics Class 12 Solutions – All 16 Chapters | StudyWudy");
  assert.equal(chapter.documentTitle, "Balbharati Physics Class 12 Chapter 8: Electrostatics Solutions – Maharashtra Board | StudyWudy");
  assert.equal(chapter.description, "Complete Maharashtra Board Class 12 Physics Chapter 8 Electrostatics solutions, including MCQs, brief answers, capacitor numericals and step-by-step textbook answers from Balbharati Physics Standard 12 on pages 212–213.");
});

test("the dielectric-slab title uses its normalized MCQ type rather than a numerical topic keyword", () => {
  const prompt = "A slab of material of dielectric constant k has the same area A as the plates of a parallel plate capacitor and has a thickness (3/4d), where d is the separation of the plates. The change in capacitance when the slab is inserted between the plates is ______.";
  const record = {
    ...academicContext,
    row_id: 229_911,
    question_id: "q-msb-balbharati-physics-standard-12-8-002",
    display_label: "2",
    type: "mcq_single",
    prompt_text: prompt,
    book_title: "Balbharati Physics Standard 12",
    chapter_number: 8,
    chapter_title: "Electrostatics",
  };
  assert.equal(questionDocumentTitle(record), "Dielectric Slab Capacitor MCQ Solution – Class 12 Physics Chapter 8 | StudyWudy");
  assert.equal(record.prompt_text, prompt);
  assert.ok(questionDocumentTitle(record).length < prompt.length);
});

test("true-or-false titles use the statement and never expose the private database row ID", () => {
  const record = {
    board_slug: "cbse",
    board_name: "Central Board of Secondary Education",
    board_short_name: "CBSE",
    class_number: 12,
    grade_label: "Class 12",
    grade_slug: "class-12",
    subject_name: "Accountancy",
    subject_slug: "accountancy",
    row_id: 39_148,
    question_id: "q-cbse-ncert-accountancy-company-accounts-and-analysis-of-financial-statements-class-12-1-001",
    display_label: "1",
    type: "brief",
    prompt_text: "**State whether the following statement is True or False.** A company is an artificial person.",
    book_title: "NCERT Accountancy Company Accounts and Analysis of Financial Statements Class 12",
    chapter_number: 1,
    chapter_title: "Accounting for Share Capital",
  };
  assert.equal(questionDocumentTitle(record), ACCOUNTANCY_SAMPLE_TITLE);
  assert.equal(questionSocialTitle(record), ACCOUNTANCY_SAMPLE_TITLE);
  assert.doesNotMatch(questionDescription(record), /39148|catalogue reference/iu);
});

test("collision handling uses public textbook context and genuine question labels", () => {
  const record = {
    ...academicContext,
    row_id: 987_654_321,
    question_id: "q-public-example",
    display_label: "7(b)",
    type: "brief",
    prompt_text: "State Coulomb's law.",
    book_title: "Balbharati Physics Standard 12",
    chapter_number: 8,
    chapter_title: "Electrostatics",
  };
  const title = questionDocumentTitle(record, true);
  const description = questionDescription(record, true);
  assert.match(title, /Maharashtra Board|Balbharati|Q7\(b\)/u);
  assert.doesNotMatch(`${title} ${description}`, /987654321|catalogue reference/iu);
});

test("chapter descriptions change with source textbook and real question mix", () => {
  const first = chapterSearchMetadata({
    ...academicContext,
    book_title: "Balbharati Physics Standard 12",
    chapter_number: 8,
    chapter_title: "Electrostatics",
  }, electrostaticsQuestions());
  const second = chapterSearchMetadata({
    ...academicContext,
    book_title: "Maharashtra State Board HSC Question Bank Physics Standard 12",
    chapter_number: 8,
    chapter_title: "Electrostatics",
  }, [{ type: "brief", prompt_text: "Explain electric field." }]);
  assert.notEqual(first.description, second.description);
  assert.match(first.description, /MCQs, brief answers, capacitor numericals/u);
  assert.match(second.description, /HSC Question Bank/u);
});

test("main question headings omit the question-type instruction but preserve the actual prompt", () => {
  assert.equal(questionMainHeading({
    question_id: "fill-blank-example",
    display_label: "35",
    prompt_text: "Fill in the blank: The whorl is green that protects the flower until it opens.",
  }), "The whorl is green that protects the flower until it opens");
  assert.equal(questionMainHeading({
    question_id: "one-sentence-example",
    display_label: "11",
    prompt_text: "Answer in one sentence. Which glands contribute fluids to the semen?",
  }), "Which glands contribute fluids to the semen?");
  assert.equal(questionMainHeading({
    question_id: "ordinary-question-example",
    display_label: "22",
    prompt_text: "Describe the process of double fertilization.",
  }), "Describe the process of double fertilization");
  assert.equal(questionMainHeading({
    question_id: "matrix-example",
    display_label: "11",
    prompt_text: String.raw`Find the co-factor of the following matrix. $\left[\begin{matrix}1&-1&2\\-2&3&5\\-2&0&-1\end{matrix}\right]$`,
  }), "Find the co-factor of the following matrix. [1, −1, 2; −2, 3, 5; −2, 0, −1]");
});

test("the Worker rewrites search metadata without replacing ordinary question H1 text", async () => {
  const source = await readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8");
  assert.match(source, /academicSearchMetadataResponse/);
  assert.match(source, /chapterSearchMetadata/);
  assert.match(source, /X-StudyWudy-Search-Metadata/);
  const questionSection = source.slice(
    source.indexOf("async function questionMetadataResponse"),
    source.indexOf("async function questionCompletenessIndexingResponse"),
  );
  assert.equal((questionSection.match(/answer-page-hero h1/gu) || []).length, 1);
  assert.match(questionSection, /if \(overrideSchema\)/u);
  assert.doesNotMatch(questionSection, /\.on\(["']h1["']/u);
});

test("compaction survives a second pass so truncated metadata keeps its marker", () => {
  const sentence = "State the effect that the concentration of hydrogen ions has on the nature of an aqueous solution";
  const clipped = compactText(sentence, 44);
  assert.ok(clipped.endsWith("…"), `expected a truncation marker, got ${JSON.stringify(clipped)}`);
  // NFKC decomposes U+2026 into three full stops and the trailing-punctuation
  // strip then removed them, so re-compacting an already-clipped string used to
  // publish a title that simply stopped mid-phrase.
  assert.equal(plainText(clipped), clipped);
  assert.equal(compactText(clipped, 200), clipped);
  assert.doesNotMatch(`${plainText(clipped)}. From a textbook.`, /\.\.\./u);
});

test("printed dot leaders in fill-in-the-blank prompts do not read as broken truncation", () => {
  assert.equal(plainText("Water has...................... density than ice."), "Water has… density than ice");
  assert.equal(plainText("Express 0.99999.... in the form p/q"), "Express 0.99999… in the form p/q");
  assert.equal(plainText("Wait... just a moment"), "Wait... just a moment");
});

test("neighbouring questions that differ only past the old 44-character cut get distinct metadata", () => {
  const record = (prompt) => ({
    ...academicContext,
    row_id: 3_595,
    question_id: `q-collision-${prompt.length}`,
    display_label: "1",
    type: "brief",
    prompt_text: prompt,
    book_title: "Lakhmir Singh Chemistry Class 10",
    chapter_number: 2,
    chapter_title: "Acids Bases and Salts",
  });
  const first = record("What effect does the concentration of H+ ions have on the nature of a solution?");
  const second = record("What effect does the concentration of OH- ions have on the nature of a solution?");
  assert.notEqual(questionDocumentTitle(first), questionDocumentTitle(second));
  assert.notEqual(questionDescription(first), questionDescription(second));
  for (const value of [questionDocumentTitle(first), questionDescription(first)]) {
    assert.ok([...value].length <= 160, `${value} is ${[...value].length} characters`);
  }
});
