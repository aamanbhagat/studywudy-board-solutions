#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import {
  LAUNCH_HOT_PATH_DOCUMENTS,
  LAUNCH_HOT_PATH_RELEASE,
} from "../launch-hot-path.mjs";
import { CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS } from "../corpus-quality-manifest.mjs";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { isQuestionPubliclyEligible } from "../public-question-eligibility.mjs";
import { PRODUCTION_ORIGIN } from "./featured-study-route-smoke.mjs";

export async function smokeLaunchHotPaths({
  deploymentUrl = PRODUCTION_ORIGIN,
  fetchImpl = fetch,
  iterations = 3,
  concurrency = 6,
  timeoutMs = 20_000,
} = {}) {
  const origin = new URL(deploymentUrl).origin;
  const jobs = [];
  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    for (const document of LAUNCH_HOT_PATH_DOCUMENTS) jobs.push({ document, iteration });
  }
  const results = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      const response = await fetchImpl(new URL(job.document.publicPath, `${origin}/`), {
        method: "GET",
        redirect: "manual",
        headers: {
          accept: "text/html",
          "cache-control": "no-cache",
          pragma: "no-cache",
          "user-agent": `StudyWudy ${LAUNCH_HOT_PATH_RELEASE} deployment gate/${job.iteration}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status !== 200) throw new Error(`${job.document.publicPath} returned ${response.status} on pass ${job.iteration}`);
      if (!(response.headers.get("content-type") || "").includes("text/html")) {
        throw new Error(`${job.document.publicPath} did not return HTML`);
      }
      const marker = response.headers.get("x-studywudy-launch-hot-path") || "";
      if (!marker.startsWith(`${LAUNCH_HOT_PATH_RELEASE}; ${job.document.kind}`)) {
        throw new Error(`${job.document.publicPath} missed the static launch path on pass ${job.iteration}`);
      }
      const body = await response.text();
      if (!/<\/html>\s*$/iu.test(body)) throw new Error(`${job.document.publicPath} returned truncated HTML`);
      if (job.document.kind === "electrostatics-question") {
        if (!/class=["'][^"']*\bquestion-exercise-related\b/iu.test(body)) {
          throw new Error(`${job.document.publicPath} missed same-exercise or same-chapter questions`);
        }
        if (!/class=["'][^"']*\brelated-questions\b/iu.test(body)) {
          throw new Error(`${job.document.publicPath} missed related textbook questions`);
        }
        const relatedRowIds = [...body.matchAll(/\bdata-related-question-row-id=["'](\d+)["']/giu)]
          .map((match) => Number(match[1]));
        if (!relatedRowIds.length) throw new Error(`${job.document.publicPath} missed related question publishing identities`);
        if (new Set(relatedRowIds).size !== relatedRowIds.length) {
          throw new Error(`${job.document.publicPath} repeated a related question`);
        }
        const ineligibleRowId = relatedRowIds.find((rowId) => !isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, rowId)
          || CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS.includes(rowId));
        if (ineligibleRowId) throw new Error(`${job.document.publicPath} linked ineligible related row ${ineligibleRowId}`);
      }
      results.push(Object.freeze({
        pathname: job.document.publicPath,
        iteration: job.iteration,
        marker,
        bytes: body.length,
      }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return Object.freeze(results);
}

async function main() {
  const deploymentUrl = process.env.STUDYWUDY_DEPLOYMENT_URL || process.argv[2] || PRODUCTION_ORIGIN;
  const results = await smokeLaunchHotPaths({ deploymentUrl });
  console.log(`PASS: ${results.length} repeated launch-hot-path requests returned complete static HTML`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
