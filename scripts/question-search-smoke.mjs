#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { PRODUCTION_ORIGIN } from "./featured-study-route-smoke.mjs";
import { SEARCH_FILTER_RELEASE } from "../question-search.mjs";
import { extractCrawlerVisibleText } from "../crawler-visible-text.mjs";

const REQUIRED_POPULAR_FILTERS = Object.freeze([
  "/search?type=numerical",
  "/search?hasDiagram=true",
  "/search?type=mcq_single",
  "/search?board=maharashtra-board",
]);

const LEGACY_KEYWORD_FILTERS = Object.freeze([
  "/search?q=numerical",
  "/search?q=diagram",
]);

export const QUESTION_SEARCH_SMOKE_CASES = Object.freeze([
  Object.freeze({ name: "popular structured filters", pathname: "/search", expected: Object.freeze({}) }),
  Object.freeze({ name: "numerical type", pathname: "/search?type=numerical", expected: Object.freeze({ type: "numerical" }) }),
  Object.freeze({ name: "diagram evidence", pathname: "/search?hasDiagram=true", expected: Object.freeze({ hasDiagram: true }) }),
  Object.freeze({ name: "single-choice type", pathname: "/search?type=mcq_single", expected: Object.freeze({ type: "mcq_single" }) }),
  Object.freeze({ name: "Maharashtra board", pathname: "/search?board=maharashtra-board", expected: Object.freeze({ board: "maharashtra-board" }) }),
  Object.freeze({ name: "ranked exact-chapter query", pathname: "/search?q=climate", expected: Object.freeze({ ranked: true }) }),
  Object.freeze({ name: "electric-field runtime regression", pathname: "/search?q=electric%20field", expected: Object.freeze({}) }),
]);

function normalizeDeploymentUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Deployment URL must use HTTP or HTTPS");
  return url.origin;
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "iu"))?.[1] || "";
}

export function extractStructuredSearchCards(html) {
  const cards = [];
  const tags = String(html || "").match(/<a\b[^>]*\bdata-question-type=["'][^"']+["'][^>]*>/giu) || [];
  for (const tag of tags) {
    cards.push(Object.freeze({
      href: attribute(tag, "href"),
      rowId: Number(attribute(tag, "data-question-row-id")),
      type: attribute(tag, "data-question-type"),
      board: attribute(tag, "data-question-board"),
      hasDiagram: attribute(tag, "data-has-diagram") === "true",
      publicEligible: attribute(tag, "data-public-search-eligible") === "true",
      priority: Number(attribute(tag, "data-search-priority")),
      match: attribute(tag, "data-search-match"),
    }));
  }
  return Object.freeze(cards);
}

