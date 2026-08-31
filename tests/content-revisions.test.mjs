import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  CONTENT_PUBLISHED_AT,
  CONTENT_REVISION_SCOPES,
  CONTENT_REVISION_TABLE,
  contentRevisionEpochs,
  hasContentRevisionTable,
} from "../content-revisions.mjs";
import { priorityQuestionPilotReviewedAt, streamPathMatchesTaxonomy } from "../scripts/sitemap-route-sources.mjs";

const root = new URL("../", import.meta.url).pathname;

function log(rows) {
  const database = new DatabaseSync(":memory:");
  database.exec(`CREATE TABLE ${CONTENT_REVISION_TABLE} (
    scope TEXT NOT NULL,
    entity_key TEXT NOT NULL,
    revision INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    first_seen_at INTEGER NOT NULL,
    PRIMARY KEY (scope, entity_key, revision)
  )`);
  const insert = database.prepare(`INSERT INTO ${CONTENT_REVISION_TABLE}
    (scope, entity_key, revision, content_hash, first_seen_at) VALUES (?, ?, ?, ?, ?)`);
  for (const row of rows) insert.run(...row);
  return database;
}

test("a database with no revision log reports no epochs rather than throwing", () => {
  const database = new DatabaseSync(":memory:");
  assert.equal(hasContentRevisionTable(database), false);
  assert.equal(contentRevisionEpochs(database).size, 0);
  database.close();
});

// The sitemap builder fails closed on a URL with no epoch, so this returning an
// empty map for a present-but-empty table is what makes the guard fire instead
// of the build silently emitting the publication date for every URL.
test("an empty revision log yields no epochs", () => {
  const database = log([]);
  assert.equal(hasContentRevisionTable(database), true);
  assert.equal(contentRevisionEpochs(database).size, 0);
  database.close();
});

test("the latest revision wins, and a reverted page dates from its restore", () => {
  // Revision 3 restores revision 1's content. Its lastmod must be when it was
  // restored (300), not when that text first existed (100) - selecting on
  // MAX(first_seen_at) would agree here by accident, so the case that matters
  // is /reverted, whose newest revision carries the *lowest* timestamp.
  const database = log([
    ["question", "/kept", 1, "aaa", 100],
    ["question", "/kept", 2, "bbb", 200],
    ["question", "/kept", 3, "aaa", 300],
    ["question", "/reverted", 1, "ccc", 900],
    ["question", "/reverted", 2, "ddd", 400],
  ]);
  const epochs = contentRevisionEpochs(database);
  assert.equal(epochs.get("/kept"), 300);
  assert.equal(epochs.get("/reverted"), 400);
  assert.equal(epochs.size, 2);
  database.close();
});

test("every scope the log can emit is declared", () => {
  assert.deepEqual([...CONTENT_REVISION_SCOPES].sort(), [
    "board", "book", "chapter", "cluster", "grade",
    "question", "static", "stream", "subject", "trust",
  ]);
  assert.equal(new Set(CONTENT_REVISION_SCOPES).size, CONTENT_REVISION_SCOPES.length);
});

test("the publication date parses to the seed the bootstrap run writes", () => {
  assert.equal(Math.floor(Date.parse(CONTENT_PUBLISHED_AT) / 1_000), 1786764610);
});

// The Worker serves /sitemaps/priority-question-pilot.xml itself under
// run_worker_first, so the static asset only has to agree with it. Reading the
// date out of the Worker is what keeps one instant from being two literals.
test("the pilot review date is read from the deployed entrypoint", () => {
  const reviewedAt = priorityQuestionPilotReviewedAt(root);
  assert.ok(Number.isInteger(reviewedAt) && reviewedAt > 0);
  assert.equal(new Date(1_000 * reviewedAt).toISOString().replace(/\.000Z$/, "Z"), "2026-08-23T18:30:00Z");
});

test("stream URLs outside the taxonomy are not submittable", () => {
  assert.equal(streamPathMatchesTaxonomy("/maharashtra-board/class-12"), true);
  assert.equal(streamPathMatchesTaxonomy("/maharashtra-board/class-12/streams/no-such-stream"), true);
  assert.equal(streamPathMatchesTaxonomy("/maharashtra-board/class-12/streams/science/subjects/not-a-subject"), false);
});
