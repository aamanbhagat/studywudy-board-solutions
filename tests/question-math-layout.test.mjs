import assert from "node:assert/strict";
import test from "node:test";

import { normalizeQuestionMathLayout } from "../question-math-layout.mjs";

const matrix = "${\\left[\\begin{matrix}{1}&-{1}&{3}\\\\{2}&{1}&{0}\\\\{3}&{3}&{1}\\end{matrix}\\right]}$";

test("repeated matrix assignments and their conclusion receive deliberate rows", () => {
  const source = `Apply the given elementary transformation of the following matrix.\nA = ${matrix}, 3R_(3)and then C_(3)+ 2C_(2) and A = ${matrix}, C_(3)+ 2C_(2)and then 3R_(3)What do you conclude?`;
  const result = normalizeQuestionMathLayout(source);
  assert.equal(result.enhanced, true);
  assert.deepEqual(result.content.split("\n"), [
    "Apply the given elementary transformation of the following matrix.",
    `A = ${matrix}, 3R_(3) and then C_(3) + 2C_(2)`,
    `and A = ${matrix}, C_(3) + 2C_(2) and then 3R_(3)`,
    "What do you conclude?",
  ]);
  assert.equal(result.content.replace(/\s+/gu, ""), source.replace(/\s+/gu, ""));
});

test("non-matrix question content is unchanged", () => {
  const source = "Explain why the relation is symmetric.";
  assert.deepEqual(normalizeQuestionMathLayout(source), { content: source, enhanced: false });
});

test("nested prompt blocks are normalized without mutating the input", () => {
  const source = { kind: "blocks", blocks: [{ kind: "paragraph", text: `A = ${matrix}, C_(3)+ 2C_(2)` }] };
  const result = normalizeQuestionMathLayout(source);
  assert.equal(result.enhanced, true);
  assert.match(result.content.blocks[0].text, /C_\(3\) \+ 2C_\(2\)/u);
  assert.notEqual(result.content, source);
  assert.notEqual(result.content.blocks[0], source.blocks[0]);
});
