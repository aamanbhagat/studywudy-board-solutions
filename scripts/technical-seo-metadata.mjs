#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { contentToText } from "../answer-completeness.mjs";
import { isBookQuarantined } from "../multilingual-text-quality.mjs";
import { PHASE3_QUESTION_SEO } from "../phase3-question-seo-manifest.mjs";
import { questionDescription, questionDocumentTitle, questionSocialTitle } from "../question-seo.mjs";
import { bookSearchMetadata, chapterSearchMetadata, subjectSearchMetadata } from "../search-metadata.mjs";
import {
  SERP_TITLE_BUDGET,
  STATUS,
  SEVERITY,
  checklistEntry,
  corpusProvenance,
  describeLengths,
  documentTitleFromHtml,
  finding,
  metaDescriptionFromHtml,
  normalizeSimilarity,
  serpCollisionGroups,
  staticAssetProvenance,
  titleLength,
} from "../technical-seo.mjs";

// Question titles and both book-bearing hub titles are built around the
// group-minimal shelf mark that scripts/phase3-build-question-seo.mjs computes.
// The Worker reads the same table (comparison/after-worker.js:279), so an audit
// that omitted it would measure titles no page ever renders.
const BOOK_TITLE_CODES = PHASE3_QUESTION_SEO.bookTitleCodes;

const QUESTION_ROWS_SQL = `SELECT q.row_id, q.display_label, q.type, q.prompt_text, q.question_id,
  q.concept_tags, q.chapter_slug, b.id AS book_id, b.slug AS book_slug, b.title AS book_title,
  b.board_slug, b.grade_slug, b.subject_slug,
  bo.name AS board_name, bo.short_name AS board_short_name,
  g.class_number, g.label AS grade_label, s.name AS subject_name,
  c.number AS chapter_number, c.title AS chapter_title
  FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id
  JOIN catalog_boards bo ON bo.slug = b.board_slug
  JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
  JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
    AND s.slug = b.subject_slug
  JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
  ORDER BY q.row_id`;

const BOOK_ROWS_SQL = `SELECT b.id AS book_id, b.slug AS book_slug, b.title AS book_title,
  b.board_slug, b.grade_slug, b.subject_slug, b.chapter_count, b.question_count,
  bo.name AS board_name, bo.short_name AS board_short_name,
  g.class_number, g.label AS grade_label, s.name AS subject_name
  FROM catalog_books b
  JOIN catalog_boards bo ON bo.slug = b.board_slug
  JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
  JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
    AND s.slug = b.subject_slug
  ORDER BY b.id`;

const CHAPTER_ROWS_SQL = `SELECT c.book_id, c.slug AS chapter_slug, c.number AS chapter_number,
  c.title AS chapter_title, c.question_count,
  b.slug AS book_slug, b.title AS book_title, b.board_slug, b.grade_slug, b.subject_slug,
  bo.name AS board_name, bo.short_name AS board_short_name,
  g.class_number, g.label AS grade_label, s.name AS subject_name
  FROM catalog_chapters c JOIN catalog_books b ON b.id = c.book_id
  JOIN catalog_boards bo ON bo.slug = b.board_slug
  JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
  JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
    AND s.slug = b.subject_slug
  ORDER BY c.book_id, c.position`;

// catalog_questions.prompt_text is a flattened copy written before the content
// repair and never rewritten by it, so it disagrees with catalog_book_chunks on
// ~19,897 rows. The Worker reconciles the two before it builds a title
// (comparison/after-worker.js, standaloneQuestionResponse), so a title measured
// from the column alone describes text that never ships. Reconcile the same way
// as scripts/phase3-build-question-seo.mjs:44-75.
function reconcilePromptText(database, rows) {
  const chunksForBook = database.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index");
  const repaired = new Map();
  for (const { book_id: bookId } of database.prepare("SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id").all()) {
    let pack;
    try {
      pack = JSON.parse(gunzipSync(Buffer.concat(chunksForBook.all(bookId).map((chunk) => Buffer.from(chunk.content_chunk)))).toString("utf8"));
    } catch (error) {
      throw new Error(`Unable to decode catalog_book_chunks for ${bookId}: ${error}`);
    }
    for (const chapter of pack.chapters || []) {
      for (const exercise of chapter.exercises || []) {
        for (const question of exercise.questions || []) {
          const text = contentToText(question.prompt);
          if (text.trim()) repaired.set(question.id, text);
        }
      }
    }
  }
  let reconciled = 0;
  for (const row of rows) {
    const text = repaired.get(row.question_id);
    if (!text || text === row.prompt_text) continue;
    row.prompt_text = text;
    reconciled += 1;
  }
  return reconciled;
}

