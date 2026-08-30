import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  SERP_TITLE_BUDGET,
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
  // book_code is the group-minimal shelf mark the phase-3 builder emits; the
  // Worker passes it in on every hub render. Left out, hubBookCode derives the
  // same lead from the title, which is what keeps a prerender honest.
  const book = bookSearchMetadata({
    ...academicContext,
    book_title: "Balbharati Physics Standard 12",
    book_code: "Balbharati",
    chapter_count: 16,
    question_count: 497,
  });
  const chapter = chapterSearchMetadata({
    ...academicContext,
    book_title: "Balbharati Physics Standard 12",
    book_code: "Balbharati",
    chapter_number: 8,
    chapter_title: "Electrostatics",
  }, electrostaticsQuestions());

  assert.equal(subject.documentTitle, "Maharashtra Board Class 12 Physics Textbook Solutions | StudyWudy");
  assert.equal(book.documentTitle, "Balbharati Class 12 Physics Solutions | StudyWudy");
  assert.equal(chapter.documentTitle, "Balbharati Cl12 Physics Ch8: Electrostatics Solutions | StudyWudy");
  // Everything that tells two hub pages apart has to sit inside the clip Google
  // applies to the SERP line, or the visible titles are duplicates however
  // distinct the full strings are. The brand suffix is allowed to fall outside it.
  for (const title of [subject.documentTitle, book.documentTitle, chapter.documentTitle]) {
    const identity = title.replace(/\s+\|\s+StudyWudy$/u, "");
    assert.ok([...identity].length <= SERP_TITLE_BUDGET, `${identity} is ${[...identity].length} characters`);
  }
  // The chapter hub and its question pages must name the same book, class and
  // subject the same way — they share hubBookCode and shortSubjectName for it.
  assert.ok(chapter.documentTitle.startsWith("Balbharati Cl12 Physics Ch8"));
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
  assert.equal(questionSocialTitle(record), "Dielectric Slab Capacitor MCQ Solution – Class 12 Physics Chapter 8");
  // The <title> is a separate generator: identifier-first, so the tokens that
  // separate two sibling questions land inside Google's ~60-character clip
  // instead of past it. It carries no " | StudyWudy" — Google appends the site
  // name to the SERP line itself, and there is no room for it here.
  const documentTitle = questionDocumentTitle(record, "Balbharati");
  assert.equal(documentTitle, "Balbharati Cl12 Physics Ch8 Q2: A slab of material of…");
  assert.ok([...documentTitle].length <= SERP_TITLE_BUDGET, `${documentTitle} is ${[...documentTitle].length} characters`);
  assert.equal(record.prompt_text, prompt);
  assert.ok(documentTitle.length < prompt.length);
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
  // "NCERT Company" is the group-minimal book code the phase-3 builder emits for
  // this book; the Worker passes it in from the manifest on every render.
  assert.equal(questionDocumentTitle(record, "NCERT Company"), ACCOUNTANCY_SAMPLE_TITLE);
  assert.equal(questionSocialTitle(record), "A Company Is an Artificial Person – True or False | Class 12 Accountancy");
  const surfaces = `${questionDocumentTitle(record, "NCERT Company")} ${questionSocialTitle(record)} ${questionDescription(record)}`;
  assert.doesNotMatch(surfaces, /39148|catalogue reference/iu);
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
  const title = questionDocumentTitle(record, "Balbharati");
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
  const record = (label, prompt) => ({
    ...academicContext,
    row_id: 3_595,
    question_id: `q-collision-${label}`,
    display_label: label,
    type: "brief",
    prompt_text: prompt,
    book_title: "Lakhmir Singh Chemistry Class 10",
    chapter_number: 2,
    chapter_title: "Acids Bases and Salts",
  });
  const first = record("1", "What effect does the concentration of H+ ions have on the nature of a solution?");
  const second = record("2", "What effect does the concentration of OH- ions have on the nature of a solution?");
  const titles = [first, second].map((row) => questionDocumentTitle(row, "Lakhmir Singh"));
  // These two prompts are identical for 44 characters, so the prompt tail cannot
  // be what separates the titles — the Q label is, and it sits at character 30.
  // Both titles fit the SERP budget whole, so differing here is the same thing
  // as differing after Google's clip.
  assert.notEqual(titles[0], titles[1]);
  for (const title of titles) {
    assert.ok([...title].length <= SERP_TITLE_BUDGET, `${title} is ${[...title].length} characters`);
  }
  // The description and social card stay prompt-first, so they separate on the
  // prompt tail instead and must carry the disambiguating qualifier to do it.
  assert.notEqual(questionDescription(first, true), questionDescription(second, true));
  assert.notEqual(questionSocialTitle(first, true), questionSocialTitle(second, true));
  assert.ok([...questionDescription(first, true)].length <= 160, questionDescription(first, true));
});
