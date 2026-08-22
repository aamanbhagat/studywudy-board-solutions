import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  inspectPublicHtmlCacheControl,
  PUBLIC_HTML_CACHE_CONTROL,
  RENDER_CONSISTENCY_RELEASE,
} from "../render-consistency.mjs";
import {
  inspectIncompleteHtmlCacheControl,
  RENDER_CONSISTENCY_MODES,
  RENDER_CONSISTENCY_ROUTES,
  smokeRenderConsistency,
} from "../scripts/render-consistency-smoke.mjs";

test("public HTML allows the edge cache but never a stale browser variant", () => {
  assert.deepEqual(inspectPublicHtmlCacheControl(PUBLIC_HTML_CACHE_CONTROL), []);
  assert.ok(inspectPublicHtmlCacheControl("public, max-age=0, s-maxage=3600, stale-while-revalidate=2592000")
    .includes("stale-while-revalidate is forbidden for public HTML"));
});

test("incomplete answer HTML remains noindex and uncacheable", async () => {
  assert.deepEqual(inspectIncompleteHtmlCacheControl("no-store"), []);
  assert.ok(inspectIncompleteHtmlCacheControl(PUBLIC_HTML_CACHE_CONTROL).length > 0);
  const results = await smokeRenderConsistency({
    deploymentUrl: "https://deployment.example",
    routes: ["/questions/incomplete"],
    modes: [RENDER_CONSISTENCY_MODES[0]],
    interRequestDelayMs: 0,
    fetchImpl: async () => new Response("<!doctype html><title>StudyWudy</title>", {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "x-robots-tag": "noindex, follow",
        "x-studywudy-publish-gate": "phase4-test; incomplete",
        "x-studywudy-render-consistency": RENDER_CONSISTENCY_RELEASE,
      },
    }),
  });
  assert.equal(results[0].cachePolicy, "incomplete-no-store");
});

test("the static asset header source uses the same public HTML policy", () => {
  const headers = readFileSync(new URL("../comparison/after-assets/_headers", import.meta.url), "utf8");
  const rootPolicy = headers.split("\n\n", 1)[0];
  assert.equal(rootPolicy, `/\n  Cache-Control: ${PUBLIC_HTML_CACHE_CONTROL}`);
  assert.doesNotMatch(headers.split("/_next/static/", 1)[0], /stale-while-revalidate|s-maxage=31536000/iu);
});

test("deployment smoke compares cached and Worker responses for every affected route", async () => {
  const requests = [];
  const results = await smokeRenderConsistency({
    deploymentUrl: "https://deployment.example",
    interRequestDelayMs: 0,
    fetchImpl: async (url, init) => {
      requests.push({ pathname: new URL(url).pathname, accept: init.headers.accept });
      return new Response("<!doctype html><title>StudyWudy</title>", {
        status: 200,
        headers: {
          "cache-control": PUBLIC_HTML_CACHE_CONTROL,
          "content-type": "text/html; charset=utf-8",
          "x-studywudy-render-consistency": RENDER_CONSISTENCY_RELEASE,
        },
      });
    },
  });
  assert.equal(results.length, RENDER_CONSISTENCY_ROUTES.length * RENDER_CONSISTENCY_MODES.length);
  assert.deepEqual([...new Set(requests.map(({ pathname }) => pathname))], RENDER_CONSISTENCY_ROUTES);
  assert.deepEqual([...new Set(requests.map(({ accept }) => accept))], RENDER_CONSISTENCY_MODES.map(({ accept }) => accept));
});

test("deployment smoke rejects an older cached renderer", async () => {
  await assert.rejects(
    smokeRenderConsistency({
      deploymentUrl: "https://deployment.example",
      routes: ["/cbse"],
      modes: [RENDER_CONSISTENCY_MODES[0]],
      interRequestDelayMs: 0,
      fetchImpl: async () => new Response("old", {
        status: 200,
        headers: {
          "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=2592000",
          "x-studywudy-render-consistency": "older-renderer",
        },
      }),
    }),
    /returned renderer older-renderer/u,
  );
});
