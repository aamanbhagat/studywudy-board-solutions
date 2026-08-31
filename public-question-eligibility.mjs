import {
  isQuestionEquationReviewPending,
  isQuestionRenderedDiagramAvailable,
  isQuestionRowIndexable,
} from "./answer-completeness.mjs";
import { corpusQuestionIndexEligible } from "./corpus-quality.mjs";

export const PUBLIC_QUESTION_ELIGIBILITY_POLICY_VERSION = "final-publishing-gate-v2-page-consistent";

// Submitting a URL is a stronger claim than serving it, so the sitemap rule is
// its own policy with its own version: a page that renders `noindex, follow` is
// a correct page, but the same URL inside a sitemap is a false submission.
export const PUBLIC_QUESTION_SITEMAP_ELIGIBILITY_POLICY_VERSION = "sitemap-matches-rendered-indexability-v1";

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

// The sitemap builder used to apply `isQuestionPubliclyEligible` alone, while
// the Worker conjoins it with `corpusQuestionIndexEligible` before deciding the
// robots directive (comparison/after-worker.js:1799-1812). The two rules living
// in two files is what let 216 URLs be submitted for indexing and then served
// `noindex, follow`; keeping the sitemap rule next to the page rule is what
// stops that recurring. `duplicateRowIds` is deliberately required rather than
// defaulted: forgetting the quarantine list is the exact defect being fixed,
// and a silent default would hide it again.
export function questionSitemapEligibility(manifest, { rowId, questionId, duplicateRowIds } = {}) {
  const page = questionPublicEligibility(manifest, rowId);
  const corpusQualityClear = corpusQuestionIndexEligible({
    questionId,
    rowId: Number(rowId),
    duplicateRowIds,
  });
  const checks = Object.freeze({ ...page.checks, corpusQualityClear });
  const failures = Object.freeze(Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name));
  return Object.freeze({
    eligible: failures.length === 0,
    checks,
    failures,
    pageEligible: page.eligible,
    corpusQualityClear,
  });
}

export function isQuestionSitemapEligible(manifest, evidence = {}) {
  return questionSitemapEligibility(manifest, evidence).eligible;
}
