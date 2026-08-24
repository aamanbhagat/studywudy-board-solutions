import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChapterPageExperience,
  CHAPTER_PAGE_EXPERIENCE_STYLES,
  findChapterPageContext,
  renderChapterPageExperience,
} from "../chapter-page-experience.mjs";

const route = Object.freeze({
  boardSlug: "maharashtra-board",
  classNumber: 12,
  subjectSlug: "physics",
  textbookSlug: "balbharati-physics-standard-12",
  chapterSlug: "electrostatics",
});

const catalog = Object.freeze({
  board_name: "Maharashtra State Board",
  grade_label: "Standard 12",
  subject_name: "Physics",
  book_title: "Balbharati Physics Standard 12",
  chapter_number: 8,
  chapter_title: "Electrostatics",
});

function fixturePayload({ examEvidence = false } = {}) {
  const questions = [{
    id: "q-msb-balbharati-physics-standard-12-8-001",
    displayLabel: "1",
    type: "mcq_single",
    prompt: "A charged isolated parallel-plate capacitor has its plate spacing increased. What changes?",
    choices: [{ id: "a", content: "Charge remains constant; potential rises; capacitance falls" }],
    correctChoiceId: "a",
    explanation: "Capacitance follows C = ε₀A/d. Since V = Q/C and Q is fixed, the electric potential rises as capacitance falls.",
  }, {
    id: "q-msb-balbharati-physics-standard-12-8-002",
    displayLabel: "2",
    type: "numerical",
    prompt: "Use Coulomb’s law to find the electrostatic force and electric field.",
    steps: [{ content: "F = (1 / 4πε₀)|q₁q₂|/r² and E = F/q₀." }],
    finalAnswer: "The field is 4 N/C.",
  }, {
    id: "q-msb-balbharati-physics-standard-12-8-003",
    displayLabel: "3",
    type: "brief",
    prompt: "Justify the electric flux through the closed surface using Gauss’s law.",
    answer: "The electric flux depends on the enclosed charge.",
  }, {
    id: "q-msb-balbharati-physics-standard-12-8-004",
    displayLabel: "4",
    type: "numerical",
    prompt: "Find equivalent capacitance for capacitors in series and parallel and the energy stored.",
    steps: [{ content: "In series, reciprocals add; in parallel, capacitances add. Energy stored is U = ½CV²." }],
    finalAnswer: "The equivalent capacitance is 4 μF.",
    solutionMedia: [{ alt: "Circuit diagram of the capacitor combination" }],
  }, {
    id: "q-msb-balbharati-physics-standard-12-8-005",
    displayLabel: "5",
    type: "detailed",
    prompt: "Derive the relation for a parallel-plate capacitor.",
    steps: [{ content: "Begin with the uniform field between the plates." }],
    finalAnswer: "Therefore C = ε₀A/d.",
  }];
  if (examEvidence) {
    questions[1].marks = 3;
    questions[1].previousYears = ["2022", "2024"];
    questions[1].commonStudentMistake = "Do not substitute centimetres where the formula requires metres.";
  }
  return {
    catalog: { book: { title: catalog.book_title } },
    chapters: [{
      slug: "rotational-dynamics",
      number: 1,
      title: "Rotational Dynamics",
      exercises: [],
    }, {
      slug: route.chapterSlug,
      number: 8,
      title: "Electrostatics",
      summary: "A generic source summary that the chapter profile replaces.",
      exercises: [{ id: "exercise-8", questions }],
    }],
  };
}

function modelFor(payload) {
  return buildChapterPageExperience({
    payload,
    chapter: findChapterPageContext(payload, route.chapterSlug),
    route,
    catalog,
    reviewedAt: 1_787_270_400,
  });
}

test("Electrostatics gets a specific overview and a question-linked seven-formula sheet", () => {
  const model = modelFor(fixturePayload());
  const markup = renderChapterPageExperience(model);
  assert.equal(model.ready, true);
  assert.match(model.overview[0], /charges at rest/);
  assert.deepEqual(model.formulas.map((formula) => formula.name), [
    "Coulomb’s law",
    "Electric field",
    "Electric potential",
    "Capacitance",
    "Capacitors in series and parallel",
    "Energy stored in a capacitor",
    "Gauss’s law",
  ]);
  assert.match(markup.hub, /Formula sheet/);
  assert.match(markup.hub, /Coulomb’s law/);
  assert.match(markup.hub, /Gauss’s law/);
  assert.doesNotMatch(markup.hub, /data-math-(?:source|spoken|plain)=/);
  assert.doesNotMatch(markup.hub, /\\(?:frac|varepsilon)|\$\$?/u);
  assert.equal((markup.hub.match(/<math\b/gu) || []).length, 7);
  assert.equal((markup.hub.match(/\brole="math"/gu) || []).length, 7);
  assert.equal((markup.hub.match(/math-plain-text|math-semantic-only/gu) || []).length, 0);
  assert.match(markup.hub, /\/electrostatics\/questions\/q-msb-balbharati-physics-standard-12-8-002/);
  assert.match(markup.hub, /href="#q-msb-balbharati-physics-standard-12-8-001"/);
});

