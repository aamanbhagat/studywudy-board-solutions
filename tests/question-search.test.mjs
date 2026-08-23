import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildQuestionSearchPlan,
  parseQuestionSearchCriteria,
  questionHasDiagramEvidence,
  questionHasNumericalEvidence,
  questionSearchHeading,
  renderActiveSearchFilterInputs,
  renderPopularQuestionFilters,
  SEARCH_FILTER_RELEASE,
  normalizedQuestionType,
} from "../question-search.mjs";
import {
  inspectQuestionSearchHtml,
  QUESTION_SEARCH_SMOKE_CASES,
  smokeQuestionSearch,
} from "../scripts/question-search-smoke.mjs";

const projection = "SELECT q.question_id, q.type, b.board_slug";

function criteria(query) {
  return parseQuestionSearchCriteria(new URLSearchParams(query));
}

test("structured filter parameters are allowlisted and remain distinct from q", () => {
  assert.deepEqual(
    criteria("type=numerical&hasDiagram=true&board=maharashtra-board&q=electric%20field"),
    {
      query: "electric field",
      type: "numerical",
      hasDiagram: true,
      board: "maharashtra-board",
      hasFilters: true,
      hasCriteria: true,
      errors: [],
    },
  );
  assert.deepEqual(criteria("type=not-real&hasDiagram=maybe&board=unknown").errors, [
    "type=not-real",
    "hasDiagram=maybe",
    "board=unknown",
  ]);
});

test("popular chips use the four structured URLs", () => {
  const markup = renderPopularQuestionFilters(criteria("type=numerical"));
  for (const href of [
    "/search?type=numerical",
    "/search?hasDiagram=true",
    "/search?type=mcq_single",
    "/search?board=maharashtra-board",
  ]) assert.ok(markup.includes(`href="${href}"`));
  assert.doesNotMatch(markup, /\?q=(?:numerical|diagram|mcq|maharashtra)/iu);
  assert.match(markup, /href="\/search\?type=numerical" aria-current="page"/u);
});

test("the ordinary search box keeps q as a lexical query", () => {
  assert.deepEqual(criteria("q=numerical"), {
    query: "numerical",
    type: null,
    hasDiagram: null,
    board: null,
    hasFilters: false,
    hasCriteria: true,
    errors: [],
  });
});

test("the committed search HTML and hydration payload contain no legacy popular-filter URLs", async () => {
  const html = await readFile(new URL("../comparison/after-assets/pages/search/index.html", import.meta.url), "utf8");
  assert.match(html, /\/search\?type=numerical/u);
  assert.match(html, /\/search\?hasDiagram=true/u);
  assert.doesNotMatch(html, /\/search\?q=(?:numerical|diagram)/iu);
});

test("type and board filters compile to exact bound predicates", () => {
  const plan = buildQuestionSearchPlan(criteria("type=numerical&board=maharashtra-board"), projection);
  assert.match(plan.sql, /CASE q\.question_id[\s\S]+?ELSE q\.type[\s\S]+?= \?[\s\S]+?lower\(q\.prompt_text\) LIKE '%calculate%'[\s\S]+?b\.board_slug = \?/u);
  assert.deepEqual(plan.bindings, ["numerical", "maharashtra-board"]);
  assert.match(plan.sql, /1 AS search_priority/u);
  assert.doesNotMatch(plan.sql, /content_publish_gate|reviewed search exception/iu);
  assert.match(plan.sql, /LIMIT 1536/u);
});

test("numerical classification requires quantitative evidence, not a bad imported type label", () => {
  assert.equal(questionHasNumericalEvidence("Calculate the mass of ammonia produced from 2.00 kg of nitrogen."), true);
  assert.equal(questionHasNumericalEvidence("Find the value of x in the given equation."), true);
  assert.equal(questionHasNumericalEvidence("Evaluate the definite integral."), true);
  assert.equal(questionHasNumericalEvidence("A reaction between ammonia and boron trifluoride is given. Identify the acid and base. Which theory explains it?"), false);
  assert.equal(questionHasNumericalEvidence("Write a program with a function score() to calculate the quiz score."), false);
  assert.equal(questionHasNumericalEvidence("Two solid cones AandB are placed in a cylindrical tube. Find their heights."), false);
  assert.equal(questionHasNumericalEvidence("The electrode potential of copper is positive. Explain the possible reason."), false);
});