// The Worker only appends a disambiguator to rows that would otherwise collide,
// so the shipped og:title and description depend on a corpus-wide collision
// pass. Mirrors scripts/phase3-build-question-seo.mjs:175-204 — including the
// fact that the document title is no longer part of it, because the book code
// makes it unique by construction.
function disambiguatedRowIds(rows) {
  const collisionRows = (generator, normalizer = (value) => value) => {
    const firstRowByValue = new Map();
    const collisions = new Set();
    for (const row of rows) {
      const value = normalizer(generator(row, false));
      const first = firstRowByValue.get(value);
      if (first == null) firstRowByValue.set(value, Number(row.row_id));
      else {
        collisions.add(first);
        collisions.add(Number(row.row_id));
      }
    }
    return collisions;
  };
  return new Set([
    ...collisionRows(questionSocialTitle),
    ...collisionRows(questionDescription),
    ...collisionRows(questionSocialTitle, normalizeSimilarity),
    ...collisionRows(questionDescription, normalizeSimilarity),
  ]);
}

function questionPath(row) {
  return `/${row.board_slug}/${row.grade_slug}/${row.subject_slug}/${row.book_slug}/${row.chapter_slug}/questions/${row.question_id}`;
}

// Board, class, home and search titles come from the minified Next.js bundle
// (worker.js) and are never rewritten by comparison/after-worker.js, so there is
// no pure function to import. The prerendered documents are the only offline
// source of truth for them.
function staticDocuments(root) {
  const base = resolve(root, "comparison/after-assets");
  const documents = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".html")) documents.push(path);
    }
  };
  walk(base);
  const records = [];
  for (const path of documents.sort()) {
    const html = readFileSync(path, "utf8");
    const title = documentTitleFromHtml(html);
    if (!title) continue;
    const route = `/${path.slice(base.length + 1).replace(/(?:^|\/)index\.html$/u, "").replace(/\.html$/u, "")}`;
    const pathname = route.replace(/^\/pages/u, "") || "/";
    // Several prerendered surfaces deliberately repeat one title: the six
    // /launch-hot-path/search variants, the corpus-quality review stubs, the
    // launch-hot-path question mirrors. All are noindex and point their canonical
    // at the page they mirror, so they are not pages Google can show — counting
    // them as visible-title duplicates measures the alias, not the site.
    const robots = html.match(/<meta[^>]+name="robots"[^>]+content="([^"]*)"/iu)?.[1] || "";
    const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/iu)?.[1] || "";
    let canonicalPath = "";
    try {
      canonicalPath = canonical ? new URL(canonical).pathname.replace(/\/$/u, "") || "/" : "";
    } catch { canonicalPath = ""; }
    records.push({
      template: pathname.startsWith("/launch-hot-path") ? "launch-hot-path" : "static",
      path: pathname,
      title,
      description: metaDescriptionFromHtml(html),
      indexable: !/\bnoindex\b/iu.test(robots) && (!canonicalPath || canonicalPath === pathname),
    });
  }
  return records;
}

