import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { isQuestionRowIndexable } from "../answer-completeness.mjs";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { bookIdFromPathname, isBookQuarantined } from "../multilingual-text-quality.mjs";

const root = resolve(import.meta.dirname, "..");

function popcountByte(value) {
  let byte = value;
  let count = 0;
  while (byte) {
    count += byte & 1;
    byte >>= 1;
  }
  return count;
}

test("the generated publishing manifest has no word-count threshold", () => {
  assert.equal(PHASE4_GATE_MANIFEST.policyVersion, "phase4-v7-language-quality");
  assert.match(PHASE4_GATE_MANIFEST.multilingualTextPolicy, /unresolved Hindi and Tamil imports are quarantined/u);
  assert.equal(PHASE4_GATE_MANIFEST.questionPageExperienceVersion, "question-specific-trust-v2");
  assert.match(PHASE4_GATE_MANIFEST.formulaAccessibilityPolicy, /semantic MathML must agree/i);
  assert.match(PHASE4_GATE_MANIFEST.completenessPolicy, /no minimum word count/i);
  assert.equal(Object.hasOwn(PHASE4_GATE_MANIFEST, "depthFloor"), false);
  const bytes = Uint8Array.from(atob(PHASE4_GATE_MANIFEST.indexabilityBitsetBase64), (character) => character.charCodeAt(0));
  const passedRows = bytes.reduce((sum, byte) => sum + popcountByte(byte), 0);
  assert.equal(passedRows, PHASE4_GATE_MANIFEST.gatePassedCount);
  assert.equal(passedRows, PHASE4_GATE_MANIFEST.indexableCount);
});

test("production sitemap assets contain exactly the type-complete question set", () => {
  const sitemapDirectory = resolve(root, "comparison/after-assets/sitemaps");
  const questionFiles = readdirSync(sitemapDirectory).filter((name) => /^questions-\d+\.xml\.gz$/u.test(name));
  const paths = [];
  for (const name of questionFiles) {
    const xml = gunzipSync(readFileSync(resolve(sitemapDirectory, name))).toString("utf8");
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/gu)) paths.push(new URL(match[1]).pathname);
  }
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(paths.length, PHASE4_GATE_MANIFEST.indexableCount);
  assert.equal(paths.some((path) => isBookQuarantined(bookIdFromPathname(path))), false);

  const databasePath = resolve(root, "../data/d1/studywudy-content.sqlite3");
  if (!existsSync(databasePath)) return;
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const rows = database.prepare(`SELECT q.row_id,
    '/' || b.board_slug || '/' || b.grade_slug || '/' || b.subject_slug || '/' ||
    b.slug || '/' || q.chapter_slug || '/questions/' || q.question_id AS path
    FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id`).all();
  const rowByPath = new Map(rows.map((row) => [row.path, Number(row.row_id)]));
  for (const path of paths) {
    assert.ok(rowByPath.has(path), `sitemap question is missing from D1: ${path}`);
    assert.equal(isQuestionRowIndexable(PHASE4_GATE_MANIFEST, rowByPath.get(path)), true, `sitemap question failed its gate: ${path}`);
  }
  database.close();
});

test("the live methodology and final response layer use the completeness policy", () => {
  const methodology = readFileSync(resolve(root, "phase5-compliance.mjs"), "utf8");
  const productionWorker = readFileSync(resolve(root, "comparison/after-worker.js"), "utf8");
  assert.match(methodology, /does not use a minimum word count/i);
  assert.match(methodology, /complete answer for its question type/i);
  assert.match(methodology, /no substantially equivalent indexed page/i);
  assert.match(methodology, /semantic mathematics/i);
  assert.match(productionWorker, /isQuestionRowIndexable\(PHASE4_GATE_MANIFEST/u);
  assert.match(productionWorker, /questionCompletenessIndexingResponse/u);
});
