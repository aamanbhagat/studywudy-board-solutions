import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { corpusQuestionIndexEligible } from "../corpus-quality.mjs";
import { CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS } from "../corpus-quality-manifest.mjs";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import {
  isQuestionPubliclyEligible,
  isQuestionSitemapEligible,
} from "../public-question-eligibility.mjs";
import {
  CONTENT_QUALITY_STATIC_QUESTION_COUNT,
  ELECTROSTATICS_STATIC_QUESTION_COUNT,
  isLocalLaunchHotPathBuildRequest,
  LAUNCH_HOT_PATH_DOCUMENTS,
  LAUNCH_HOT_PATH_RELEASE,
  launchHotPathDocument,
  MATH_CRITICAL_STATIC_QUESTION_COUNT,
  STATIC_QUESTION_SEARCH_COUNT,
} from "../launch-hot-path.mjs";
import { smokeLaunchHotPaths } from "../scripts/launch-hot-path-smoke.mjs";

test("the static-build bypass is restricted to local capture requests", () => {
  const headers = { "x-studywudy-static-build": LAUNCH_HOT_PATH_RELEASE };
  assert.equal(isLocalLaunchHotPathBuildRequest(new Request("http://127.0.0.1:8789/search", { headers })), true);
  assert.equal(isLocalLaunchHotPathBuildRequest(new Request("http://localhost:8789/search", { headers })), true);
  assert.equal(isLocalLaunchHotPathBuildRequest(new Request("https://studywudy-board-solutions.example/search", { headers })), false);
  assert.equal(isLocalLaunchHotPathBuildRequest(new Request("http://127.0.0.1:8789/search")), false);
});

test("all launch-critical Electrostatics answers and public search filters have static documents", () => {
  assert.equal(ELECTROSTATICS_STATIC_QUESTION_COUNT, 21);
  assert.equal(CONTENT_QUALITY_STATIC_QUESTION_COUNT, 5);
  assert.equal(MATH_CRITICAL_STATIC_QUESTION_COUNT, 1);
  assert.equal(STATIC_QUESTION_SEARCH_COUNT, 5);
  assert.equal(LAUNCH_HOT_PATH_DOCUMENTS.length, 32);
  assert.equal(launchHotPathDocument("https://example.test/search?type=numerical")?.kind, "question-search");
  assert.equal(launchHotPathDocument("https://example.test/search?q=numerical"), null);
  assert.equal(
    launchHotPathDocument("https://example.test/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electrostatics/questions/q-msb-balbharati-physics-standard-12-8-021")?.rowId,
    229930,
  );
  assert.equal(
    launchHotPathDocument("https://example.test/tamil-nadu-board/class-4/science/samacheer-kalvi-science-term-1-class-4/my-body/questions/q-tn-samacheer-kalvi-science-term-1-class-4-1-001")?.rowId,
    284673,
  );
  assert.equal(
    launchHotPathDocument("https://example.test/maharashtra-board/class-10/marathi/balbharati-marathi-composite-antarbharati-standard-10/chapter-11/questions/q-msb-balbharati-marathi-composite-antarbharati-standard-10-11-001")?.rowId,
    190697,
  );
  assert.equal(
    launchHotPathDocument("https://example.test/cbse/class-12/chemistry/ncert-exemplar-chemistry-exemplar-class-12/solid-states/questions/q-cbse-ncert-exemplar-chemistry-exemplar-class-12-1-042")?.rowId,
    43145,
  );
  assert.equal(
    launchHotPathDocument("https://example.test/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/electromagnetic-induction/questions/q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-38-120")?.rowId,
    62208,
  );
  assert.equal(
    launchHotPathDocument("https://example.test/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/gausss-law/questions/q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-30-039")?.rowId,
    61547,
  );
  assert.equal(
    launchHotPathDocument("https://example.test/cbse/class-12/physics/ncert-exemplar-physics-exemplar-class-12/electric-charges-and-fields/questions/q-cbse-ncert-exemplar-physics-exemplar-class-12-1-030")?.rowId,
    63247,
  );
});

test("a prerendered row is never served index, follow unless a sitemap would submit it", async () => {
  // launchHotPathStaticResponse runs first in the fetch chain, so for these 27
  // rows its X-Robots-Tag is the one Google sees - the dynamic path at :1819 is
  // never reached. It used to decide on the publishing gate alone while the
  // sitemap builder also required the corpus-quality rule, which is the Section 3
  // defect with the sign flipped: served `index`, never submitted. No row
  // diverges today, so only this invariant would catch it coming back.
  const questions = LAUNCH_HOT_PATH_DOCUMENTS.filter(({ rowId }) => rowId);
  assert.equal(questions.length, 27);
  for (const { rowId, questionId } of questions) {
    const served = isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, rowId)
      && corpusQuestionIndexEligible({
        questionId,
        rowId: Number(rowId),
        duplicateRowIds: CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS,
      });
    const submitted = isQuestionSitemapEligible(PHASE4_GATE_MANIFEST, {
      rowId,
      questionId,
      duplicateRowIds: CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS,
    });
    assert.equal(served, submitted, `row ${rowId} is served ${served ? "index" : "noindex"} but ${submitted ? "is" : "is not"} sitemap-eligible`);
  }
  // Adding a prerendered row to the duplicate-choice list is the change that
  // would have broken this, so pin that it now withdraws the index directive
  // rather than leaving the header behind.
  const [{ rowId, questionId }] = questions;
  assert.equal(
    corpusQuestionIndexEligible({ questionId, rowId, duplicateRowIds: [rowId] }),
    false,
  );
  // The composition above has to be the one the Worker actually performs; this
  // branch is only reachable through the static asset response, so the source is
  // what pins it.
  const source = await readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8");
  assert.match(
    source,
    /const indexable = isQuestionPubliclyEligible\(PHASE4_GATE_MANIFEST, document\.rowId\)\s*\n\s*&& corpusQuestionIndexEligible\(\{/u,
  );
});

test("stress smoke rejects a dynamic fallback even when it returns 200", async () => {
  await assert.rejects(
    smokeLaunchHotPaths({
      deploymentUrl: "https://deployment.example",
      iterations: 1,
      concurrency: 2,
      fetchImpl: async () => new Response("<!doctype html><html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    }),
    /missed the static launch path/u,
  );
});

test("stress smoke requests every static document repeatedly", async () => {
  const requests = [];
  const results = await smokeLaunchHotPaths({
    deploymentUrl: "https://deployment.example",
    iterations: 2,
    concurrency: 4,
    fetchImpl: async (url) => {
      requests.push(url.toString());
      const document = launchHotPathDocument(url);
      const relatedMarkup = document.kind === "electrostatics-question"
        ? '<section class="question-exercise-related"></section><section class="related-questions"><a data-related-question-row-id="229916"></a></section>'
        : "";
      return new Response(`<!doctype html><html>${relatedMarkup}</html>`, {
        status: 200,
        headers: {
          "content-type": "text/html",
          "x-studywudy-launch-hot-path": `${LAUNCH_HOT_PATH_RELEASE}; ${document.kind}`,
        },
      });
    },
  });
  assert.equal(results.length, 64);
  assert.equal(requests.length, 64);
});
