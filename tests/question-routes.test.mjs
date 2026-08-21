import assert from "node:assert/strict";
import test from "node:test";
import {
  getQuestionUrl,
  isLegacyQuestionId,
  questionIdFromUrl,
  questionRecordFromCatalogRow,
} from "../question-routes.mjs";

const canonicalPath = "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electrostatics/questions/q-msb-balbharati-physics-standard-12-8-001";

test("builds the canonical public question URL", () => {
  assert.equal(getQuestionUrl({
    boardSlug: "maharashtra-board",
    classNumber: 12,
    subjectSlug: "physics",
    textbookSlug: "balbharati-physics-standard-12",
    chapterSlug: "electrostatics",
    publicQuestionId: "q-msb-balbharati-physics-standard-12-8-001",
  }), canonicalPath);
});

test("maps a D1 catalog projection into the same canonical URL", () => {
  const record = questionRecordFromCatalogRow({
    board_slug: "maharashtra-board",
    grade_slug: "class-12",
    subject_slug: "physics",
    book_slug: "balbharati-physics-standard-12",
    chapter_slug: "electrostatics",
    question_id: "q-msb-balbharati-physics-standard-12-8-001",
  });
  assert.equal(getQuestionUrl(record), canonicalPath);
});

test("rejects malformed route records instead of emitting a broken href", () => {
  assert.throws(() => getQuestionUrl({
    boardSlug: "maharashtra-board",
    classNumber: 0,
    subjectSlug: "physics",
    textbookSlug: "balbharati-physics-standard-12",
    chapterSlug: "electrostatics",
    publicQuestionId: "q-msb-balbharati-physics-standard-12-8-001",
  }), /classNumber/u);
});

test("identifies the retired demo IDs without rejecting canonical catalog IDs", () => {
  assert.equal(isLegacyQuestionId("q-physics-08-a"), true);
  assert.equal(isLegacyQuestionId("q-physics-12"), true);
  assert.equal(isLegacyQuestionId("q-msb-balbharati-physics-standard-12-8-001"), false);
  assert.equal(isLegacyQuestionId("q-psych-1-001"), false);
});

test("extracts public IDs only from question routes", () => {
  assert.equal(questionIdFromUrl(canonicalPath), "q-msb-balbharati-physics-standard-12-8-001");
  assert.equal(questionIdFromUrl("/maharashtra-board/class-12/physics"), null);
});
