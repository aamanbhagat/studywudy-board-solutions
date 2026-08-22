import assert from "node:assert/strict";
import test from "node:test";

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
      return new Response("<!doctype html><html></html>", {
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
