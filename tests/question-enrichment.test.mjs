import assert from "node:assert/strict";
import test from "node:test";

import {
  applyQuestionEnrichmentForQuality,
  normalizeQuestionEnrichment,
  questionEnrichmentHasPublishableContent,
  QUESTION_ENRICHMENT_POLICY_VERSION,
} from "../question-enrichment.mjs";

test("source-bounded enrichment normalizes supplemental fields", () => {
  const enrichment = normalizeQuestionEnrichment({
    concept_explanation: "  A question-specific explanation.  ",
    reasoning_steps: ["First step", "First step", "Second step"],
    choice_explanations: [
      { choice_id: "B", explanation: "This does not match the condition." },
      { choice_id: "b", explanation: "Duplicate entries are ignored." },
    ],
    confidence: 0.94,
  });
  assert.equal(QUESTION_ENRICHMENT_POLICY_VERSION, "source-bounded-supplement-v1");
  assert.equal(enrichment.conceptExplanation, "A question-specific explanation.");
  assert.deepEqual(enrichment.reasoningSteps, ["First step", "Second step"]);
  assert.deepEqual(enrichment.choiceExplanations, [{
    choiceId: "b",
    explanation: "This does not match the condition.",
  }]);
  assert.equal(questionEnrichmentHasPublishableContent(enrichment), true);
});

test("enrichment changes only a quality shadow and preserves protected question content", () => {
  const question = {
    id: "q-1",
    prompt: "Original prompt",
    choices: [
      { id: "A", content: "Original correct option" },
      { id: "B", content: "Original distractor" },
    ],
    correctChoiceId: "A",
    answer: "Original answer",
    explanation: "Original explanation",
  };
  const before = structuredClone(question);
  const qualityShadow = applyQuestionEnrichmentForQuality(question, {
    concept_explanation: "Supplemental concept.",
    reasoning_steps: ["Supplemental reasoning."],
    choice_explanations: [{ choice_id: "b", explanation: "Why B does not fit." }],
    confidence: 0.96,
  });

  assert.deepEqual(question, before);
  assert.equal(qualityShadow.prompt, before.prompt);
  assert.equal(qualityShadow.answer, before.answer);
  assert.equal(qualityShadow.correctChoiceId, before.correctChoiceId);
  assert.equal(qualityShadow.choices[0].content, before.choices[0].content);
  assert.equal(qualityShadow.choices[1].content, before.choices[1].content);
  assert.equal(qualityShadow.choices[1].explanation, "Why B does not fit.");
  assert.match(qualityShadow.explanation, /Original explanation[\s\S]*Supplemental concept/u);
});

test("low-confidence or empty material cannot pass the publishing helper", () => {
  assert.equal(questionEnrichmentHasPublishableContent({
    concept_explanation: "Some text",
    confidence: 0.87,
  }), false);
  assert.equal(questionEnrichmentHasPublishableContent({ confidence: 1 }), false);
});
