#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { extractCrawlerVisibleText } from "../crawler-visible-text.mjs";
import {
  LAUNCH_HOT_PATH_DOCUMENTS,
  LAUNCH_HOT_PATH_RELEASE,
} from "../launch-hot-path.mjs";

const root = resolve(import.meta.dirname, "..");
const assetsRoot = resolve(root, "comparison/after-assets");

function outputPath(entry) {
  return resolve(assetsRoot, entry.assetPath.replace(/^\//u, ""), "index.html");
}

function occurrences(value, pattern) {
  return [...String(value || "").matchAll(pattern)].length;
}

function inspect(entry, html) {
  const failures = [];
  const source = String(html || "");
  const text = extractCrawlerVisibleText(source);
  if (!/^<!doctype html>/iu.test(source) || !/<\/html>\s*$/iu.test(source)) failures.push("document is not complete HTML");
  if (/self\.__next_f|<script\b[^>]*src=["']\/_next\/static\/chunks\//iu.test(source)) failures.push("Next hydration payload remains");
  if (/class=["'][^"']*\b(?:math-plain-text|math-semantic-only|katex(?:-display)?)\b|<annotation\b/iu.test(source)) {
    failures.push("a duplicate equation representation remains");
  }
  if (/\\(?:frac|varepsilon|epsilon|text|mathrm|times)\b|\$\$/u.test(text)) failures.push("raw TeX is crawler-visible");
  if (entry.kind.endsWith("-question")) {
    if (!source.includes(`id="${entry.questionId}"`)) failures.push("question identity is missing");
    if (!/(?:Automated (?:completeness gate passed|answer checks incomplete)|Equation review pending)/u.test(text)) failures.push("publishing evidence is missing");
    if (entry.questionId.endsWith("-002")) {
      if (!/Dielectric Slab Capacitor MCQ Solution/u.test(source)) failures.push("Q2 title does not use the normalized MCQ type");
      if (/Dielectric Slab Capacitor Numerical/u.test(source)) failures.push("Q2 title still uses the imported Numerical classification");
    }
    if (entry.inspection === "corrected-semantic-answer") {
      if (!/The brain is inside the skull, while the nose is an external organ\./u.test(text)) failures.push("corrected answer explanation is missing");
      if (/external organ is an internal organ/u.test(text)) failures.push("joined contradictory answer remains");
    }
    if (entry.inspection === "authoritative-mapping-mismatch") {
      if (!/Authoritative textbook mapping mismatch/u.test(text)) failures.push("authoritative mapping mismatch is not disclosed");
      if (!/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/iu.test(source)) failures.push("authoritative mapping mismatch is still indexable");
      if (!/डासपीटिका[^.]{0,100}chapter 10|chapter 10[^.]{0,100}डासपीटिका/iu.test(text)) failures.push("official chapter-order evidence is missing");
    }
    if (entry.inspection === "verified-source-typo-retained") {
      if (!/Verified source typo retained/u.test(text)) failures.push("verified source-typo note is missing");
      if (/positvely/u.test(text)) failures.push("retained source typo is crawler-visible");
      if (!source.includes('data-content-quality-classification="source typo retained with note"')) failures.push("source-typo classification is missing");
      if (!/\bdata-nosnippet(?:\s|=|>)/u.test(source)) failures.push("source quotation is not snippet-excluded");
    }
    if (entry.inspection === "gauss-law-density-repair") {
      if (!/density ρ/u.test(text)) failures.push("repaired charge density is missing");
      if (/density ρρ/u.test(text)) failures.push("duplicated charge-density symbol remains");
      if (!/Gauss’s Law/u.test(text) || /Gausss Law/u.test(text)) failures.push("Gauss’s Law title repair is missing");
    }
    if (entry.inspection === "fixed-charges-grammar-repair") {
      if (!/two fixed charges/u.test(text)) failures.push("fixed-charges grammar repair is missing");
      if (/two fixed charged/u.test(text)) failures.push("fixed charged grammar defect remains");
    }
    if (entry.inspection === "lr-semantic-roundtrip") {
      if (!/<math\b[^>]*aria-label=["'][^"']*integral[^"']*["']/iu.test(source)) failures.push("LR integral is missing from semantic MathML");
      if (!/<math\b[^>]*aria-label=["'][^"']*epsilon[^"']*["']/iu.test(source)) failures.push("LR epsilon is missing from semantic MathML");
      if (!/U sub B equals one half L i squared/iu.test(source)) failures.push("LR one-half magnetic-energy relation is missing");
    }
  } else {
    const declared = Number(source.match(/\bdata-search-result-count=["'](\d+)["']/iu)?.[1]);
    const cards = occurrences(source, /<a\b[^>]*\bdata-question-id=["'][^"']+["'][^>]*>/giu);
    if (!Number.isInteger(declared)) failures.push("server-rendered result count is missing");
    else if (declared !== cards) failures.push(`declared ${declared} results but rendered ${cards} cards`);
    if (!cards && entry.search === "") failures.push("no question cards are server-rendered");
    if (entry.search === "" && cards !== 16) failures.push(`default showroom has ${cards} cards instead of 16`);
    if (entry.search === "" && !/Quality-screened sample questions/iu.test(text)) failures.push("default showroom still makes a misleading verified claim");
    if (entry.search === "" && /data-showcase-verified|data-source-mapping-verified/iu.test(source)) failures.push("default showroom still conflates internal and authoritative mapping");
    if (entry.search !== "" && /\breviewed matches\b/iu.test(text)) failures.push("filtered summary overclaims human review");
    if (entry.search !== "" && !/All \d+ eligible matches are rendered below\./iu.test(text)) failures.push("filtered summary does not describe eligible matches");
    if (/डसपटक|HuntingGathering|We did not\s+(?:blank|in the class)|literal blank|_{3,}/iu.test(text)) {
      failures.push("a reported showroom defect remains");
    }
    if (entry.search === "type=numerical" && /boron trifluoride|which theory explains it|electrode potential of copper|write (?:the )?SQL quer|structured query language/iu.test(text)) {
      failures.push("a conceptual or SQL question remains classified as numerical");
    }
    if (entry.search === "hasDiagram=true" && /assassination of Julius Caesar|giving graphic details|write the newspaper report/iu.test(text)) {
      failures.push("a non-diagram writing prompt remains classified as diagram-based");
    }
  }
  return Object.freeze(failures);
}

function verifyFiles() {
  for (const entry of LAUNCH_HOT_PATH_DOCUMENTS) {
    const path = outputPath(entry);
    const failures = inspect(entry, readFileSync(path, "utf8"));
    if (failures.length) throw new Error(`${entry.publicPath}: ${failures.join("; ")}`);
  }
}

async function fetchDocuments(origin) {
  const documents = [];
  for (const entry of LAUNCH_HOT_PATH_DOCUMENTS) {
    const url = new URL(entry.publicPath, `${origin}/`);
    const response = await fetch(url, {
      headers: {
        accept: "text/html",
        "cache-control": "no-cache",
        "x-studywudy-static-build": LAUNCH_HOT_PATH_RELEASE,
        "user-agent": `StudyWudy ${LAUNCH_HOT_PATH_RELEASE} release builder`,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
    if (response.status !== 200) throw new Error(`${entry.publicPath} returned ${response.status}`);
    if (!(response.headers.get("content-type") || "").includes("text/html")) throw new Error(`${entry.publicPath} did not return HTML`);
    const html = await response.text();
    const failures = inspect(entry, html);
    if (failures.length) throw new Error(`${entry.publicPath}: ${failures.join("; ")}`);
    documents.push(Object.freeze({ entry, html }));
    console.log(`CAPTURE ${entry.publicPath}`);
  }
  return documents;
}

const mode = process.argv[2];
if (mode === "--check") {
  verifyFiles();
  console.log(`PASS: ${LAUNCH_HOT_PATH_DOCUMENTS.length} ${LAUNCH_HOT_PATH_RELEASE} documents`);
} else if (mode === "--write") {
  const originFlag = process.argv.indexOf("--origin");
  const origin = new URL(originFlag >= 0 ? process.argv[originFlag + 1] : "http://127.0.0.1:8789").origin;
  const documents = await fetchDocuments(origin);
  for (const { entry, html } of documents) {
    const path = outputPath(entry);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, html);
  }
  verifyFiles();
  console.log(`Wrote ${documents.length} ${LAUNCH_HOT_PATH_RELEASE} documents`);
} else {
  throw new Error("Usage: node scripts/build-launch-hot-path-static.mjs --write [--origin URL] | --check");
}
