import assert from "node:assert/strict";
import test from "node:test";
import {
  SERP_TITLE_BUDGET,
  describeLengths,
  documentTitleFromHtml,
  extractHeadingOutline,
  inspectHeadingOutline,
  isCompleteHtmlDocument,
  lengthHistogram,
  metaDescriptionFromHtml,
  normalizeSimilarity,
  percentile,
  serpClip,
  serpCollisionGroups,
  structuredDataBlocks,
  structuredDataTypes,
  titleLength,
} from "../technical-seo.mjs";

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

test("titleLength counts code points, not UTF-16 units", () => {
  assert.equal(titleLength("StudyWudy"), 9);
  // The corpus is bilingual; a UTF-16 .length would over-count Devanagari
  // combining sequences and under-count nothing, so the two must differ here.
  const devanagari = "आकृती पूर्ण करा";
  assert.equal(titleLength(devanagari), [...devanagari].length);
  // An astral character is one code point and two UTF-16 units.
  assert.equal(titleLength("a\u{1D400}b"), 3);
  assert.equal("a\u{1D400}b".length, 4);
  assert.equal(titleLength(null), 0);
});

test("serpClip cuts on code points and leaves short titles untouched", () => {
  assert.equal(serpClip("short title", 60), "short title");
  assert.equal(titleLength(serpClip("x".repeat(200), 60)), 60);
  assert.equal(serpClip("a\u{1D400}b", 2), "a\u{1D400}");
  assert.equal(serpClip("दत्तानां चित्राणां", 5), "दत्ता");
});

test("normalizeSimilarity folds case, punctuation and Unicode form", () => {
  assert.equal(normalizeSimilarity("Q1: What is Ohm's Law?"), "q1 what is ohm s law");
  assert.equal(normalizeSimilarity("  A—B  "), "a b");
  // NFKC: the composed and decomposed forms must collapse to one key, or the
  // collision counts split a single group in two.
  assert.equal(normalizeSimilarity("é"), normalizeSimilarity("é"));
  assert.equal(normalizeSimilarity(undefined), "");
});

// ---------------------------------------------------------------------------
// Distributions
// ---------------------------------------------------------------------------

test("percentile indexes a sorted array without interpolating", () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentile(sorted, 0), 1);
  assert.equal(percentile(sorted, 0.5), 5);
  assert.equal(percentile(sorted, 0.9), 9);
  assert.equal(percentile(sorted, 1), 10);
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([42], 0.95), 42);
});

test("lengthHistogram buckets on the floor and omits empty buckets", () => {
  assert.deepEqual(lengthHistogram([0, 9, 10, 19, 20]), { "0-9": 2, "10-19": 2, "20-29": 1 });
  // A gap in the data is a missing key, not a zero - the report reads the keys
  // as the observed range.
  assert.deepEqual(lengthHistogram([5, 45]), { "0-9": 1, "40-49": 1 });
  assert.deepEqual(lengthHistogram([]), {});
  assert.deepEqual(lengthHistogram([61, 62], 100), { "0-99": 2 });
});

test("lengthHistogram keys sort numerically, not lexically", () => {
  const keys = Object.keys(lengthHistogram([5, 95, 105, 1005]));
  assert.deepEqual(keys, ["0-9", "90-99", "100-109", "1000-1009"]);
});

test("describeLengths reports the over-budget count and the quantiles", () => {
  const lengths = [10, 20, 61, 62, 63, 64, 65, 66, 67, 200];
  const summary = describeLengths(lengths, 60);
  assert.equal(summary.pages, 10);
  assert.equal(summary.overBudget, 8);
  assert.equal(summary.overBudgetShare, 0.8);
  assert.equal(summary.minimum, 10);
  assert.equal(summary.maximum, 200);
  assert.equal(summary.p50, 63);
  // Exactly at the budget is inside it: the check is `> budget`.
  assert.equal(describeLengths([60, 60], 60).overBudget, 0);
  assert.equal(describeLengths([61], 60).overBudget, 1);
});

