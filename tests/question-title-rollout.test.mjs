import assert from "node:assert/strict";
import test from "node:test";
import { compactDistinctiveText, questionDocumentTitle, questionLegacyDocumentTitle } from "../question-seo.mjs";
import {
  QUESTION_TITLE_PINNED_ROWS,
  QUESTION_TITLE_ROLLOUT_ROWS,
  QUESTION_TITLE_ROLLOUT_STAGE,
  QUESTION_TITLE_STAGE_ROWS,
  questionTitleRolledOut,
} from "../question-title-rollout.mjs";

// Row 39,148, the page public-title-quality.mjs pins against served HTML.
const ACCOUNTANCY = Object.freeze({
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
});

test("the legacy title is the pre-rollout string, not a second identity-first variant", () => {
  // A page outside the stage has to serve the byte string it served before the
  // rewrite. If this drifts, the rollout stops being reversible: withdrawing a
  // batch would leave those pages on a third title nobody has ever measured.
  const legacy = questionLegacyDocumentTitle(ACCOUNTANCY);
  assert.equal(legacy, "A Company Is an Artificial Person – True or False | Class 12 Accountancy");
  assert.notEqual(legacy, questionDocumentTitle(ACCOUNTANCY, "NCERT Company"));
  // The true-false branch is the one that suppressed the brand suffix; every
  // other layout carried it, and that asymmetry is part of the old string.
  assert.doesNotMatch(legacy, /\| StudyWudy$/u);
  assert.match(
    questionLegacyDocumentTitle({ ...ACCOUNTANCY, type: "mcq_single", prompt_text: "Find the value of x." }),
    /\| StudyWudy$/u,
  );
});

test("an elided book code never keeps half a word", () => {
  // The canary caught "NCERT…xemplar" on 41,513 pages: the tail slice landed
  // inside "Exemplar", so the partial-word strip had no whitespace to match and
  // kept the fragment. Every token beside the ellipsis must be a whole word of
  // the input, which is the one property that makes the output safe to print.
  assert.equal(compactDistinctiveText("NCERT Mathematics Exemplar", 18), "NCERT…");
  assert.equal(compactDistinctiveText("NCERT Mathematics Exemplar", 22), "NCERT…Exemplar");
  assert.equal(compactDistinctiveText("Balbharati Marathi Composite", 22), "Balbharati…Composite");
  for (const source of [
    "NCERT Mathematics Exemplar", "NCERT English Flamingo", "Balbharati Marathi Composite",
    "SCERT Ganit Bhag 2 Bijganit", "Goyal Brothers Prakashan Commercial Applications",
    "Samacheer Kalvi Biology Botany", "NCERT Social and Political Life 1",
  ]) {
    for (const budget of [8, 12, 16, 18, 22, 26, 30]) {
      const output = compactDistinctiveText(source, budget);
      assert.ok([...output].length <= budget, `${budget}: "${output}" exceeds its budget`);
      const words = new Set(source.split(/\s+/u));
      // A trailing "…" is a clip and may cut mid-word - "Balbhar…" reads as
      // truncated. A fragment *after* an ellipsis does not: "…xemplar" gives the
      // reader a meaningless suffix with no signal that anything preceded it.
      const clipped = /…$/u.test(output) && output.indexOf("…") === output.length - 1;
      const tokens = output.replace(/…/gu, " ").split(/\s+/u).filter(Boolean);
      for (const [index, token] of tokens.entries()) {
        if (clipped && index === tokens.length - 1) continue;
        assert.ok(words.has(token), `${budget}: "${output}" invented the token "${token}"`);
      }
    }
  }
  // A single word longer than its half has nothing to elide around, so it falls
  // back to a clip with a trailing ellipsis rather than splicing two fragments.
  assert.equal(compactDistinctiveText("Antidisestablishmentarianism", 12), "Antidisesta…");
});

test("the two release-gated rows are inside every stage", () => {
  // scripts/search-metadata-gate.mjs:162 and public-title-quality.mjs:7 both pin
  // an exact identity-first title, and the second is checked against served
  // HTML. A stage that omits either row fails check:release rather than
  // reporting a rollout problem, so the failure would read as the wrong bug.
  assert.ok(questionTitleRolledOut(39_148), "row 39148 (public-title-quality sample) must be rolled out");
  assert.ok(questionTitleRolledOut(229_911), "row 229911 (search-metadata-gate sample) must be rolled out");
});

test("membership is an explicit, stable row set rather than a sample", () => {
  // The same URL must return the same title on every request. A hash or
  // percentage split would let one page's title flicker between two strings,
  // which is worse for search than either title on its own.
  assert.ok(["release-gates", "canary-1", "all"].includes(QUESTION_TITLE_ROLLOUT_STAGE));
  for (const rows of [QUESTION_TITLE_PINNED_ROWS, QUESTION_TITLE_ROLLOUT_ROWS]) {
    assert.equal(rows.length, new Set(rows).size);
    assert.ok(rows.every((rowId) => Number.isSafeInteger(rowId) && rowId > 0));
    assert.deepEqual([...rows].sort((a, b) => a - b), [...rows]);
  }
  // The canary the rollout was sized for; the pinned set is a floor, not a stage
  // anyone chose, so only the canary carries the 100-200 bound.
  assert.ok(QUESTION_TITLE_ROLLOUT_ROWS.length >= 100 && QUESTION_TITLE_ROLLOUT_ROWS.length <= 200);
  // Widening a stage may never drop a page back to the legacy title: a URL that
  // moved forward and then back would show Google two titles for one page.
  assert.ok(QUESTION_TITLE_PINNED_ROWS.every((rowId) => QUESTION_TITLE_ROLLOUT_ROWS.includes(rowId)));
  for (let index = 0; index < 3; index += 1) assert.ok(questionTitleRolledOut(QUESTION_TITLE_STAGE_ROWS[0]));
});

test("rows outside the stage are not rolled out, whatever shape the id arrives in", () => {
  const outside = 299_458;
  assert.ok(!QUESTION_TITLE_STAGE_ROWS.includes(outside));
  assert.equal(questionTitleRolledOut(outside), false);
  // D1 hands the fallback metadata path a string row_id
  // (comparison/after-worker.js, questionMetadataResponse), so the predicate
  // has to coerce or that whole route silently serves legacy titles forever.
  assert.equal(questionTitleRolledOut(String(QUESTION_TITLE_STAGE_ROWS[0])), true);
  assert.equal(questionTitleRolledOut(null), false);
  assert.equal(questionTitleRolledOut(undefined), false);
  assert.equal(questionTitleRolledOut("not-a-row"), false);
});
