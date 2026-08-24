import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  assertRepresentationPreservesTokens,
  buildCanonicalFormulaLookup,
  canonicalFormulaForLegacyLabel,
  evaluateQuestionFormulaAccessibility,
  extractSemanticTokens,
  extractFormulaSources,
  formulaRepresentations,
  invalidRenderedMathFound,
  repairCrawlerFormulaSource,
  renderSemanticMath,
  renderMathText,
  SEMANTIC_MATH_STYLES,
  validateFormulaStructure,
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
  assert.match(half.mathml, /aria-label="one half C V squared"/u);
  assert.doesNotMatch(half.mathml, /<annotation\b|application\/x-tex|encoding="text\/plain"/iu);

  assert.equal(formulaRepresentations("10^{-8}").plainText, "10⁻⁸");
  assert.equal(formulaRepresentations("t=\\frac{3}{4}d").plainText, "t = (3/4)d");
  const capacitors = formulaRepresentations("C_1+C_2");
  assert.equal(capacitors.plainText, "C₁ + C₂");
  assert.equal((capacitors.mathml.match(/<msub>/gu) || []).length, 2);
  assert.equal(formulaRepresentations("2\\,\\mathrm{mm}").plainText, "2 mm");
  assert.equal(formulaRepresentations("U_B=\\frac12Li^2").plainText, "U₍B₎ = (1/2)Li²");
  const reaction = formulaRepresentations("2PbO(s) + C(s) -&gt; 2Pb(s) + CO_2(g)");
  assert.equal(reaction.plainText, "2PbO(s) + C(s) → 2Pb(s) + CO₂(g)");
  assert.doesNotMatch(reaction.mathml, /&amp;(?:amp;)?gt;/u);

  const dipole = formulaRepresentations("V_{\\text{equatorial}} = \\frac{1}{4\\pi\\varepsilon_0}\\frac{p\\cos 90^\\circ}{r^2} = 0");
  assert.equal(dipole.plainText, "V₍equatorial₎ = (1/4πε₀)(p cos 90°/r²) = 0");
});

test("matrix environments render as accessible MathML tables without leaking TeX commands", () => {
  const squareMatrix = formulaRepresentations(String.raw`\left[\begin{matrix}{1}&-{1}&{2}\\-{2}&{3}&{5}\\-{2}&{0}&-{1}\end{matrix}\right]`);
  assert.equal((squareMatrix.mathml.match(/<mtr>/gu) || []).length, 3);
  assert.equal((squareMatrix.mathml.match(/<mtd>/gu) || []).length, 9);
  assert.match(squareMatrix.mathml, /<mtable class="math-matrix-table">/u);
  assert.match(squareMatrix.mathml, /<mo>\[<\/mo><mrow><mtable class="math-matrix-table">/u);
  assert.match(squareMatrix.mathml, /<\/mtable><\/mrow><mo>\]<\/mo>/u);
  assert.equal(squareMatrix.plainText, "[1, −1, 2; −2, 3, 5; −2, 0, −1]");
  assert.match(squareMatrix.spokenText, /three by three matrix; row one: one, minus one, two/u);
  assert.doesNotMatch(`${squareMatrix.plainText}\n${squareMatrix.spokenText}\n${squareMatrix.mathml}`, /begin|end|bmatrix|vmatrix/iu);
  assert.equal(validateFormulaRepresentations(squareMatrix).complete, true);

  const bracketMatrix = formulaRepresentations(String.raw`A=\begin{bmatrix}1&2\\3&4\end{bmatrix}`);
  assert.equal(bracketMatrix.plainText, "A = [1, 2; 3, 4]");
  assert.match(bracketMatrix.mathml, /<mo fence="true" stretchy="true">\[<\/mo><mtable class="math-matrix-table">/u);
  assert.match(bracketMatrix.mathml, /<\/mtable><mo fence="true" stretchy="true">\]<\/mo>/u);

  const determinant = formulaRepresentations(String.raw`\begin{vmatrix}a&b\\c&d\end{vmatrix}`);
  assert.equal(determinant.plainText, "|a, b; c, d|");
  assert.match(determinant.spokenText, /two by two determinant/u);
  assert.equal((determinant.mathml.match(/fence="true"/gu) || []).length, 2);
  assert.match(determinant.mathml, /<mtable class="math-matrix-table">/u);
  assert.equal(validateFormulaRepresentations(determinant).complete, true);
  assert.match(SEMANTIC_MATH_STYLES, /\.math-matrix-table>mtr>mtd\{padding:\.18em \.42em\}/u);
});

