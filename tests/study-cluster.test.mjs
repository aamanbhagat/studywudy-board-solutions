import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { isQuestionPubliclyEligible } from "../public-question-eligibility.mjs";
import { applyKnownPayloadRepairs } from "../multilingual-text-quality.mjs";
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
import {
  STUDY_CLUSTER_CHAPTER_RUNTIME,
  STUDY_CLUSTER_RUNTIME_PAGES,
} from "../study-cluster-runtime.mjs";

const database = new DatabaseSync(resolve(import.meta.dirname, "../../data/d1/studywudy-content.sqlite3"), { readOnly: true });

function payload(bookId) {
  const rows = database.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index").all(bookId);
  const parsed = JSON.parse(gunzipSync(Buffer.concat(rows.map((row) => Buffer.from(row.content_chunk)))));
  return applyKnownPayloadRepairs(bookId, parsed);
}

function publiclyEligiblePayload(bookId) {
  const source = payload(bookId);
  const eligibleIds = new Set(database.prepare(
    "SELECT row_id, question_id FROM catalog_questions WHERE book_id = ?",
  ).all(bookId)
    .filter((row) => isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, Number(row.row_id)))
    .map((row) => row.question_id));
  for (const chapter of source.chapters || []) {
    for (const exercise of chapter.exercises || []) {
      exercise.questions = (exercise.questions || []).filter((question) => eligibleIds.has(question.id));
    }
  }
  return source;
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
const primaryPayload = payload(primaryBookId);
const questionBankPayload = payload(questionBankBookId);
const model = buildStudyClusterModel({
  primaryPayload,
  questionBankPayload,
  catalog,
  reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
});

test.after(() => database.close());

