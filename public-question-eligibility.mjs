import {
  isQuestionEquationReviewPending,
  isQuestionRenderedDiagramAvailable,
  isQuestionRowIndexable,
} from "./answer-completeness.mjs";

export const PUBLIC_QUESTION_ELIGIBILITY_POLICY_VERSION = "final-publishing-gate-v2-page-consistent";

export function evaluatePublicQuestionEligibility({
  overallPublishingGatePassed = false,
  indexable = overallPublishingGatePassed,
  equationReviewPending = false,
  authoritativeMappingConflict = false,
  unresolvedContent = false,
  pageExperienceReady = true,
  requiresDiagram = false,
  hasRenderedDiagram = false,
} = {}) {
  const checks = Object.freeze({
    overallPublishingGatePassed: overallPublishingGatePassed === true,
    indexable: indexable === true,
    equationReviewComplete: equationReviewPending !== true,
    authoritativeMappingClear: authoritativeMappingConflict !== true,
    contentResolved: unresolvedContent !== true,
    pageExperienceReady: pageExperienceReady === true,
    renderedDiagramAvailable: requiresDiagram !== true || hasRenderedDiagram === true,
  });
  const failures = Object.freeze(Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name));
  return Object.freeze({
    eligible: failures.length === 0,
    checks,
    failures,
  });
}

export function questionPublicEligibility(manifest, rowId, evidence = {}) {
  const overallPublishingGatePassed = isQuestionRowIndexable(manifest, rowId);
  return evaluatePublicQuestionEligibility({
    overallPublishingGatePassed,
    indexable: evidence.indexable ?? overallPublishingGatePassed,
    equationReviewPending: isQuestionEquationReviewPending(manifest, rowId),
    authoritativeMappingConflict: evidence.authoritativeMappingConflict === true,
    unresolvedContent: evidence.unresolvedContent === true,
    pageExperienceReady: evidence.pageExperienceReady !== false,
    requiresDiagram: evidence.requiresDiagram === true,
    hasRenderedDiagram: evidence.hasRenderedDiagram ?? isQuestionRenderedDiagramAvailable(manifest, rowId),
  });
}

export function isQuestionPubliclyEligible(manifest, rowId, evidence = {}) {
  return questionPublicEligibility(manifest, rowId, evidence).eligible;
}