test("question grouping exposes only categories supported by chapter questions", () => {
  const model = modelFor(fixturePayload());
  const groups = Object.fromEntries(model.groups.map((group) => [group.label, group.questions.length]));
  assert.equal(groups.MCQs, 1);
  assert.equal(groups["Give reason"], 1);
  assert.equal(groups.Derivations, 1);
  assert.equal(groups.Numericals, 2);
  assert.equal(groups["Diagram questions"], 1);
  assert.equal(groups["Frequently repeated board questions"], undefined);
});

test("unsupported marks, past-paper and mistake claims stay off the page", () => {
  const model = modelFor(fixturePayload());
  const markup = renderChapterPageExperience(model).hub;
  assert.equal(model.examPreparation.marks, null);
  assert.equal(model.examPreparation.pastPapers, null);
  assert.deepEqual(model.examPreparation.commonMistakes, []);
  assert.doesNotMatch(markup, /<h3>Typical marks<\/h3>/);
  assert.doesNotMatch(markup, /<h3>Past-paper appearances<\/h3>/);
  assert.doesNotMatch(markup, /<h3>Source-recorded student mistakes<\/h3>/);
});

test("exam preparation uses the warm chapter surface instead of a dark panel", () => {
  assert.match(
    CHAPTER_PAGE_EXPERIENCE_STYLES,
    /\.chapter-exam-prep\{[\s\S]*?background:var\(--hub-white\);[\s\S]*?color:var\(--hub-ink\)/u,
  );
  assert.match(
    CHAPTER_PAGE_EXPERIENCE_STYLES,
    /\.chapter-exam-prep \.chapter-evidence-grid>article:nth-child\(2\)\{background:var\(--hub-blue-soft\)\}/u,
  );
  assert.match(
    CHAPTER_PAGE_EXPERIENCE_STYLES,
    /\.chapter-evidence-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/u,
  );
});

test("formula cards use light math bands and compact question references", () => {
  assert.match(
    CHAPTER_PAGE_EXPERIENCE_STYLES,
    /\.chapter-formula-grid article\{[\s\S]*?--formula-accent:var\(--hub-blue\);[\s\S]*?background:var\(--hub-white\);/u,
  );
  assert.match(
    CHAPTER_PAGE_EXPERIENCE_STYLES,
    /\.chapter-formula-equation\{[\s\S]*?border-left:4px solid var\(--formula-accent\);[\s\S]*?background:var\(--formula-tint\)!important;[\s\S]*?color:var\(--hub-navy\)!important;/u,
  );
  assert.match(
    CHAPTER_PAGE_EXPERIENCE_STYLES,
    /\.chapter-formula-uses a,\.chapter-formula-uses span\{[\s\S]*?min-height:1\.7rem;[\s\S]*?border-radius:999px;/u,
  );
});

test("exam modules appear when marks, repeat years and a mistake are explicitly recorded", () => {
  const model = modelFor(fixturePayload({ examEvidence: true }));
  const markup = renderChapterPageExperience(model).hub;
  assert.equal(model.examPreparation.marks.label, "3 marks");
  assert.deepEqual(model.examPreparation.pastPapers, { questionCount: 1, appearanceCount: 2 });
  assert.equal(model.groups.find((group) => group.label === "Frequently repeated board questions").questions.length, 1);
  assert.match(markup, /Past-paper appearances/);
  assert.match(markup, /Do not substitute centimetres/);
});

test("the original textbook directory is replaced after the question layout", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8"));
  assert.match(source, /details\.course-finder-directory/);
  assert.match(source, /element\.remove\(\)/);
  assert.match(source, /element\.before\(experience\.hub/);
  assert.match(source, /element\.after\(experience\.directory/);
  assert.match(source, /X-StudyWudy-Chapter-Experience/);
  assert.match(source, /usesMathematicsProblemLabels/);
  assert.match(source, /question-card\[data-question-type="brief"\] \.question-number small/);
  assert.match(source, /chapter-rail nav a small/);
});
