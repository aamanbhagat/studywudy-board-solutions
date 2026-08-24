import assert from "node:assert/strict";
import test from "node:test";

import {
  buildQuestionPageExperience,
  conciseDirectAnswer,
  findQuestionPageContext,
  QUESTION_PAGE_THEME_ALIGNMENT_STYLES,
  renderQuestionPageExperience,
} from "../question-page-experience.mjs";
import { extractCrawlerVisibleText } from "../crawler-visible-text.mjs";
import { subjectAwareQuestionTypeLabel } from "../question-type-labels.mjs";
import {
  questionHasRepeatedProofPresentation,
  questionNeedsStepByStepSolution,
  questionSolutionLabel,
} from "../question-solution-label.mjs";
import { placeQuestionSolutionMedia } from "../question-solution-media.mjs";
import { MAX_RELATED_QUESTIONS, MIN_RELATED_QUESTIONS, relatedQuestionTargetCount } from "../related-question-count.mjs";
import { buildCompletedFillBlank } from "../fill-blank-completion.mjs";

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

test("Mathematics brief records use the student-facing Problem label", () => {
  assert.equal(subjectAwareQuestionTypeLabel("brief", "mathematics", "Brief answer"), "Problem");
  assert.equal(subjectAwareQuestionTypeLabel("brief", "physics", "Brief answer"), "Brief answer");
  assert.equal(subjectAwareQuestionTypeLabel("numerical", "mathematics", "Numerical"), "Numerical");

  const payload = fixturePayload();
  const question = payload.chapters[0].exercises[0].questions[0];
  question.type = "brief";
  question.correctChoiceId = undefined;
  question.answer = "The required result follows from the given relation.";
  const mathematicsRoute = { ...route, subject: "mathematics" };
  const context = findQuestionPageContext(payload, mathematicsRoute.chapter, mathematicsRoute.question);
  const model = buildQuestionPageExperience({
    payload,
    context,
    route: mathematicsRoute,
    catalog: { ...catalog, subject_name: "Mathematics" },
    reviewedAt: 1_787_270_400,
  });
  assert.equal(model.questionTypeLabel, "Problem");
  assert.match(renderQuestionPageExperience(model).aboveFold, /Question 1 · Problem/);
});

