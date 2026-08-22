import test from "node:test";
import assert from "node:assert/strict";
import {
  FEATURED_STUDY_ROUTES,
  smokeFeaturedStudyRoutes,
} from "../scripts/featured-study-route-smoke.mjs";
import {
  STUDY_CLUSTER_BASE,
  STUDY_CLUSTER_INDEXABLE_PATHS,
  STUDY_CLUSTER_PYQ_PATH,
} from "../study-cluster.mjs";

test("deployment smoke covers the chapter and every featured study resource", () => {
  assert.deepEqual(FEATURED_STUDY_ROUTES, [
    STUDY_CLUSTER_BASE,
    ...STUDY_CLUSTER_INDEXABLE_PATHS,
    STUDY_CLUSTER_PYQ_PATH,
  ]);
  for (const suffix of ["study", "revision", "important-questions", "practice", "answer-writing"]) {
    assert.ok(FEATURED_STUDY_ROUTES.includes(`${STUDY_CLUSTER_BASE}/${suffix}`));
  }
});

test("deployment smoke requests the uncached SSR path and accepts only 200", async () => {
  const requests = [];
  const results = await smokeFeaturedStudyRoutes({
    deploymentUrl: "https://deployment.example/path-that-must-be-ignored",
    routes: [STUDY_CLUSTER_BASE, `${STUDY_CLUSTER_BASE}/practice`],
    concurrency: 1,
    interBatchDelayMs: 0,
    retryDelayMs: 0,
    fetchImpl: async (url, init) => {
      requests.push({ url: url.toString(), init });
      return new Response("ok", { status: 200 });
    },
  });
  assert.equal(results.length, 2);
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
    STUDY_CLUSTER_BASE,
    `${STUDY_CLUSTER_BASE}/practice`,
  ]);
  assert.ok(requests.every(({ init }) => init.redirect === "manual" && init.headers.accept === "*/*"));
});

test("deployment smoke reports the exact featured route that is unavailable", async () => {
  await assert.rejects(
    smokeFeaturedStudyRoutes({
      deploymentUrl: "https://deployment.example",
      routes: [`${STUDY_CLUSTER_BASE}/practice`],
      interBatchDelayMs: 0,
      retryDelayMs: 0,
      fetchImpl: async () => new Response("unavailable", { status: 503 }),
    }),
    new RegExp(`${STUDY_CLUSTER_BASE}/practice returned 503`, "u"),
  );
});
