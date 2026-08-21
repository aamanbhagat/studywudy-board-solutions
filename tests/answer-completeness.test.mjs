import assert from "node:assert/strict";
import test from "node:test";
import {
  encodeIndexabilityBitset,
  evaluateAnswerCompleteness,
  isQuestionRowIndexable,
  lexicalTokens,
} from "../answer-completeness.mjs";

test("a concise MCQ passes when it explains the principle and a distractor", () => {
  const answer = {
    type: "mcq_single",
    prompt: "Which process transfers heat through the bulk movement of a liquid?",
    choices: [
      { id: "a", content: "Conduction" },
      { id: "b", content: "Convection" },
      { id: "c", content: "Radiation" },
    ],
    correctChoiceId: "b",
    explanation: "Convection is correct because warmer, less-dense liquid rises while cooler, denser liquid sinks, creating a circulating current that transports energy through the fluid. Conduction is the tempting incorrect choice: it transfers energy through particle collisions without bulk movement of the material.",
  };
  assert.ok(lexicalTokens(answer.explanation).length < 150);
  assert.deepEqual(evaluateAnswerCompleteness(answer).missing, []);
});

test("an MCQ with only the selected option is incomplete", () => {
  const result = evaluateAnswerCompleteness({
    type: "mcq_multi",
    prompt: "Select the prime numbers.",
    choices: [{ id: "a", content: "2" }, { id: "b", content: "4" }, { id: "c", content: "5" }],
    correctChoiceIds: ["a", "c"],
    explanation: "a, c",
  });
  assert.equal(result.complete, false);
  assert.ok(result.missing.includes("governingPrincipleAndReasoning"));
  assert.ok(result.missing.includes("distractorReasoning"));
});

test("one-word and fill-blank answers require direct context, not filler", () => {
  assert.equal(evaluateAnswerCompleteness({
    type: "one_word",
    prompt: "Name the organelle where aerobic respiration occurs.",
    answer: "Mitochondrion",
    explanation: "It contains the enzymes that complete aerobic respiration and release usable energy.",
  }).complete, true);
  assert.equal(evaluateAnswerCompleteness({
    type: "one_sentence",
    prompt: "All green plants are ______.",
    answer: "Autotrophs",
  }).complete, false);
});

test("give-reason answers require causal reasoning", () => {
  const complete = evaluateAnswerCompleteness({
    type: "give_reason",
    prompt: "Why does a metal spoon feel colder than a wooden spoon?",
    answer: "Metal feels colder because it conducts heat away from the hand faster than wood; therefore the skin temperature falls more quickly.",
  });
  assert.equal(complete.complete, true);
  assert.equal(complete.kind, "give_reason");
});

test("numericals check formula, substitution, units, arithmetic and final answer", () => {
  const numerical = {
    type: "numerical",
    prompt: "A cyclist covers 120 m in 10 s. Find the speed.",
    steps: [
      { content: "Formula: v = s/t." },
      { content: "Substitution: v = 120/10 m/s." },
      { content: "Arithmetic: 120/10 = 12." },
    ],
    finalAnswer: "The speed is 12 m/s.",
  };
  assert.equal(evaluateAnswerCompleteness(numerical).complete, true);
  assert.ok(evaluateAnswerCompleteness({ ...numerical, finalAnswer: "The speed is 12.", steps: numerical.steps.map((step) => ({ content: step.content.replaceAll("m/s", "") })) }).missing.includes("units"));
  const wrongArithmetic = { ...numerical, steps: [...numerical.steps.slice(0, 2), { content: "Arithmetic: 120/10 = 13." }] };
  assert.ok(evaluateAnswerCompleteness(wrongArithmetic).missing.includes("arithmeticAccuracy"));
});

test("derivations, diagrams and long answers use their own structural checks", () => {
  assert.equal(evaluateAnswerCompleteness({
    type: "detailed",
    prompt: "Derive the equation for uniformly accelerated motion.",
    steps: [
      { content: "Given initial velocity u, let acceleration a remain constant for time t." },
      { content: "From acceleration, a = (v-u)/t, so at = v-u." },
    ],
    finalAnswer: "Therefore, v = u + at, as required.",
  }).complete, true);
  assert.equal(evaluateAnswerCompleteness({
    type: "diagram",
    prompt: "Draw and explain a plant cell.",
    diagram: { src: "/plant-cell.svg", alt: "Labelled plant cell showing the cell wall and chloroplasts", labels: ["cell wall", "chloroplast"] },
    labels: ["cell wall", "chloroplast"],
    explanation: "The cell wall supports the cell, while chloroplasts absorb light for photosynthesis.",
  }).complete, true);
  assert.equal(evaluateAnswerCompleteness({
    type: "detailed",
    prompt: "Explain photosynthesis.",
    steps: [{ content: "First, chlorophyll absorbs light." }, { content: "Next, that energy supports glucose formation." }],
    finalAnswer: "Thus light energy is stored as chemical energy in glucose.",
  }).complete, true);
});

test("the compact manifest bitset preserves per-row index decisions", () => {
  const encoded = encodeIndexabilityBitset([
    { rowId: 1, gatePassed: true },
    { rowId: 2, gatePassed: false },
    { rowId: 9, gatePassed: true },
  ], 10);
  const manifest = Object.freeze({ maximumRowId: 10, indexabilityBitsetBase64: encoded });
  assert.equal(isQuestionRowIndexable(manifest, 1), true);
  assert.equal(isQuestionRowIndexable(manifest, 2), false);
  assert.equal(isQuestionRowIndexable(manifest, 9), true);
  assert.equal(isQuestionRowIndexable(manifest, 11), false);
});