export function collectTitles(database, root, { includeQuestions = true } = {}) {
  const entries = [];
  const counts = { reconciledPromptRows: 0, disambiguatedRows: 0 };

  const books = database.prepare(BOOK_ROWS_SQL).all().filter((book) => !isBookQuarantined(book.book_id));
  const booksBySubject = new Map();
  for (const book of books) {
    const key = `${book.board_slug}/${book.grade_slug}/${book.subject_slug}`;
    const group = booksBySubject.get(key) || [];
    group.push(book);
    booksBySubject.set(key, group);
  }
  for (const [path, subjectBooks] of booksBySubject) {
    const metadata = subjectSearchMetadata({
      ...subjectBooks[0],
      book_count: subjectBooks.length,
      chapter_count: subjectBooks.reduce((total, book) => total + Number(book.chapter_count), 0),
      question_count: subjectBooks.reduce((total, book) => total + Number(book.question_count), 0),
    });
    entries.push({ template: "subject", path: `/${path}`, title: metadata.documentTitle, description: metadata.description });
  }
  for (const book of books) {
    const metadata = bookSearchMetadata({ ...book, book_code: BOOK_TITLE_CODES[book.book_id] });
    entries.push({
      template: "textbook",
      path: `/${book.board_slug}/${book.grade_slug}/${book.subject_slug}/${book.book_slug}`,
      title: metadata.documentTitle,
      description: metadata.description,
    });
  }

  const questionsByChapter = new Map();
  for (const question of database.prepare("SELECT book_id, chapter_slug, type, prompt_text FROM catalog_questions ORDER BY row_id").iterate()) {
    const key = `${question.book_id}\u0000${question.chapter_slug}`;
    const group = questionsByChapter.get(key) || [];
    group.push(question);
    questionsByChapter.set(key, group);
  }
  for (const chapter of database.prepare(CHAPTER_ROWS_SQL).iterate()) {
    if (isBookQuarantined(chapter.book_id)) continue;
    const metadata = chapterSearchMetadata({ ...chapter, book_code: BOOK_TITLE_CODES[chapter.book_id] }, questionsByChapter.get(`${chapter.book_id}\u0000${chapter.chapter_slug}`) || []);
    entries.push({
      template: "chapter",
      path: `/${chapter.board_slug}/${chapter.grade_slug}/${chapter.subject_slug}/${chapter.book_slug}/${chapter.chapter_slug}`,
      title: metadata.documentTitle,
      description: metadata.description,
    });
  }

  entries.push(...staticDocuments(root));

  if (includeQuestions) {
    const rows = database.prepare(QUESTION_ROWS_SQL).all();
    counts.reconciledPromptRows = reconcilePromptText(database, rows);
    const disambiguated = disambiguatedRowIds(rows);
    counts.disambiguatedRows = disambiguated.size;
    for (const row of rows) {
      const disambiguate = disambiguated.has(Number(row.row_id));
      entries.push({
        template: "question",
        path: questionPath(row),
        title: questionDocumentTitle(row, BOOK_TITLE_CODES[row.book_id]),
        description: questionDescription(row, disambiguate),
      });
    }
  }

  // Every corpus-derived route is self-canonical and indexable; only the
  // prerendered documents carry a robots or canonical override, and
  // staticDocuments has already read theirs.
  for (const entry of entries) if (entry.indexable === undefined) entry.indexable = true;

  return { entries, counts };
}

function byTemplate(entries) {
  const templates = new Map();
  for (const entry of entries) {
    const group = templates.get(entry.template) || [];
    group.push(entry);
    templates.set(entry.template, group);
  }
  return templates;
}

