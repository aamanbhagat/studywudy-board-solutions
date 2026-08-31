#!/usr/bin/env node

// Content revision log.
//
// `<lastmod>` is a claim about when a page's content last changed, and this
// corpus has no way to answer that: catalog_questions.updated_at,
// catalog_chapters.updated_at and catalog_books.updated_at are null on every
// one of their 299,458 / 7,715 / 606 rows, and PHASE4_GATE_MANIFEST
// .catalogMaxUpdatedAt has read 0 for eleven policy versions. The sitemap
// builder already threads MAX(question, chapter, book) per URL, so the frozen
// lastmod is missing data rather than a bad generator, and no edit to the
// generator can move it.
//
// This script supplies the missing data by fingerprinting what each page
// renders and recording the first build at which each fingerprint appeared.
// The log is append-only: a page that changes twice keeps both revisions, so
// the provenance survives. Seeding it now - before the content pipeline starts
// rewriting answers - is the whole point. Back-filling afterwards would stamp
// every rewritten page with the date of the back-fill and lose which pages
// actually moved.
//
// Bootstrap is deliberately a no-op on the emitted sitemaps: the first run
// seeds every entity at the timestamp the current generator already emits for
// it, so the first build after wiring this in is byte-identical and the 33
// sha256 pins in release/production-manifest.json all still hold. Nothing is
// republished to Google on the strength of a schema change.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { CORPUS_QUALITY_MANIFEST } from "../corpus-quality-manifest.mjs";
import {
  applyKnownPayloadRepairs,
  isBookQuarantined,
  repairKnownText,
  reviewedBookTitle,
  reviewedChapterTitle,
} from "../multilingual-text-quality.mjs";
import { normalizeQuestionEnrichment } from "../question-enrichment.mjs";
import { streamsFor, subjectsFor } from "../comparison/stream-taxonomy.js";
import { STUDY_CLUSTER_INDEXABLE_PATHS } from "../study-cluster.mjs";
import { TRUST_POLICY_UPDATED_AT, TRUST_TRANSPARENCY_PATHS } from "../trust-transparency.mjs";
import {
  CONTENT_PUBLISHED_AT,
  CONTENT_REVISION_SCOPES,
  POLICY_PAGE_UPDATED_AT,
} from "../content-revisions.mjs";
import { streamPathMatchesTaxonomy, streamPathsFromWorker } from "./sitemap-route-sources.mjs";

const root = resolve(import.meta.dirname, "..");

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 || index === process.argv.length - 1 ? fallback : process.argv[index + 1];
}

const mode = process.argv.includes("--write") ? "write" : "check";
const databasePath = resolve(root, argument("--source-db", "../data/d1/studywudy-content.sqlite3"));
const reportPath = resolve(root, argument("--output", "audits/phase-3/content-revisions.json"));
const now = Number(argument("--now", Math.floor(Date.now() / 1_000)));
if (!Number.isInteger(now) || now <= 0) throw new Error("--now must be a positive integer epoch in seconds");

const contentPublishedEpoch = Math.floor(Date.parse(CONTENT_PUBLISHED_AT) / 1_000);
const methodologyEpoch = Number(PHASE4_GATE_MANIFEST.reviewedAt);
const policyEpoch = Math.floor(Date.parse(POLICY_PAGE_UPDATED_AT) / 1_000);
const trustPolicyEpoch = Math.floor(Date.parse(TRUST_POLICY_UPDATED_AT) / 1_000);

