#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import {
  STUDY_CLUSTER_BASE,
  STUDY_CLUSTER_INDEXABLE_PATHS,
  STUDY_CLUSTER_PYQ_PATH,
} from "../study-cluster.mjs";

export const PRODUCTION_ORIGIN = "https://studywudy-board-solutions.amanbhagat17089.workers.dev";
export const FEATURED_STUDY_ROUTES = Object.freeze([
  ...new Set([
    STUDY_CLUSTER_BASE,
    ...STUDY_CLUSTER_INDEXABLE_PATHS,
    STUDY_CLUSTER_PYQ_PATH,
  ]),
]);

function normalizeDeploymentUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Deployment URL must use HTTP or HTTPS");
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.origin;
}

async function requestRoute({ deploymentUrl, pathname, fetchImpl, timeoutMs, retryDelayMs }) {
  const url = new URL(pathname, `${deploymentUrl}/`);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        headers: {
          // The Worker app cache only matches explicit text/html requests. Using
          // */* exercises the deployed SSR path instead of accepting a stale hit.
          accept: "*/*",
          "user-agent": "StudyWudy featured-route deployment gate/1.0",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      await response.body?.cancel();
      if (response.status !== 503 || attempt === 3) {
        return Object.freeze({ pathname, status: response.status, ok: response.status === 200 });
      }
    } catch (error) {
      if (attempt === 3) {
        return Object.freeze({
          pathname,
          status: null,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs * (2 ** attempt)));
  }
  return Object.freeze({ pathname, status: null, ok: false, error: "retry loop exhausted" });
}

export async function smokeFeaturedStudyRoutes({
  deploymentUrl,
  fetchImpl = fetch,
  routes = FEATURED_STUDY_ROUTES,
  concurrency = 1,
  timeoutMs = 30_000,
  interBatchDelayMs = 500,
  retryDelayMs = 2_000,
} = {}) {
  const origin = normalizeDeploymentUrl(deploymentUrl || PRODUCTION_ORIGIN);
  const uniqueRoutes = [...new Set(routes)];
  const results = [];

  for (let offset = 0; offset < uniqueRoutes.length; offset += concurrency) {
    if (offset > 0 && interBatchDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, interBatchDelayMs));
    const batch = uniqueRoutes.slice(offset, offset + concurrency);
    results.push(...await Promise.all(batch.map((pathname) => requestRoute({
      deploymentUrl: origin,
      pathname,
      fetchImpl,
      timeoutMs,
      retryDelayMs,
    }))));
  }

  const failures = results.filter((result) => !result.ok);
  if (failures.length) {
    const detail = failures.map((result) => `${result.pathname} returned ${result.status ?? result.error}`).join("; ");
    throw new Error(`Featured study route smoke test failed: ${detail}`);
  }
  return Object.freeze(results);
}

async function main() {
  const deploymentUrl = process.env.STUDYWUDY_DEPLOYMENT_URL || process.argv[2] || PRODUCTION_ORIGIN;
  const results = await smokeFeaturedStudyRoutes({ deploymentUrl });
  for (const result of results) console.log(`200 ${result.pathname}`);
  console.log(`Verified ${results.length} featured study routes at ${normalizeDeploymentUrl(deploymentUrl)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