test("describeLengths does not mutate its input and tolerates an empty set", () => {
  const lengths = [30, 10, 20];
  describeLengths(lengths);
  assert.deepEqual(lengths, [30, 10, 20]);
  const empty = describeLengths([]);
  assert.equal(empty.pages, 0);
  assert.equal(empty.minimum, null);
  assert.equal(empty.maximum, null);
  assert.equal(empty.overBudgetShare, 0);
});

// ---------------------------------------------------------------------------
// SERP collisions - the new checklist item's core metric
// ---------------------------------------------------------------------------

test("serpCollisionGroups finds titles that are unique in full but collide when clipped", () => {
  const shared = "Differentiate the following with respect to x — Class 12 Mathematics";
  const entries = [
    { path: "/a", title: `${shared} Ch 5 Q1 | StudyWudy` },
    { path: "/b", title: `${shared} Ch 5 Q2 | StudyWudy` },
    { path: "/c", title: "Something entirely different | StudyWudy" },
  ];
  // All three are distinct in full - which is what the existing gate asserts.
  assert.equal(new Set(entries.map((entry) => entry.title)).size, 3);
  const result = serpCollisionGroups(entries, SERP_TITLE_BUDGET);
  assert.equal(result.collisionGroups, 1);
  assert.equal(result.collidingPages, 2);
  assert.equal(result.distinctVisibleTitles, 2);
  assert.deepEqual(result.largestGroups[0].examplePaths, ["/a", "/b"]);
});

test("serpCollisionGroups reports no collisions when the clipped titles differ", () => {
  const result = serpCollisionGroups([
    { path: "/a", title: "Ohm's law explained for Class 10 physics students here" },
    { path: "/b", title: "Newton's laws explained for Class 10 physics students" },
  ]);
  assert.equal(result.collisionGroups, 0);
  assert.equal(result.collidingPages, 0);
  assert.deepEqual(result.largestGroups, []);
});

test("serpCollisionGroups sorts groups largest first", () => {
  const entries = [
    { path: "/a1", title: "Alpha" }, { path: "/a2", title: "Alpha" },
    { path: "/b1", title: "Beta" }, { path: "/b2", title: "Beta" }, { path: "/b3", title: "Beta" },
  ];
  const result = serpCollisionGroups(entries);
  assert.deepEqual(result.largestGroups.map((group) => group.pages), [3, 2]);
});

// ---------------------------------------------------------------------------
// HTML inspection
// ---------------------------------------------------------------------------

test("isCompleteHtmlDocument rejects the truncated bodies production streams", () => {
  assert.equal(isCompleteHtmlDocument("<html><body>ok</body></html>"), true);
  assert.equal(isCompleteHtmlDocument("<html><body>ok</body></html>\n  "), true);
  // The exact shape observed live: a 200 that stops mid-tag inside <style>.
  assert.equal(isCompleteHtmlDocument("<html><head><style>.a{colo"), false);
  assert.equal(isCompleteHtmlDocument("error code: 1102"), false);
  assert.equal(isCompleteHtmlDocument(""), false);
  assert.equal(isCompleteHtmlDocument(null), false);
});

test("documentTitleFromHtml and metaDescriptionFromHtml decode and collapse whitespace", () => {
  const html = `<html><head><title>Q1: Ohm&#39;s law\n  &mdash; Ch 5 | StudyWudy</title>
    <meta name="description" content="Step&nbsp;by step   answer."></head><body></body></html>`;
  assert.equal(documentTitleFromHtml(html), "Q1: Ohm's law — Ch 5 | StudyWudy");
  assert.equal(metaDescriptionFromHtml(html), "Step by step answer.");
  assert.equal(documentTitleFromHtml("<html></html>"), null);
  assert.equal(metaDescriptionFromHtml("<html></html>"), null);
});

test("extractHeadingOutline records level, id and text in document order", () => {
  const outline = extractHeadingOutline(`
    <h1 id="main">Electrostatics</h1>
    <section><h2>Coulomb&rsquo;s law</h2><p>body</p><h3>Worked example</h3></section>
  `);
  assert.deepEqual(outline.map((heading) => [heading.level, heading.text]), [
    [1, "Electrostatics"],
    [2, "Coulomb’s law"],
    [3, "Worked example"],
  ]);
  assert.equal(outline[0].id, "main");
  assert.equal(outline[1].id, null);
});

