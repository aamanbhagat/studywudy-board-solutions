import assert from "node:assert/strict";
import test from "node:test";

import { encodeFlagBitset, encodeIndexabilityBitset } from "../answer-completeness.mjs";
import {
  evaluatePublicQuestionEligibility,
  isQuestionPubliclyEligible,
  questionPublicEligibility,
} from "../public-question-eligibility.mjs";

test("the final public predicate fails closed on every publishing hold", () => {
  assert.equal(evaluatePublicQuestionEligibility({ overallPublishingGatePassed: true }).eligible, true);
  for (const evidence of [
    { overallPublishingGatePassed: false },
    { overallPublishingGatePassed: true, equationReviewPending: true },
    { overallPublishingGatePassed: true, authoritativeMappingConflict: true },
    { overallPublishingGatePassed: true, unresolvedContent: true },
    { overallPublishingGatePassed: true, indexable: false },
    { overallPublishingGatePassed: true, pageExperienceReady: false },
    { overallPublishingGatePassed: true, requiresDiagram: true, hasRenderedDiagram: false },
  ]) assert.equal(evaluatePublicQuestionEligibility(evidence).eligible, false);
  assert.equal(evaluatePublicQuestionEligibility({
    overallPublishingGatePassed: true,
    requiresDiagram: true,
    hasRenderedDiagram: true,
  }).eligible, true);
});

test("manifest decisions and equation review use the same final predicate", () => {
  const records = [
    { rowId: 1, gatePassed: true, equationReviewPending: false },
    { rowId: 2, gatePassed: true, equationReviewPending: true },
    { rowId: 3, gatePassed: false, equationReviewPending: false },
  ];
  const manifest = Object.freeze({
    maximumRowId: 3,
    indexabilityBitsetBase64: encodeIndexabilityBitset(records, 3),
    equationReviewBitsetBase64: encodeFlagBitset(records, 3, "equationReviewPending"),
  });
  assert.equal(isQuestionPubliclyEligible(manifest, 1), true);
  assert.equal(isQuestionPubliclyEligible(manifest, 2), false);
  assert.equal(isQuestionPubliclyEligible(manifest, 3), false);
  assert.deepEqual(questionPublicEligibility(manifest, 2).failures, ["equationReviewComplete"]);
});
