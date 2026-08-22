#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import {
  ACCOUNTANCY_SAMPLE_PATH,
  PUBLIC_TITLE_QUALITY_RELEASE,
  inspectPublicTitle,
} from "../public-title-quality.mjs";
import { PRODUCTION_ORIGIN } from "./featured-study-route-smoke.mjs";

export const PUBLIC_TITLE_ROUTES = Object.freeze(["/", ACCOUNTANCY_SAMPLE_PATH]);

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
          "user-agent": "StudyWudy public-title deployment gate/1.0",
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

export async function smokePublicTitleQuality({
  deploymentUrl = PRODUCTION_ORIGIN,
  fetchImpl = fetch,
  timeoutMs = 30_000,
  interRequestDelayMs = 250,
} = {}) {
  const origin = new URL(deploymentUrl).origin;
  const results = [];
  for (const [index, pathname] of PUBLIC_TITLE_ROUTES.entries()) {
    if (index > 0 && interRequestDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, interRequestDelayMs));
    const response = await fetchWithRetry(new URL(pathname, `${origin}/`), fetchImpl, timeoutMs);
    if (response.status !== 200) throw new Error(`${pathname} returned ${response.status}`);
    if (response.headers.get("x-studywudy-public-title") !== PUBLIC_TITLE_QUALITY_RELEASE) {
      throw new Error(`${pathname} is missing the public-title release marker`);
    }
    const html = await response.text();
    const inspection = inspectPublicTitle({
      html,
      pathname,
      privateRowId: pathname === ACCOUNTANCY_SAMPLE_PATH ? 39_148 : null,
    });
    if (inspection.failures.length) throw new Error(`${pathname}: ${inspection.failures.join("; ")}`);
    results.push(Object.freeze({ pathname, status: response.status, title: inspection.title }));
  }
  return Object.freeze(results);
}

async function main() {
  const deploymentUrl = process.env.STUDYWUDY_DEPLOYMENT_URL || process.argv[2] || PRODUCTION_ORIGIN;
  const results = await smokePublicTitleQuality({ deploymentUrl });
  console.log(`PASS: ${results.length} descriptive public titles contain no private database IDs`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
