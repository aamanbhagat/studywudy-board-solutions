import assert from "node:assert/strict";
import test from "node:test";

import {
  buildQuestionPageExperience,
  conciseDirectAnswer,
  findQuestionPageContext,
  renderQuestionPageExperience,
} from "../question-page-experience.mjs";
import { extractCrawlerVisibleText } from "../crawler-visible-text.mjs";

const route = Object.freeze({
  board: "maharashtra-board",
  grade: "class-12",
  subject: "physics",
  book: "balbharati-physics-standard-12",
  chapter: "electrostatics",
  question: "q-msb-balbharati-physics-standard-12-8-001",
});

const catalog = Object.freeze({
  row_id: 1,
  board_name: "Maharashtra State Board",
  grade_label: "Standard 12",
  subject_name: "Physics",
  book_title: "Balbharati Physics Standard 12",
  chapter_number: 8,
  chapter_title: "Electrostatics",
  display_label: "1",
});

function fixturePayload({ edition = "2025 revised edition", optional = false } = {}) {
  return {
    catalog: { book: { title: catalog.book_title, ...(edition ? { edition } : {}) } },
    sourceChecksum: "c06b37bbd876ca01c2717d34cde95a6714e89c428af963be4416f96f461c2dbf",
    sourceVersion: "balbharati-physics-2025-c06b37bbd876",
    chapters: [{
      slug: route.chapter,
      number: 8,
      title: "Electrostatics",
      exercises: [{
        id: "chapter-8-question-set-1",
        displayLabel: "Question Set 1",
        questions: [{
          id: route.question,
          displayLabel: "1",
          order: 1,
          exerciseId: "chapter-8-question-set-1",
          type: "mcq_single",
          prompt: "A charged and isolated parallel-plate capacitor has its plate separation increased. What changes?",
          choices: [
            { id: "a", content: "Charge decreases; potential decreases" },
            { id: "d", content: "Charge is constant; potential increases; capacitance decreases" },
          ],
          correctChoiceId: "d",
          explanation: "For an isolated capacitor, charge remains constant. Since C = ε₀A/d and V = Q/C, increasing d decreases C and increases V.",
          conceptTags: ["parallel-plate-capacitor", "electrostatics"],
          ...(optional ? {
            commonStudentMistake: "Do not treat an isolated capacitor as if it remains connected to a constant-voltage battery.",
            alternativeMethod: "Use the electric-field relation V = Ed after first noting that Q and therefore E remain constant.",
            whyMethodWorks: "Isolation fixes Q, so changing the geometry changes C and V rather than the stored charge.",
          } : {}),
        }, {
          id: "q-msb-balbharati-physics-standard-12-8-002",
          displayLabel: "2",
          order: 2,
          exerciseId: "chapter-8-question-set-1",
          type: "brief",
          prompt: "Explain how capacitance depends on plate separation.",
          answer: "Capacitance is inversely proportional to plate separation for fixed plate area and dielectric.",
          conceptTags: ["parallel-plate-capacitor"],
          examYear: "2024",
        }],
      }],
    }],
  };
}

function modelFor(payload) {
  const context = findQuestionPageContext(payload, route.chapter, route.question);
  return buildQuestionPageExperience({ payload, context, route, catalog, reviewedAt: 1_787_270_400 });
}

test("a question page summary uses the exact mapped answer and textbook context", () => {
  const payload = fixturePayload();
  const model = modelFor(payload);
  const markup = renderQuestionPageExperience(model);
  assert.equal(model.ready, true);
  assert.equal(model.directAnswer, "Option D: Charge is constant; potential increases; capacitance decreases");
  assert.match(markup.aboveFold, /Maharashtra State Board/);
  assert.match(markup.aboveFold, /Standard 12/);
  assert.match(markup.aboveFold, /Balbharati Physics Standard 12/);
  assert.match(markup.aboveFold, /Catalog and imported payload are internally consistent; an authoritative textbook comparison is not recorded/);
  assert.match(markup.trust, /Checksum c06b37bbd876/);
  assert.match(markup.trust, /Internal mapping consistent/);
  assert.match(markup.trust, /Authoritative textbook comparison not recorded/);
  assert.match(markup.trust, /Editorial review pending/);
  assert.match(markup.trust, /No verified named academic reviewer/);
  assert.doesNotMatch(markup.trust, /StudyWudy Editorial Team/);
  assert.doesNotMatch(markup.trust, /Reviewed by/);
  assert.match(markup.trust, /request_type=content_correction/);
  assert.match(markup.trust, /Report an academic error/);
  assert.match(markup.trust, /Textbook edition/);
  assert.match(markup.trust, /Academic year/);
  assert.match(markup.trust, /Source page/);
  assert.match(markup.sameExercise, /Question Set 1/);
  assert.match(markup.sameExercise, /q-msb-balbharati-physics-standard-12-8-002/);
  assert.match(markup.previousYear, /2024/);
});

test("optional study panels render only from question-specific source fields", () => {
  const ordinary = renderQuestionPageExperience(modelFor(fixturePayload()));
  assert.doesNotMatch(ordinary.solutionSupplement, /Common student mistake/);
  assert.doesNotMatch(ordinary.solutionSupplement, /Alternative method/);
  assert.doesNotMatch(ordinary.solutionSupplement, /Why this method works/);

  const enriched = renderQuestionPageExperience(modelFor(fixturePayload({ optional: true })));
  assert.match(enriched.solutionSupplement, /constant-voltage battery/);
  assert.match(enriched.solutionSupplement, /electric-field relation V = Ed/);
  assert.match(enriched.solutionSupplement, /Isolation fixes Q/);
});

