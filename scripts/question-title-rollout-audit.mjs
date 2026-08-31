#!/usr/bin/env node
// Stage the identity-first question <title> (70cf3c09) and audit the stage.
//
// `--select` picks the next stage's rows and prints question-title-rollout.mjs;
// the default run measures the stage that is currently checked in. The two
// modes share one row loader on purpose: a canary that is selected against a
// different corpus projection than the one it is audited against proves
// nothing.
//
// The build gate in scripts/phase3-build-question-seo.mjs stays on the target
// title and keeps asserting zero collisions at 45/50/55/60 for the whole corpus.
// That answers "is the new title design sound". This script answers the other
// question: "how much of it is live, and does the half-migrated state collide
// with itself" - which is the only failure mode a staged rollout adds.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { contentToText } from "../answer-completeness.mjs";
import { PHASE3_QUESTION_SEO } from "../phase3-question-seo-manifest.mjs";
import { getQuestionUrl, questionRecordFromCatalogRow } from "../question-routes.mjs";
import { bookCodeLead } from "../search-metadata.mjs";
import { questionDocumentTitle, questionLegacyDocumentTitle } from "../question-seo.mjs";
import { QUESTION_TITLE_ROLLOUT_STAGE, QUESTION_TITLE_STAGE_ROWS, questionTitleRolledOut } from "../question-title-rollout.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index];
  if (!token.startsWith("--")) continue;
  const next = process.argv[index + 1];
  args.set(token, next && !next.startsWith("--") ? next : "1");
}
const root = resolve(import.meta.dirname, "..");
const databasePath = resolve(root, args.get("--source-db") || "../data/d1/studywudy-content.sqlite3");
const sitemapDirectory = resolve(root, "comparison/after-assets/sitemaps");

// The SERP budgets the build gate uses. Google clips by pixel width, so a title
// that is unique at 60 but not at 45 is not actually unique on a phone.
const BUDGETS = Object.freeze([45, 50, 55, 60]);
const clip = (text, budget) => [...text].slice(0, budget).join("");

// ---------------------------------------------------------------------------
// Rows, projected and reconciled exactly as scripts/phase3-build-question-seo.mjs
// and the Worker do. catalog_questions.prompt_text trails the repaired chunks by
// ~20K rows, so a title computed from the column alone is a title that never
// ships.
// ---------------------------------------------------------------------------
function loadRows(database) {
  const rows = database.prepare(`SELECT q.row_id, q.display_label, q.type, q.prompt_text, q.question_id,
    q.concept_tags, q.book_id, q.chapter_slug, b.title AS book_title, b.slug AS book_slug,
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
    ORDER BY q.row_id`).all();
  const chunksForBook = database.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index");
  const repaired = new Map();
  for (const { book_id: bookId } of database.prepare("SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id").all()) {
    const pack = JSON.parse(gunzipSync(Buffer.concat(chunksForBook.all(bookId).map((chunk) => Buffer.from(chunk.content_chunk)))).toString("utf8"));
    for (const chapter of pack.chapters || [])
      for (const exercise of chapter.exercises || [])
        for (const question of exercise.questions || []) {
          const text = contentToText(question.prompt);
          if (text.trim()) repaired.set(question.id, text);
        }
  }
  let reconciled = 0;
  for (const row of rows) {
    const text = repaired.get(row.question_id);
    if (!text || text === row.prompt_text) continue;
    row.prompt_text = text;
    reconciled += 1;
  }
  return { rows, reconciled };
}

const disambiguatedRows = new Set(PHASE3_QUESTION_SEO.disambiguatedRowIds);
const bookCodes = PHASE3_QUESTION_SEO.bookTitleCodes;
const targetTitle = (row) => questionDocumentTitle(row, bookCodes[row.book_id]);
const legacyTitle = (row) => questionLegacyDocumentTitle(row, disambiguatedRows.has(Number(row.row_id)));