test("normalized classifications and diagram evidence reject the reported false positives", () => {
  assert.equal(normalizedQuestionType({
    question_id: "q-cbse-ncert-exemplar-chemistry-exemplar-class-11-7-036",
    type: "numerical",
  }), "brief");
  assert.equal(normalizedQuestionType({
    question_id: "q-cbse-ncert-chemistry-class-12-4-004",
    type: "numerical",
  }), "give_reason");
  assert.equal(questionHasDiagramEvidence("A reporter covers the assassination of Julius Caesar. Giving graphic details, write a newspaper report."), false);
  assert.equal(questionHasDiagramEvidence("Draw a labelled circuit diagram of a simple electric motor."), true);
  assert.equal(questionHasDiagramEvidence("Read the paragraph and draw conclusions."), false);
});

test("text search ranks concept, question phrase, textbook and body in order", () => {
  const plan = buildQuestionSearchPlan(criteria("q=electric%20field"), projection);
  assert.deepEqual(plan.bindings, ["electric field", "%electric field%", "%elecric field%", "%electric%", "%field%"]);
  const concept = plan.sql.indexOf("THEN 2");
  const question = plan.sql.indexOf("THEN 3");
  const textbook = plan.sql.indexOf("THEN 4");
  const body = plan.sql.indexOf("ELSE 5");
  assert.ok(concept > 0 && concept < question && question < textbook && textbook < body);
  assert.match(plan.sql, /ORDER BY search_priority, q\.row_id/u);
  assert.match(plan.sql, /json_each\(CASE WHEN json_valid\(q\.concept_tags\)/u);
  assert.match(plan.sql, /LIMIT 256/u);
});

test("diagram-only search uses the bounded static-build candidate window", () => {
  assert.match(buildQuestionSearchPlan(criteria("hasDiagram=true"), projection).sql, /LIMIT 512/u);
});

test("active filters survive a keyword form submission and receive a specific heading", () => {
  const selected = criteria("type=mcq_single&board=cbse&q=force");
  assert.equal(
    renderActiveSearchFilterInputs(selected),
    '<input type="hidden" name="type" value="mcq_single"><input type="hidden" name="board" value="cbse">',
  );
  assert.equal(questionSearchHeading(selected), "Single-choice MCQs · CBSE questions matching “force”");
});

test("diagram headings promise rendered solution media, not prompt wording", () => {
  assert.equal(questionSearchHeading(criteria("hasDiagram=true")), "Questions with rendered solution diagrams");
  assert.equal(questionSearchHeading(criteria("hasDiagram=false")), "Questions without rendered solution diagrams");
});

test("crawler inspection rejects lexical type chips in HTML or hydration data and mixed filtered results", () => {
  const entry = QUESTION_SEARCH_SMOKE_CASES.find(({ expected }) => expected.type === "numerical");
  const bad = `<div class="search-suggestions"><a href="/search?type=numerical">Numerical</a></div><script>self.__next_f.push(["/search?q=numerical"])</script><a data-question-type="brief" data-question-board="cbse" data-has-diagram="false" data-search-priority="1" data-search-match="structured-filter"></a>`;
  const inspection = inspectQuestionSearchHtml(entry, bad);
  assert.ok(inspection.failures.some((failure) => failure.includes("legacy keyword filter")));
  assert.ok(inspection.failures.some((failure) => failure.includes("type other than numerical")));
});

test("production smoke covers every structured filter and relevance ranking", async () => {
  const requests = [];
  const popular = '<div class="search-suggestions"><a href="/search?type=numerical">Numericals</a><a href="/search?hasDiagram=true">Diagrams</a><a href="/search?type=mcq_single">MCQs</a><a href="/search?board=maharashtra-board">Maharashtra</a></div>';
  const card = (type, board, hasDiagram, priority) => `<a href="/cbse/class-1/mathematics/example-book/example-chapter/questions/q-example" data-question-row-id="1" data-question-type="${type}" data-question-board="${board}" data-has-diagram="${hasDiagram}" data-public-search-eligible="true" data-search-priority="${priority}" data-search-match="concept-title"></a>`;
  const fetchImpl = async (url, init) => {
    requests.push({ url: url.toString(), init });
    const parsed = new URL(url);
    if (parsed.pathname === "/__studywudy_missing_route_probe_20260823__") return new Response("not found", { status: 404 });
    if (parsed.pathname !== "/search") {
      return new Response("<html><body>Complete equation-safe answer</body></html>", {
        status: 200,
        headers: {
          "x-studywudy-publish-gate": "phase4-test; complete",
          "x-robots-tag": "index, follow",
        },
      });
    }
    const type = parsed.searchParams.get("type") || "brief";
    const board = parsed.searchParams.get("board") || "cbse";
    const diagram = parsed.searchParams.get("hasDiagram") === "true";
    const priority = parsed.searchParams.has("q") ? 2 : parsed.search ? 1 : 9;
    const cards = card(type, board, diagram, priority);
    const summary = parsed.search ? '<p>All 1 eligible matches are rendered below.</p>' : "";
    return new Response(`${popular}${summary}<div class="search-result-list" data-search-result-count="1">${cards}</div>`, {
      status: 200,
      headers: {
        "content-type": "text/html",
        "cache-control": parsed.search ? "no-store" : "public, max-age=0, s-maxage=3600",
        "x-studywudy-search-filter": SEARCH_FILTER_RELEASE,
      },
    });
  };
  const results = await smokeQuestionSearch({ deploymentUrl: "https://deployment.example/ignored", fetchImpl });
  assert.equal(results.length, QUESTION_SEARCH_SMOKE_CASES.length);
  assert.equal(requests.length, QUESTION_SEARCH_SMOKE_CASES.length + 3);
  assert.equal(requests.at(-2).init.method, "GET");
  assert.equal(new URL(requests.at(-1).url).pathname, "/__studywudy_missing_route_probe_20260823__");
});

test("production smoke rejects a search card whose individual page is noindex", async () => {
  const searchCase = QUESTION_SEARCH_SMOKE_CASES.find(({ expected }) => expected.type === "mcq_single");
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/__studywudy_missing_route_probe_20260823__") return new Response("not found", { status: 404 });
    if (parsed.pathname === "/search") {
      return new Response(`<div class="search-suggestions"><a href="/search?type=numerical">Numericals</a><a href="/search?hasDiagram=true">Diagrams</a><a href="/search?type=mcq_single">MCQs</a><a href="/search?board=maharashtra-board">Maharashtra</a></div><p>All 1 eligible matches are rendered below.</p><div class="search-result-list" data-search-result-count="1"><a href="/cbse/class-12/physics/book/chapter/questions/q-incomplete" data-question-row-id="2" data-question-type="mcq_single" data-question-board="cbse" data-has-diagram="false" data-public-search-eligible="true" data-search-priority="1" data-search-match="structured-filter"></a></div>`, {
        status: 200,
        headers: {
          "content-type": "text/html",
          "cache-control": "no-store",
          "x-studywudy-search-filter": SEARCH_FILTER_RELEASE,
        },
      });
    }
    return new Response(null, {
      status: 200,
      headers: {
        "x-studywudy-publish-gate": "phase4-test; review-required",
        "x-robots-tag": "noindex, follow",
      },
    });
  };
  await assert.rejects(
    smokeQuestionSearch({ deploymentUrl: "https://deployment.example", fetchImpl, cases: [searchCase] }),
    /listed in search but did not pass its page publishing gate/u,
  );
});

test("the Worker keeps structured search parameters out of the default edge cache key", async () => {
  const source = await readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8");
  assert.match(source, /\["q", "type", "hasDiagram", "board"\]\.some/u);
  assert.match(source, /buildQuestionSearchPlan\(criteria, projection\)/u);
  assert.match(source, /x-studywudy-search-filter/u);
  assert.match(source, /All \$\{rows\.length\} eligible matches are rendered below\./u);
  assert.doesNotMatch(source, /reviewed matches/iu);
});