test("extractHeadingOutline marks aria-hidden and hidden subtrees", () => {
  const outline = extractHeadingOutline(`
    <h1>Visible</h1>
    <div aria-hidden="true"><h2>Decorative</h2></div>
    <h2 hidden>Collapsed</h2>
  `);
  assert.deepEqual(outline.map((heading) => heading.hidden), [false, true, true]);
  // Hidden headings must not count toward the outline, or every collapsed
  // mobile nav reads as a level skip.
  assert.deepEqual(inspectHeadingOutline(outline).failures, []);
});

test("extractHeadingOutline ignores headings inside script and style", () => {
  const outline = extractHeadingOutline(`<h1>Real</h1><script>var s = "<h2>fake</h2>";</script>`);
  assert.deepEqual(outline.filter((heading) => !heading.hidden).map((heading) => heading.text), ["Real"]);
});

test("inspectHeadingOutline implements page-has-heading-one and heading-order", () => {
  const none = inspectHeadingOutline([{ level: 2, text: "Only an H2", hidden: false }]);
  assert.equal(none.h1Count, 0);
  assert.ok(none.failures.includes("no H1"));
  assert.ok(none.failures.some((failure) => failure.includes("first heading is an H2")));

  const two = inspectHeadingOutline([
    { level: 1, text: "One", hidden: false },
    { level: 1, text: "Two", hidden: false },
  ]);
  assert.equal(two.h1Count, 2);
  assert.ok(two.failures.some((failure) => failure.includes("exactly one is required")));

  const skip = inspectHeadingOutline([
    { level: 1, text: "One", hidden: false },
    { level: 3, text: "Jumped", hidden: false },
  ]);
  assert.ok(skip.failures.some((failure) => failure.includes("skips a level")));

  // Going back up more than one level is legal and must not be reported.
  const backUp = inspectHeadingOutline([
    { level: 1, text: "One", hidden: false },
    { level: 2, text: "Two", hidden: false },
    { level: 3, text: "Three", hidden: false },
    { level: 1, text: "Back", hidden: false },
  ]);
  assert.equal(backUp.failures.filter((failure) => failure.includes("skips a level")).length, 0);
});

test("inspectHeadingOutline flags empty headings and counts levels", () => {
  const inspection = inspectHeadingOutline([
    { level: 1, text: "Title", hidden: false },
    { level: 2, text: "", id: "qf-heading", hidden: false },
    { level: 2, text: "Second", hidden: false },
  ]);
  assert.deepEqual(inspection.levelCounts, { h1: 1, h2: 2 });
  assert.equal(inspection.headingCount, 3);
  assert.ok(inspection.failures.includes("empty H2 #qf-heading"));
});

test("inspectHeadingOutline passes a well-formed outline", () => {
  const inspection = inspectHeadingOutline([
    { level: 1, text: "Chapter", hidden: false },
    { level: 2, text: "Section", hidden: false },
    { level: 3, text: "Detail", hidden: false },
    { level: 2, text: "Next", hidden: false },
  ]);
  assert.deepEqual(inspection.failures, []);
  assert.equal(inspection.h1Count, 1);
});

// ---------------------------------------------------------------------------
// Structured data
// ---------------------------------------------------------------------------

test("structuredDataTypes finds nested @type values", () => {
  const blocks = structuredDataBlocks(`
    <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question",
      "acceptedAnswer":{"@type":"Answer"}}]}</script>
    <script type="application/ld+json">[{"@type":"BreadcrumbList"}]</script>
  `);
  assert.equal(blocks.length, 2);
  assert.deepEqual(structuredDataTypes(blocks), ["Answer", "BreadcrumbList", "FAQPage", "Question"]);
});

test("structuredDataBlocks marks unparseable JSON-LD instead of throwing", () => {
  const blocks = structuredDataBlocks('<script type="application/ld+json">{ not json }</script>');
  assert.deepEqual(structuredDataTypes(blocks), ["__unparseable__"]);
});

test("structuredDataBlocks ignores scripts that are not JSON-LD", () => {
  assert.deepEqual(structuredDataBlocks('<script type="text/javascript">{"@type":"FAQPage"}</script>'), []);
  assert.deepEqual(structuredDataBlocks("<html></html>"), []);
});
