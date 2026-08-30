import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import { isQuestionRowIndexable } from "../answer-completeness.mjs";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { bookIdFromPathname, isBookQuarantined } from "../multilingual-text-quality.mjs";
import { SOURCE_TEXT_INTEGRITY_MANIFEST } from "../source-text-integrity-manifest.mjs";
import { isSourceTextIntegrityRowPassed } from "../source-text-integrity.mjs";

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

// Pinning these to a literal is what let the manifest fall three policy
// generations behind the gate that writes it: a7199151 bumped both constants on
// 2026-08-24 without regenerating, and a test asserting the checked-in value
// cannot notice that the generator moved on. Read them back out of the script
// instead, so the assertion fails the moment the two disagree.
function gateScriptConstant(name) {
  const source = readFileSync(resolve(root, "scripts/phase4-content-gate.mjs"), "utf8");
  const match = source.match(new RegExp(`^const ${name} = "([^"]+)";$`, "mu"));
  assert.ok(match, `scripts/phase4-content-gate.mjs no longer declares ${name}`);
  return match[1];
}

test("the generated publishing manifest has no word-count threshold", () => {
  assert.equal(PHASE4_GATE_MANIFEST.policyVersion, gateScriptConstant("POLICY_VERSION"));
  assert.match(PHASE4_GATE_MANIFEST.multilingualTextPolicy, /unresolved Hindi and Tamil imports are quarantined/u);
  assert.equal(PHASE4_GATE_MANIFEST.questionPageExperienceVersion, gateScriptConstant("QUESTION_PAGE_EXPERIENCE_VERSION"));
  assert.match(PHASE4_GATE_MANIFEST.formulaAccessibilityPolicy, /semantic-token preservation.*MathML/i);
  assert.match(PHASE4_GATE_MANIFEST.promptRequirementsPolicy, /draw, working, comparison, reason and derivation/i);
  assert.equal(typeof PHASE4_GATE_MANIFEST.equationReviewBitsetBase64, "string");
  assert.match(PHASE4_GATE_MANIFEST.semanticAnswerQualityPolicy, /post-generation-semantic/u);
  assert.match(PHASE4_GATE_MANIFEST.sourceMappingPolicy, /internal mapping consistency is separate/u);
  assert.match(PHASE4_GATE_MANIFEST.sourceTextIntegrityPolicy, /imported question.*Given.*substitutions.*final answer/u);
  assert.match(PHASE4_GATE_MANIFEST.sourceTextIntegrityPolicy, /near-duplicates.*discrete counts fail closed/u);
  assert.equal(PHASE4_GATE_MANIFEST.sourceTextIntegrityPassedCount, SOURCE_TEXT_INTEGRITY_MANIFEST.gatePassedCount);
  assert.equal(PHASE4_GATE_MANIFEST.normalizedQuestionVerifiedCount, SOURCE_TEXT_INTEGRITY_MANIFEST.normalizedQuestionVerifiedCount);
  assert.match(PHASE4_GATE_MANIFEST.completenessPolicy, /no minimum word count/i);
  assert.equal(Object.hasOwn(PHASE4_GATE_MANIFEST, "depthFloor"), false);
  const bytes = Uint8Array.from(atob(PHASE4_GATE_MANIFEST.indexabilityBitsetBase64), (character) => character.charCodeAt(0));
  const passedRows = bytes.reduce((sum, byte) => sum + popcountByte(byte), 0);
  assert.equal(passedRows, PHASE4_GATE_MANIFEST.gatePassedCount);
  assert.equal(passedRows, PHASE4_GATE_MANIFEST.indexableCount);
});

test("source-input integrity is a separate fail-closed publishing prerequisite", () => {
  assert.equal(SOURCE_TEXT_INTEGRITY_MANIFEST.policyVersion, "source-text-integrity-v1");
  assert.equal(SOURCE_TEXT_INTEGRITY_MANIFEST.corpusCount, PHASE4_GATE_MANIFEST.corpusCount);
  const bytes = Uint8Array.from(atob(SOURCE_TEXT_INTEGRITY_MANIFEST.indexabilityBitsetBase64), (character) => character.charCodeAt(0));
  assert.equal(bytes.reduce((sum, byte) => sum + popcountByte(byte), 0), SOURCE_TEXT_INTEGRITY_MANIFEST.gatePassedCount);

  const correctedButQuarantinedRows = [12550, 12559, 13092, 13094, 13096];
  const suspiciousNearDuplicatePeers = [9047, 195312];
  for (const rowId of [...correctedButQuarantinedRows, ...suspiciousNearDuplicatePeers]) {
    assert.equal(isSourceTextIntegrityRowPassed(SOURCE_TEXT_INTEGRITY_MANIFEST, rowId), false, `row ${rowId} must remain in source review`);
    assert.equal(isQuestionRowIndexable(PHASE4_GATE_MANIFEST, rowId), false, `row ${rowId} must remain out of the final publishing set`);
  }
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
  assert.match(methodology, /complete, semantically coherent answer for its question type/i);
  assert.match(methodology, /no substantially equivalent indexed page/i);
  assert.match(methodology, /semantic mathematics/i);
  assert.match(productionWorker, /isQuestionPubliclyEligible\(PHASE4_GATE_MANIFEST/u);
  assert.match(productionWorker, /questionCompletenessIndexingResponse/u);
  assert.match(productionWorker, /questionEligibilityHeadResponse/u);
  assert.match(productionWorker, /questionHead\) return enhanceResponse\(request, questionHead, env\)/u);
});
