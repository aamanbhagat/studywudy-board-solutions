#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import {
  inspectPublicHtmlCacheControl,
  RENDER_CONSISTENCY_RELEASE,
} from "../render-consistency.mjs";
import { STUDY_CLUSTER_BASE } from "../study-cluster.mjs";
import { PRODUCTION_ORIGIN } from "./featured-study-route-smoke.mjs";

const ELECTROSTATICS_QUESTION_BASE = `${STUDY_CLUSTER_BASE}/questions/q-msb-balbharati-physics-standard-12-8-`;

export const RENDER_CONSISTENCY_ROUTES = Object.freeze([
  "/",
  "/cbse",
  STUDY_CLUSTER_BASE,
  `${ELECTROSTATICS_QUESTION_BASE}002`,
  `${ELECTROSTATICS_QUESTION_BASE}005`,
  `${ELECTROSTATICS_QUESTION_BASE}010`,
  "/search",
]);

export const RENDER_CONSISTENCY_MODES = Object.freeze([
  Object.freeze({ name: "edge-html", accept: "text/html" }),
  Object.freeze({ name: "worker-html", accept: "*/*" }),
]);

export function inspectIncompleteHtmlCacheControl(value) {
  const cacheControl = String(value ?? "").toLowerCase();
  const failures = [];
  if (!/(?:^|,)\s*no-store(?:\s*,|$)/u.test(cacheControl)) failures.push("no-store directive is missing");
  if (/(?:^|,)\s*(?:public|s-maxage=)(?:\s*,|\d)/u.test(cacheControl)) failures.push("incomplete HTML is publicly cacheable");
  return Object.freeze(failures);
}

export async function smokeRenderConsistency({
  deploymentUrl = PRODUCTION_ORIGIN,
  fetchImpl = fetch,
  routes = RENDER_CONSISTENCY_ROUTES,
  modes = RENDER_CONSISTENCY_MODES,
  timeoutMs = 30_000,
  interRequestDelayMs = 100,
} = {}) {
  const origin = new URL(deploymentUrl).origin;
  const results = [];
  for (const pathname of routes) {
    for (const mode of modes) {
      if (results.length > 0 && interRequestDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, interRequestDelayMs));
      }
      const response = await fetchImpl(new URL(pathname, `${origin}/`), {
        method: "GET",
        redirect: "manual",
        headers: {
          accept: mode.accept,
          "cache-control": "no-cache",
          pragma: "no-cache",
          "user-agent": `StudyWudy render-consistency deployment gate/1.0 (${mode.name})`,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status !== 200) throw new Error(`${pathname} (${mode.name}) returned ${response.status}`);
      const release = response.headers.get("x-studywudy-render-consistency");
      if (release !== RENDER_CONSISTENCY_RELEASE) {
        throw new Error(`${pathname} (${mode.name}) returned renderer ${release || "<missing>"}`);
      }
      const publishGate = response.headers.get("x-studywudy-publish-gate") || "";
      const incomplete = /;\s*incomplete$/iu.test(publishGate);
      if (incomplete && !/\bnoindex\b/iu.test(response.headers.get("x-robots-tag") || "")) {
        throw new Error(`${pathname} (${mode.name}): incomplete answer is missing noindex`);
      }
      const cacheFailures = incomplete
        ? inspectIncompleteHtmlCacheControl(response.headers.get("cache-control"))
        : inspectPublicHtmlCacheControl(response.headers.get("cache-control"));
      if (cacheFailures.length) throw new Error(`${pathname} (${mode.name}): ${cacheFailures.join("; ")}`);
      await response.body?.cancel();
      results.push(Object.freeze({ pathname, mode: mode.name, release, cachePolicy: incomplete ? "incomplete-no-store" : "public-edge-cache" }));
    }
  }
  return Object.freeze(results);
}

async function main() {
  const deploymentUrl = process.env.STUDYWUDY_DEPLOYMENT_URL || process.argv[2] || PRODUCTION_ORIGIN;
  const results = await smokeRenderConsistency({ deploymentUrl });
  console.log(`PASS: ${results.length} cached and uncached route variants use ${RENDER_CONSISTENCY_RELEASE}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
