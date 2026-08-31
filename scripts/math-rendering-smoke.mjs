#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import {
  assertValidCrawlerText,
  extractCrawlerVisibleText,
} from "../crawler-visible-text.mjs";
import {
  CANONICAL_EQUATION_SOURCES,
  extractSemanticTokens,
  formulaRepresentations,
  invalidRenderedMathFound,
} from "../semantic-math.mjs";
import { LAUNCH_HOT_PATH_RELEASE } from "../launch-hot-path.mjs";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { isQuestionPubliclyEligible } from "../public-question-eligibility.mjs";
import { STUDY_CLUSTER_BASE } from "../study-cluster.mjs";
import { PRODUCTION_ORIGIN } from "./featured-study-route-smoke.mjs";

const questionTwo = `${STUDY_CLUSTER_BASE}/questions/q-msb-balbharati-physics-standard-12-8-002`;
const questionTen = `${STUDY_CLUSTER_BASE}/questions/q-msb-balbharati-physics-standard-12-8-010`;
const coulombsLawSource = "F=\\frac{1}{4\\pi\\varepsilon_0}\\frac{|q_1q_2|}{r^2}";
const coulombsSpoken = formulaRepresentations(coulombsLawSource).spokenText;
const sphericalShellWorkSource = "W=\\frac{Q^2}{8\\pi\\varepsilon_0}\\left(\\frac{1}{b}-\\frac{1}{a}\\right)";
const dielectricSlabCanonical = formulaRepresentations(CANONICAL_EQUATION_SOURCES.dielectricSlabRegionCapacitances);
const practicePath = `${STUDY_CLUSTER_BASE}/practice`;
const lrQuestionPath = "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/electromagnetic-induction/questions/q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-38-120";
const lrQuestionRowId = 62_208;
const transmissionQuestionPath = "/cbse/class-12/physics/ncert-exemplar-physics-exemplar-class-12/alternating-current/questions/q-cbse-ncert-exemplar-physics-exemplar-class-12-7-028";
const geometryQuestionPath = "/cbse/class-9/mathematics/ncert-mathematics-class-9/quadrilaterals/questions/q-cbse-ncert-mathematics-class-9-8-012";
const circlesQuestionPath = "/cbse/class-10/mathematics/ncert-exemplar-mathematics-exemplar-class-10/circles/questions/q-cbse-ncert-exemplar-mathematics-exemplar-class-10-9-037";
const lrRequiredTokens = Object.freeze(["ε", "R", "L", "t", "τ", "i", "Q", "W", "H", "U", "∫", "e"]);
const lrMagneticEnergySpoken = formulaRepresentations(String.raw`U_B=\frac12Li^2`).spokenText;
const transmissionOneWireSpoken = formulaRepresentations(String.raw`R_{\text{one}}=\frac{\rho l}{A}`).spokenText;
const transmissionLineSpoken = formulaRepresentations(String.raw`R_{\text{line}}=2R_{\text{one}}=2(2.16)\ \Omega=4.33\ \Omega`).spokenText;
const transmissionSubstitutionSpoken = formulaRepresentations(String.raw`P_{\text{loss},11000}=(90.91)^{2}(4.33)\ \text{W}`).spokenText;
const geometryRelations = Object.freeze([
  String.raw`AF\cap BD=P,\quad EC\cap BD=Q`,
  String.raw`AE\parallel FC`,
  String.raw`EC\parallel AF`,
  String.raw`EQ\parallel AP`,
  String.raw`FP\parallel CQ`,
].map((source) => formulaRepresentations(source)));

export const MATH_RENDERING_ROUTES = Object.freeze([
  STUDY_CLUSTER_BASE,
  `${STUDY_CLUSTER_BASE}/revision`,
  `${STUDY_CLUSTER_BASE}/concepts/coulombs-law`,
  questionTwo,
  questionTen,
  lrQuestionPath,
  transmissionQuestionPath,
  geometryQuestionPath,
  circlesQuestionPath,
  practicePath,
]);

function normalizeDeploymentUrl(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Deployment URL must use HTTP or HTTPS");
  return url.origin;
}

function startTags(value) {
  const html = String(value ?? "");
  const tags = [];
  for (let index = 0; index < html.length; index += 1) {
    if (html[index] !== "<" || !/[A-Za-z]/u.test(html[index + 1] || "")) continue;
    let quote = null;
    let end = index + 1;
    for (; end < html.length; end += 1) {
      const character = html[end];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") quote = character;
      else if (character === ">") break;
    }
    if (end < html.length) tags.push(html.slice(index, end + 1));
    index = end;
  }
  return tags;
}

function attribute(tag, name) {
  const match = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "u").exec(tag);
  return match?.[1] ?? match?.[2] ?? null;
}

function hasClass(tag, name) {
  return (attribute(tag, "class") || "").split(/\s+/u).includes(name);
}