test("matrix imports with comma-separated cells and piecewise cases become real tables", () => {
  const imported = formulaRepresentations(String.raw`\left[\begin{matrix}{1},-{1},{2}\\-{2},{3},{5}\\-{2},{0},-{1}\end{matrix}\right]`);
  assert.equal((imported.mathml.match(/<mtd>/gu) || []).length, 9);
  assert.equal(imported.plainText, "[1, −1, 2; −2, 3, 5; −2, 0, −1]");

  const cases = formulaRepresentations(String.raw`f(x)=\begin{cases}x&x>0\\0&x=0\end{cases}`);
  assert.equal((cases.mathml.match(/<mtr>/gu) || []).length, 2);
  assert.equal((cases.mathml.match(/<mtd>/gu) || []).length, 4);
  assert.match(cases.mathml, /<mo fence="true" stretchy="true">\{<\/mo><mtable>/u);
  assert.match(cases.spokenText, /two by two piecewise expression/u);
  assert.doesNotMatch(`${cases.plainText}\n${cases.mathml}`, /begin|end|cases/iu);

  const multilineInline = renderMathText(String.raw`$\begin{aligned}
x&=1\\
y&=2
\end{aligned}$`);
  assert.match(multilineInline, /<mtable>/u);
  assert.doesNotMatch(multilineInline, /\\begin|\\end|begin\s*aligned|end\s*aligned/iu);

  const embeddedBareArray = renderMathText(String.raw`Use the following values: \begin{array}{cc}x&1\\y&2\end{array}.`);
  assert.match(embeddedBareArray, /Use the following values:/u);
  assert.match(embeddedBareArray, /<mtable>/u);
  assert.doesNotMatch(embeddedBareArray, /\\begin|\\end|begin\s*array|end\s*array/iu);

  const rowSpacing = formulaRepresentations(String.raw`\begin{array}{c}1\\[-2pt]2\\[4pt]3\end{array}`);
  assert.equal((rowSpacing.mathml.match(/<mtr>/gu) || []).length, 3);
  assert.equal(rowSpacing.plainText, "1; 2; 3");
  assert.doesNotMatch(rowSpacing.plainText, /pt|\[/u);
});

test("semantic-token round trips preserve the complete LR identifier and operator set", () => {
  const canonical = String.raw`Q=\int_0^t i\,dt,\quad \tau=L/R,\quad W=H+U,\quad i=\frac{\varepsilon}{R}(1-e^{-t/\tau})`;
  const representation = formulaRepresentations(canonical);
  const requiredTokens = extractSemanticTokens(canonical);
  for (const token of ["ε", "R", "L", "t", "τ", "i", "Q", "W", "H", "U", "∫", "e"]) {
    assert.ok(requiredTokens.includes(token), `missing canonical token ${token}`);
  }
  assert.equal(assertRepresentationPreservesTokens(representation.plainText, requiredTokens, { representation: "plain" }).complete, true);
  assert.equal(assertRepresentationPreservesTokens(representation.spokenText, requiredTokens, { representation: "spoken" }).complete, true);
  assert.equal(assertRepresentationPreservesTokens(representation.mathml, requiredTokens, { representation: "mathml" }).complete, true);

  const lost = validateFormulaRepresentations({
    ...representation,
    plainText: representation.plainText.replaceAll("ε", "").replaceAll("∫", ""),
    spokenText: representation.spokenText.replaceAll("epsilon", "").replaceAll("integral", ""),
    mathml: representation.mathml.replaceAll("ε", "").replaceAll("∫", ""),
  });
  assert.ok(lost.tokenFailures.plain.includes("ε"));
  assert.ok(lost.tokenFailures.plain.includes("∫"));
  assert.ok(lost.missing.includes("mathmlSemanticTokensPreserved"));
});

test("geometry relations preserve intersection, parallel and delimiter semantics in every representation", () => {
  const sources = [
    String.raw`AF\cap BD=P`,
    String.raw`EC\cap BD=Q`,
    String.raw`AE\parallel FC`,
    String.raw`EC\parallel AF`,
    String.raw`EQ\parallel AP`,
    String.raw`FP\parallel CQ`,
  ];
  for (const source of sources) {
    const representation = formulaRepresentations(source);
    const validation = validateFormulaRepresentations(representation);
    assert.equal(validation.complete, true, `${source}: ${validation.missing.join(", ")}`);
    if (source.includes("\\cap")) {
      assert.match(representation.plainText, /∩/u);
      assert.match(representation.spokenText, /intersection/u);
      assert.match(representation.mathml, /<mo>∩<\/mo>/u);
    } else {
      assert.match(representation.plainText, /∥/u);
      assert.match(representation.spokenText, /is parallel to/u);
      assert.match(representation.mathml, /<mo>∥<\/mo>/u);
    }
  }
});

test("legacy math labels are reconciled to the canonical formula before MathML rendering", () => {
  const canonical = String.raw`Q=\int_0^t i\,dt,\qquad W_{B}=\varepsilon Q`;
  const lookup = buildCanonicalFormulaLookup({ steps: [{ formula: canonical }] });
  const recovered = canonicalFormulaForLegacyLabel(lookup, "Q = ₀^t i dt, W_B = Q");
  assert.ok(recovered);
  assert.equal(recovered.source, canonical);
  assert.match(recovered.mathml, />∫</u);
  assert.match(recovered.mathml, />ε</u);
  assert.match(recovered.spokenText, /integral/u);
  assert.match(recovered.spokenText, /epsilon/u);
});

test("legacy transmission labels reconcile to canonical identifiers and ohm units", () => {
  const source = String.raw`R_{\text{line}}=2R_{\text{one}}=2(2.16)\ \Omega=4.33\ \Omega`;
  const lookup = buildCanonicalFormulaLookup({ steps: [{ formula: source }] });
  const recovered = canonicalFormulaForLegacyLabel(lookup, "Rₗine = 2Rₒne = 2(2.16) = 4.33");
  assert.ok(recovered);
  assert.equal(
    recovered.spokenText,
    "R sub line equals two R sub one equals two ( two point one six ) ohm equals four point three three ohm",
  );
  assert.equal(
    canonicalFormulaForLegacyLabel(lookup, String.raw`{R}_{l}ine=2{R}_{o}ne=2(2.16)=4.33`)?.source,
    source,
  );
});

test("legacy geometry labels recover dropped intersection and parallel operators", () => {
  const intersection = String.raw`AF\cap BD=P`;
  const parallel = String.raw`AE\parallel FC`;
  const lookup = buildCanonicalFormulaLookup({ steps: [{ formula: intersection }, { formula: parallel }] });
  assert.equal(canonicalFormulaForLegacyLabel(lookup, "A F B D equals P")?.source, intersection);
  assert.equal(canonicalFormulaForLegacyLabel(lookup, "A E F C")?.source, parallel);
});

test("combined geometry proof statements keep logical operators and prose as MathML text", () => {
  const statements = [
    [
      String.raw`AE\parallel FC\ \text{and}\ AE=FC\Rightarrow AECF\ \text{is a parallelogram}`,
      "AEFCandAE=FCAECFisaparallelogram",
    ],
    [
      String.raw`BQ=QP\ \text{and}\ DP=PQ\implies BQ=QP=PD`,
      "BQ=QPandDP=PQBQ=QP=PD",
    ],
  ];
  for (const [source, lossyLegacyLabel] of statements) {
    const representation = formulaRepresentations(source);
    assert.equal(validateFormulaRepresentations(representation).complete, true);
    assert.match(representation.mathml, /<mtext>and<\/mtext>/u);
    assert.match(representation.mathml, /<mo>⇒<\/mo>/u);
    assert.doesNotMatch(representation.mathml, /<mi>a<\/mi><mi>n<\/mi><mi>d<\/mi>/u);
    assert.equal(canonicalFormulaForLegacyLabel(buildCanonicalFormulaLookup({ formula: source }), lossyLegacyLabel)?.source, source);
  }
});

test("logical equivalence commands and bare TeX lines render without command leakage", () => {
  const source = String.raw`\sim(p \vee q) \vee (\sim p \wedge q) \equiv {\sim p}`;
  const representation = formulaRepresentations(source);
  assert.equal(representation.plainText, "∼ (p ∨ q) ∨ (∼ p ∧ q) ≡ ∼ p");
  assert.match(representation.mathml, /<mo>∼<\/mo>/u);
  assert.match(representation.mathml, /<mo>∨<\/mo>/u);
  assert.match(representation.mathml, /<mo>∧<\/mo>/u);
  assert.match(representation.mathml, /<mo>≡<\/mo>/u);
  assert.doesNotMatch(representation.mathml, /<mtext>\\?(?:sim|vee|wedge|equiv)<\/mtext>/u);
  assert.equal(validateFormulaRepresentations(representation).complete, true);

  const bareLine = renderMathText(String.raw`(\sim p \wedge \sim q) \vee (\sim p \wedge q)`);
  assert.match(bareLine, /<math\b/u);
  assert.doesNotMatch(bareLine, /\\(?:sim|vee|wedge)\b/u);

  const styled = formulaRepresentations(String.raw`\mathbf{T}\qquad\textbf{[RHS]}`);
  assert.match(styled.mathml, /mathvariant="bold"/u);
  assert.match(styled.mathml, /<mtext>\[RHS\]<\/mtext>/u);
  assert.doesNotMatch(styled.mathml, /<mtext>\\?(?:mathbf|textbf)<\/mtext>/u);
});

test("legacy degree labels map back to canonical angle formulae instead of placeholders", () => {
  const source = String.raw`\angle RQS=180^\circ-\angle QRS-\angle QSR=180^\circ-75^\circ-75^\circ=30^\circ`;
  const lookup = buildCanonicalFormulaLookup({ formula: source });
  assert.equal(canonicalFormulaForLegacyLabel(lookup, "RQS=180^- QRS- QSR=180^-75^-75^=30^")?.source, source);
});

test("strict equation parsing rejects structurally impossible formulae", () => {
  for (const source of [
    String.raw`\frac{{}^{2}}`,
    String.raw`\left(\right`,
    "E = ",
    String.raw`_0^t i\,dt`,
    String.raw`\frac{}{R}`,
    String.raw`\frac{E}{}`,
    String.raw`{R}_{o}ne=2.16\ \Omega`,
    String.raw`{R}_{l}ine=4.33\ \Omega`,
    String.raw`\left\right`,
    String.raw`AF\text{cap}BD=P`,
    String.raw`Q=\left)`,
    String.raw`Q=\right(`,
  ]) assert.equal(validateFormulaStructure(source).complete, false, source);
  assert.equal(validateFormulaStructure(String.raw`E=\int_0^t i\,dt`).complete, true);
  assert.equal(validateFormulaStructure(String.raw`R_{\text{one}}=2.16\ \Omega`).complete, true);
  assert.equal(validateFormulaStructure(String.raw`R_{\text{line}}=4.33\ \Omega`).complete, true);
});

test("invalid rendered-math patterns and altered MathML fail closed", () => {
  assert.deepEqual(invalidRenderedMathFound(String.raw`AF\text{cap}BD=P`), ["textCommandUsedForIntersection"]);
  assert.deepEqual(invalidRenderedMathFound(String.raw`Q=\left)`), ["leftCommandBeforeClosingDelimiter"]);
  assert.deepEqual(invalidRenderedMathFound(String.raw`Q=\right(`), ["rightCommandBeforeOpeningDelimiter"]);
  assert.deepEqual(invalidRenderedMathFound(String.raw`\frac{}{R}`), ["emptyFractionNumerator"]);
  assert.deepEqual(invalidRenderedMathFound(String.raw`\frac{E}{}`), ["emptyFractionDenominator"]);
  const valid = formulaRepresentations(String.raw`AE\parallel FC`);
  const corrupted = validateFormulaRepresentations({ ...valid, mathml: valid.mathml.replaceAll("∥", "") });
  assert.equal(corrupted.complete, false);
  assert.ok(corrupted.missing.includes("sourceDerivedMathml"));
  assert.ok(corrupted.missing.includes("mathmlSemanticTokensPreserved"));
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

test("rendered semantic math exposes one labelled and visually authoritative MathML object", () => {
  const markup = renderSemanticMath(formulaRepresentations("\\frac{1}{2}CV^2"), { visiblePlain: true });
  assert.doesNotMatch(markup, /data-math-(?:source|spoken|plain)=/u);
  assert.doesNotMatch(markup, /\\frac|\$\$?/u);
  assert.doesNotMatch(markup, /math-plain-text|math-semantic-only|data-nosnippet/u);
  assert.match(markup, /<math[^>]+role="math"[^>]+aria-label="one half C V squared"/u);
  assert.equal((markup.match(/<math\b/gu) || []).length, 1);
  assert.equal((markup.match(/\baria-label=/gu) || []).length, 1);
  assert.equal((markup.match(/>\(1\/2\)CV²</gu) || []).length, 0);
});

test("bare boxed final answers are discovered and rendered as semantic math", () => {
  const source = String.raw`\boxed{\frac{2}{7}}`;
  const evaluation = evaluateQuestionFormulaAccessibility({ finalAnswer: source });
  assert.equal(evaluation.formulaCount, 1);
  assert.equal(evaluation.complete, true);
  const html = renderMathText(source);
  assert.match(html, /<math\b/u);
  assert.match(html, /<mfrac>/u);
  assert.doesNotMatch(html, /\\(?:boxed|frac)/u);
});

test("labelled inline equations are evaluated once without treating their prose line as bare TeX", () => {
  const question = {
    finalAnswer: {
      blocks: [{
        text: String.raw`(a) $\text{Green plants} \rightarrow \text{rabbit} \rightarrow \text{fox} \rightarrow \text{lion}$`,
      }],
    },
  };
  const evaluation = evaluateQuestionFormulaAccessibility(question);
  assert.equal(evaluation.formulaCount, 1);
  assert.equal(evaluation.complete, true);
  assert.equal(evaluation.formulas[0].source, String.raw`\text{Green plants} \rightarrow \text{rabbit} \rightarrow \text{fox} \rightarrow \text{lion}`);
});

test("geometry words inside TeX text commands become semantic geometry symbols", () => {
  const angle = formulaRepresentations(String.raw`\text{angle}RQS={30}^{\circ}`);
  const triangle = formulaRepresentations(String.raw`\text{triangle}PQR`);
  const parallel = formulaRepresentations(String.raw`RS\parallel PQ`);
  assert.equal(angle.plainText, "∠RQS = 30°");
  assert.equal(triangle.plainText, "△PQR");
  assert.equal(parallel.plainText, "RS ∥ PQ");
  assert.match(angle.mathml, /<mo>∠<\/mo><mi>R<\/mi><mi>Q<\/mi><mi>S<\/mi>/u);
  assert.match(triangle.mathml, /<mo>△<\/mo><mi>P<\/mi><mi>Q<\/mi><mi>R<\/mi>/u);
  assert.match(parallel.mathml, /<mo>∥<\/mo>/u);
  assert.doesNotMatch(`${angle.mathml}${triangle.mathml}`, /<mtext>(?:angle|triangle)<\/mtext>/u);
  assert.equal(validateFormulaRepresentations(angle).complete, true);
  assert.equal(validateFormulaRepresentations(triangle).complete, true);
});

test("shared rich-text rendering derives every route's equation markup from the semantic renderer", () => {
  const markup = renderMathText("Use $$C_1=\\frac{\\varepsilon_0A}{d}$$ when $d>0$.");
  assert.equal((markup.match(/<math\b/gu) || []).length, 2);
  assert.doesNotMatch(markup, /math-plain-text|math-semantic-only/u);
  assert.doesNotMatch(markup, /data-math-(?:source|spoken|plain)=/u);
  assert.doesNotMatch(markup, />\$\$|>\$/u);
});

test("shared rich-text rendering converts nested Markdown emphasis without leaking markers", () => {
  const markup = renderMathText("The diagram illustrates a **dicot seed (bean – *Phaseolus vulgaris*)** in two views.");
  assert.equal(
    markup,
    "The diagram illustrates a <strong>dicot seed (bean – <em>Phaseolus vulgaris</em>)</strong> in two views.",
  );
  assert.doesNotMatch(markup, /\*Phaseolus vulgaris\*/u);
  assert.equal(renderMathText("***Important***"), "<strong><em>Important</em></strong>");
});

test("shared emphasis rendering preserves multiplication, identifiers, escaped markers and safe HTML", () => {
  assert.equal(renderMathText("a*b*c and seed_coat_type"), "a*b*c and seed_coat_type");
  assert.equal(renderMathText(String.raw`\*literal\*`), "&#42;literal&#42;");
  assert.equal(renderMathText("<script>*safe*</script>"), "&lt;script&gt;<em>safe</em>&lt;/script&gt;");
});

test("Markdown emphasis may safely wrap semantic mathematics", () => {
  const markup = renderMathText("**Use $V=Q/C$ now**");
  assert.match(markup, /^<strong>Use <span[^>]+><math[\s\S]+<\/math><\/span> now<\/strong>$/u);
  assert.doesNotMatch(markup, /\*\*/u);
});

test("the Worker replaces legacy glyph trees with one semantic representation", async () => {
  const source = await readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8");
  assert.match(source, /ast-mathml-authoritative-v7-geometry-symbols/u);
  assert.match(source, /canonicalFormulaForLegacyLabel/u);
  assert.match(source, /data-nosnippet/u);
  assert.match(source, /element\.replace\(renderSemanticMath\(representation, \{ visiblePlain: true \}\)/u);
  assert.match(source, /const original = element\.getAttribute\("data-math-source"\) \|\| ""/u);
  assert.match(source, /const source = repairCrawlerFormulaSource\(original\)/u);
  assert.match(source, /semantic-math\.js/u);
  assert.match(source, /\.katex-mathml, annotation/u);
  assert.match(source, /\.math > \.katex, \.math > \.katex-display[\s\S]+?element\.remove\(\)/u);
  assert.doesNotMatch(source, /element\.prepend\(renderSemanticMath/u);
  assert.match(source, /textChunk\.replace\(repaired, \{ html: true \}\)/u);
});
