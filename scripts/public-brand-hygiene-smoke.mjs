#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import {
  FORBIDDEN_PUBLIC_BRAND_PATTERNS,
  PUBLIC_BRAND_HYGIENE_RELEASE,
  PUBLIC_BRAND_REPLACEMENT,
  inspectPublicBrandHtml,
  publicDocumentUrl,
} from "../public-brand-hygiene.mjs";
import { extractCrawlerVisibleText } from "../crawler-visible-text.mjs";
import { PRODUCTION_ORIGIN } from "./featured-study-route-smoke.mjs";

export const PUBLIC_BRAND_HTML_ROUTES = Object.freeze([
  "/",
  "/boards",
  "/search",
  "/cbse",
  "/about/methodology",
  "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electrostatics",
  "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electrostatics/revision",
  "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electrostatics/practice",
  "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electrostatics/questions/q-msb-balbharati-physics-standard-12-8-002",
]);

export const PUBLIC_BRAND_DISCOVERY_ROUTES = Object.freeze(["/robots.txt", "/sitemap.xml"]);

async function fetchWithRetry(url, fetchImpl, timeoutMs) {
  let response;
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        headers: {
          accept: "text/html,application/xml,text/plain;q=0.9,*/*;q=0.8",
          "cache-control": "no-cache",
          "user-agent": "StudyWudy public-brand deployment gate/1.0",
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

function discoveryFailures(value, pageUrl) {
  const expectedOrigin = new URL(publicDocumentUrl(pageUrl)).origin;
  const withoutExpectedOrigin = String(value).replaceAll(expectedOrigin, "");
  return FORBIDDEN_PUBLIC_BRAND_PATTERNS
    .filter(({ pattern }) => pattern.test(withoutExpectedOrigin))
    .map(({ label }) => `discovery metadata contains ${label}`);
}

export async function smokePublicBrandHygiene({
  deploymentUrl = PRODUCTION_ORIGIN,
  fetchImpl = fetch,
  timeoutMs = 30_000,
  interRequestDelayMs = 250,
} = {}) {
  const origin = new URL(deploymentUrl).origin;
  const results = [];
  for (const [index, pathname] of [...PUBLIC_BRAND_HTML_ROUTES, ...PUBLIC_BRAND_DISCOVERY_ROUTES].entries()) {
    if (index > 0 && interRequestDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, interRequestDelayMs));
    const pageUrl = new URL(pathname, `${origin}/`);
    const response = await fetchWithRetry(pageUrl, fetchImpl, timeoutMs);
    if (response.status !== 200) throw new Error(`${pathname} returned ${response.status}`);
    if (response.headers.get("x-studywudy-brand-hygiene") !== PUBLIC_BRAND_HYGIENE_RELEASE) {
      throw new Error(`${pathname} is missing the public-brand release marker`);
    }
    const body = await response.text();
    const failures = PUBLIC_BRAND_HTML_ROUTES.includes(pathname)
      ? [...inspectPublicBrandHtml(body, { pageUrl }).failures]
      : discoveryFailures(body, pageUrl);
    if (pathname === "/") {
      const crawlerText = extractCrawlerVisibleText(body);
      const replacementCount = crawlerText.split(PUBLIC_BRAND_REPLACEMENT).length - 1;
      if (replacementCount !== 1) failures.push(`replacement homepage copy occurs ${replacementCount} times instead of once`);
      if (!crawlerText.includes("One system, every question")) failures.push("homepage formats eyebrow is missing");
    }
    if (failures.length) throw new Error(`${pathname}: ${failures.join("; ")}`);
    results.push(Object.freeze({ pathname, status: response.status }));
  }
  return Object.freeze(results);
}

async function main() {
  const deploymentUrl = process.env.STUDYWUDY_DEPLOYMENT_URL || process.argv[2] || PRODUCTION_ORIGIN;
  const results = await smokePublicBrandHygiene({ deploymentUrl });
  console.log(`PASS: ${results.length} public copy, metadata, JSON-LD and discovery responses are brand-clean`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
