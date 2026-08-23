#!/usr/bin/env node

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  assertValidCrawlerText,
  extractCrawlerVisibleText,
} from "../crawler-visible-text.mjs";
import { NIGHTLY_QUALITY_SAMPLE_MANIFEST } from "../nightly-quality-sample-manifest.mjs";
import { detectSourceTextAnomalies } from "../source-text-integrity.mjs";
import { PRODUCTION_ORIGIN } from "./featured-study-route-smoke.mjs";

const DEFAULT_SAMPLE_SIZE = 100;
const DEFAULT_CONCURRENCY = 4;
const FORBIDDEN_PAGE_TEXT = /Equation review pending|Automated answer checks incomplete|\bundefined\b|\bNaN\b|\[object Object\]|\ufffd|\{\{[^{}]+\}\}/u;

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function utcSeed(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function selectRowIds(rowIds, category, seed, count) {
  return [...rowIds]
    .sort((left, right) => createHash("sha256").update(`${seed}:${category}:${left}`).digest("hex")
      .localeCompare(createHash("sha256").update(`${seed}:${category}:${right}`).digest("hex")))
    .slice(0, count);
}

function attribute(tag, name) {
  const match = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "u").exec(tag || "");
  return match?.[1] ?? match?.[2] ?? null;
}

function questionCardTag(html) {
  return String(html).match(/<article\b[^>]*\bclass=(?:"[^"]*\bquestion-card\b[^"]*"|'[^']*\bquestion-card\b[^']*')[^>]*>/iu)?.[0] || "";
}

function choiceInspection(html) {
  const list = String(html).match(/<ol\b[^>]*\bclass=(?:"[^"]*\bquestion-choice-list\b[^"]*"|'[^']*\bquestion-choice-list\b[^']*')[^>]*>([\s\S]*?)<\/ol>/iu)?.[1] || "";
  const items = [...list.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/giu)].map((match) => {
    const content = match[2].replace(/<b\b[\s\S]*?<\/b>/iu, "").replace(/<small\b[\s\S]*?<\/small>/iu, "");
    return Object.freeze({
      correct: /\bis-correct\b/u.test(attribute(`<li ${match[1]}>`, "class") || ""),
      text: extractCrawlerVisibleText(content).normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("en-IN"),
    });
  });
  return Object.freeze({ items, correctCount: items.filter(({ correct }) => correct).length });
}

function inspectPage({ category, rowId, entry, status, headers, html, error }) {
  const failures = [];
  if (error) failures.push(error);
  if (status !== 200) failures.push(`HTTP ${status ?? "request failed"}`);
  if (!(headers?.get("content-type") || "").includes("text/html")) failures.push("response is not HTML");
  if (!/; complete$/u.test(headers?.get("x-studywudy-publish-gate") || "")) failures.push("final publishing gate is not complete");
  if (/(?:^|,)\s*noindex\b/iu.test(headers?.get("x-robots-tag") || "") || !/(?:^|,)\s*index\b/iu.test(headers?.get("x-robots-tag") || "")) failures.push("page is not indexable");
  if (!headers?.get("x-studywudy-public-eligibility")) failures.push("public-eligibility marker is missing");
  if (!/^<!doctype html>/iu.test(html) || !/<\/html>\s*$/iu.test(html)) failures.push("HTML document is truncated or malformed");

  const card = questionCardTag(html);
  if (attribute(card, "data-question-row-id") !== String(rowId)) failures.push("source row mapping does not match");
  if (attribute(card, "data-question-id") !== entry.questionId) failures.push("question ID mapping does not match");
  if (attribute(card, "data-question-book") !== entry.bookId) failures.push("book mapping does not match");
  if (attribute(card, "data-question-type") !== entry.type) failures.push("normalized type classification does not match");

  const crawlerText = extractCrawlerVisibleText(html);
  try {
    assertValidCrawlerText(crawlerText, entry.pathname);
  } catch (caught) {
    failures.push(caught instanceof Error ? caught.message : String(caught));
  }
  if (FORBIDDEN_PAGE_TEXT.test(crawlerText)) failures.push("crawler text contains a placeholder, runtime token, or corrupted Unicode");
  const sourceTextAnomalies = detectSourceTextAnomalies(crawlerText, { numericContext: true });
  if (sourceTextAnomalies.length) {
    failures.push(`crawler text contains source-input anomaly signals: ${[...new Set(sourceTextAnomalies.map(({ code }) => code))].join(", ")}`);
  }
  if (!/<article\b[^>]*\bclass=(?:"[^"]*\bsolution-body\b[^"]*"|'[^']*\bsolution-body\b[^']*')/iu.test(html)) failures.push("answer body is missing");
  if (!/Automated completeness gate passed/u.test(crawlerText)) failures.push("passed-gate trust copy is missing");
  const mathCount = (html.match(/<math\b/giu) || []).length;
  const labelledMathCount = (html.match(/<math\b[^>]*\brole=["']math["'][^>]*\baria-label=/giu) || []).length;
  if (mathCount !== labelledMathCount) failures.push("semantic equation markup is incomplete");

  if (category === "mcq") {
    const choices = choiceInspection(html);
    if (choices.items.length < 2) failures.push("MCQ choices are missing");
    if (new Set(choices.items.map(({ text }) => text)).size !== choices.items.length) failures.push("MCQ has duplicate answer choices");
    if (entry.type === "mcq_single" && choices.correctCount !== 1) failures.push("single-choice MCQ does not expose exactly one correct option");
    if (entry.type === "mcq_multi" && choices.correctCount < 1) failures.push("multiple-choice MCQ does not expose a correct option");
  }
  if (category === "numerical" && !/[0-9]|<math\b/iu.test(html)) failures.push("numerical answer has no quantitative result");
  if (category === "diagram" && !/<article\b[^>]*\bclass=(?:"[^"]*\bsolution-body\b[^"]*"|'[^']*\bsolution-body\b[^']*')[\s\S]*?<img\b/iu.test(html)) failures.push("rendered solution diagram is missing");
  if (category === "derivation" && (html.match(/<ol\b[^>]*\bclass=(?:"[^"]*\bquestion-step-list\b[^"]*"|'[^']*\bquestion-step-list\b[^']*')[^>]*>[\s\S]*?<li\b/giu) || []).length < 1) failures.push("derivation has no rendered proof steps");
  if (category === "multilingual") {
    if (attribute(String(html).match(/<html\b[^>]*>/iu)?.[0], "lang") !== entry.language) failures.push("page language does not match the reviewed source");
    if (entry.language === "hi" && !/\p{Script=Devanagari}/u.test(crawlerText)) failures.push("reviewed Hindi page has no Devanagari text");
  }
  return Object.freeze({ category, rowId, pathname: entry.pathname, failures: Object.freeze(failures) });
}

async function fetchPage(origin, entry, timeoutMs) {
  const url = new URL(entry.pathname, `${origin}/`);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "text/html",
          "cache-control": "no-cache",
          "user-agent": `StudyWudy ${NIGHTLY_QUALITY_SAMPLE_MANIFEST.policyVersion} nightly audit`,
        },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const html = await response.text();
      if (response.status !== 503 || attempt === 2) return { status: response.status, headers: response.headers, html };
    } catch (error) {
      if (attempt === 2) return { status: null, headers: new Headers(), html: "", error: error instanceof Error ? error.message : String(error) };
    }
    await new Promise((resolve) => setTimeout(resolve, 750 * (2 ** attempt)));
  }
  return { status: null, headers: new Headers(), html: "", error: "retry loop exhausted" };
}