test("publishes thirteen evidence-backed indexable resources and keeps PYQ noindex", () => {
  assert.equal(STUDY_CLUSTER_CONCEPTS.length, 8);
  assert.equal(STUDY_CLUSTER_INDEXABLE_PATHS.length, 13);
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

test("runtime pages and the chapter enhancement are prebuilt from the reviewed model", () => {
  const publicModel = buildStudyClusterModel({
    primaryPayload: publiclyEligiblePayload(primaryBookId),
    questionBankPayload: publiclyEligiblePayload(questionBankBookId),
    catalog,
    reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
  });
  const runtimePaths = [...STUDY_CLUSTER_INDEXABLE_PATHS, STUDY_CLUSTER_PYQ_PATH];
  assert.deepEqual(Object.keys(STUDY_CLUSTER_RUNTIME_PAGES), runtimePaths);
  for (const pathname of runtimePaths) {
    const rendered = renderStudyClusterPage(publicModel, matchStudyClusterRoute(pathname));
    assert.deepEqual(STUDY_CLUSTER_RUNTIME_PAGES[pathname], rendered);
  }
  assert.equal(STUDY_CLUSTER_CHAPTER_RUNTIME.pathname, STUDY_CLUSTER_BASE);
  assert.match(STUDY_CLUSTER_CHAPTER_RUNTIME.experience.hub, /Private practice/u);
  assert.match(STUDY_CLUSTER_CHAPTER_RUNTIME.searchMetadata.documentTitle, /Electrostatics Solutions/u);
  assert.equal(STUDY_CLUSTER_CHAPTER_RUNTIME.breadcrumbs.at(-1).href, STUDY_CLUSTER_BASE);
});

test("practice is browser-only and the PYQ evidence desk fails closed", () => {
  const practice = renderStudyClusterPage(model, matchStudyClusterRoute(`${STUDY_CLUSTER_BASE}/practice`));
  assert.match(practice.body, /data-study-practice="local-only-v1"/u);
  assert.match(practice.body, /Retry mistakes/u);
  assert.match(practice.body, /Difficulty note/u);
  assert.match(practice.body, /Derive the capacitance with a partial dielectric slab/u);
  assert.match(practice.body, /zero-thickness conducting foil placed between the plates forms two capacitors in series/iu);
  assert.doesNotMatch(practice.body, /Same c:\s*Same/iu);
  const pyq = renderStudyClusterPage(model, matchStudyClusterRoute(STUDY_CLUSTER_PYQ_PATH));
  assert.equal(pyq.robots, "noindex, follow");
  assert.match(pyq.body, /verified marking schemes/u);
  assert.match(pyq.body, /question bank is not a previous-year board paper/iu);
});

test("practice route builds only the question data needed by its server render", () => {
  const route = matchStudyClusterRoute(`${STUDY_CLUSTER_BASE}/practice`);
  const practiceModel = buildStudyClusterModel({
    primaryPayload,
    questionBankPayload,
    catalog,
    reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
    route,
  });
  assert.equal(practiceModel.practiceQuestions.length, model.practiceQuestions.length);
  assert.deepEqual(practiceModel.textbookQuestions, []);
  assert.deepEqual(practiceModel.questionBankQuestions, []);
  assert.deepEqual(practiceModel.concepts, []);
  assert.deepEqual(practiceModel.important, []);
  assert.deepEqual(practiceModel.diagramQuestions, []);
  assert.match(renderStudyClusterPage(practiceModel, route).body, /Question 12/u);
});

test("study resources use prebuilt HTML assets instead of request-time shell rendering", async () => {
  const source = await readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8");
  assert.match(source, /staticStudyClusterPageResponse/u);
  assert.match(source, /pages\/study-cluster/u);
  assert.doesNotMatch(source, /STUDY_CLUSTER_RUNTIME_PAGES|studyClusterResponse/u);
  for (const asset of ["chapter", "revision", "practice", "concepts/coulombs-law"]) {
    const html = await readFile(new URL(`../comparison/after-assets/pages/study-cluster/${asset}/index.html`, import.meta.url), "utf8");
    assert.match(html, /<main id="main-content">/u);
    assert.match(html, /data-studywudy-(?:study-cluster|chapter-hub)/u);
    assert.doesNotMatch(html, /studywudy-board-solutions\.amanbhagat17089\.workers\.dev/u);
  }
});

test("malformed MCQs are skipped instead of taking the practice route down", () => {
  const route = matchStudyClusterRoute(`${STUDY_CLUSTER_BASE}/practice`);
  const practiceModel = buildStudyClusterModel({
    primaryPayload: {
      chapters: [{
        slug: "electrostatics",
        exercises: [{
          questions: [
            {
              id: "q-msb-balbharati-physics-standard-12-8-901",
              displayLabel: "901",
              order: 901,
              type: "mcq_single",
              prompt: "Which quantity remains constant for an isolated charged capacitor?",
              choices: [
                { id: "a", content: "Charge" },
                { id: "b", content: "Potential" },
              ],
              correctChoiceId: "a",
              explanation: "No conducting path is available, so charge remains constant.",
            },
            {
              id: "q-msb-balbharati-physics-standard-12-8-902",
              displayLabel: "902",
              type: "mcq_single",
              prompt: "Malformed choices must not throw.",
              choices: { length: 4 },
              correctChoiceId: "a",
              subQuestions: { length: 1 },
            },
            {
              id: "q-msb-balbharati-physics-standard-12-8-903",
              displayLabel: "903",
              type: "mcq_single",
              prompt: "A missing correct answer is incomplete.",
              choices: [{ id: "a", content: "One" }, { id: "b", content: "Two" }],
            },
          ],
        }],
      }],
    },
    questionBankPayload: null,
    catalog,
    reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
    route,
  });
  assert.equal(practiceModel.practiceQuestions.length, 1);
  const page = renderStudyClusterPage(practiceModel, route);
  assert.match(page.body, /Which quantity remains constant/u);
  assert.doesNotMatch(page.body, /Malformed choices/u);
  assert.doesNotMatch(page.body, /A missing correct answer/u);
});
