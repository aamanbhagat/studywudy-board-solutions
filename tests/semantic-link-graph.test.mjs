import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import {
  buildQuestionSemanticGraph,
  renderQuestionSemanticGraph,
  renderSemanticPromotion,
  semanticPromotionForPath,
  VERIFIED_QUESTION_SEMANTICS,
} from "../semantic-link-graph.mjs";
import { STUDY_CLUSTER_BASE, STUDY_CLUSTER_QBANK_BOOK } from "../study-cluster.mjs";

const database = new DatabaseSync(resolve(import.meta.dirname, "../../data/d1/studywudy-content.sqlite3"), { readOnly: true });
const primaryBookId = "maharashtra-board::class-12::physics::balbharati-physics-standard-12";
const questionBankBookId = `maharashtra-board::class-12::physics::${STUDY_CLUSTER_QBANK_BOOK}`;

function payload(bookId) {
  const rows = database.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index").all(bookId);
  return JSON.parse(gunzipSync(Buffer.concat(rows.map((row) => Buffer.from(row.content_chunk)))));
}

function questionsFor(source) {
  const chapter = source.chapters.find((item) => item.slug === "electrostatics");
  return chapter.exercises.flatMap((exercise) => exercise.questions).filter((question) => question.id);
}

const primaryPayload = payload(primaryBookId);
const questionBankPayload = payload(questionBankBookId);
const primaryQuestions = questionsFor(primaryPayload);
const databasePaths = new Set(database.prepare(`SELECT '/' || b.board_slug || '/' || b.grade_slug || '/' ||
  b.subject_slug || '/' || b.slug || '/' || q.chapter_slug || '/questions/' || q.question_id AS pathname
  FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id`).all().map((row) => row.pathname));

test.after(() => database.close());

test("every Electrostatics textbook question has seven supported semantic relationships", () => {
  assert.equal(primaryQuestions.length, 21);
  const required = new Set([
    "Formula used", "Concept explanation", "Similar textbook problem", "Easier prerequisite",
    "Harder problem", "Chapter test", "Revision note",
  ]);
  for (const question of primaryQuestions) {
    const graph = buildQuestionSemanticGraph({ primaryPayload, questionBankPayload, questionId: question.id });
    assert.ok(graph, question.id);
    assert.deepEqual(new Set(graph.links.map((link) => link.relation)), required);
    assert.equal(graph.links.some((link) => link.questionId === question.id), false);
    assert.equal(graph.previousYear, null);
    assert.match(graph.previousYearStatus, /No verified paper-year source/u);
    assert.doesNotMatch(graph.links.map((link) => link.label).join(" "), /\bundefined\b|\bNaN\b|\[object Object\]/u);
  }
});

test("question graphs keep their harder problem without decompressing the question-bank payload at request time", () => {
  for (const question of primaryQuestions) {
    const graph = buildQuestionSemanticGraph({ primaryPayload, questionBankPayload: null, questionId: question.id });
    const harder = graph.links.find((link) => link.relation === "Harder problem");
    assert.ok(harder?.href.includes("maharashtra-state-board-hsc-question-bank-physics-standard-12"), question.id);
    assert.ok(databasePaths.has(new URL(harder.href, "https://example.test").pathname), harder.href);
  }
});

test("question relationships use database-backed routes and descriptive anchor text", () => {
  const generic = /^(?:view solution|open answer|read more|view full solution|see the mapped worked solution)$/iu;
  for (const question of primaryQuestions) {
    const graph = buildQuestionSemanticGraph({ primaryPayload, questionBankPayload, questionId: question.id });
    for (const link of graph.links) {
      assert.ok(link.href.startsWith("/"));
      assert.equal(generic.test(link.label.trim()), false, link.label);
      if (link.href.includes("/questions/")) {
        assert.ok(databasePaths.has(new URL(link.href, "https://example.test").pathname), link.href);
      }
    }
  }
  const dielectric = buildQuestionSemanticGraph({
    primaryPayload,
    questionBankPayload,
    questionId: "q-msb-balbharati-physics-standard-12-8-002",
  });
  assert.equal(dielectric.questionLabel, "Derive the capacitance with a partial dielectric slab");
  assert.match(renderQuestionSemanticGraph(dielectric), /<a href="[^"]+" data-link-relation="Formula used">/u);
  const sphericalShell = buildQuestionSemanticGraph({
    primaryPayload,
    questionBankPayload,
    questionId: "q-msb-balbharati-physics-standard-12-8-010",
  });
  assert.equal(
    sphericalShell.links.find((link) => link.relation === "Formula used")?.label,
    "Use V = (U/q₀); V = (1/4πε₀)(q/r) for Electric potential",
  );
});

test("Q1 semantic links come from its verified parallel-plate formula profile", () => {
  assert.equal(VERIFIED_QUESTION_SEMANTICS[1].primaryConceptId, "parallel-plate-capacitance");
  assert.deepEqual(VERIFIED_QUESTION_SEMANTICS[1].formulaIdsUsed, ["parallel-plate-capacitance"]);
  const graph = buildQuestionSemanticGraph({
    primaryPayload,
    questionBankPayload,
    questionId: "q-msb-balbharati-physics-standard-12-8-001",
  });
  assert.equal(graph.semanticProfile.source, "verified-question-semantics-v1");
  assert.equal(graph.concept, "Parallel-plate capacitance");
  assert.equal(
    graph.links.find((link) => link.relation === "Formula used")?.label,
    "Use C = (Q/V) = (ε₀A/d) for Parallel-plate capacitance",
  );
  assert.doesNotMatch(graph.links.slice(0, 2).map((link) => link.label).join(" "), /Energy stored/u);
});

test("strong resources receive crawlable links from hierarchy and related chapter pages", () => {
  const sources = [
    "/", "/maharashtra-board", "/maharashtra-board/class-12", "/maharashtra-board/class-12/physics",
    "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/current-electricity",
    "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/magnetic-fields-due-to-electric-current",
    "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electromagnetic-induction",
  ];
  for (const source of sources) {
    const promotion = semanticPromotionForPath(source);
    assert.equal(promotion.links.length, 3);
    const markup = renderSemanticPromotion(promotion);
    assert.match(markup, new RegExp(`<a href="${STUDY_CLUSTER_BASE}/study">`, "u"));
    assert.match(markup, new RegExp(`<a href="${STUDY_CLUSTER_BASE}/revision">`, "u"));
    assert.match(markup, new RegExp(`<a href="${STUDY_CLUSTER_BASE}/practice">`, "u"));
    assert.doesNotMatch(markup, />\s*(?:View solution|Open answer|Read more)\s*</iu);
  }
});