export function inspectQuestionSearchHtml(entry, html) {
  const source = String(html || "");
  const crawlerText = extractCrawlerVisibleText(source);
  const cards = extractStructuredSearchCards(source);
  const failures = [];
  const declaredCount = Number(source.match(/\bdata-search-result-count=["'](\d+)["']/iu)?.[1]);
  if (!Number.isInteger(declaredCount)) failures.push("server-rendered result count is missing");
  else if (declaredCount !== cards.length) failures.push(`declared ${declaredCount} results but rendered ${cards.length} cards`);
  for (const href of REQUIRED_POPULAR_FILTERS) {
    if (!source.includes(`href="${href}"`)) failures.push(`popular filter ${href} is missing`);
  }
  for (const href of LEGACY_KEYWORD_FILTERS) {
    if (source.includes(href)) failures.push(`legacy keyword filter ${href} remains in rendered HTML or hydration data`);
  }
  if (!cards.length && !entry.pathname.includes("?")) failures.push("no server-rendered structured search cards were found");
  if (cards.some((card) => !card.href || !Number.isSafeInteger(card.rowId) || card.rowId < 1 || !card.publicEligible)) {
    failures.push("a result is missing its final public-search eligibility evidence");
  }
  if (entry.pathname.includes("?")) {
    if (/\breviewed matches\b/iu.test(crawlerText)) failures.push("filtered summary overclaims human review");
    if (!/\d+ eligible (?:match is|matches are) rendered below\./iu.test(crawlerText)) failures.push("filtered summary does not describe eligible matches");
  }
  if (entry.expected.type && cards.some((card) => card.type !== entry.expected.type)) {
    failures.push(`results include a type other than ${entry.expected.type}`);
  }
  if (entry.expected.board && cards.some((card) => card.board !== entry.expected.board)) {
    failures.push(`results include a board other than ${entry.expected.board}`);
  }
  if (entry.expected.hasDiagram === true && cards.some((card) => !card.hasDiagram)) {
    failures.push("results include a question without diagram evidence");
  }
  if (entry.expected.type === "numerical" && /boron trifluoride|which theory explains it|electrode potential of copper|write (?:the )?SQL quer|structured query language/iu.test(crawlerText)) {
    failures.push("numerical results include a conceptual or SQL classification defect");
  }
  if (entry.expected.hasDiagram === true && /assassination of Julius Caesar|giving graphic details|write the newspaper report/iu.test(crawlerText)) {
    failures.push("diagram results include a non-diagram writing prompt");
  }
  if (entry.expected.ranked) {
    const priorities = cards.map(({ priority }) => priority);
    if (priorities.some((priority) => ![2, 3, 4, 5].includes(priority))) failures.push("a text result has an invalid relevance priority");
    if (priorities.some((priority, index) => index > 0 && priority < priorities[index - 1])) failures.push("text results are not ordered by relevance priority");
    if (!priorities.some((priority) => priority === 2)) failures.push("the exact concept/title tier is missing from the ranked fixture");
  }
  return Object.freeze({ name: entry.name, pathname: entry.pathname, cards, failures: Object.freeze(failures) });
}

export async function smokeQuestionSearch({
  deploymentUrl = PRODUCTION_ORIGIN,
  fetchImpl = fetch,
  cases = QUESTION_SEARCH_SMOKE_CASES,
  timeoutMs = 30_000,
} = {}) {
  const origin = normalizeDeploymentUrl(deploymentUrl);
  const results = [];
  const questionPaths = new Set();
  const sampledQuestionPaths = new Set();
  for (const entry of cases) {
    const response = await fetchImpl(new URL(entry.pathname, `${origin}/`), {
      method: "GET",
      redirect: "manual",
      headers: {
        accept: "text/html",
        "cache-control": "no-cache",
        "user-agent": "StudyWudy structured question-search deployment gate/1.0",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200) throw new Error(`${entry.pathname} returned ${response.status}`);
    if (response.headers.get("x-studywudy-search-filter") !== SEARCH_FILTER_RELEASE) {
      throw new Error(`${entry.pathname} is missing the structured-search release marker`);
    }
    if (entry.pathname.includes("?") && response.headers.get("cache-control") !== "no-store") {
      throw new Error(`${entry.pathname} is not isolated from the default search cache`);
    }
    const inspection = inspectQuestionSearchHtml(entry, await response.text());
    if (inspection.failures.length) throw new Error(`${entry.pathname}: ${inspection.failures.join("; ")}`);
    for (const card of inspection.cards) questionPaths.add(card.href);
    for (const card of inspection.cards.slice(0, 5)) sampledQuestionPaths.add(card.href);
    results.push(inspection);
  }
  const pendingPaths = [...questionPaths];
  for (let offset = 0; offset < pendingPaths.length; offset += 12) {
    await Promise.all(pendingPaths.slice(offset, offset + 12).map(async (pathname) => {
      const response = await fetchImpl(new URL(pathname, `${origin}/`), {
        method: "HEAD",
        redirect: "manual",
        headers: {
          accept: "text/html",
          "cache-control": "no-cache",
          "user-agent": "StudyWudy public-search page-gate deployment check/1.0",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status !== 200) throw new Error(`${pathname} returned ${response.status}`);
      if (!/; complete$/u.test(response.headers.get("x-studywudy-publish-gate") || "")) {
        throw new Error(`${pathname} is listed in search but did not pass its page publishing gate`);
      }
      if (!/^index,\s*follow\b/iu.test(response.headers.get("x-robots-tag") || "")) {
        throw new Error(`${pathname} is listed in search but is not indexable`);
      }
    }));
  }
  const sampledPaths = [...sampledQuestionPaths];
  for (let offset = 0; offset < sampledPaths.length; offset += 5) {
    await Promise.all(sampledPaths.slice(offset, offset + 5).map(async (pathname) => {
      const response = await fetchImpl(new URL(pathname, `${origin}/`), {
        method: "GET",
        redirect: "manual",
        headers: {
          accept: "text/html",
          "cache-control": "no-cache",
          "user-agent": "StudyWudy eligible-destination concurrent GET gate/1.0",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const html = await response.text();
      if (response.status !== 200) throw new Error(`${pathname} GET returned ${response.status}`);
      if (!/; complete$/u.test(response.headers.get("x-studywudy-publish-gate") || "")) {
        throw new Error(`${pathname} GET did not pass its page publishing gate`);
      }
      if (!/^index,\s*follow\b/iu.test(response.headers.get("x-robots-tag") || "")) {
        throw new Error(`${pathname} GET is listed in search but is not indexable`);
      }
      if (/Equation review pending|data-studywudy-equation-review=["']pending/iu.test(html)) {
        throw new Error(`${pathname} GET contains an equation-review placeholder despite passing`);
      }
      if (/AEFCandAE=FCAECFisaparallelogram|BQ=QPandDP=PQBQ=QP=PD/iu.test(html.replace(/\s+/gu, ""))) {
        throw new Error(`${pathname} GET contains collapsed prose in MathML`);
      }
    }));
  }
  const missingResponse = await fetchImpl(new URL("/__studywudy_missing_route_probe_20260823__", `${origin}/`), {
    method: "GET",
    redirect: "manual",
    headers: { accept: "text/html", "cache-control": "no-cache", "user-agent": "StudyWudy early-404 deployment gate/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (missingResponse.status !== 404) throw new Error(`nonexistent route returned ${missingResponse.status} instead of 404`);
  return Object.freeze(results);
}

async function main() {
  const deploymentUrl = process.env.STUDYWUDY_DEPLOYMENT_URL || process.argv[2] || PRODUCTION_ORIGIN;
  const results = await smokeQuestionSearch({ deploymentUrl });
  for (const result of results) console.log(`PASS ${result.pathname} (${result.cards.length} questions)`);
  console.log("Checked structured filters, concurrent eligible-page GETs, rendered equation gates, early 404s, cache isolation and relevance ordering");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
