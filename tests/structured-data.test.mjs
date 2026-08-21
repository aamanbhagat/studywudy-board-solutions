import assert from "node:assert/strict";
import test from "node:test";
import {
  homepageStructuredData,
  mathSolverEligibility,
  originalDiagramStructuredData,
  qAPageEligibility,
  stringifyStructuredData,
  STRUCTURED_DATA_POLICY,
  studyResourceStructuredData,
} from "../structured-data.mjs";

const basePath = "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electrostatics";
const breadcrumbs = [
  { name: "Home", href: "/" },
  { name: "Maharashtra Board", href: "/maharashtra-board" },
  { name: "Electrostatics", href: basePath },
];
const metadata = {
  title: "Electrostatics Resource | StudyWudy",
  description: "A source-specific Electrostatics learning resource for Maharashtra Board Class 12 Physics.",
};
const model = {
  important: [{
    anchor: "Derive the capacitance with a partial dielectric slab",
    href: `${basePath}/questions/q-msb-balbharati-physics-standard-12-8-002`,
  }],
  practiceQuestions: [{
    id: "q-test",
    href: `${basePath}/questions/q-msb-balbharati-physics-standard-12-8-001`,
    prompt: "Which relation gives the energy stored in a capacitor?",
    correctChoiceId: "b",
    choices: [
      { id: "a", content: "CV²" },
      { id: "b", content: "(1/2)CV²" },
    ],
    explanation: "Charging work accumulates from zero potential difference to the final value.",
  }],
};

function schemaFor(kind, suffix = kind) {
  return studyResourceStructuredData({
    route: { kind, pathname: `${basePath}/${suffix}` },
    metadata,
    reviewedIso: "2026-08-18",
    breadcrumbs,
    model,
  });
}

test("Organization and WebSite are defined together for the homepage", () => {
  const schema = homepageStructuredData("http://localhost:8789");
  assert.deepEqual(schema["@graph"].map((node) => node["@type"]), ["Organization", "WebSite"]);
  assert.equal(schema["@graph"][0].url, "https://studywudy-board-solutions.amanbhagat17089.workers.dev/");
  assert.equal(schema["@graph"][0].logo["@type"], "ImageObject");
  assert.equal(schema["@graph"][1].potentialAction["@type"], "SearchAction");
});

test("substantial guides, collections and genuine practice use distinct schema profiles", () => {
  for (const kind of ["revision", "answer-writing", "concept"]) {
    const resource = schemaFor(kind)["@graph"][1];
    assert.deepEqual(resource["@type"], ["Article", "LearningResource"]);
    assert.equal(resource.author.name, "StudyWudy Editorial Team");
    assert.equal(resource.publisher["@id"], "https://studywudy-board-solutions.amanbhagat17089.workers.dev/#organization");
    assert.ok(resource.headline);
  }
  for (const kind of ["study", "important-questions"]) {
    assert.equal(schemaFor(kind)["@graph"][1]["@type"], "CollectionPage");
  }
  const quiz = schemaFor("practice")["@graph"][1];
  assert.equal(quiz["@type"], "Quiz");
  assert.equal(quiz.hasPart.length, 1);
  assert.equal(quiz.hasPart[0]["@type"], "Question");
  assert.equal(quiz.hasPart[0].eduQuestionType, "Multiple choice");
  assert.match(quiz.hasPart[0].acceptedAnswer.text, /\(1\/2\)CV²/u);
  assert.notEqual(quiz.hasPart[0].eduQuestionType, "Flashcard");
  const evidenceDesk = schemaFor("previous-year-questions")["@graph"];
  assert.equal(evidenceDesk.length, 1);
  assert.equal(evidenceDesk[0]["@type"], "BreadcrumbList");
});

test("QAPage and MathSolver stay disabled until their real interaction requirements exist", () => {
  assert.equal(qAPageEligibility({ singleQuestion: true }).eligible, false);
  assert.equal(qAPageEligibility({
    singleQuestion: true,
    userSubmittedQuestion: true,
    acceptsAlternativeAnswers: true,
  }).eligible, true);
  assert.equal(mathSolverEligibility({ interactiveSolver: true, acceptsMathExpression: true }).eligible, false);
  assert.equal(mathSolverEligibility({
    interactiveSolver: true,
    acceptsMathExpression: true,
    returnsStepByStepSolution: true,
    publiclyAccessible: true,
  }).eligible, true);
  const published = ["revision", "answer-writing", "concept", "study", "important-questions", "practice", "previous-year-questions"]
    .map((kind) => stringifyStructuredData(schemaFor(kind)))
    .join("\n");
  assert.doesNotMatch(published, /"@type":"QAPage"/u);
  assert.doesNotMatch(published, /"@type":"MathSolver"/u);
  assert.equal(STRUCTURED_DATA_POLICY.qAPageEnabledForCurrentTemplates, false);
  assert.equal(STRUCTURED_DATA_POLICY.mathSolverEnabledForCurrentTemplates, false);
});

test("only the reviewed original diagram receives image credit metadata", () => {
  const route = {
    board: "maharashtra-board",
    grade: "class-12",
    subject: "biology",
    book: "balbharati-biology-standard-12",
    chapter: "reproduction-in-lower-and-higher-plants",
    question: "q-msb-balbharati-biology-standard-12-1-036",
  };
  const schema = originalDiagramStructuredData(route, `/${Object.values(route).slice(0, 5).join("/")}/questions/${route.question}`);
  assert.equal(schema["@type"], "ImageObject");
  assert.equal(schema.width, 1450);
  assert.equal(schema.height, 1085);
  assert.equal(schema.creditText, "StudyWudy Editorial Team");
  assert.match(schema.contentUrl, /\/images\/solutions\/dicot-seed-labelled-q36\.png$/u);
  assert.equal(originalDiagramStructuredData({ ...route, question: "q-not-reviewed" }, "/not-reviewed"), null);
  assert.equal(STRUCTURED_DATA_POLICY.originalDiagramCount, 1);
});