// Key order has to be fixed or the fingerprint changes when V8 does. JSON
// .stringify is not stable across differently-built objects, which is exactly
// what `{...question, choices}` produces in the enrichment overlay.
function canonical(value) {
  if (value === null || value === undefined || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

// 128 bits. Across 300K entities the birthday probability of a collision is
// ~1e-28, and a collision would understate one page's lastmod rather than
// corrupt anything.
function fingerprint(value) {
  return createHash("sha256").update(canonical(value)).digest("hex").slice(0, 32);
}

const source = new DatabaseSync(databasePath, { readOnly: mode !== "write" });

// The Worker admits an enrichment on factual_pass = 1 AND quality_pass = 1 AND
// confidence >= 0.88 (comparison/after-worker.js:1076) and renders it as a
// panel beside the source answer, so it is part of what the page shows and has
// to be part of the fingerprint. This is the render rule, not the gate's
// `questionEnrichmentHasPublishableContent` rule - the two differ on
// enrichments carrying only a common mistake or an exam tip, which render but
// do not count towards publishability.
const enrichmentByKey = new Map();
if (source.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'question_enrichments'").get()) {
  for (const row of source.prepare(`SELECT book_id, chapter_slug, question_id, content_gzip, confidence
    FROM question_enrichments
    WHERE factual_pass = 1 AND quality_pass = 1 AND confidence >= 0.88`).iterate()) {
    try {
      const content = JSON.parse(gunzipSync(Buffer.from(row.content_gzip)).toString("utf8"));
      const enrichment = normalizeQuestionEnrichment({ ...content, confidence: Number(row.confidence) });
      if (enrichment) enrichmentByKey.set(`${row.book_id}:${row.chapter_slug}:${row.question_id}`, enrichment);
    } catch {
      // A malformed enrichment renders as nothing, so it fingerprints as nothing.
    }
  }
}

const boards = source.prepare("SELECT slug, name, short_name, region, description FROM catalog_boards ORDER BY slug").all();
const grades = source.prepare("SELECT board_slug, slug, class_number, label FROM catalog_grades ORDER BY board_slug, class_number").all();
const subjects = source.prepare("SELECT board_slug, grade_slug, slug, name FROM catalog_subjects ORDER BY board_slug, grade_slug, slug").all();
const books = source.prepare(`SELECT id, board_slug, grade_slug, subject_slug, slug, title, description,
  chapter_count, question_count FROM catalog_books ORDER BY id`).all()
  .filter((book) => !isBookQuarantined(book.id));
const chapters = source.prepare(`SELECT book_id, slug, number, position, title, summary, book_pages, question_count
  FROM catalog_chapters ORDER BY book_id, position`).all();

const livePath = new Set(books.map((book) => `/${book.board_slug}/${book.grade_slug}/${book.subject_slug}`));
const bookById = new Map(books.map((book) => [book.id, book]));
const chaptersByBook = new Map();
for (const chapter of chapters) {
  if (!bookById.has(chapter.book_id)) continue;
  const list = chaptersByBook.get(chapter.book_id) || [];
  list.push(chapter);
  chaptersByBook.set(chapter.book_id, list);
}

// One entry per submitted URL. `seed` is the timestamp the current generator
// already emits for that URL, so the bootstrap run reproduces today's sitemaps
// exactly; only later runs can move a lastmod.
const entities = [];
const record = (scope, path, seed, content) => {
  entities.push({ scope, path, seed, hash: fingerprint(content) });
};

// --- questions and chapters -------------------------------------------------
// Read from catalog_book_chunks rather than catalog_questions.prompt_text: the
// Worker renders the chunk payload (comparison/after-worker.js:973
// loadCatalogQuestionPayload) and falls back to prompt_text only for metadata,
// and prompt_text trails the repaired chunks by 19,897 rows. Fingerprinting
// prompt_text would have declared those 19,897 pages unchanged while the page
// showed different text.
const questionFingerprintByKey = new Map();
let payloadQuestionCount = 0;
for (const { book_id: bookId } of source.prepare("SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id").iterate()) {
  const book = bookById.get(bookId);
  if (!book) continue;
  const chunks = source.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index").all(bookId);
  const payload = applyKnownPayloadRepairs(
    bookId,
    JSON.parse(gunzipSync(Buffer.concat(chunks.map((row) => Buffer.from(row.content_chunk)))).toString("utf8")),
  );
  const bookPath = `/${book.board_slug}/${book.grade_slug}/${book.subject_slug}/${book.slug}`;
  const bookTitle = reviewedBookTitle(bookId, repairKnownText(bookId, book.title));
  for (const chapter of payload.chapters || []) {
    const chapterQuestions = [];
    for (const exercise of chapter.exercises || []) {
      for (const question of exercise.questions || []) {
        const key = `${bookId}:${chapter.slug}:${question.id}`;
        const hash = fingerprint({
          question,
          enrichment: enrichmentByKey.get(key) || null,
          // Rendered in the breadcrumb and the H1, so a repaired chapter title
          // is a change to this page even when the answer is untouched.
          chapterTitle: reviewedChapterTitle(bookId, chapter.slug, repairKnownText(bookId, chapter.title)),
          bookTitle,
        });
        questionFingerprintByKey.set(key, hash);
        chapterQuestions.push([question.id, hash]);
        payloadQuestionCount += 1;
        record("question", `${bookPath}/${chapter.slug}/questions/${question.id}`, contentPublishedEpoch, { hash });
      }
    }
    const catalogChapter = (chaptersByBook.get(bookId) || []).find((row) => row.slug === chapter.slug);
    // The chapter page renders the questions themselves
    // (chapter-page-experience.mjs buildChapterPageExperience takes the whole
    // payload), so an answer edit is a change to the chapter page too. Books
    // and above only render titles and counts, so they are NOT rolled up from
    // here - propagating an answer edit to a board page would be a false claim.
    record("chapter", `${bookPath}/${chapter.slug}`, contentPublishedEpoch, {
      title: catalogChapter ? reviewedChapterTitle(bookId, chapter.slug, repairKnownText(bookId, catalogChapter.title)) : null,
      number: catalogChapter?.number ?? null,
      summary: catalogChapter?.summary ?? null,
      bookPages: catalogChapter?.book_pages ?? null,
      questions: chapterQuestions,
    });
  }
}

// --- books, subjects, grades, boards ---------------------------------------
for (const book of books) {
  const path = `/${book.board_slug}/${book.grade_slug}/${book.subject_slug}/${book.slug}`;
  record("book", path, contentPublishedEpoch, {
    title: reviewedBookTitle(book.id, repairKnownText(book.id, book.title)),
    description: book.description,
    chapterCount: book.chapter_count,
    questionCount: book.question_count,
    chapters: (chaptersByBook.get(book.id) || []).map((chapter) => [
      chapter.slug,
      reviewedChapterTitle(book.id, chapter.slug, repairKnownText(book.id, chapter.title)),
      chapter.number,
      chapter.question_count,
    ]),
  });
}
for (const subject of subjects) {
  const path = `/${subject.board_slug}/${subject.grade_slug}/${subject.slug}`;
  if (!livePath.has(path)) continue;
  record("subject", path, contentPublishedEpoch, {
    name: subject.name,
    books: books.filter((book) => `/${book.board_slug}/${book.grade_slug}/${book.subject_slug}` === path)
      .map((book) => [book.slug, reviewedBookTitle(book.id, repairKnownText(book.id, book.title)), book.chapter_count, book.question_count]),
  });
}
for (const grade of grades) {
  const path = `/${grade.board_slug}/${grade.slug}`;
  const gradeSubjects = subjects
    .filter((subject) => subject.board_slug === grade.board_slug && subject.grade_slug === grade.slug)
    .filter((subject) => livePath.has(`/${subject.board_slug}/${subject.grade_slug}/${subject.slug}`));
  if (!gradeSubjects.length) continue;
  record("grade", path, contentPublishedEpoch, {
    label: grade.label,
    classNumber: grade.class_number,
    subjects: gradeSubjects.map((subject) => [subject.slug, subject.name]),
  });
}
for (const board of boards) {
  const boardGrades = grades.filter((grade) => grade.board_slug === board.slug)
    .filter((grade) => subjects.some((subject) => subject.board_slug === board.slug
      && subject.grade_slug === grade.slug
      && livePath.has(`/${subject.board_slug}/${subject.grade_slug}/${subject.slug}`)));
  if (!boardGrades.length) continue;
  record("board", `/${board.slug}`, contentPublishedEpoch, {
    name: board.name,
    shortName: board.short_name,
    region: board.region,
    description: board.description,
    grades: boardGrades.map((grade) => [grade.slug, grade.label]),
  });
}

// --- stream, cluster, trust and static routes -------------------------------
// A three-scope enum would have left these 230 URLs with no revision row, and
// the builder cannot emit a lastmod for a URL it has no row for.
for (const path of streamPathsFromWorker(root)) {
  if (!streamPathMatchesTaxonomy(path)) continue;
  const [board, grade, , streamId, , subjectSlug] = path.split("/").filter(Boolean);
  record("stream", path, contentPublishedEpoch, {
    streams: streamsFor(board, grade).map((stream) => [stream.id, stream.label ?? null]),
    subjects: subjectsFor(board, grade, streamId),
    subjectSlug: subjectSlug ?? null,
  });
}
for (const path of STUDY_CLUSTER_INDEXABLE_PATHS) {
  record("cluster", path, methodologyEpoch, { path, reviewedAt: methodologyEpoch });
}
for (const path of TRUST_TRANSPARENCY_PATHS) {
  record("trust", path, trustPolicyEpoch, { path, policyUpdatedAt: TRUST_POLICY_UPDATED_AT });
}
record("static", "/", contentPublishedEpoch, { boards: boards.map((board) => [board.slug, board.name]) });
record("static", "/boards", contentPublishedEpoch, { boards: boards.map((board) => [board.slug, board.name, board.region]) });
// The methodology page states these counts in its copy, so it genuinely
// changes when they do - which is why it gets a content hash rather than a
// declared date like the legal pages.
record("static", "/about/methodology", methodologyEpoch, {
  policyVersion: PHASE4_GATE_MANIFEST.policyVersion,
  reviewedAt: methodologyEpoch,
  indexableCount: PHASE4_GATE_MANIFEST.indexableCount,
  sitemapIndexableCount: CORPUS_QUALITY_MANIFEST.sitemapIndexableCount,
});
for (const path of ["/privacy", "/terms", "/contact"]) {
  record("static", path, policyEpoch, { path, policyUpdatedAt: POLICY_PAGE_UPDATED_AT });
}

const unknownScope = entities.find((entity) => !CONTENT_REVISION_SCOPES.includes(entity.scope));
if (unknownScope) throw new Error(`Scope ${unknownScope.scope} is not declared in content-revisions.mjs`);
const duplicate = (() => {
  const seen = new Set();
  for (const entity of entities) {
    if (seen.has(entity.path)) return entity.path;
    seen.add(entity.path);
  }
  return null;
})();
if (duplicate) throw new Error(`Two entities claim the same URL: ${duplicate}`);

// Kept identical to migrations/0005_content_revisions.sql, which applies this to
// D1. `migrations/` is run with --persist-to comparison/after-persistence and
// never reaches ../data/d1/studywudy-content.sqlite3, the DB this script opens,
// so the two copies exist for two different databases and must not drift.
//
// Not STRICT, unlike migrations 0001-0004. `CREATE TABLE IF NOT EXISTS` no-ops
// against the table this already created in the corpus DB, and SQLite cannot add
// STRICT to an existing table - so declaring it here would leave the corpus DB
// permanently laxer than the migration claims. Two matching non-STRICT copies
// beat one STRICT claim that is false on the database that is actually read.
const DDL = [
  `CREATE TABLE IF NOT EXISTS catalog_content_revisions (
    scope TEXT NOT NULL,
    entity_key TEXT NOT NULL,
    revision INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    first_seen_at INTEGER NOT NULL,
    PRIMARY KEY (scope, entity_key, revision)
  )`,
  "CREATE INDEX IF NOT EXISTS catalog_content_revisions_entity ON catalog_content_revisions (entity_key, revision DESC)",
];

const tableExists = Boolean(source.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'catalog_content_revisions'").get());
const latest = new Map();
if (tableExists) {
  for (const row of source.prepare(`SELECT scope, entity_key, revision, content_hash, first_seen_at
    FROM catalog_content_revisions ORDER BY entity_key, revision`).iterate()) {
    latest.set(row.entity_key, row);
  }
}
// Bootstrap is a distinct mode, not a special case of the incremental one: on
// an empty log every entity is new, and stamping 101,948 URLs with the wall
// clock would republish the whole site on a schema change.
const bootstrap = latest.size === 0;

const inserts = [];
for (const entity of entities) {
  const previous = latest.get(entity.path);
  if (previous && previous.content_hash === entity.hash) continue;
  inserts.push({
    scope: entity.scope,
    entityKey: entity.path,
    revision: previous ? Number(previous.revision) + 1 : 1,
    contentHash: entity.hash,
    firstSeenAt: bootstrap || !previous ? entity.seed : now,
    previousHash: previous ? previous.content_hash : null,
  });
}
const retired = [...latest.keys()].filter((path) => !entities.some((entity) => entity.path === path));

const byScope = {};
for (const entity of entities) {
  byScope[entity.scope] = byScope[entity.scope] || { entities: 0, inserts: 0 };
  byScope[entity.scope].entities += 1;
}
for (const insert of inserts) byScope[insert.scope].inserts += 1;

if (mode === "write") {
  for (const statement of DDL) source.exec(statement);
  const insert = source.prepare(`INSERT INTO catalog_content_revisions
    (scope, entity_key, revision, content_hash, first_seen_at) VALUES (?, ?, ?, ?, ?)`);
  source.exec("BEGIN");
  try {
    for (const row of inserts) insert.run(row.scope, row.entityKey, row.revision, row.contentHash, row.firstSeenAt);
    source.exec("COMMIT");
  } catch (error) {
    source.exec("ROLLBACK");
    throw error;
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  mode,
  bootstrap,
  database: databasePath,
  now,
  contentPublishedEpoch,
  entityCount: entities.length,
  payloadQuestionCount,
  enrichmentCount: enrichmentByKey.size,
  insertCount: inserts.length,
  // Entities that vanish are not deleted: the log is append-only, and a URL
  // that comes back should come back with its history.
  retiredEntityCount: retired.length,
  retiredExamples: retired.slice(0, 10),
  byScope,
  changedExamples: inserts.filter((row) => row.previousHash).slice(0, 10),
  digest: fingerprint(entities.map((entity) => [entity.path, entity.hash])),
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
source.close();

console.log(JSON.stringify({
  mode,
  bootstrap,
  entityCount: report.entityCount,
  payloadQuestionCount,
  insertCount: report.insertCount,
  retiredEntityCount: report.retiredEntityCount,
  byScope,
  digest: report.digest,
  pass: !retired.length && (mode === "check" || inserts.length >= 0),
}, null, 2));
if (retired.length) process.exitCode = 1;
