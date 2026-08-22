#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import {
  BOARD_HUB_ASSERTIONS,
  BOARD_HUB_SSR_RELEASE,
  inspectBoardHubHtml,
} from "../board-landing-ssr.mjs";
import { PRODUCTION_ORIGIN } from "./featured-study-route-smoke.mjs";

export const CBSE_BOARD_PATH = "/cbse";
export const BOARD_HUB_PATHS = Object.freeze(Object.keys(BOARD_HUB_ASSERTIONS));
export const BOARD_HUB_SSR_MODES = Object.freeze([
  Object.freeze({ name: "edge-html", accept: "text/html" }),
  Object.freeze({ name: "uncached-worker", accept: "*/*" }),
]);
export const CBSE_BOARD_SSR_MODES = BOARD_HUB_SSR_MODES;

function normalizeDeploymentUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Deployment URL must use HTTP or HTTPS");
  return url.origin;
}

export async function smokeBoardHubSsr({
  deploymentUrl = PRODUCTION_ORIGIN,
  fetchImpl = fetch,
  modes = BOARD_HUB_SSR_MODES,
  routes = BOARD_HUB_PATHS,
  timeoutMs = 30_000,
} = {}) {
  const origin = normalizeDeploymentUrl(deploymentUrl);
  const results = [];
  for (const route of routes) {
    for (const mode of modes) {
      const response = await fetchImpl(new URL(route, `${origin}/`), {
        method: "GET",
        redirect: "manual",
        headers: {
          accept: mode.accept,
          "cache-control": "no-cache",
          "user-agent": `StudyWudy board hub SSR deployment gate/2.0 (${route}; ${mode.name})`,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status !== 200) throw new Error(`${route} (${mode.name}) returned ${response.status}`);
      if (response.headers.get("x-studywudy-board-ssr") !== BOARD_HUB_SSR_RELEASE) {
        throw new Error(`${route} (${mode.name}) is missing the ${BOARD_HUB_SSR_RELEASE} release marker`);
      }
      const inspection = inspectBoardHubHtml(route, await response.text());
      if (inspection.failures.length) {
        throw new Error(`${route} (${mode.name}): ${inspection.failures.join("; ")}`);
      }
      results.push(Object.freeze({ route, mode: mode.name, crawlerText: inspection.crawlerText }));
    }
  }
  return Object.freeze(results);
}

export async function smokeCbseBoardSsr(options = {}) {
  const results = await smokeBoardHubSsr({ ...options, routes: [CBSE_BOARD_PATH] });
  return Object.freeze(results.map(({ mode, crawlerText }) => Object.freeze({ mode, crawlerText })));
}

async function main() {
  const deploymentUrl = process.env.STUDYWUDY_DEPLOYMENT_URL || process.argv[2] || PRODUCTION_ORIGIN;
  const results = await smokeBoardHubSsr({ deploymentUrl });
  for (const result of results) console.log(`PASS ${result.route} (${result.mode})`);
  console.log("Verified complete class links, supporting content and footers in both board-hub HTML responses");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
