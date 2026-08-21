import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  questionDocumentTitle,
} from "../question-seo.mjs";
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
  assert.equal(book.documentTitle, "Balbharati Class 12 Physics Solutions – All 16 Chapters | StudyWudy");
  assert.equal(chapter.documentTitle, "Maharashtra Board Class 12 Physics Chapter 8 Electrostatics Solutions | StudyWudy");
  assert.equal(chapter.description, "Complete Maharashtra Board Class 12 Physics Chapter 8 Electrostatics solutions, including MCQs, brief answers, capacitor numericals and step-by-step textbook answers from Balbharati Physics Standard 12 on pages 212–213.");
});

test("individual numerical title is compact while the visible question remains exact", () => {
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
  assert.equal(questionDocumentTitle(record), "Dielectric Slab Capacitor Numerical – Class 12 Physics Chapter 8 | StudyWudy");
  assert.equal(record.prompt_text, prompt);
  assert.ok(questionDocumentTitle(record).length < prompt.length);
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
