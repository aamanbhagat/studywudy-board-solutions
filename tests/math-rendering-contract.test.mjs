import assert from "node:assert/strict";
import test from "node:test";

import {
  assertValidCrawlerText,
  extractCrawlerVisibleText,
  forbiddenCrawlerTextFound,
} from "../crawler-visible-text.mjs";
import {
  CANONICAL_EQUATION_SOURCES,
  compareSemanticEquationTokens,
  formulaRepresentations,
  repairCrawlerFormulaSource,
  repairMalformedFormulaText,
  renderMathText,
  renderSemanticMath,
} from "../semantic-math.mjs";
import { inspectMathRendering } from "../scripts/math-rendering-smoke.mjs";

const corruptCapacitorDerivation = String.raw`C_{1} = \frac{\varepsilon _{0} A}{d/4} = \frac{4_{0} A}{d}, C_{2} = \frac{k_{0} A}{3d/4} = \frac{4k_{0} A}{3d}`;
const correctedCapacitorDerivation = String.raw`C_{1} = \frac{\varepsilon_0 A}{d/4} = \frac{4\varepsilon_0 A}{d}, C_{2} = \frac{k\varepsilon_0 A}{3d/4} = \frac{4k\varepsilon_0 A}{3d}`;
const coulombsLaw = String.raw`F=\frac{1}{4\pi\varepsilon_0}\frac{|q_1q_2|}{r^2}`;
const sphericalShellWork = String.raw`W=\frac{Q^2}{8\pi\varepsilon_0}\left(\frac{1}{b}-\frac{1}{a}\right)`;

test("mathematical correctness repairs the verified capacitor derivation before parsing", () => {
  assert.equal(
    repairCrawlerFormulaSource(corruptCapacitorDerivation),
    CANONICAL_EQUATION_SOURCES.dielectricSlabRegionCapacitances,
  );
  assert.equal(
    formulaRepresentations(corruptCapacitorDerivation).plainText,
    "C₁ = (ε₀A/(d/4)) = (4ε₀A/d), C₂ = (kε₀A/(3d/4)) = (4kε₀A/(3d))",
  );
  assert.equal(
    formulaRepresentations(corruptCapacitorDerivation).source,
    CANONICAL_EQUATION_SOURCES.dielectricSlabRegionCapacitances,
  );
  assert.equal(
    formulaRepresentations(correctedCapacitorDerivation).source,
    CANONICAL_EQUATION_SOURCES.dielectricSlabRegionCapacitances,
  );
  assert.equal(
    repairCrawlerFormulaSource("C₁ = (₀ A)/(d/4) = (4₀ A)/(d), C₂ = (k₀ A)/(3d/4) = (4k₀ A)/(3d)"),
    "C₁ = (ε₀ A)/(d/4) = (4ε₀ A)/(d), C₂ = (kε₀ A)/(3d/4) = (4kε₀ A)/(3d)",
  );
});

test("verified capacitor coefficients retain epsilon across the full chapter", () => {
  assert.equal(
    formulaRepresentations(String.raw`C_i=\frac{k_{0} A}{d/3}=\frac{3k_{0} A}{d}`).plainText,
    "Cᵢ = (kε₀A/(d/3)) = (3kε₀A/d)",
  );
  assert.equal(repairMalformedFormulaText("C₁ = 3₀A/d and C₂ = k₀A/d"), "C₁ = 3ε₀A/d and C₂ = kε₀A/d");
});