export async function runNightlyEligibleQualitySample({
  deploymentUrl = PRODUCTION_ORIGIN,
  seed = utcSeed(),
  sampleSize = DEFAULT_SAMPLE_SIZE,
  concurrency = DEFAULT_CONCURRENCY,
  timeoutMs = 30_000,
} = {}) {
  const origin = new URL(deploymentUrl).origin;
  const jobs = [];
  for (const [category, rowIds] of Object.entries(NIGHTLY_QUALITY_SAMPLE_MANIFEST.categories)) {
    for (const rowId of selectRowIds(rowIds, category, seed, sampleSize)) {
      jobs.push({ category, rowId, entry: NIGHTLY_QUALITY_SAMPLE_MANIFEST.entries[rowId] });
    }
  }

  const fetched = new Map();
  const fetchOnce = (entry) => {
    if (!fetched.has(entry.pathname)) fetched.set(entry.pathname, fetchPage(origin, entry, timeoutMs));
    return fetched.get(entry.pathname);
  };
  const results = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      results.push(inspectPage({ ...job, ...await fetchOnce(job.entry) }));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  results.sort((left, right) => left.category.localeCompare(right.category) || left.rowId - right.rowId);
  const failures = results.filter((result) => result.failures.length);
  return Object.freeze({
    policyVersion: NIGHTLY_QUALITY_SAMPLE_MANIFEST.policyVersion,
    publishingGateVersion: NIGHTLY_QUALITY_SAMPLE_MANIFEST.publishingGateVersion,
    seed,
    origin,
    requestedPerCategory: sampleSize,
    sampled: results.length,
    uniqueRequests: fetched.size,
    pass: failures.length === 0,
    categoryCounts: Object.freeze(Object.fromEntries(Object.keys(NIGHTLY_QUALITY_SAMPLE_MANIFEST.categories).map((category) => [category, results.filter((result) => result.category === category).length]))),
    failures: Object.freeze(failures),
  });
}

async function main() {
  const report = await runNightlyEligibleQualitySample({
    deploymentUrl: process.env.STUDYWUDY_DEPLOYMENT_URL || process.argv[2] || PRODUCTION_ORIGIN,
    seed: process.env.STUDYWUDY_NIGHTLY_SEED || utcSeed(),
    sampleSize: positiveInteger(process.env.STUDYWUDY_NIGHTLY_SAMPLE_SIZE, DEFAULT_SAMPLE_SIZE, DEFAULT_SAMPLE_SIZE),
    concurrency: positiveInteger(process.env.STUDYWUDY_NIGHTLY_CONCURRENCY, DEFAULT_CONCURRENCY, 8),
    timeoutMs: positiveInteger(process.env.STUDYWUDY_NIGHTLY_TIMEOUT_MS, 30_000, 120_000),
  });
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (process.env.STUDYWUDY_NIGHTLY_REPORT) writeFileSync(process.env.STUDYWUDY_NIGHTLY_REPORT, output);
  console.log(output.trimEnd());
  if (!report.pass) throw new Error(`${report.failures.length} of ${report.sampled} stratified checks failed`);
  console.log(`PASS: ${report.sampled} category checks across ${report.uniqueRequests} eligible pages`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
