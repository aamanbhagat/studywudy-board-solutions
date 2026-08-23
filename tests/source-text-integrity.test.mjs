import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SOURCE_CORRECTION_LEDGER, applyVerifiedQuestionCorrections } from "../source-correction-ledger.mjs";
import { repairKnownText } from "../multilingual-text-quality.mjs";
import {
  detectSourceTextAnomalies,
  discreteResultEvaluation,
  evaluateSourceTextIntegrity,
  numericNearDuplicateTemplate,
  suspiciousDroppedOrDuplicatedDigit,
} from "../source-text-integrity.mjs";

test("detects high-confidence source OCR and unit-boundary anomalies", () => {
  const cases = new Map([
    ["A box contains loo red cards, 200 yellow cards and 50 blue cards.", "ambiguous-hundred-ocr"],
    ["A value is 12cmblank.", "cmblank-token"],
    ["The height is 75cm___?", "numeric-placeholder-attached"],
    ["There are 1O0 cards.", "letter-o-inside-numeric-quantity"],
    ["There are I00 cards.", "ambiguous-hundred-ocr"],
    ["The length is 1..75 cm.", "malformed-decimal-separator"],
    ["The cuboid is 11cmx10cm.", "broken-unit-boundary"],
  ]);
  for (const [input, code] of cases) {
    const findings = detectSourceTextAnomalies(input, { numericContext: true });
    assert(findings.some((finding) => finding.code === code), `${input} should report ${code}`);
  }
  assert.equal(detectSourceTextAnomalies("The public loo is nearby.", { numericContext: false }).length, 0);
  assert.equal(detectSourceTextAnomalies("H2O2 is hydrogen peroxide.", { numericContext: true }).length, 0);
});

test("records and applies the reviewed coin and lead-shot corrections without approving publication", () => {
  assert.equal(Object.keys(SOURCE_CORRECTION_LEDGER).length, 5);
  const payload = {
    chapters: [{
      slug: "surface-areas-and-volumes",
      exercises: [{
        questions: [{
          id: "q-cbse-rd-sharma-mathematics-class-10-14-019",
          prompt: "How many coins 1.75 cm in diameter and 2 mm thick form 11 cm × 10 cm × 7 cm?",
          finalAnswer: "$\\boxed{17142\\frac{6}{7}\\text{ coins}}$",
          steps: [{ content: "H=75\\text{ cm}; 11\\times10\\times75=8250" }],
        }],
      }],
    }],
  };
  applyVerifiedQuestionCorrections("cbse::class-10::mathematics::rd-sharma-mathematics-class-10", payload);
  const question = payload.chapters[0].exercises[0].questions[0];
  assert.equal(question.finalAnswer, "$\\boxed{1600\\text{ coins}}$");
  assert.match(question.steps[0].content, /H=7\\text\{ cm\}/u);
  assert.match(question.steps[0].content, /11\\times10\\times7=770/u);
});

test("removes OCR-interpretation prose after the probability prompt is corrected", () => {
  const payload = {
    chapters: [{
      slug: "probability",
      exercises: [{
        questions: [
          {
            id: "q-cbse-rd-sharma-mathematics-class-10-16-125",
            prompt: "A box contains 100 red cards, 200 yellow cards and 50 blue cards.",
            steps: [{ content: "Interpreting “100 red cards” as $100$ red cards, the box has 100 red cards." }],
          },
          {
            id: "q-cbse-rd-sharma-mathematics-class-10-16-127",
            prompt: "A box contains 100 red cards, 200 yellow cards and 50 blue cards.",
            steps: [{ content: "Interpreting “100 red cards” as the apparent typo “100 red cards,” the total is 350." }],
          },
        ],
      }],
    }],
  };
  applyVerifiedQuestionCorrections("cbse::class-10::mathematics::rd-sharma-mathematics-class-10", payload);
  assert.match(payload.chapters[0].exercises[0].questions[0].steps[0].content, /^The box contains/u);
  assert.match(payload.chapters[0].exercises[0].questions[1].steps[0].content, /^Using the stated/u);
  assert.doesNotMatch(JSON.stringify(payload), /Interpreting|apparent typo/u);
});