function semanticMathStructure(html) {
  const tags = startTags(html);
  return Object.freeze({
    wrappers: Object.freeze(tags.filter((tag) => /^<span\b/iu.test(tag) && hasClass(tag, "math-semantic"))),
    plainFallbacks: Object.freeze(tags.filter((tag) => /^<span\b/iu.test(tag) && hasClass(tag, "math-plain-text"))),
    splitSemantics: Object.freeze(tags.filter((tag) => /^<span\b/iu.test(tag) && hasClass(tag, "math-semantic-only"))),
    mathml: Object.freeze(tags.filter((tag) => /^<math\b/iu.test(tag))),
  });
}

export function inspectMathRendering(pathname, html) {
  const crawlerText = extractCrawlerVisibleText(html);
  const failures = [];
  const invalidRenderedMath = invalidRenderedMathFound(`${html}\n${crawlerText}`);
  if (invalidRenderedMath.length) failures.push(`invalid rendered math: ${invalidRenderedMath.join(", ")}`);
  try {
    assertValidCrawlerText(crawlerText, pathname);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  const structure = semanticMathStructure(html);
  if (structure.wrappers.length !== structure.mathml.length) {
    failures.push("each equation wrapper must contain exactly one MathML object");
  }
  if (structure.mathml.some((tag) => attribute(tag, "role") !== "math" || !attribute(tag, "aria-label"))) {
    failures.push("every MathML object must have exactly one accessible math name");
  }
  if (structure.wrappers.some((tag) => attribute(tag, "role") || attribute(tag, "aria-label"))) {
    failures.push("an equation wrapper duplicates the MathML accessible name");
  }
  if (structure.plainFallbacks.length || structure.splitSemantics.length) {
    failures.push("an equation exposes a second plain or split semantic text tree");
  }
  if (/\bdata-math-(?:source|spoken|plain)=/iu.test(html)) {
    failures.push("duplicate or raw equation metadata is exposed in public HTML");
  }
  if (/<(?:span|div)\b[^>]*\bclass=["'][^"']*\bkatex(?:-display)?\b/iu.test(html)) {
    failures.push("a duplicate KaTeX glyph tree remains in public HTML");
  }
  if (/<annotation\b|application\/x-tex|encoding=["']text\/plain["']/iu.test(html)) {
    failures.push("textual MathML annotation is present");
  }
  if (/\$|\\(?:d?frac|tfrac|varepsilon|epsilon|pi|cdot|times|oint|vec|text|mathrm)\b|\*\*/u.test(crawlerText)) {
    failures.push("raw TeX or Markdown is crawler-visible");
  }
  if (/\bI mm\b/u.test(crawlerText)) {
    failures.push("OCR-corrupt unit is crawler-visible");
  }
  const coulombSemantics = structure.mathml.filter((tag) => attribute(tag, "aria-label") === coulombsSpoken).length;
  if ([STUDY_CLUSTER_BASE, `${STUDY_CLUSTER_BASE}/revision`, `${STUDY_CLUSTER_BASE}/concepts/coulombs-law`].includes(pathname)
    && coulombSemantics < 1) {
    failures.push("semantic Coulomb relation is missing");
  }
  if (pathname.endsWith("/concepts/coulombs-law") && coulombSemantics !== 1) {
    failures.push("Coulomb relation does not have exactly one equation representation");
  }
  if (pathname === questionTwo) {
    if (/4\\?_[{]?0|k\\?_[{]?0/u.test(html)) failures.push("malformed epsilon source remains in the document");
  }
  if (pathname === questionTwo) {
    if (structure.mathml.filter((tag) => attribute(tag, "aria-label") === dielectricSlabCanonical.spokenText).length !== 1) {
      failures.push("canonical dielectric-slab equation does not have one accessible semantic representation");
    }
  }
  if (pathname === questionTen) {
    const sphericalShellWorkSpoken = formulaRepresentations(sphericalShellWorkSource).spokenText;
    const workSemanticOccurrences = structure.mathml.filter((tag) => attribute(tag, "aria-label") === sphericalShellWorkSpoken).length;
    if (workSemanticOccurrences < 1) failures.push("correct spherical-shell work formula is missing");
    if (/Use\s+undefined\s+for\s+Electric potential/iu.test(crawlerText)) {
      failures.push("connected-resource formula label is unresolved");
    }
  }
  if (pathname === lrQuestionPath) {
    const pageSemanticTokens = new Set(structure.mathml.flatMap((tag) => extractSemanticTokens(attribute(tag, "aria-label") || "", { representation: "spoken" })));
    for (const token of lrRequiredTokens) {
      if (!pageSemanticTokens.has(token)) failures.push(`LR semantic token ${token} is missing`);
    }
    if (!structure.mathml.some((tag) => attribute(tag, "aria-label") === lrMagneticEnergySpoken)) {
      failures.push("LR magnetic-energy one-half formula is malformed or missing");
    }
  }
  if (pathname === transmissionQuestionPath) {
    const labels = structure.mathml.map((tag) => attribute(tag, "aria-label") || "");
    if (!labels.includes(transmissionOneWireSpoken)) failures.push("one-wire resistance identifier is missing or split");
    if (!labels.includes(transmissionLineSpoken)) failures.push("line-resistance formula or ohm units are missing");
    if (!labels.includes(transmissionSubstitutionSpoken)) failures.push("high-voltage loss substitution has malformed delimiters or exponent structure");
    if (!crawlerText.includes("Ω")) failures.push("ohm symbol is missing from crawler-visible transmission equations");
    if (/\{R\}_\{[ol]\}(?:ne|ine)|R[ₒₗ](?:ne|ine)|\\(?:left|right)\b/u.test(`${html} ${crawlerText}`)) {
      failures.push("malformed transmission-equation fragments remain");
    }
  }
  if (pathname === geometryQuestionPath) {
    const labels = structure.mathml.map((tag) => attribute(tag, "aria-label") || "");
    for (const relation of geometryRelations) {
      if (!labels.includes(relation.spokenText)) failures.push(`geometry relation is missing: ${relation.plainText}`);
    }
    if (!html.includes("<mo>∩</mo>")) failures.push("geometry intersections are not rendered as semantic operators");
    if (!html.includes("<mo>∥</mo>")) failures.push("geometry parallel relations are not rendered as semantic operators");
  }
  if (pathname === circlesQuestionPath) {
    if (!html.includes("<mo>∠</mo><mi>R</mi><mi>Q</mi><mi>S</mi>")) failures.push("angle RQS is not exposed as a semantic angle symbol");
    if (!html.includes("<mo>△</mo><mi>P</mi><mi>Q</mi><mi>R</mi>")) failures.push("triangle PQR is not exposed as a semantic triangle symbol");
    if (!html.includes("<mo>∥</mo>")) failures.push("parallel relation is missing from the Circles proof");
    if (/<mtext>(?:angle|triangle)<\/mtext>/iu.test(html)) failures.push("geometry words remain generic MathML text");
  }
  return Object.freeze({ pathname, crawlerText, failures: Object.freeze(failures) });
}

export async function smokeMathRendering({
  deploymentUrl = PRODUCTION_ORIGIN,
  fetchImpl = fetch,
  routes = MATH_RENDERING_ROUTES,
  timeoutMs = 30_000,
} = {}) {
  const origin = normalizeDeploymentUrl(deploymentUrl);
  const results = [];
  for (const pathname of routes) {
    const response = await fetchImpl(new URL(pathname, `${origin}/`), {
      method: "GET",
      redirect: "manual",
      headers: {
        accept: "text/html",
        "cache-control": "no-cache",
        "x-studywudy-static-build": LAUNCH_HOT_PATH_RELEASE,
        "user-agent": "StudyWudy math rendering deployment gate/1.0",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200) throw new Error(`${pathname} returned ${response.status}`);
    if (pathname === lrQuestionPath) {
      // This used to demand a literal "; complete". It was written when the gate
      // judged the raw answer; v15 judges applyQuestionEnrichmentForQuality(...),
      // which is the answer the Worker actually renders, and row 62208 has an
      // enrichment that fails semanticAnswer:basicGrammarAndReadability. So the
      // row is now correctly de-indexed and the literal was asserting a verdict
      // the corpus no longer supports - it failed the deploy as a math-rendering
      // bug when nothing about the math had changed.
      //
      // What is worth gating is that the deployed Worker and the deployed
      // manifest agree about this row, because that divergence is a real and
      // observed failure: the Worker imports semantic-math.mjs rather than
      // bundling it, so it can evaluate today's validators against a stale
      // bitset and serve noindex while the header claims complete. Deriving the
      // expectation catches that and survives a policy change, the same
      // treatment a7199151's drift forced onto the two tests that pinned
      // POLICY_VERSION as a literal.
      const indexable = isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, lrQuestionRowId);
      const expected = `${PHASE4_GATE_MANIFEST.policyVersion}; ${indexable ? "complete" : "incomplete"}`;
      const actual = response.headers.get("x-studywudy-publish-gate") || "";
      if (actual !== expected) {
        throw new Error(`${pathname} publish gate is "${actual}"; the deployed manifest says "${expected}"`);
      }
      // The robots directive is derived from the same boolean, so a page that
      // disagrees with its own header is drift the header alone cannot show.
      const robots = response.headers.get("x-robots-tag") || "";
      if (indexable !== !/\bnoindex\b/u.test(robots)) {
        throw new Error(`${pathname} serves "${robots}" while the manifest says indexable=${indexable}`);
      }
    }
    const result = inspectMathRendering(pathname, await response.text());
    if (result.failures.length) throw new Error(`${pathname}: ${result.failures.join("; ")}`);
    results.push(result);
  }
  return Object.freeze(results);
}

async function main() {
  const deploymentUrl = process.env.STUDYWUDY_DEPLOYMENT_URL || process.argv[2] || PRODUCTION_ORIGIN;
  const results = await smokeMathRendering({ deploymentUrl });
  for (const result of results) console.log(`PASS ${result.pathname}`);
  console.log(`Verified mathematical, accessible, and crawler-text rendering on ${results.length} deployment pages`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