test("question study sections share the StudyWudy answer-sheet theme", () => {
  assert.match(
    QUESTION_PAGE_THEME_ALIGNMENT_STYLES,
    /\.standalone-question-page \.question-answer-summary\{[\s\S]*?border:3px solid var\(--question-ink\);[\s\S]*?background:var\(--question-white\);/u,
  );
  assert.match(
    QUESTION_PAGE_THEME_ALIGNMENT_STYLES,
    /\.standalone-question-page \.phase4-review-signal\{[\s\S]*?display:grid;[\s\S]*?border-left:9px solid var\(--question-green\);/u,
  );
  assert.match(
    QUESTION_PAGE_THEME_ALIGNMENT_STYLES,
    /\.standalone-question-page \.question-trust-panel::before\{[\s\S]*?linear-gradient/u,
  );
  assert.match(
    QUESTION_PAGE_THEME_ALIGNMENT_STYLES,
    /\.standalone-question-page \.question-exercise-card\{[\s\S]*?box-shadow:var\(--question-shadow\);/u,
  );
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
  assert.match(source, /QUESTION_PAGE_THEME_ALIGNMENT_STYLES/);
  assert.match(source, /canonical-single-pass-v2-themed/);
  assert.match(source, /Same solution · clearer view/);
  assert.match(source, /The method and answer are unchanged\./);
  assert.match(source, /\.solution-body section:has\(>\.same-solution-divider\)\{[^}]*border-top:3px solid var\(--ink\)!important/);
  assert.match(source, /placeQuestionSolutionMedia/);
  assert.match(source, /data-solution-media-placement="\$\{escapeHtmlAttribute\(placement\)\}"/u);
  assert.doesNotMatch(source, /<div>\$\{solutionMarkup\}<\/div>\$\{solutionMedia\}/u);
  assert.doesNotMatch(source, /--ink:#17231d;--green:#174d31;--paper:#f7f2e8/);
});

test("solution content does not repeat visible answer, explanation, or step headings", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /<h3>Answers?<\/h3>/u);
  assert.doesNotMatch(source, /<h3>Explanation<\/h3>/u);
  assert.doesNotMatch(source, /<h3>Step-by-step solution<\/h3>/u);
  assert.match(source, /<section aria-label="Answer">/u);
  assert.match(source, /<section aria-label="Explanation">/u);
  assert.match(source, /<section aria-label="Solution steps">/u);
  assert.match(source, /<h2 class="solution-kicker solution-kicker-green"[^>]*>\$\{escapeHtmlAttribute\(solutionLabel\)\}<\/h2>/u);
});

test("the green solution label is concise except where worked steps are required", () => {
  const descriptive = { type: "detailed", prompt: "Describe the process of double fertilization." };
  assert.equal(questionSolutionLabel(descriptive, { subject: "biology" }), "Solution");
  assert.equal(questionNeedsStepByStepSolution(descriptive, { subject: "biology" }), false);
  assert.equal(questionSolutionLabel({ ...descriptive, steps: [{ content: "First step" }] }, { subject: "biology" }), "Step-by-step solution");
  assert.equal(questionSolutionLabel({ type: "brief", prompt: "State the result." }, { subject: "mathematics" }), "Step-by-step solution");
  assert.equal(questionSolutionLabel({ type: "numerical", prompt: "Find the current." }, { subject: "physics" }), "Step-by-step solution");
  assert.equal(questionSolutionLabel({ type: "brief", prompt: "Derive the required expression." }, { subject: "physics" }), "Step-by-step solution");
});

test("the clearer-view divider appears only for a complete proof repeated in three representations", () => {
  const repeatedProof = {
    prompt: "Using rules in logic, prove the following statement.",
    answer: {
      kind: "blocks",
      blocks: [
        { kind: "paragraph", text: "Proof: We prove the statement using the standard logical equivalence laws." },
        { kind: "paragraph", text: "Assumption: p and q are propositions. Start with the LHS and apply De Morgan's Law." },
        { kind: "paragraph", text: "Step 1: Rewrite the LHS, distribute the common term, and use the complement law. This gives the required RHS without changing the original expression." },
        { kind: "paragraph", text: "Conclusion: The LHS equals RHS. Hence proved." },
      ],
    },
    steps: [{ content: "Start with LHS" }, { content: "Apply the laws" }],
    finalAnswer: "The identity is proved.",
  };
  const ordinaryWorkedAnswer = {
    prompt: "Check whether the following matrix is invertible or not.",
    answer: "The matrix is invertible because its determinant equals 1.",
    steps: [{ content: "Write the determinant" }, { content: "Apply the identity" }],
    finalAnswer: "The determinant is non-zero, so the matrix is invertible.",
  };

  assert.equal(questionHasRepeatedProofPresentation(repeatedProof), true);
  assert.equal(questionHasRepeatedProofPresentation(ordinaryWorkedAnswer), false);
  assert.equal(questionHasRepeatedProofPresentation({ ...repeatedProof, finalAnswer: null }), false);
  assert.equal(questionHasRepeatedProofPresentation({ ...repeatedProof, steps: [] }), false);
});

test("solution figures are placed at their relevant explanation instead of the answer end", () => {
  const media = '<div class="question-media-gallery" data-solution-media-placement="contextual-v1">Figure</div>';
  const referenced = placeQuestionSolutionMedia({
    solutionMarkup: "<section><p>Opening text.</p><p>The diagram illustrates the two views.</p><p>Continue here.</p></section>",
    mediaMarkup: media,
    question: { prompt: "Describe the seed." },
  });
  assert.ok(referenced.indexOf("diagram illustrates") < referenced.indexOf(media));
  assert.ok(referenced.indexOf(media) < referenced.indexOf("Continue here"));

  const definitionFallback = placeQuestionSolutionMedia({
    solutionMarkup: "<section><p>Double Fertilization</p><p>Double fertilization is the process in which two fusion events occur within the embryo sac.</p><p>Step-by-Step Process</p></section>",
    mediaMarkup: media,
    question: { prompt: "Describe the process of double fertilization." },
  });
  assert.ok(definitionFallback.indexOf("two fusion events") < definitionFallback.indexOf(media));
  assert.ok(definitionFallback.indexOf(media) < definitionFallback.indexOf("Step-by-Step Process"));
  assert.equal((definitionFallback.match(/data-solution-media-placement/gu) || []).length, 1);
});

test("related-question targets vary deterministically from eight through twenty", () => {
  const counts = Array.from({ length: 13 }, (_, index) => relatedQuestionTargetCount({ rowId: index + 1 }));
  assert.equal(Math.min(...counts), MIN_RELATED_QUESTIONS);
  assert.equal(Math.max(...counts), MAX_RELATED_QUESTIONS);
  assert.equal(new Set(counts).size, 13);
  assert.equal(relatedQuestionTargetCount({ rowId: 212031 }), relatedQuestionTargetCount({ rowId: 212031 }));
});

test("fill-in-the-blank answer insertions remain bold and gain a sitewide underline", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8"));
  assert.match(source, /function standaloneQuestionUsesFillBlanks\(question\)/u);
  assert.match(source, /fill\\s\+in\\s\+the\\s\+blanks\?/u);
  assert.match(source, /data-question-answer-format="fill-blank"/u);
  assert.match(source, /\.question-card\[data-question-answer-format="fill-blank"\] \.solution-body>div strong\{font-weight:950;text-decoration-line:underline;text-decoration-thickness:2px;text-underline-offset:3px;/u);
  assert.match(source, /<strong class="fill-blank-answer">/u);
});

test("short fill-blank records render the complete original sentence with highlighted answers", () => {
  const single = buildCompletedFillBlank({
    prompt: { kind: "blocks", blocks: [
      { kind: "paragraph", text: "**Fill in the blank:**" },
      { kind: "paragraph", text: "The whorl ________is green that protects the flower until it opens." },
    ] },
    answer: "Calyx",
  });
  assert.deepEqual(single.answers, ["Calyx"]);
  assert.equal(`${single.parts[0]}${single.answers[0]}${single.parts[1]}`, "The whorl Calyx is green that protects the flower until it opens.");

  const multiple = buildCompletedFillBlank({
    prompt: "Fill in the blanks: The ______ are coloured. Flowers produce ______ or ______.",
    answer: "The **petals** are coloured. Flowers produce **nectar** or **fragrance**.",
  });
  assert.deepEqual(multiple.answers, ["petals", "nectar", "fragrance"]);
  assert.equal(`${multiple.parts[0]}${multiple.answers[0]}${multiple.parts[1]}${multiple.answers[1]}${multiple.parts[2]}${multiple.answers[2]}${multiple.parts[3]}`, "The petals are coloured. Flowers produce nectar or fragrance.");

  const leadingBlank = buildCompletedFillBlank({
    prompt: "**Fill in the blanks:** ______ hormone initiate rooting.",
    answer: "Auxin",
  });
  assert.equal(`${leadingBlank.parts[0]}${leadingBlank.answers[0]}${leadingBlank.parts[1]}`, "Auxin hormone initiate rooting.");

  const correctChoice = buildCompletedFillBlank({
    prompt: "Fill in the blank: First Five Year Plan of ........ commenced in 1956.",
    choices: [{ id: "a", content: "Pakistan" }, { id: "b", content: "China" }],
    correctChoiceId: "a",
  });
  assert.equal(`${correctChoice.parts[0]}${correctChoice.answers[0]}${correctChoice.parts[1]}`, "First Five Year Plan of Pakistan commenced in 1956.");
});

test("the bounded renderer draws imported match-column prompts as accessible sitewide tables", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8"));
  assert.match(source, /import \{ parseColumnTablePrompt \} from "\.\.\/question-column-table\.mjs"/u);
  assert.match(source, /function standaloneColumnTable\(value, bookId\)/u);
  assert.match(source, /function standaloneQuestionBlocks\(blocks, bookId\)/u);
  assert.match(source, /paragraphRun\.map\(\(block\) => block\.text\)\.join\("\\n"\)/u);
  assert.match(source, /return standaloneQuestionBlocks\(value\.blocks \|\| \[\], bookId\)/u);
  assert.match(source, /class="question-table-scroll question-column-table-scroll" role="region" tabindex="0"/u);
  assert.match(source, /<caption class="sr-only">Items to match between textbook columns<\/caption>/u);
  assert.match(source, /scope="colgroup"/u);
  assert.match(source, /QUESTION_COLUMN_TABLE_STYLES/u);
  assert.match(source, /data-studywudy-column-table="sitewide-v1"/u);
  assert.match(source, /\.question-table-scroll\{max-width:100%;margin:12px 0 20px;/u);
  assert.match(source, /\.question-column-table-scroll\{margin:12px 0 20px;/u);
  assert.match(source, /\$\{STANDALONE_QUESTION_STYLES\}\$\{QUESTION_COLUMN_TABLE_STYLES\}/u);
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
  assert.match(source, /relatedQuestionTargetCount\(\{ rowId, questionId: route\.question \}\)/u);
  assert.match(source, /\.slice\(0, relatedTargetCount\)/u);
  assert.match(source, /data-related-question-count=/u);
  assert.match(source, /data-related-question-target=/u);
});

test("related-question cards include source thumbnails without decoding every related payload", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8");
  const builder = await fs.readFile(new URL("../scripts/build-question-payload-assets.mjs", import.meta.url), "utf8");
  const manifest = JSON.parse(await fs.readFile(new URL("../comparison/after-assets/__studywudy_payloads/manifest.json", import.meta.url), "utf8"));
  assert.match(source, /loadRelatedQuestionMediaIndex/);
  assert.match(source, /related-media\.json/u);
  assert.match(source, /class="related-media"><img alt=/u);
  assert.match(source, /decoding="async"[\s\S]*loading="lazy"/u);
  assert.match(source, /standaloneMediaUrl\(mediaSource\)/u);
  assert.match(builder, /promptMedia\.find\(\(item\) => item\?\.url \|\| item\?\.fallbackUrl\)/u);
  assert.ok(manifest.relatedMediaQuestionCount > 19_000);
  assert.ok(manifest.relatedMediaAssetBytes > 0);
});

test("every bounded question page keeps the original layout and places pagination before related questions", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8"));
  assert.match(source, /data-studywudy-question-structure="sitewide-v1"/u);
  assert.match(source, /standalonePriorityQuestionPagination/);
  assert.match(source, /aria-label="Previous and next questions"/);
  assert.match(source, /sitewideFlow = `\$\{questionArticle\}\$\{standalonePriorityQuestionPagination[\s\S]*?\$\{priorityPrimaryRelated\}\$\{priorityFollowOn\}`/u);
  assert.match(source, /const previousRow = sameChapterRows/u);
  assert.match(source, /const nextRow = sameChapterRows/u);
  assert.match(source, /Publishing eligibility controls recommendations and indexing/u);
  assert.match(source, /"x-studywudy-question-experience": "sitewide-question-first-v1"/u);
  assert.match(source, /heroSummary = ""/u);
  assert.match(source, /layoutSidebars = standaloneQuestionChapterRail\(catalog, route\)/u);
  assert.match(source, /contextSidebar = standaloneQuestionContext\(catalog, route\)/u);
  assert.doesNotMatch(source, /data-studywudy-question-priority="pilot-v1"\] \.answer-page-layout\{display:block\}/u);
  assert.doesNotMatch(source, /data-studywudy-question-priority="pilot-v1"\] \.question-chapter-rail[^\n]*display:none/u);
  assert.match(source, /if \(!card\) return ""/u);
  assert.match(source, /paginationItems\.length === 1 \? "has-single-item" : "has-two-items"/u);
  assert.doesNotMatch(source, /Start of chapter|End of chapter|is-disabled/u);
  assert.match(source, /priority-question-pagination-item\.is-next\{grid-column:2[^\n]*background:#0757d8;color:var\(--white\);text-align:right\}/u);
  assert.match(source, /priority-question-pagination-item\.is-previous\{grid-column:1[^\n]*text-align:left\}/u);
  assert.match(source, /directionLabel = isPrevious \? "Previous" : "Next"/u);
  assert.match(source, /\? `← Question \$\{escapeHtmlAttribute\(card\.label\)\}`[\s\S]*?: `Question \$\{escapeHtmlAttribute\(card\.label\)\} →`/u);
  assert.match(source, /inlineSolutionOverview = ""/u);
  assert.match(source, /inlineSolutionSupplement = ""/u);
  assert.match(source, /sourceVerifiedPanels = priorityQuestionSourceVerified/u);
  assert.match(source, /enrichmentPanel = standaloneQuestionEnrichmentPanel/u);
  assert.match(source, /priorityFollowOn = `\$\{relocatedSolutionDetails\}\$\{enrichmentPanel\}\$\{sourceVerifiedPanels\}\$\{reviewPanel\}/u);
  assert.match(source, /priority-question-study-details" aria-label="Additional solution details"/u);
  assert.match(source, /navigation: Object\.freeze\(\{ previous: null, next: null \}\)/u);
  assert.match(source, /if \(!card\) return ""/u);
});

test("the Biology question-one pilot has a source-verified, route-scoped search release", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8"));
  assert.match(source, /PRIORITY_QUESTION_PILOT_ROW_ID = 212031/u);
  assert.match(source, /priority-question-official-source-review-v2/u);
  assert.match(source, /https:\/\/books\.ebalbharati\.in\/pdfs\/1203030421\.pdf/u);
  assert.match(source, /3b8c6215b968acbab0cde678daf8bbdbc6cd5cffac230f3aeac1f23fba8c37f5/u);
  assert.match(source, /questionPages: "Textbook page 16 · PDF page 26"/u);
  assert.match(source, /conceptPages: "Textbook pages 6–8 · PDF pages 16–18"/u);
  assert.match(source, /choiceText: "Large quantities of pollens"/u);
  assert.match(source, /Producing pollen in large numbers is an adaptation of wind-pollinated flowers/u);
  assert.match(source, /Dry pollen is associated with wind pollination/u);
  assert.match(source, /Colour attracts insects at the flower level/u);
  assert.match(source, /priorityQuestionPilotSourceMatches/u);
  assert.match(source, /publishingManifestEligible \|\| priorityQuestionSourceVerified/u);
  assert.match(source, /priority-question-official-source dl div\{min-width:0/u);
  assert.match(source, /priority-question-official-source dd code\{display:block;max-width:100%;overflow-wrap:anywhere;word-break:break-word/u);
  assert.match(source, /source-verified-pilot-complete/u);
  assert.match(source, /Each incorrect option now has textbook-backed reasoning/u);
  assert.doesNotMatch(source, /standard distractor-by-distractor explanation check remains transparently unmet/u);
  assert.match(source, /meta property="og:type" content="website"/u);
  assert.match(source, /meta name="twitter:description"/u);
  assert.match(source, /renderBreadcrumbStructuredData\(standaloneQuestionBreadcrumbItems/u);
  assert.match(source, /\.pattern-code\{color:#064fc5\}/u);
  assert.match(source, /prefers-reduced-motion:reduce/u);
  assert.match(source, /data:image\/svg\+xml/u);
  assert.match(source, /priorityQuestionPilotSitemapResponse/u);
  assert.match(source, /\/sitemaps\/priority-question-pilot\.xml/u);
  assert.match(source, /publicFaviconResponse/u);
  assert.match(source, /content-type": "image\/svg\+xml; charset=utf-8"/u);
});
