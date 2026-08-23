#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { extractCrawlerVisibleText } from "../crawler-visible-text.mjs";
import { CORPUS_QUALITY_POLICY_VERSION } from "../corpus-quality.mjs";
import { PRODUCTION_ORIGIN } from "./featured-study-route-smoke.mjs";

const CASES = Object.freeze([
  Object.freeze({
    name: "corrected Quadratic Equations chapter metadata",
    pathname: "/cbse/class-10/mathematics/ncert-exemplar-mathematics-exemplar-class-10/quadatric-euation",
    surface: "chapter",
    contains: /Quadratic Equations/u,
    excludes: /Quadatric/u,
  }),
  Object.freeze({
    name: "plate-separation chapter excerpt",
    pathname: "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electrostatics",
    surface: "chapter",
    excludes: /\bI mm\b/u,
  }),
  Object.freeze({
    name: "plate-separation atomic repair",
    pathname: "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electrostatics/questions/q-msb-balbharati-physics-standard-12-8-005",
    surface: "atomic",
    contains: /Reviewed import repair applied/u,
    excludes: /\bI mm\b/u,
    classification: "OCR/import corruption",
  }),
  Object.freeze({
    name: "capacitor epsilon equation repair",
    pathname: "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electrostatics/questions/q-msb-balbharati-physics-standard-12-8-002",
    surface: "atomic",
    contains: /Equation rendering repair applied/u,
    excludes: /(?:4|k)_\{0\}/u,
    classification: "equation-rendering defect",
  }),
  Object.freeze({
    name: "verified NCERT source typo atomic note",
    pathname: "/cbse/class-12/chemistry/ncert-exemplar-chemistry-exemplar-class-12/solid-states/questions/q-cbse-ncert-exemplar-chemistry-exemplar-class-12-1-042",
    surface: "atomic",
    contains: /Verified source typo retained/u,
    excludes: /positvely/u,
    classification: "source typo retained with note",
    snippetExcluded: true,
  }),
  Object.freeze({
    name: "NCERT source typo chapter excerpt",
    pathname: "/cbse/class-12/chemistry/ncert-exemplar-chemistry-exemplar-class-12/solid-states",
    surface: "chapter",
    excludes: /positvely/u,
    snippetExcluded: true,
  }),
  Object.freeze({
    name: "joined-word import atomic quarantine",
    pathname: "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/electric-field-and-potential/questions/q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-29-031",
    surface: "atomic",
    contains: /Imported wording under source review/u,
    excludes: /rfrom/u,
    classification: "OCR/import corruption",
    snippetExcluded: true,
    noindex: true,
  }),
  Object.freeze({
    name: "joined-unit import atomic quarantine",
    pathname: "/cisce/class-10/mathematics/frank-mathematics-part-2-class-10/problems-based-on-quadratic-equations/questions/q-cisce-frank-mathematics-part-2-class-10-6-042",
    surface: "atomic",
    contains: /Imported wording under source review/u,
    excludes: /rfrom/u,
    classification: "OCR/import corruption",
    snippetExcluded: true,
    noindex: true,
  }),
  Object.freeze({
    name: "joined-word import chapter excerpt",
    pathname: "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/electric-field-and-potential",
    surface: "chapter",
    excludes: /rfrom/u,
    snippetExcluded: true,
  }),
  Object.freeze({
    name: "hint import atomic quarantine",
    pathname: "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/friction/questions/q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-6-052",
    surface: "atomic",
    contains: /Imported wording under source review/u,
    excludes: /bye the/u,
    classification: "OCR/import corruption",
    snippetExcluded: true,
    noindex: true,
  }),
  Object.freeze({
    name: "hint import chapter excerpt",
    pathname: "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/friction",
    surface: "chapter",
    excludes: /bye the/u,
    snippetExcluded: true,
  }),
  Object.freeze({
    name: "duplicate-choice atomic quarantine",
    pathname: "/cbse/class-1/mathematics/ncert-math-magic-class-1/money/questions/q-cbse-ncert-math-magic-class-1-12-001",
    surface: "atomic",
    contains: /Duplicate options under source review/u,
    classification: "OCR/import corruption",
    snippetExcluded: true,
    noindex: true,
  }),
  Object.freeze({ name: "source typo excluded from search", pathname: "/search?q=positvely", surface: "search", excludes: /positvely/u }),
  Object.freeze({ name: "joined-word defects excluded from search", pathname: "/search?q=rfrom", surface: "search", excludes: /rfrom/u }),
  Object.freeze({ name: "hint defect excluded from search", pathname: "/search?q=bye%20the", surface: "search", excludes: /bye the/u }),
  Object.freeze({ name: "repaired plate separation in search", pathname: "/search?q=plate%20separation", surface: "search", contains: /1 mm/u, excludes: /\bI mm\b/u }),
  Object.freeze({
    name: "Gauss law chapter title and charge-density repair",
    pathname: "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/gausss-law",
    surface: "chapter",
    contains: /Gauss’s Law/u,
    excludes: /Gausss Law|density ρρ/u,
  }),
  Object.freeze({
    name: "charge-density atomic repair",
    pathname: "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/gausss-law/questions/q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-30-039",
    surface: "atomic",
    contains: /density ρ/u,
    excludes: /density ρρ/u,
    classification: "OCR/import corruption",
  }),
  Object.freeze({
    name: "semiconductor terminology and variable-spacing repair",
    pathname: "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/semiconductors-and-semiconductor-devices/questions/q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-45-013",
    surface: "atomic",
    contains: /charge carriers be n and the average drift speed/u,
    excludes: /charge carries|\bnand\b/u,
    classification: "OCR/import corruption",
  }),
  Object.freeze({
    name: "semiconductor charge-carriers repair",
    pathname: "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/semiconductors-and-semiconductor-devices/questions/q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-45-028",
    surface: "atomic",
    contains: /charge carriers/u,
    excludes: /charge carries/u,
    classification: "OCR/import corruption",
    payloadPolicy: "all-question-payload-pack-v3",
  }),
  Object.freeze({
    name: "electric-field spelling repair",
    pathname: "/cbse/class-12/physics/ncert-exemplar-physics-exemplar-class-12/electric-charges-and-fields/questions/q-cbse-ncert-exemplar-physics-exemplar-class-12-1-017",
    surface: "atomic",
    contains: /electric field everywhere/u,
    excludes: /elecric/u,
    classification: "OCR/import corruption",
  }),
  Object.freeze({
    name: "fixed-charges grammar repair",
    pathname: "/cbse/class-12/physics/ncert-exemplar-physics-exemplar-class-12/electric-charges-and-fields/questions/q-cbse-ncert-exemplar-physics-exemplar-class-12-1-030",
    surface: "atomic",
    contains: /two fixed charges/u,
    excludes: /two fixed charged/u,
  }),
  Object.freeze({ name: "charge-carriers search repair", pathname: "/search?q=charge%20carriers", surface: "search", contains: /charge carriers/u, excludes: /charge carries/u }),
  Object.freeze({ name: "electric-field search repair", pathname: "/search?q=electric%20field", surface: "search", contains: /electric field/u, excludes: /elecric/u }),
]);

