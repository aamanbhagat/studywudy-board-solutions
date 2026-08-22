#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import {
  ACCESSIBILITY_TEXT_RELEASE,
  inspectAccessibilityHtml,
} from "../accessibility-text.mjs";
import { STUDY_CLUSTER_BASE } from "../study-cluster.mjs";
import { PRODUCTION_ORIGIN } from "./featured-study-route-smoke.mjs";

export const ACCESSIBILITY_TEXT_ROUTES = Object.freeze([
  "/",
  `${STUDY_CLUSTER_BASE}/revision`,
  `${STUDY_CLUSTER_BASE}/concepts/coulombs-law`,
]);

async function fetchWithRetry(url, fetchImpl, timeoutMs) {
  let response;
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        headers: {
          accept: "text/html",
          "cache-control": "no-cache",
          "user-agent": "StudyWudy accessibility-text deployment gate/1.0",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    if (!lastError && response.status !== 503) return response;
    await response?.body?.cancel();
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1_000 * (2 ** attempt)));
  }
  if (lastError) throw lastError;
  return response;
}

export async function smokeAccessibilityText({
  deploymentUrl = PRODUCTION_ORIGIN,
  fetchImpl = fetch,
  routes = ACCESSIBILITY_TEXT_ROUTES,
  timeoutMs = 30_000,
  interRequestDelayMs = 250,
} = {}) {
  const origin = new URL(deploymentUrl).origin;
  const results = [];
  for (const [index, pathname] of routes.entries()) {
    if (index > 0 && interRequestDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, interRequestDelayMs));
    const response = await fetchWithRetry(new URL(pathname, `${origin}/`), fetchImpl, timeoutMs);
    if (response.status !== 200) throw new Error(`${pathname} returned ${response.status}`);
    if (response.headers.get("x-studywudy-accessibility-text") !== ACCESSIBILITY_TEXT_RELEASE) {
      throw new Error(`${pathname} is missing the accessibility-text release marker`);
    }
    const body = await response.text();
    const inspection = inspectAccessibilityHtml(body);
    if (inspection.failures.length) throw new Error(`${pathname}: ${inspection.failures.join("; ")}`);
    results.push(Object.freeze({ pathname, status: response.status, assistiveTextLength: inspection.text.length }));
  }
  return Object.freeze(results);
}

async function main() {
  const deploymentUrl = process.env.STUDYWUDY_DEPLOYMENT_URL || process.argv[2] || PRODUCTION_ORIGIN;
  const results = await smokeAccessibilityText({ deploymentUrl });
  console.log(`PASS: ${results.length} server-rendered pages expose clean accessible names and hide decorative labels`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