test("a formula-only principle renders semantic math instead of visible TeX delimiters", () => {
  const payload = fixturePayload();
  payload.chapters[0].exercises[0].questions[0].formulaUsed = "$$V_{\\text{equatorial}} = \\frac{1}{4\\pi\\varepsilon_0}\\frac{p\\cos 90^\\circ}{r^2} = 0$$";
  const markup = renderQuestionPageExperience(modelFor(payload));
  assert.match(markup.solutionSupplement, /<math[^>]+role="math"[^>]+aria-label="V sub equatorial equals one over four pi epsilon sub zero p cos ninety degrees over r squared equals zero"/u);
  assert.doesNotMatch(markup.solutionSupplement, /math-plain-text|math-semantic-only/u);
  assert.doesNotMatch(markup.solutionSupplement, /data-math-(?:source|spoken|plain)=/u);
  assert.doesNotMatch(markup.solutionSupplement, />\$\$/u);
});

test("a prose principle derives inline formulas instead of exposing raw TeX text", () => {
  const payload = fixturePayload();
  payload.chapters[0].exercises[0].questions[0].formulaUsed = "When $t = \\tfrac{3}{4}d$, the air gap is $d - \\tfrac{3}{4}d = \\tfrac{d}{4}$.";
  const markup = renderQuestionPageExperience(modelFor(payload));
  assert.equal((markup.solutionSupplement.match(/class="math math-semantic math-visible math-inline"/gu) || []).length, 2);
  assert.equal((markup.solutionSupplement.match(/<math\b/gu) || []).length, 2);
  assert.doesNotMatch(markup.solutionSupplement, /math-plain-text|math-semantic-only/u);
  assert.doesNotMatch(extractCrawlerVisibleText(markup.solutionSupplement), /\$|\\tfrac/u);
});

test("a direct answer derives semantic equations instead of exposing TeX delimiters", () => {
  const payload = fixturePayload();
  const question = payload.chapters[0].exercises[0].questions[0];
  question.type = "brief";
  question.correctChoiceId = undefined;
  question.answer = "The work is $$W=\\frac{Q^2}{8\\pi\\varepsilon_0}\\left(\\frac{1}{b}-\\frac{1}{a}\\right)$$ for $a>b$.";
  const markup = renderQuestionPageExperience(modelFor(payload));
  assert.equal((markup.aboveFold.match(/<math\b/gu) || []).length, 2);
  assert.doesNotMatch(markup.aboveFold, /math-plain-text|math-semantic-only/u);
  assert.doesNotMatch(extractCrawlerVisibleText(markup.aboveFold), /\$|\\(?:d?frac|varepsilon)/u);
});

test("missing edition metadata is disclosed instead of inventing verification", () => {
  const model = modelFor(fixturePayload({ edition: null }));
  const markup = renderQuestionPageExperience(model);
  assert.equal(model.edition, null);
  assert.match(markup.aboveFold, /authoritative textbook comparison is not recorded/);
  assert.match(markup.trust, /Not recorded in source data/);
  assert.doesNotMatch(markup.aboveFold, /Verified against/);
});

test("direct answers stay type-aware", () => {
  assert.equal(conciseDirectAnswer({ type: "true_false", result: { value: false, correction: "The field is not zero." } }), "False. The field is not zero.");
  assert.equal(conciseDirectAnswer({ type: "fill_blank", blanks: [{ answer: "coulomb" }] }), "coulomb");
  assert.equal(conciseDirectAnswer({ type: "numerical", finalAnswer: "The acceleration is 9.8 m/s²." }), "The acceleration is 9.8 m/s².");
});

test("the final Worker layer fails indexing closed when the experience is unavailable", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8"));
  assert.match(source, /questionPageExperienceResponse/);
  assert.match(source, /experienceReady[\s\S]{0,80}&& row[\s\S]{0,80}&& isQuestionPubliclyEligible/);
  assert.match(source, /filterPublicQuestionRecommendations/);
  assert.match(source, /corpusQuestionIndexEligible/);
  assert.match(source, /X-StudyWudy-Question-Experience/);
  assert.match(source, /Question-Experience/);
});

test("the bounded question renderer preserves the original StudyWudy page theme", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8"));
  assert.match(source, /data-studywudy-question-template=\"original-theme-v1\"/);
  assert.match(source, /STUDYWUDY_QUESTION_THEME_ASSETS/);
  assert.match(source, /_next\/static\/chunks\/3utpp1hmg6_bb\.css/);
  assert.match(source, /class=\"shell header-inner\"/);
  assert.match(source, /class=\"question-chapter-rail\"/);
  assert.match(source, /class=\"answer-context\"/);
  assert.match(source, /class=\"footer-banner\"/);
  assert.match(source, /canonical-single-pass-v2-themed/);
  assert.doesNotMatch(source, /--ink:#17231d;--green:#174d31;--paper:#f7f2e8/);
});

test("the bounded renderer restores publishing-gated related question sections", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8"));
  assert.match(source, /standaloneEligibleRelatedQuestions/);
  assert.match(source, /standaloneRelatedQuestionSections/);
  assert.match(source, /data-related-question-row-id/);
  assert.match(source, /class=\"related-question-copy\"/);
  assert.match(source, /<b><span>Open<\/span> →<\/b><\/a>/);
  assert.match(source, /sameExerciseOrChapter/);
  assert.match(source, /relatedQuestionSections\.sameTextbook/);
  assert.match(source, /standalone_related_questions_failed/);
  assert.match(source, /ORDER BY ABS\(q\.row_id - \?\) LIMIT 64/);
  assert.match(source, /ORDER BY ABS\(q\.row_id - \?\) LIMIT 96/);
});