test("plain scientific notation is normalized before public rendering", () => {
  const markup = renderMathText("Option A: 1.78 × 10^(-8)C");
  assert.equal(markup, "Option A: 1.78 × 10⁻⁸C");
  assert.doesNotMatch(markup, /\^\(|1 0[−-]8/u);
});

test("the reviewed spherical-shell formula restores epsilon before every representation is derived", () => {
  const corrupt = String.raw`W = \frac{Q^{2}}{8\pi _{0}}(\frac{1}{b}-\frac{1}{a})`;
  assert.equal(
    formulaRepresentations(corrupt).plainText,
    "W = (Q²/8πε₀)((1/b) − (1/a))",
  );
  assert.equal(compareSemanticEquationTokens(sphericalShellWork, "W = (Q²/8π₀)((1/b) − (1/a))").complete, false);
  assert.equal(compareSemanticEquationTokens(sphericalShellWork, "W = (Q²/8πε₀)((1/b) − (1/a))").complete, true);
});

test("visual correctness uses one authoritative MathML tree", () => {
  const representation = formulaRepresentations(coulombsLaw);
  const markup = renderSemanticMath(representation, { visiblePlain: true });
  assert.match(markup, /class="math math-semantic math-visible"/u);
  assert.equal((markup.match(/<math\b/gu) || []).length, 1);
  assert.doesNotMatch(markup, /math-plain-text|math-semantic-only|data-nosnippet/u);
  assert.doesNotMatch(markup, /data-math-(?:source|spoken|plain)=/u);
});

test("accessible correctness exposes labelled MathML without textual TeX annotations", () => {
  const representation = formulaRepresentations(coulombsLaw);
  assert.match(representation.mathml, /^<math[^>]+role="math"[^>]+aria-label="[^"]+">/u);
  assert.match(representation.mathml, /<mfrac>/u);
  assert.match(representation.mathml, /<msub>/u);
  assert.doesNotMatch(representation.mathml, /<annotation\b|application\/x-tex|encoding="text\/plain"/iu);
});

test("basic extracted text receives one equation tree rather than a plain-plus-MathML duplicate", () => {
  const markup = renderSemanticMath(formulaRepresentations(coulombsLaw), { visiblePlain: true });
  const text = extractCrawlerVisibleText(`<body>${markup}</body>`);
  assert.equal(text, "F = 1 4 π ε 0 | q 1 q 2 | r 2");
  assert.equal((text.match(/\bF\b/gu) || []).length, 1);
  assert.doesNotMatch(text, /\$\$?|\\frac|\\varepsilon|<br\s*\/?>|\*\*/u);
  assert.doesNotMatch(text, /1 0[−-]8|\bC 1\b/u);
});

test("deployment inspection rejects public source attributes and duplicate visual trees", () => {
  const valid = renderSemanticMath(formulaRepresentations(coulombsLaw), { visiblePlain: true });
  assert.deepEqual(inspectMathRendering("/fixture", `<body>${valid}</body>`).failures, []);

  const rawMetadata = valid.replace('class="math math-semantic math-visible"', 'class="math math-semantic math-visible" data-math-source="F=\\frac{1}{r^2}"');
  assert.ok(inspectMathRendering("/fixture", `<body>${rawMetadata}</body>`).failures.includes(
    "duplicate or raw equation metadata is exposed in public HTML",
  ));

  const duplicateGlyphTree = `<body>${valid}</body>`.replace("</span></body>", '<span class="katex"><span>1 0−8</span></span></span></body>');
  const duplicateFailures = inspectMathRendering("/fixture", duplicateGlyphTree).failures;
  assert.ok(duplicateFailures.includes("a duplicate KaTeX glyph tree remains in public HTML"));

  const rawMathCommand = `<body>${valid}<p>\\mathrm{C}</p></body>`;
  assert.ok(inspectMathRendering("/fixture", rawMathCommand).failures.includes("raw TeX or Markdown is crawler-visible"));
});

test("the LR deployment check requires every reported semantic token and the one-half energy formula", () => {
  const lrPath = "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/electromagnetic-induction/questions/q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-38-120";
  const balance = renderSemanticMath(formulaRepresentations(String.raw`Q=\int_0^t i\,dt,\quad \tau=L/R,\quad W=H+U,\quad i=\frac{\varepsilon}{R}(1-e^{-t/\tau})`), { visiblePlain: true });
  const magneticEnergy = renderSemanticMath(formulaRepresentations(String.raw`U_B=\frac12Li^2`), { visiblePlain: true });
  assert.deepEqual(inspectMathRendering(lrPath, `<body>${balance}${magneticEnergy}</body>`).failures, []);
  const lostEpsilon = balance.replaceAll("epsilon", "missing-symbol").replaceAll("ε", "");
  assert.ok(inspectMathRendering(lrPath, `<body>${lostEpsilon}${magneticEnergy}</body>`).failures.includes("LR semantic token ε is missing"));
});

test("the transmission deployment check preserves complete resistance identifiers and ohm units", () => {
  const path = "/cbse/class-12/physics/ncert-exemplar-physics-exemplar-class-12/alternating-current/questions/q-cbse-ncert-exemplar-physics-exemplar-class-12-7-028";
  const oneWire = renderSemanticMath(formulaRepresentations(String.raw`R_{\text{one}}=\frac{\rho l}{A}`), { visiblePlain: true });
  const line = renderSemanticMath(formulaRepresentations(String.raw`R_{\text{line}}=2R_{\text{one}}=2(2.16)\ \Omega=4.33\ \Omega`), { visiblePlain: true });
  const substitution = renderSemanticMath(formulaRepresentations(String.raw`P_{\text{loss},11000}=(90.91)^{2}(4.33)\ \text{W}`), { visiblePlain: true });
  assert.deepEqual(inspectMathRendering(path, `<body>${oneWire}${line}${substitution}</body>`).failures, []);
  const malformed = `${oneWire}${line}${substitution}<p>{R}_{o}ne Rₗine \\left\\right</p>`;
  assert.ok(inspectMathRendering(path, `<body>${malformed}</body>`).failures.some((failure) => failure.includes("malformed")));
});

test("the geometry deployment check preserves intersection and parallel operators", () => {
  const path = "/cbse/class-9/mathematics/ncert-mathematics-class-9/quadrilaterals/questions/q-cbse-ncert-mathematics-class-9-8-012";
  const relations = [
    String.raw`AF\cap BD=P,\quad EC\cap BD=Q`,
    String.raw`AE\parallel FC`,
    String.raw`EC\parallel AF`,
    String.raw`EQ\parallel AP`,
    String.raw`FP\parallel CQ`,
  ].map((source) => renderSemanticMath(formulaRepresentations(source), { visiblePlain: true })).join("");
  assert.deepEqual(inspectMathRendering(path, `<body>${relations}</body>`).failures, []);
  const lostOperators = relations.replaceAll("∩", "").replaceAll("∥", "");
  const failures = inspectMathRendering(path, `<body>${lostOperators}</body>`).failures;
  assert.ok(failures.includes("geometry intersections are not rendered as semantic operators"));
  assert.ok(failures.includes("geometry parallel relations are not rendered as semantic operators"));
});

test("crawler extraction respects greater-than signs inside quoted attributes", () => {
  const markup = '<span class="math" title="a > b"><span>a &gt; b</span></span>';
  assert.equal(extractCrawlerVisibleText(markup), "a > b");
});

test("the rendered-text gate hard-fails unresolved values, malformed formulas and raw TeX", () => {
  const bad = "undefined NaN [object Object] 8π₀ 4₀A k₀A {R}_{o}ne {R}_{l}ine Rₒne Rₗine \\left\\right \\right\\left \\frac $$";
  assert.deepEqual(forbiddenCrawlerTextFound(bad), [
    "undefined", "NaN", "[object Object]", "8π₀", "4₀A", "k₀A", "{R}_{o}ne", "{R}_{l}ine",
    "Rₒne", "Rₗine", "\\left\\right", "\\right\\left", "\\frac", "$$",
  ]);
  assert.throws(() => assertValidCrawlerText(bad, "fixture"), /invalid rendered text/u);
  assert.equal(assertValidCrawlerText("W = (Q²/8πε₀)((1/b) − (1/a))"), true);
});
