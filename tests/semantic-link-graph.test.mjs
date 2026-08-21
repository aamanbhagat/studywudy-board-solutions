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
