#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { extractCrawlerVisibleText } from "../crawler-visible-text.mjs";
import { SEARCH_EXCERPT_MAXIMUM, SEARCH_EXCERPT_RELEASE } from "../search-excerpt.mjs";
import { PRODUCTION_ORIGIN } from "./featured-study-route-smoke.mjs";

export const SEARCH_EXCERPT_CASES = Object.freeze([
  Object.freeze({ name: "default Question Bank", pathname: "/search" }),
  Object.freeze({ name: "electric field results", pathname: "/search?q=electric%20field" }),
]);

function normalizeDeploymentUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Deployment URL must use HTTP or HTTPS");
  return url.origin;
}

export function extractSearchCardExcerpts(html) {
  const excerpts = [];
  const pattern = /<h2\b[^>]*\bdata-search-excerpt=["']plain-v2["'][^>]*>([\s\S]*?)<\/h2>/giu;
  for (const match of String(html || "").matchAll(pattern)) {
    excerpts.push(extractCrawlerVisibleText(match[1]));
  }
  return Object.freeze(excerpts);
}

export function extractSearchCardDescriptions(html) {
  const descriptions = [];
  const pattern = /<b\b[^>]*\bdata-search-description=["']plain-v2["'][^>]*>([\s\S]*?)<\/b>/giu;
  for (const match of String(html || "").matchAll(pattern)) {
    descriptions.push(extractCrawlerVisibleText(match[1]));
  }
  return Object.freeze(descriptions);
}

function plainTextFailures(text, label) {
  const failures = [];
  if (/\*\*|__|!\[|\$|<\/?[a-z][^>]*>|\\[A-Za-z]+\b/iu.test(text)) {
    failures.push(`${label} exposes raw Markdown, HTML or TeX`);
  }
  if (/(?:^|\s)\|(?:\s|$)/u.test(text)) failures.push(`${label} exposes a Markdown table pipe`);
  if (/(?:^|[\s([])\*[^*\n]+\*(?=$|[\s).,;:\]])/u.test(text)) failures.push(`${label} exposes Markdown emphasis`);
  return failures;
}

export function inspectSearchExcerptHtml(pathname, html) {
  const excerpts = extractSearchCardExcerpts(html);
  const descriptions = extractSearchCardDescriptions(html);
  const failures = [];
  if (!excerpts.length) failures.push("no server-rendered search excerpts were found");
  if (descriptions.length !== excerpts.length) failures.push("each search excerpt must have one parsed plain-text description");
  excerpts.forEach((excerpt, index) => {
    const label = `excerpt ${index + 1}`;
    if ([...excerpt].length > SEARCH_EXCERPT_MAXIMUM) failures.push(`${label} exceeds ${SEARCH_EXCERPT_MAXIMUM} characters`);
    failures.push(...plainTextFailures(excerpt, label));
  });
  descriptions.forEach((description, index) => {
    failures.push(...plainTextFailures(description, `description ${index + 1}`));
  });
  if (pathname.includes("electric%20field") && !excerpts.some((excerpt) => /(?:electric|electrostatic) field/iu.test(excerpt))) {
    failures.push("electric field results do not contain the requested concept");
  }
  return Object.freeze({
    pathname,
    excerpts,
    descriptions,
    failures: Object.freeze(failures),
  });
}

export async function smokeSearchExcerpts({
  deploymentUrl = PRODUCTION_ORIGIN,
  fetchImpl = fetch,
  cases = SEARCH_EXCERPT_CASES,
  timeoutMs = 30_000,
} = {}) {
  const origin = normalizeDeploymentUrl(deploymentUrl);
  const results = [];
  for (const entry of cases) {
    const response = await fetchImpl(new URL(entry.pathname, `${origin}/`), {
      method: "GET",
      redirect: "manual",
      headers: {
        accept: "text/html",
        "cache-control": "no-cache",
        "user-agent": "StudyWudy search excerpt deployment gate/1.0",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200) throw new Error(`${entry.pathname} returned ${response.status}`);
    if (response.headers.get("x-studywudy-search-excerpt") !== SEARCH_EXCERPT_RELEASE) {
      throw new Error(`${entry.pathname} is missing the parsed-excerpt release marker`);
    }
    const result = inspectSearchExcerptHtml(entry.pathname, await response.text());
    if (result.failures.length) throw new Error(`${entry.pathname}: ${result.failures.join("; ")}`);
    results.push(Object.freeze({ ...result, name: entry.name }));
  }
  return Object.freeze(results);
}

async function main() {
  const deploymentUrl = process.env.STUDYWUDY_DEPLOYMENT_URL || process.argv[2] || PRODUCTION_ORIGIN;
  const results = await smokeSearchExcerpts({ deploymentUrl });
  for (const result of results) console.log(`PASS ${result.pathname} (${result.excerpts.length} excerpts)`);
  console.log("Verified parsed, plain-text Question Bank excerpts and descriptions without raw Markdown, HTML or TeX");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
