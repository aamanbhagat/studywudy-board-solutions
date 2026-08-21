#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  homepageStructuredData,
  mathSolverEligibility,
  originalDiagramStructuredData,
  qAPageEligibility,
  stringifyStructuredData,
  STRUCTURED_DATA_POLICY,
  studyResourceStructuredData,
} from "../structured-data.mjs";

const root = resolve(import.meta.dirname, "..");
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
  important: [{ name: "Dielectric slab derivation", anchor: "Derive the capacitance with a partial dielectric slab", href: `${basePath}/questions/q-msb-balbharati-physics-standard-12-8-002` }],
  practiceQuestions: [{
    id: "q-audit",
    href: `${basePath}/questions/q-msb-balbharati-physics-standard-12-8-001`,
    prompt: "Which relation gives the energy stored in a capacitor?",
    correctChoiceId: "b",
    choices: [{ id: "a", content: "CV²" }, { id: "b", content: "(1/2)CV²" }],
    explanation: "Charging work accumulates from zero potential difference to the final value.",
  }],
};
const errors = [];
const profiles = {};

function fail(message) {
  errors.push(message);
}

function resource(kind, suffix = kind) {
  return studyResourceStructuredData({
    route: { kind, pathname: `${basePath}/${suffix}` },
    metadata,
    reviewedIso: "2026-08-18",
    breadcrumbs,
    model,
  });
}

const homepage = homepageStructuredData();
profiles.homepage = homepage["@graph"].map((node) => node["@type"]);
if (JSON.stringify(profiles.homepage) !== JSON.stringify(["Organization", "WebSite"])) {
  fail("Homepage identity graph must contain exactly Organization and WebSite");
}
if (homepage["@graph"][1]?.potentialAction?.["@type"] !== "SearchAction") fail("Homepage WebSite is missing SearchAction");

for (const kind of ["revision", "answer-writing", "concept"]) {
  const node = resource(kind)["@graph"][1];
  profiles[kind] = node?.["@type"];
  if (!Array.isArray(node?.["@type"]) || !node["@type"].includes("Article")) fail(`${kind} is missing Article markup`);
  if (!node?.headline || !node?.author || !node?.publisher || !node?.dateModified) fail(`${kind} Article lacks editorial identity or review date`);
  if (node?.image) fail(`${kind} uses an image without a reviewed original diagram record`);
}

for (const kind of ["study", "important-questions"]) {
  const node = resource(kind)["@graph"][1];
  profiles[kind] = node?.["@type"];
  if (node?.["@type"] !== "CollectionPage" || node?.mainEntity?.["@type"] !== "ItemList") {
    fail(`${kind} must remain a CollectionPage with an ItemList`);
  }
}

const quiz = resource("practice")["@graph"][1];
profiles.practice = quiz?.["@type"];
if (quiz?.["@type"] !== "Quiz" || !quiz.hasPart?.length) fail("Practice page is missing a populated Quiz");
if (quiz?.hasPart?.some((question) => question["@type"] !== "Question" || question.eduQuestionType !== "Multiple choice" || !question.acceptedAnswer?.text)) {
  fail("Quiz questions do not mirror the visible MCQ format and answers");
}
if (quiz?.hasPart?.some((question) => question.eduQuestionType === "Flashcard")) fail("MCQs were incorrectly labelled as flashcards");

const evidenceDesk = resource("previous-year-questions")["@graph"];
profiles["previous-year-questions"] = evidenceDesk.map((node) => node["@type"]);
if (evidenceDesk.length !== 1 || evidenceDesk[0]?.["@type"] !== "BreadcrumbList") {
  fail("Noindex PYQ evidence desk must emit only its breadcrumb schema");
}

const diagramRoute = {
  board: "maharashtra-board",
  grade: "class-12",
  subject: "biology",
  book: "balbharati-biology-standard-12",
  chapter: "reproduction-in-lower-and-higher-plants",
  question: "q-msb-balbharati-biology-standard-12-1-036",
};
const diagram = originalDiagramStructuredData(diagramRoute, "/maharashtra-board/class-12/biology/balbharati-biology-standard-12/reproduction-in-lower-and-higher-plants/questions/q-msb-balbharati-biology-standard-12-1-036");
profiles.originalDiagram = diagram?.["@type"];
if (!diagram || diagram["@type"] !== "ImageObject" || !diagram.contentUrl || !diagram.creditText || !diagram.creator || !diagram.width || !diagram.height) {
  fail("Reviewed original diagram lacks ImageObject credit metadata");
}

const published = [homepage, ...["revision", "answer-writing", "concept", "study", "important-questions", "practice", "previous-year-questions"].map((kind) => resource(kind)), diagram]
  .map(stringifyStructuredData)
  .join("\n");
if (/"@type":"QAPage"/u.test(published)) fail("QAPage is emitted for a current static textbook template");
if (/"@type":"MathSolver"/u.test(published)) fail("MathSolver is emitted without an interactive solver");
if (qAPageEligibility({ singleQuestion: true }).eligible) fail("Static single-answer pages pass the QAPage gate");
if (mathSolverEligibility({ interactiveSolver: false }).eligible) fail("Non-interactive mathematics passes the MathSolver gate");

const workerSource = readFileSync(resolve(root, "comparison/after-worker.js"), "utf8");
const studySource = readFileSync(resolve(root, "study-cluster.mjs"), "utf8");
if (!workerSource.includes('body > script[type="application/ld+json"]:first-child')) fail("Worker does not isolate site identity schema to the homepage");
if (!workerSource.includes("if (!isHomepage)")) fail("Worker lacks a non-home site-identity removal branch");
if (!workerSource.includes("originalDiagramStructuredData")) fail("Worker does not attach reviewed diagram metadata");
if (!studySource.includes("studyResourceStructuredData")) fail("Study resources bypass the selective schema mapper");

const report = {
  generatedAt: new Date().toISOString(),
  pass: errors.length === 0,
  policy: STRUCTURED_DATA_POLICY,
  profiles,
  guards: {
    qAPageForCurrentTemplates: false,
    mathSolverForCurrentTemplates: false,
    quizDoesNotClaimFlashcards: true,
  },
  errors,
};
mkdirSync(resolve(root, "audits/phase-4"), { recursive: true });
writeFileSync(resolve(root, "audits/phase-4/selective-structured-data-gate.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
