import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createPlainSearchText,
  createSearchExcerpt,
  evaluateSearchExcerptSource,
  parseSupportedSearchMarkup,
  SEARCH_EXCERPT_MAXIMUM,
  SEARCH_EXCERPT_RELEASE,
} from "../search-excerpt.mjs";
import {
  inspectSearchExcerptHtml,
  SEARCH_EXCERPT_CASES,
  smokeSearchExcerpts,
} from "../scripts/search-excerpt-smoke.mjs";

const forbiddenSourceMarkup = /\*\*|__|!\[|\$|<\/?[a-z][^>]*>|\\[A-Za-z]+\b/iu;

test("default Question Bank prompts lose Markdown emphasis before rendering", () => {
  const excerpt = createSearchExcerpt("**State whether the following statement is True or False.** A company is an artificial person.");
  assert.equal(excerpt, "State whether the following statement is True or False. A company is an artificial person.");
  assert.doesNotMatch(excerpt, forbiddenSourceMarkup);
});

test("the reusable plain-text stage feeds both excerpts and card descriptions", () => {
  const source = "**State whether the following statement is True or False.** A company is an artificial person.";
  const plainText = createPlainSearchText(source);
  assert.equal(plainText, "State whether the following statement is True or False. A company is an artificial person.");
  assert.equal(createSearchExcerpt(source), plainText);
  assert.doesNotMatch(plainText, forbiddenSourceMarkup);
});

test("supported-markup parsing emits structural nodes and uses semantic plain math", () => {
  const source = String.raw`Find dimensions from $$F = qE, F = qvB, \text{ and } B = \frac{\mu_0 I}{2\pi a}.$$<br>where E is the electric field.`;
  const nodes = parseSupportedSearchMarkup(source);
  assert.ok(nodes.some(({ type }) => type === "math"));
  assert.ok(nodes.some(({ type }) => type === "boundary"));
  const excerpt = createSearchExcerpt(source);
  assert.match(excerpt, /F = qE, F = qvB, and B = \(μ₀I\/\(2πa\)\)/u);
  assert.doesNotMatch(excerpt, forbiddenSourceMarkup);
});

test("tables, HTML breaks, hints and Markdown italics become clean text", () => {
  const source = "Move from point *A* to point *B*.<br>[**Hint**: Match the following.] | Column I | Column II | | (i) Electric field | (a) Force";
  const excerpt = createSearchExcerpt(source);
  assert.equal(excerpt, "Move from point A to point B. [Hint: Match the following.]; Column I; Column II; (i) Electric field; (a) Force");
  assert.doesNotMatch(excerpt, /\*|<br|\|/iu);
});

test("image-only syntax is removed while link labels and entities remain readable", () => {
  const excerpt = createSearchExcerpt("Diagram ![electric field](https://example.test/e.png) &amp; [official source](https://example.test/source)");
  assert.equal(excerpt, "Diagram & official source");
  assert.doesNotMatch(excerpt, /!\[|https?:/u);
});

test("fill-in-the-blank underscores become readable words rather than Markdown", () => {
  assert.equal(createSearchExcerpt("A ___ is an intangible asset."), "A blank is an intangible asset.");
  assert.equal(createSearchExcerpt("Human resource management includes __."), "Human resource management includes blank.");
});

test("bare and delimited TeX are converted before boundary-aware truncation", () => {
  const prefix = String.raw`Use \frac{1}{4\pi\varepsilon_0} and $$\vec{E}=5\hat{i}+4\hat{j}-6\hat{k}$$ to calculate the force.`;
  const excerpt = createSearchExcerpt(`${prefix} ${"Continue with the next verified step. ".repeat(20)}`);
  assert.ok([...excerpt].length <= SEARCH_EXCERPT_MAXIMUM);
  assert.match(excerpt, /\(1\/4πε₀\)/u);
  assert.match(excerpt, /E = 5i \+ 4j − 6k/u);
  assert.doesNotMatch(excerpt, forbiddenSourceMarkup);
  assert.ok(/[.!?…]$/u.test(excerpt));
});

test("plain imported exponent and subscript syntax becomes clean Unicode text", () => {
  assert.equal(createPlainSearchText("The value is 1.78 × 10^(−8) C and H_(2)S is present."), "The value is 1.78 × 10⁻⁸ C and H₂S is present.");
  assert.equal(createPlainSearchText("Find sec^(2) A."), "Find sec² A.");
  assert.equal(evaluateSearchExcerptSource("A reaction between ammonia and BF3. Identify the acid.").pass, true);
  assert.equal(evaluateSearchExcerptSource("A stone is tied to a negligble string.").pass, false);
  assert.equal(evaluateSearchExcerptSource("The block Bhas a coefficient of friction.").pass, false);
  assert.equal(evaluateSearchExcerptSource("Two solid cones *A*and*B* are placed together.").pass, false);
});

test("crawler gate rejects each reported raw excerpt and description form", () => {
  const bad = `<div class="search-result-list"><a data-question-row-id="1"><h2 data-search-excerpt="plain-v2">**Hint** &lt;br&gt; | $$\\frac{q}{r}$$ and *A*</h2><b data-search-description="plain-v2">Explain **Hint** →</b></a></div>`;
  const inspection = inspectSearchExcerptHtml("/search?q=electric%20field", bad);
  assert.ok(inspection.failures.some((failure) => failure.includes("raw Markdown, HTML or TeX")));
  assert.ok(inspection.failures.some((failure) => failure.includes("table pipe")));
  assert.ok(inspection.failures.some((failure) => failure.includes("Markdown emphasis")));
  assert.ok(inspection.failures.some((failure) => failure.startsWith("description 1")));
});

test("production smoke verifies default and electric-field search responses", async () => {
  const requests = [];
  const html = `<div class="search-result-list"><a data-question-row-id="1"><h2 data-search-excerpt="plain-v2">State whether the statement is true or false.</h2><b data-search-description="plain-v2">Explain whether the statement is true or false →</b></a><a data-question-row-id="2"><h2 data-search-excerpt="plain-v2">The electric field is E = F/q.</h2><b data-search-description="plain-v2">Explain the electric field →</b></a></div>`;
  const results = await smokeSearchExcerpts({
    deploymentUrl: "https://deployment.example/ignored",
    fetchImpl: async (url, init) => {
      requests.push({ url: url.toString(), init });
      return new Response(html, {
        status: 200,
        headers: { "content-type": "text/html", "x-studywudy-search-excerpt": SEARCH_EXCERPT_RELEASE },
      });
    },
  });
  assert.deepEqual(results.map(({ name }) => name), SEARCH_EXCERPT_CASES.map(({ name }) => name));
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), ["/search", "/search"]);
  assert.deepEqual(requests.map(({ url }) => new URL(url).search), ["", "?q=electric%20field"]);
});

test("the Worker routes every card prompt through the parser and marks the HTML", async () => {
  const source = await readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8");
  assert.match(source, /createPlainSearchText/u);
  assert.match(source, /const plainPrompt = createPlainSearchText\(repairKnownText\(row\.book_id, row\.prompt_text\)\)/u);
  assert.match(source, /const prompt = truncateSearchExcerpt\(plainPrompt\)/u);
  assert.match(source, /data-search-excerpt="plain-v2"/u);
  assert.match(source, /data-search-description="plain-v2"/u);
  assert.match(source, /x-studywudy-search-excerpt/u);
});