test("repairs catalog prompt text as well as decoded answer payloads", () => {
  const bookId = "cbse::class-10::mathematics::rd-sharma-mathematics-class-10";
  assert.match(repairKnownText(bookId, "How many coins form a cuboid 11cm x 10cm x 75cm___?"), /11 cm × 10 cm × 7 cm/u);
  assert.match(repairKnownText(bookId, "A box contains loo red cards, 200 yellow cards."), /100 red cards/u);
  const worker = readFileSync(new URL("../comparison/after-worker.js", import.meta.url), "utf8");
  assert.match(worker, /row\.prompt_text = repairKnownText\(row\.book_id, row\.prompt_text\)/u);
});

test("requires the normalized question, Given step, substitutions and final answer to share the numeric chain", () => {
  const clean = {
    prompt: "A cuboid is 11 cm × 10 cm × 7 cm. Find its volume.",
    steps: [
      { content: "Given: l=11 cm, b=10 cm and h=7 cm." },
      { content: "Substitution: V=11×10×7=770 cm³." },
    ],
    finalAnswer: "770 cm³",
  };
  const passed = evaluateSourceTextIntegrity({
    key: "fixture:clean",
    importedQuestion: clean,
    normalizedQuestion: structuredClone(clean),
    normalizedType: "numerical",
  });
  assert.equal(passed.sourceTextIntegrityPassed, true);

  const corrupted = structuredClone(clean);
  corrupted.steps[0].content = "Given: l=11 cm, b=10 cm and h=75 cm.";
  const failed = evaluateSourceTextIntegrity({
    key: "fixture:corrupted",
    importedQuestion: clean,
    normalizedQuestion: corrupted,
    normalizedType: "numerical",
  });
  assert.equal(failed.numericChain.normalizedQuestionToGivenPass, false);
  assert(failed.failures.includes("normalized-question-to-given-number-mismatch"));
});

test("rejects fractional discrete counts unless the final answer applies an explicit complete-object rule", () => {
  const bad = {
    finalAnswer: "$17142\\frac{6}{7}\\text{ coins}$",
    steps: [{ content: "The result is non-integral." }],
  };
  assert.equal(discreteResultEvaluation(bad, "How many coins are required?").complete, false);
  const explained = {
    finalAnswer: "136 complete shots",
    steps: [{ content: "$136\\frac{4}{11}$, so only 136 complete shots can be made." }],
  };
  assert.equal(discreteResultEvaluation(explained, "How many shots can be made?").complete, true);
});

test("near-duplicate signatures expose dropped or duplicated input digits", () => {
  const coinBad = numericNearDuplicateTemplate("How many coins 1.75cm in diameter and 2mm thick form 11cm x 10cm x 75cm___?");
  const coinGood = numericNearDuplicateTemplate("How many coins 1.75 cm in diameter and 2 mm thick form 11 cm × 10 cm × 7 cm?");
  assert.equal(coinBad.signature, coinGood.signature);
  assert.equal(suspiciousDroppedOrDuplicatedDigit(coinBad.numbers.at(-1), coinGood.numbers.at(-1)), true);

  const leadBad = numericNearDuplicateTemplate("How many lead shots of diameter 4.2 cm from dimension 6 cm × 42 cm × 21 cm?");
  const leadGood = numericNearDuplicateTemplate("How many lead shots of diameter 4.2 cm from dimensions 66 cm, 42 cm and 21 cm?");
  assert.equal(leadBad.signature, leadGood.signature);
  assert.equal(suspiciousDroppedOrDuplicatedDigit(leadBad.numbers[1], leadGood.numbers[1]), true);
  assert.equal(suspiciousDroppedOrDuplicatedDigit("12", "13"), false);
});