export function auditMetadata({ database, root, corpus, includeQuestions = true }) {
  const { entries, counts } = collectTitles(database, root, { includeQuestions });
  const templates = byTemplate(entries);
  const provenance = corpusProvenance(corpus);

  // ---- new checklist item: the ~60-character SERP budget --------------------
  const perTemplate = {};
  for (const [template, group] of [...templates.entries()].sort()) {
    perTemplate[template] = describeLengths(group.map((entry) => titleLength(entry.title)));
  }
  const allLengths = entries.map((entry) => titleLength(entry.title));
  const overall = describeLengths(allLengths);
  const longest = [...entries]
    .sort((left, right) => titleLength(right.title) - titleLength(left.title))
    .slice(0, 25)
    .map((entry) => ({ characters: titleLength(entry.title), template: entry.template, path: entry.path, title: entry.title }));

  const serpCollisions = serpCollisionGroups(entries);
  // Split out so the question-only figure stays directly comparable to the
  // pre-measured 96,985 pages / 27,846 groups; the all-template total is a
  // strict superset of it and would silently absorb a regression.
  const questionSerpCollisions = serpCollisionGroups(entries.filter((entry) => entry.template === "question"));
  // What Google can actually show. The all-document figure counts noindex
  // mirrors and canonicalised aliases, which repeat a title on purpose.
  const indexableEntries = entries.filter((entry) => entry.indexable);
  const indexableSerpCollisions = serpCollisionGroups(indexableEntries);
  // Google clips the SERP line by pixel width, so the cut floats around 55-60.
  // Measuring only 60 hides a shape that is unique there and duplicated at 50.
  const SERP_BUDGET_SWEEP = [45, 50, 55, SERP_TITLE_BUDGET];
  const serpCollisionsByBudget = Object.fromEntries(SERP_BUDGET_SWEEP.map((budget) => {
    const all = serpCollisionGroups(entries, budget);
    const indexable = serpCollisionGroups(indexableEntries, budget);
    return [budget, {
      collidingPages: all.collidingPages,
      collisionGroups: all.collisionGroups,
      indexableCollidingPages: indexable.collidingPages,
      indexableCollisionGroups: indexable.collisionGroups,
    }];
  }));
  const titleFindings = [];
  if (overall.overBudget > 0) {
    titleFindings.push(finding({
      id: "titles-over-serp-budget",
      checklistItem: "title-budget",
      severity: SEVERITY.high,
      summary: `${overall.overBudget.toLocaleString("en-IN")} of ${overall.pages.toLocaleString("en-IN")} page titles exceed the ${SERP_TITLE_BUDGET}-character SERP budget (${(overall.overBudgetShare * 100).toFixed(1)}%).`,
      evidence: {
        median: overall.p50,
        maximum: overall.maximum,
        perTemplate: Object.fromEntries(Object.entries(perTemplate)
          .map(([template, stats]) => [template, `${stats.overBudget}/${stats.pages} over, p50 ${stats.p50}, max ${stats.maximum}`])),
        budgetConstants: [
          "search-metadata.mjs:52 DOCUMENT_TITLE_LIMIT = 160",
          "search-metadata.mjs:57 SERP_HUB_TITLE_BUDGET = 60",
          "question-seo.mjs:382 Math.max(24, SERP_TITLE_BUDGET - [...prefix].length - 2)",
        ],
        // The floor is why a title can still run past 60: a long book code plus a
        // long subject leaves under 24 characters, and a title that is only an
        // identifier is worse in results than one whose prompt tail gets clipped.
        overBudgetCause: "identifier prefix longer than 34 characters (question template)",
      },
    }));
  }
  const worstBudget = SERP_BUDGET_SWEEP
    .reduce((worst, budget) => (serpCollisionsByBudget[budget].indexableCollidingPages
      > serpCollisionsByBudget[worst].indexableCollidingPages ? budget : worst), SERP_TITLE_BUDGET);
  if (serpCollisionsByBudget[worstBudget].indexableCollisionGroups > 0) {
    const worst = serpCollisionsByBudget[worstBudget];
    titleFindings.push(finding({
      id: "serp-visible-title-collisions",
      checklistItem: "title-budget",
      severity: SEVERITY.critical,
      summary: `${worst.indexableCollidingPages.toLocaleString("en-IN")} indexable pages (${((worst.indexableCollidingPages / indexableEntries.length) * 100).toFixed(1)}%) share a title with another page once clipped to ${worstBudget} characters, across ${worst.indexableCollisionGroups.toLocaleString("en-IN")} groups.`,
      evidence: {
        note: "Every title is unique in full - the existing gate is correct about that. The disambiguator lands in the tail Google truncates, so the pages are indistinguishable in results.",
        worstBudget,
        byBudget: serpCollisionsByBudget,
        distinctVisibleTitles: indexableSerpCollisions.distinctVisibleTitles,
        largestGroups: indexableSerpCollisions.largestGroups,
      },
    }));
  } else if (serpCollisions.collisionGroups > 0) {
    titleFindings.push(finding({
      id: "serp-visible-title-collisions-noindex-only",
      checklistItem: "title-budget",
      severity: SEVERITY.low,
      summary: `${serpCollisions.collidingPages.toLocaleString("en-IN")} pages share a clipped title, but every one of them is noindex or canonicalised onto another page, so none can be shown twice.`,
      evidence: {
        byBudget: serpCollisionsByBudget,
        largestGroups: serpCollisions.largestGroups,
      },
    }));
  }

  // ---- original checklist item: meta uniqueness ------------------------------
  const uniquenessFindings = [];
  const duplicateGroups = (field) => {
    const groups = new Map();
    const seenPaths = new Set();
    for (const entry of entries) {
      if (seenPaths.has(entry.path)) continue;
      seenPaths.add(entry.path);
      const value = entry[field];
      if (!value) continue;
      const key = normalizeSimilarity(value);
      const group = groups.get(key) || [];
      group.push(entry);
      groups.set(key, group);
    }
    return [...groups.values()].filter((group) => group.length > 1).sort((left, right) => right.length - left.length);
  };
  const duplicateTitles = duplicateGroups("title");
  const duplicateDescriptions = duplicateGroups("description");
  for (const [field, groups] of [["title", duplicateTitles], ["description", duplicateDescriptions]]) {
    if (!groups.length) continue;
    uniquenessFindings.push(finding({
      id: `duplicate-${field}s-across-templates`,
      checklistItem: "meta-uniqueness",
      severity: SEVERITY.medium,
      summary: `${groups.reduce((total, group) => total + group.length, 0)} pages share a normalized ${field} with another page, across ${groups.length} groups.`,
      evidence: {
        note: "phase3-build-question-seo.mjs gates question-vs-question uniqueness only. Nothing compares non-question templates, or one template against another.",
        groups: groups.slice(0, 10).map((group) => ({
          pages: group.length,
          value: String(group[0][field]).slice(0, 90),
          templates: [...new Set(group.map((entry) => entry.template))],
          examplePaths: group.slice(0, 3).map((entry) => entry.path),
        })),
      },
    }));
  }

  return [
    checklistEntry({
      id: "title-budget",
      // A title running past the budget loses its tail; two titles sharing the
      // visible window lose the page. Only the second is a failure — deriving
      // the status from overBudget alone made a corpus-wide collision fix
      // invisible in statusCounts.
      status: (() => {
        if (indexableSerpCollisions.collisionGroups > 0) return STATUS.fail;
        return overall.overBudget > 0 ? STATUS.warn : STATUS.pass;
      })(),
      metrics: {
        budget: SERP_TITLE_BUDGET,
        overall,
        perTemplate,
        serpVisibleTitleCollisions: serpCollisions,
        indexableSerpVisibleTitleCollisions: {
          pages: indexableEntries.length,
          distinctVisibleTitles: indexableSerpCollisions.distinctVisibleTitles,
          collisionGroups: indexableSerpCollisions.collisionGroups,
          collidingPages: indexableSerpCollisions.collidingPages,
        },
        serpCollisionsByBudget,
        questionSerpVisibleTitleCollisions: {
          distinctVisibleTitles: questionSerpCollisions.distinctVisibleTitles,
          collisionGroups: questionSerpCollisions.collisionGroups,
          collidingPages: questionSerpCollisions.collidingPages,
        },
        longestTitles: longest,
        reconciledPromptRows: counts.reconciledPromptRows,
        disambiguatedRows: counts.disambiguatedRows,
      },
      findings: titleFindings,
      notes: includeQuestions ? [] : ["Question pages were skipped (--skip-questions); totals cover non-question templates only."],
      provenance,
    }),
    checklistEntry({
      id: "meta-uniqueness",
      status: duplicateTitles.length || duplicateDescriptions.length ? STATUS.fail : STATUS.pass,
      metrics: {
        pagesCompared: entries.length,
        duplicateTitleGroups: duplicateTitles.length,
        duplicateDescriptionGroups: duplicateDescriptions.length,
        exactFullTitleDuplicates: entries.length - new Set(entries.map((entry) => entry.title)).size,
      },
      findings: uniquenessFindings,
      notes: [
        "Extends the question-only gate in scripts/phase3-build-question-seo.mjs to every template and across templates.",
        "audits/phase-3/README.md:18-20 claims cross-template coverage that does not exist in code.",
      ],
      provenance,
    }),
  ];
}

export { staticDocuments };
