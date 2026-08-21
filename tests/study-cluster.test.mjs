import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import {
  buildStudyClusterModel,
  matchStudyClusterRoute,
  renderStudyClusterPage,
  STUDY_CLUSTER_BASE,
  STUDY_CLUSTER_CONCEPTS,
  STUDY_CLUSTER_INDEXABLE_PATHS,
  STUDY_CLUSTER_PYQ_PATH,
  STUDY_CLUSTER_QBANK_BOOK,
} from "../study-cluster.mjs";

const database = new DatabaseSync(resolve(import.meta.dirname, "../../data/d1/studywudy-content.sqlite3"), { readOnly: true });

function payload(bookId) {
  const rows = database.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index").all(bookId);
  return JSON.parse(gunzipSync(Buffer.concat(rows.map((row) => Buffer.from(row.content_chunk)))));
}

const primaryBookId = "maharashtra-board::class-12::physics::balbharati-physics-standard-12";
const questionBankBookId = `maharashtra-board::class-12::physics::${STUDY_CLUSTER_QBANK_BOOK}`;
const catalog = database.prepare(`SELECT b.title AS book_title, bo.name AS board_name, g.label AS grade_label,
  s.name AS subject_name, c.number AS chapter_number, c.title AS chapter_title
  FROM catalog_books b JOIN catalog_boards bo ON bo.slug = b.board_slug
  JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
  JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug AND s.slug = b.subject_slug
  JOIN catalog_chapters c ON c.book_id = b.id
  WHERE b.id = ? AND c.slug = 'electrostatics'`).get(primaryBookId);
const model = buildStudyClusterModel({
  primaryPayload: payload(primaryBookId),
  questionBankPayload: payload(questionBankBookId),
  catalog,
  reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
});

test.after(() => database.close());

test("publishes twelve evidence-backed indexable resources and keeps PYQ noindex", () => {
  assert.equal(STUDY_CLUSTER_CONCEPTS.length, 7);
  assert.equal(STUDY_CLUSTER_INDEXABLE_PATHS.length, 12);
  assert.equal(STUDY_CLUSTER_INDEXABLE_PATHS.includes(STUDY_CLUSTER_PYQ_PATH), false);
  for (const pathname of STUDY_CLUSTER_INDEXABLE_PATHS) assert.equal(matchStudyClusterRoute(pathname)?.indexable, true);
  assert.equal(matchStudyClusterRoute(STUDY_CLUSTER_PYQ_PATH)?.indexable, false);
  assert.equal(matchStudyClusterRoute(`${STUDY_CLUSTER_BASE}/concepts/not-real`), null);
});

test("model uses mapped textbook and question-bank records without inventing PYQ evidence", () => {
  assert.equal(model.evidence.textbookQuestionCount, 21);
  assert.equal(model.evidence.questionBankQuestionCount, 30);
  assert.equal(model.evidence.verifiedPaperCount, 0);
  assert.equal(model.evidence.verifiedMarkingSchemeCount, 0);
  assert.equal(model.important.length, 14);
  assert.ok(model.practiceQuestions.length >= 10);
  assert.ok(model.concepts.every((concept) => concept.textbookQuestions.length && concept.questionBankQuestions.length));
  for (const question of [...model.textbookQuestions, ...model.questionBankQuestions]) {
    assert.match(question.href, /^\/maharashtra-board\/class-12\/physics\/[a-z0-9-]+\/electrostatics\/questions\/q-msb-/u);
  }
});

test("every indexable resource is self-canonical with unique metadata and crawlable solution links", () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const pathname of STUDY_CLUSTER_INDEXABLE_PATHS) {
    const route = matchStudyClusterRoute(pathname);
    const page = renderStudyClusterPage(model, route);
    assert.equal(page.robots, "index, follow");
    assert.equal(page.canonical, `https://studywudy-board-solutions.amanbhagat17089.workers.dev${pathname}`);
    assert.match(page.body, /<a href="\/maharashtra-board\//u);
    assert.match(page.body, /BreadcrumbList/u);
    assert.doesNotMatch(page.body, /q-physics-\d/u);
    titles.add(page.title);
    descriptions.add(page.description);
  }
  assert.equal(titles.size, STUDY_CLUSTER_INDEXABLE_PATHS.length);
  assert.equal(descriptions.size, STUDY_CLUSTER_INDEXABLE_PATHS.length);
});

test("practice is browser-only and the PYQ evidence desk fails closed", () => {
  const practice = renderStudyClusterPage(model, matchStudyClusterRoute(`${STUDY_CLUSTER_BASE}/practice`));
  assert.match(practice.body, /data-study-practice="local-only-v1"/u);
  assert.match(practice.body, /Retry mistakes/u);
  assert.match(practice.body, /Difficulty note/u);
  assert.match(practice.body, /Derive the capacitance with a partial dielectric slab/u);
  const pyq = renderStudyClusterPage(model, matchStudyClusterRoute(STUDY_CLUSTER_PYQ_PATH));
  assert.equal(pyq.robots, "noindex, follow");
  assert.match(pyq.body, /verified marking schemes/u);
  assert.match(pyq.body, /question bank is not a previous-year board paper/iu);
});