const RAW_RENDERED_SYNTAX = /\*\*|\$\$|\\(?:frac|varepsilon|epsilon|text|mathrm|times)\b|<br\s*\/?>/iu;

function normalizedOrigin(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Deployment URL must use HTTP or HTTPS");
  return url.origin;
}

export function inspectCorpusQualityHtml(entry, html, headers = new Headers()) {
  const text = extractCrawlerVisibleText(html);
  const failures = [];
  if (RAW_RENDERED_SYNTAX.test(text)) failures.push("crawler-visible text exposes raw Markdown, HTML or TeX syntax");
  if (entry.contains && !entry.contains.test(text)) failures.push(`missing expected crawler text ${entry.contains}`);
  if (entry.excludes && entry.excludes.test(text)) failures.push(`crawler text exposes classified defect ${entry.excludes}`);
  if (entry.classification && !html.includes(`data-content-quality-classification="${entry.classification}"`)) {
    failures.push(`missing ${entry.classification} classification note`);
  }
  if (entry.snippetExcluded && !/\bdata-nosnippet(?:\s|=|>)/u.test(html)) failures.push("source quotation is not snippet-excluded");
  if (entry.noindex && !(headers.get("x-robots-tag") || "").includes("noindex")) failures.push("review-required question is not noindexed");
  if (entry.payloadPolicy && headers.get("x-studywudy-question-payload") !== entry.payloadPolicy) {
    failures.push(`missing bounded question payload policy ${entry.payloadPolicy}`);
  }
  return Object.freeze({ text, failures: Object.freeze(failures) });
}

export async function smokeCorpusQuality({
  deploymentUrl = PRODUCTION_ORIGIN,
  fetchImpl = fetch,
  cases = CASES,
  timeoutMs = 30_000,
} = {}) {
  const origin = normalizedOrigin(deploymentUrl);
  const results = [];
  for (const entry of cases) {
    const response = await fetchImpl(new URL(entry.pathname, `${origin}/`), {
      method: "GET",
      redirect: "manual",
      headers: {
        accept: "text/html",
        "cache-control": "no-cache",
        "user-agent": "StudyWudy corpus quality deployment gate/1.0",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200) throw new Error(`${entry.pathname} returned ${response.status}`);
    const marker = response.headers.get("x-studywudy-corpus-quality");
    if (marker !== CORPUS_QUALITY_POLICY_VERSION) throw new Error(`${entry.pathname} is missing the corpus-quality release marker`);
    const inspected = inspectCorpusQualityHtml(entry, await response.text(), response.headers);
    if (inspected.failures.length) throw new Error(`${entry.pathname}: ${inspected.failures.join("; ")}`);
    results.push(Object.freeze({ ...entry, ...inspected }));
  }
  return Object.freeze(results);
}

async function main() {
  const deploymentUrl = process.env.STUDYWUDY_DEPLOYMENT_URL || process.argv[2] || PRODUCTION_ORIGIN;
  const results = await smokeCorpusQuality({ deploymentUrl });
  for (const result of results) console.log(`PASS ${result.surface} ${result.pathname}`);
  console.log(`Verified ${results.length} atomic, chapter and search corpus-quality surfaces`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { CASES as CORPUS_QUALITY_SMOKE_CASES };
