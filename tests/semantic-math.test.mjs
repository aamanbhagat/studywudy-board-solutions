import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  evaluateQuestionFormulaAccessibility,
  extractFormulaSources,
  formulaRepresentations,
  repairCrawlerFormulaSource,
  renderSemanticMath,
  validateFormulaRepresentations,
} from "../semantic-math.mjs";

test("canonical formula representations preserve fractions, exponents and subscripts", () => {
  const half = formulaRepresentations("\\frac{1}{2}CV^2");
  assert.deepEqual(
    { source: half.source, spokenText: half.spokenText, plainText: half.plainText },
    { source: "\\frac{1}{2}CV^2", spokenText: "one half C V squared", plainText: "(1/2)CV²" },
  );
  assert.match(half.mathml, /<mfrac>/u);
  assert.match(half.mathml, /<msup>/u);
  assert.match(half.mathml, /encoding="application\/x-tex"/u);
  assert.match(half.mathml, /encoding="text\/plain"/u);

  assert.equal(formulaRepresentations("10^{-8}").plainText, "10⁻⁸");
  assert.equal(formulaRepresentations("t=\\frac{3}{4}d").plainText, "t = (3/4)d");
  const capacitors = formulaRepresentations("C_1+C_2");
  assert.equal(capacitors.plainText, "C₁ + C₂");
  assert.equal((capacitors.mathml.match(/<msub>/gu) || []).length, 2);
  assert.equal(formulaRepresentations("2\\,\\mathrm{mm}").plainText, "2 mm");
  const reaction = formulaRepresentations("2PbO(s) + C(s) -&gt; 2Pb(s) + CO_2(g)");
  assert.equal(reaction.plainText, "2PbO(s) + C(s) → 2Pb(s) + CO₂(g)");
  assert.doesNotMatch(reaction.mathml, /&amp;(?:amp;)?gt;/u);

  const dipole = formulaRepresentations("V_{\\text{equatorial}} = \\frac{1}{4\\pi\\varepsilon_0}\\frac{p\\cos 90^\\circ}{r^2} = 0");
  assert.equal(dipole.plainText, "V₍equatorial₎ = (1/4πε₀)(p cos 90°/r²) = 0");
});

test("repairs the verified dipole formula lost by the imported crawler label", () => {
  const repaired = repairCrawlerFormulaSource("V_equatorial = \\frac{1}{4\\pi _{0}}\\frac{p 90^}{r^{2}} = 0");
  assert.equal(repaired, "V_{\\text{equatorial}} = \\frac{1}{4\\pi\\varepsilon_0}\\frac{p\\cos 90^\\circ}{r^2} = 0");
  assert.equal(
    repairCrawlerFormulaSource("$$V_equatorial = \\frac{1}{4\\pi _{0}}\\frac{p 90^}{r^{2}} = 0$$"),
    repaired,
  );
  assert.equal(repairCrawlerFormulaSource("V_equatorial = (1)/(4π₀)(p 90^)/(r²) = 0"), repaired);
  assert.equal(formulaRepresentations(repaired).plainText, "V₍equatorial₎ = (1/4πε₀)(p cos 90°/r²) = 0");
});

test("the consistency gate rejects each crawler-visible corruption class", () => {
  const corrupt = (source, plainText) => validateFormulaRepresentations({
    ...formulaRepresentations(source),
    plainText,
  });

  assert.ok(corrupt("10^{-8}", "1 0−8").missing.includes("numeralsStayJoined"));
  assert.ok(corrupt("\\frac{1}{2}CV^2", "(2/1)CV²").missing.includes("fractionOrderPreserved"));
  assert.ok(corrupt("10^{-8}", "10").missing.includes("exponentPreserved"));
  assert.ok(corrupt("10^{-8}", "10-8").missing.includes("mathematicalMinusPreserved"));
  assert.ok(corrupt("2\\,\\mathrm{mm}", "2 m m").missing.includes("unitsStayJoined"));
  assert.ok(corrupt("I_0", "1₀").missing.includes("latinIIsNotOne"));
});

test("formula discovery and the question gate derive all three accessible forms", () => {
  const question = {
    prompt: "Find $t=\\frac{3}{4}d$ and compare $C_1+C_2$.",
    steps: [{ content: "Use $$U=\\frac{1}{2}CV^2$$." }],
  };
  assert.deepEqual(extractFormulaSources(question), [
    "t=\\frac{3}{4}d",
    "C_1+C_2",
    "U=\\frac{1}{2}CV^2",
  ]);
  const evaluation = evaluateQuestionFormulaAccessibility(question);
  assert.equal(evaluation.complete, true);
  assert.equal(evaluation.formulaCount, 3);
  assert.ok(evaluation.formulas.every((formula) => formula.source && formula.spokenText && formula.plainText && formula.mathml));
});

test("rendered semantic math stores source, spoken and plain forms beside MathML", () => {
  const markup = renderSemanticMath(formulaRepresentations("\\frac{1}{2}CV^2"), { visiblePlain: true });
  assert.match(markup, /data-math-source="\\frac\{1\}\{2\}CV\^2"/u);
  assert.match(markup, /data-math-spoken="one half C V squared"/u);
  assert.match(markup, /data-math-plain="\(1\/2\)CV²"/u);
  assert.match(markup, /<math[^>]+aria-label="one half C V squared"/u);
});

test("the Worker hides split visual glyphs from snippets and supplies semantic fallbacks", async () => {
  const source = await readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8");
  assert.match(source, /X-StudyWudy-Semantic-Math/u);
  assert.match(source, /data-nosnippet/u);
  assert.match(source, /renderSemanticMath\(representation\)/u);
  assert.match(source, /const original = element\.getAttribute\("data-math-source"\) \|\| ""/u);
  assert.match(source, /const source = repairCrawlerFormulaSource\(original\)/u);
  assert.match(source, /semantic-math\.js/u);
  assert.match(source, /textChunk\.replace\(repaired, \{ html: true \}\)/u);
});