// A title that is never submitted cannot appear in a SERP, so the spread is
// drawn from the sitemaps rather than from the whole corpus.
function submittedPaths() {
  const paths = new Set();
  for (const file of readFileSync(resolve(sitemapDirectory, "..", "sitemap.xml"), "utf8").matchAll(/<loc>([^<]*sitemaps\/([^<]*))<\/loc>/gu)) {
    const name = file[2];
    if (!name.startsWith("questions-")) continue;
    const raw = readFileSync(resolve(sitemapDirectory, name));
    const xml = name.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
    for (const match of xml.matchAll(/<loc>([^<]*)<\/loc>/gu)) paths.add(new URL(match[1]).pathname);
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Quality checks. These are the four the rollout was asked to prove, plus the
// ones the corpus makes likely: a book code long enough to need a mid-string
// ellipsis, a prompt window that holds only the exercise instruction, and a
// title whose window collapsed to nothing.
// ---------------------------------------------------------------------------
// Everything after the first ": " is the prompt window. Testing the tail
// character instead would flag "Q1: Choose the correct option:…", whose window
// is full - of an instruction that happens to end in a colon.
function promptWindow(title) {
  const separator = title.indexOf(": ");
  return separator < 0 ? "" : title.slice(separator + 2);
}

// A truncation artifact is not a shape you can pattern-match: "NCERT…bharat" is
// a whole Hindi word and fine, while "NCERT…xemplar" is the tail of "Exemplar"
// and is not. The only sound test is against the string the code was cut from,
// so every token touching the ellipsis has to be a whole word of bookCodeLead.
// Checking a character class instead is what let 41,513 pages pass this audit
// while shipping "NCERT…xemplar".
function wordFragment(row) {
  const code = row.targetTitle.split(" Cl")[0] || "";
  if (!code.includes("…")) return null;
  const words = new Set(bookCodeLead(row).split(/\s+/u).filter(Boolean).map((word) => word.toLocaleLowerCase("en-IN")));
  for (const segment of code.split("…")) {
    const tokens = segment.split(/\s+/u).filter(Boolean);
    // Only the tokens adjacent to an elision can be partial; the ordinal the
    // builder appends for a genuine duplicate edition is not from the lead.
    for (const token of [tokens[0], tokens.at(-1)]) {
      if (!token || /^\d+$/u.test(token)) continue;
      if (!words.has(token.toLocaleLowerCase("en-IN"))) return `${row.path} :: ${code} (token "${token}" is not a word of "${bookCodeLead(row)}")`;
    }
  }
  return null;
}

function inspect(entries) {
  return {
    blankOrStub: entries.filter((entry) => !entry.title.trim() || [...entry.title].length < 10).map((entry) => entry.path),
    latexOrTableArtifacts: entries.filter((entry) => /\\\\|\$\$|[{}]|\|\s*\||\\\(|\\\[/u.test(entry.title)).map((entry) => `${entry.path} :: ${entry.title}`),
    emptyPromptWindow: entries.filter((entry) => !promptWindow(entry.title).replace(/…/gu, "").trim()).map((entry) => entry.title),
    instructionOnlyWindow: entries.filter((entry) => /: (?:Choose the correct|Answer the following|Fill in the blanks?|Select the correct|Match the following|State (?:whether|True))/iu.test(entry.title)).length,
    missingSeparator: entries.filter((entry) => !entry.title.includes(": ")).map((entry) => entry.title),
    lowercaseOpening: entries.filter((entry) => /^\p{Ll}/u.test(entry.title)).map((entry) => entry.title),
    overlong: entries.filter((entry) => [...entry.title].length > 70).map((entry) => `${[...entry.title].length} :: ${entry.title}`),
    duplicateTitles: (() => {
      const seen = new Map();
      for (const entry of entries) seen.set(entry.title, (seen.get(entry.title) || 0) + 1);
      return [...seen].filter(([, count]) => count > 1).map(([title, count]) => `${count}x ${title}`);
    })(),
  };
}

function collisions(titles) {
  const result = {};
  for (const budget of BUDGETS) {
    const groups = new Map();
    for (const title of titles) {
      const key = clip(title, budget);
      groups.set(key, (groups.get(key) || 0) + 1);
    }
    let groupCount = 0;
    let pageCount = 0;
    for (const count of groups.values()) if (count > 1) { groupCount += 1; pageCount += count; }
    result[budget] = { groups: groupCount, pages: pageCount };
  }
  return result;
}

// ---------------------------------------------------------------------------
const database = new DatabaseSync(databasePath, { readOnly: true });
const { rows, reconciled } = loadRows(database);
for (const row of rows) {
  row.path = getQuestionUrl(questionRecordFromCatalogRow(row));
  row.targetTitle = targetTitle(row);
  row.legacyTitle = legacyTitle(row);
}
const submitted = submittedPaths();

if (args.has("--select")) {
  const stage = args.get("--stage") || "canary-1";
  const size = Number(args.get("--size") || 150);
  const selection = args.has("--bulk")
    ? selectBulkStage(rows, submitted, stage, size, QUESTION_TITLE_STAGE_ROWS)
    : selectStage(rows, submitted, stage, size);
  process.stdout.write(JSON.stringify(selection, null, 2));
  process.exit(0);
}

const rolledOut = rows.filter((row) => questionTitleRolledOut(row.row_id));
const effective = rows.map((row) => (questionTitleRolledOut(row.row_id) ? row.targetTitle : row.legacyTitle));
const rolledOutEntries = rolledOut.map((row) => ({ path: row.path, title: row.targetTitle }));

// The only collision class a staged rollout can create that neither the
// all-legacy nor the all-new state has: a rolled-out page whose clipped title
// now matches a page that has not moved yet.
const effectiveGroups = new Map();
effective.forEach((title, index) => {
  const key = clip(title, 60);
  if (!effectiveGroups.has(key)) effectiveGroups.set(key, []);
  effectiveGroups.get(key).push(index);
});
const mixedCollisions = [];
for (const [key, indexes] of effectiveGroups) {
  if (indexes.length < 2) continue;
  const rolled = indexes.filter((index) => questionTitleRolledOut(rows[index].row_id));
  if (!rolled.length || rolled.length === indexes.length) continue;
  mixedCollisions.push({ key, pages: indexes.length, rolledOut: rolled.length, sample: indexes.slice(0, 3).map((index) => rows[index].path) });
}

const report = {
  generatedAt: new Date().toISOString(),
  sourceDatabase: databasePath,
  stage: QUESTION_TITLE_ROLLOUT_STAGE,
  corpusCount: rows.length,
  reconciledPromptCount: reconciled,
  rolledOutCount: rolledOut.length,
  rolledOutSubmittedCount: rolledOut.filter((row) => submitted.has(row.path)).length,
  coverage: {
    boards: [...new Set(rolledOut.map((row) => row.board_slug))].sort(),
    classes: [...new Set(rolledOut.map((row) => row.grade_slug))].sort(),
    subjects: new Set(rolledOut.map((row) => row.subject_slug)).size,
    books: new Set(rolledOut.map((row) => row.book_id)).size,
    chapters: new Set(rolledOut.map((row) => `${row.book_id}#${row.chapter_number}`)).size,
  },
  servedCollisions: collisions(effective),
  allLegacyCollisions: collisions(rows.map((row) => row.legacyTitle)),
  allTargetCollisions: collisions(rows.map((row) => row.targetTitle)),
  mixedStateCollisions: { count: mixedCollisions.length, sample: mixedCollisions.slice(0, 5) },
  // Corpus-wide, not canary-only: the book code is a per-book property, so a
  // canary of 150 pages samples only the books it happens to touch. This is the
  // check that has to hold before any later batch widens into those books.
  bookCodeFragments: (() => {
    const findings = rows.map(wordFragment).filter(Boolean);
    return { pages: findings.length, sample: [...new Set(findings)].slice(0, 10) };
  })(),
  rolledOutChecks: inspect(rolledOutEntries),
  rolledOutTitleLength: (() => {
    const lengths = rolledOutEntries.map((entry) => [...entry.title].length).sort((a, b) => a - b);
    return lengths.length
      ? { minimum: lengths[0], median: lengths[lengths.length >> 1], maximum: lengths.at(-1), over60: lengths.filter((value) => value > 60).length }
      : { minimum: 0, median: 0, maximum: 0, over60: 0 };
  })(),
};
const blocking = [
  report.mixedStateCollisions.count,
  report.bookCodeFragments.pages,
  report.rolledOutChecks.blankOrStub.length,
  report.rolledOutChecks.latexOrTableArtifacts.length,
  report.rolledOutChecks.emptyPromptWindow.length,
  report.rolledOutChecks.missingSeparator.length,
  report.rolledOutChecks.overlong.length,
  report.rolledOutChecks.duplicateTitles.length,
].reduce((total, value) => total + value, 0);
report.pass = blocking === 0;

// The SERP-clipped before/after pair for a spread of rolled-out pages. Every
// batch has to show its own evidence, and a pair rebuilt by hand against a
// different row projection than the audit used would not be evidence of the
// same thing. Sampled by stride so the spread is not one chapter.
const sampleSize = Number(args.get("--sample") || 0);
if (sampleSize > 0) {
  const stride = Math.max(1, Math.floor(rolledOut.length / sampleSize));
  report.sample = rolledOut.filter((_, index) => index % stride === 0).slice(0, sampleSize).map((row) => ({
    rowId: row.row_id,
    path: row.path,
    submitted: submitted.has(row.path),
    before: clip(row.legacyTitle, 60),
    after: clip(row.targetTitle, 60),
  }));
}

const outputPath = args.get("--output");
if (outputPath) writeFileSync(resolve(root, outputPath), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.pass) process.exitCode = 1;

// ---------------------------------------------------------------------------
function selectStage(allRows, submittedSet, stage, size) {
  const forced = new Map();
  const remember = (row, why) => {
    if (!row) return;
    if (!forced.has(row.row_id)) forced.set(row.row_id, { row, why: [] });
    forced.get(row.row_id).why.push(why);
  };
  // Rows whose new-format title is pinned by a release gate, so they cannot sit
  // outside the stage: scripts/search-metadata-gate.mjs:162 and
  // public-title-quality.mjs:7 (the second is checked against served HTML).
  remember(allRows.find((row) => row.question_id === "q-msb-balbharati-physics-standard-12-8-002"), "ci-pinned:search-metadata-gate");
  remember(allRows.find((row) => Number(row.row_id) === 39_148), "ci-pinned:public-title-quality");
  const take = (predicate, why, limit) => {
    let taken = 0;
    for (const row of allRows) {
      if (taken >= limit) break;
      if (forced.has(row.row_id) || !submittedSet.has(row.path) || !predicate(row)) continue;
      remember(row, why);
      taken += 1;
    }
  };
  take((row) => row.targetTitle.includes("…") && row.targetTitle.indexOf("…") < 20, "book-code-mid-string-ellipsis", 8);
  take((row) => /[ऀ-ॿ]/u.test(row.targetTitle), "devanagari-prompt", 8);
  take((row) => [...row.targetTitle].length >= 69, "longest-titles", 5);
  take((row) => /: (?:Choose the correct|Answer the following)/iu.test(row.targetTitle), "instruction-only-window", 6);
  const buckets = new Map();
  for (const row of allRows) {
    if (!submittedSet.has(row.path)) continue;
    const key = `${row.board_slug}|${row.grade_slug}|${row.subject_slug}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  const spread = [];
  const seenBooks = new Set([...forced.values()].map((entry) => entry.row.book_id));
  for (let pass = 0; spread.length + forced.size < size && pass < 6; pass += 1) {
    for (const key of [...buckets.keys()].sort()) {
      if (spread.length + forced.size >= size) break;
      const candidate = buckets.get(key).find((row) => !forced.has(row.row_id)
        && !spread.some((entry) => entry.row_id === row.row_id)
        && (pass > 0 || !seenBooks.has(row.book_id))
        && (row.row_id + key.length) % (pass + 3) === pass);
      if (!candidate) continue;
      seenBooks.add(candidate.book_id);
      spread.push(candidate);
    }
  }
  const selected = [...[...forced.values()].map((entry) => entry.row), ...spread];
  return {
    stage,
    rowIds: selected.map((row) => Number(row.row_id)).sort((a, b) => a - b),
    reasons: [...forced.values()].reduce((acc, entry) => {
      for (const why of entry.why) acc[why] = (acc[why] || 0) + 1;
      return acc;
    }, { "representative-spread": spread.length }),
  };
}

// A bulk stage is not a canary, and selectStage cannot produce one. That
// sampler takes at most one row per board|grade|subject per pass over six
// passes, so with 259 buckets it tops out near 1,430 rows no matter what
// --size says - asking it for 5,000 silently returns 1,432. That ceiling is
// correct for a canary, whose job is to touch as many distinct books and edge
// cases as possible in a set small enough to read by hand.
//
// A 5K+ batch wants the opposite property: a proportional slice of the
// submitted corpus that leaves every bucket's share intact, so the batch's
// collision behaviour actually predicts the remainder's. A bucket that is 4% of
// the sitemap should be 4% of the batch; over-sampling the odd corners the way
// a canary does would make the numbers look worse than the rollout really is,
// and under-sampling them would hide the failures the canary was built to find.
//
// Deterministic throughout - largest-remainder apportionment over buckets
// sorted by key, then a fixed stride within each bucket. No RNG, so re-running
// --select on the same corpus reproduces the same stage exactly.
function selectBulkStage(allRows, submittedSet, stage, size, carryForward) {
  // Every bulk stage carries forward the rows already rolled out. Dropping one
  // would send a page that served the identity-first title back to the legacy
  // string, and a title that flickers between two values across recrawls is the
  // single failure this staged rollout exists to avoid - worse than either
  // title on its own.
  const carried = new Set([...carryForward].map(Number));
  const pool = allRows.filter((row) => submittedSet.has(row.path) && !carried.has(Number(row.row_id)));
  const remaining = Math.max(0, size - carried.size);
  if (remaining > pool.length) {
    throw new Error(`stage "${stage}" wants ${remaining} new rows but only ${pool.length} submitted rows remain outside the current stage`);
  }

  const buckets = new Map();
  for (const row of pool) {
    const key = `${row.board_slug}|${row.grade_slug}|${row.subject_slug}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }
  const keys = [...buckets.keys()].sort();

  // Hamilton apportionment: floor of each bucket's exact quota, then hand out
  // what floor discarded to the largest fractional parts. Ties break on key so
  // the result does not depend on Map iteration order.
  const quota = new Map(keys.map((key) => [key, (buckets.get(key).length / pool.length) * remaining]));
  const allocation = new Map(keys.map((key) => [key, Math.floor(quota.get(key))]));
  const shortfall = () => remaining - [...allocation.values()].reduce((total, value) => total + value, 0);
  const byRemainder = [...keys].sort((left, right) => {
    const delta = (quota.get(right) % 1) - (quota.get(left) % 1);
    return delta !== 0 ? delta : (left < right ? -1 : 1);
  });
  // Cycles because a bucket can hit its own row count before the shortfall is
  // gone; a single pass would then return fewer rows than asked for, which is
  // the exact bug this function replaces.
  while (shortfall() > 0) {
    let placed = 0;
    for (const key of byRemainder) {
      if (shortfall() <= 0) break;
      if (allocation.get(key) >= buckets.get(key).length) continue;
      allocation.set(key, allocation.get(key) + 1);
      placed += 1;
    }
    if (placed === 0) throw new Error(`cannot allocate ${shortfall()} more rows: every bucket is exhausted`);
  }

  // Stride within the bucket rather than the first N: rows arrive in row_id
  // order, which is import order, which clusters by book and chapter. Taking
  // the head of each bucket would rebuild the whole batch out of first chapters.
  const selected = [];
  for (const key of keys) {
    const bucket = buckets.get(key);
    const want = allocation.get(key);
    if (!want) continue;
    const stride = bucket.length / want;
    for (let index = 0; index < want; index += 1) selected.push(bucket[Math.floor(index * stride)]);
  }

  const rowIds = [...new Set([...carried, ...selected.map((row) => Number(row.row_id))])].sort((a, b) => a - b);
  if (rowIds.length !== size) {
    throw new Error(`selected ${rowIds.length} rows for stage "${stage}" but asked for ${size}`);
  }
  return {
    stage,
    rowIds,
    reasons: {
      "carried-forward": carried.size,
      "proportional-spread": selected.length,
      buckets: keys.filter((key) => allocation.get(key) > 0).length,
    },
    coverage: {
      boards: [...new Set(selected.map((row) => row.board_slug))].sort(),
      classes: [...new Set(selected.map((row) => row.grade_slug))].sort(),
      subjects: new Set(selected.map((row) => row.subject_slug)).size,
      books: new Set(selected.map((row) => row.book_id)).size,
      chapters: new Set(selected.map((row) => `${row.book_id}#${row.chapter_number}`)).size,
    },
  };
}
