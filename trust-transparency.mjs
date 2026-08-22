export const TRUST_POLICY_VERSION = "question-trust-v1";
export const TRUST_POLICY_UPDATED_AT = "2026-08-21T12:00:00+05:30";

// These registries intentionally start empty. A person or correction is added only
// when the supporting identity, qualification, date, edition and change record are
// available. Automated publishing checks never populate either registry.
export const MANUAL_REVIEWER_PROFILES = Object.freeze([]);
export const QUESTION_MANUAL_REVIEWS = Object.freeze([]);
export const QUESTION_CORRECTIONS = Object.freeze([]);

export const TRUST_TRANSPARENCY_PATHS = Object.freeze([
  "/reviewers",
  "/reviewers/aman-bhagat",
  "/reviewers/studywudy-editorial-process",
  "/corrections",
]);

function text(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function isoDate(value) {
  const candidate = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(candidate)) return null;
  const parsed = Date.parse(`${candidate}T00:00:00Z`);
  return Number.isFinite(parsed) ? candidate : null;
}

function displayDate(value) {
  const date = isoDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(Date.parse(`${date}T00:00:00Z`));
}

export function validateReviewerProfile(profile) {
  if (!profile || typeof profile !== "object") return false;
  return Boolean(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(text(profile.slug))
    && text(profile.name)
    && text(profile.qualification)
    && text(profile.bio)
  );
}

export function validateManualReview(review, profiles = MANUAL_REVIEWER_PROFILES) {
  if (!review || typeof review !== "object") return false;
  const profile = profiles.find((candidate) => candidate.slug === review.reviewerSlug);
  return Boolean(
    profile
    && validateReviewerProfile(profile)
    && text(review.questionId)
    && isoDate(review.reviewedOn)
    && text(review.textbookEdition)
    && text(review.academicYear)
  );
}

export function validateCorrectionRecord(correction) {
  if (!correction || typeof correction !== "object") return false;
  return Boolean(
    text(correction.questionId)
    && text(correction.pathname).startsWith("/")
    && isoDate(correction.correctedOn)
    && text(correction.summary)
  );
}

export function manualReviewForQuestion(questionId) {
  const review = QUESTION_MANUAL_REVIEWS.find((candidate) => candidate.questionId === questionId);
  return validateManualReview(review) ? review : null;
}

export function correctionsForQuestion(questionId) {
  return QUESTION_CORRECTIONS
    .filter((candidate) => candidate.questionId === questionId && validateCorrectionRecord(candidate))
    .toSorted((left, right) => right.correctedOn.localeCompare(left.correctedOn));
}

function normalizeSourcePages(value) {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  const normalized = values.flatMap((candidate) => {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return [String(candidate)];
    const cleaned = text(candidate);
    return cleaned ? [cleaned.replace(/\s*[-–—]\s*/gu, "–")] : [];
  });
  if (!normalized.length) return null;
  if (normalized.length === 2 && normalized.every((candidate) => /^\d+$/u.test(candidate))) {
    return `Pages ${normalized[0]}–${normalized[1]}`;
  }
  return `Page${normalized.length === 1 && !/[–,]/u.test(normalized[0]) ? "" : "s"} ${normalized.join(", ")}`;
}

function publishingGateDate(reviewedAt) {
  const milliseconds = Number(reviewedAt) * 1_000;
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(milliseconds);
}

export function buildQuestionTrustRecord({
  question,
  pathname,
  sourceMappingVerified,
  internalMappingConsistent = sourceMappingVerified,
  authoritativeSourceMapping = null,
  exercise,
  sourcePages,
  edition,
  academicYear,
  sourceRevision,
  reviewedAt,
  completeness,
  diagramSourceVerified = false,
  manualReview = manualReviewForQuestion(question?.id),
  corrections = correctionsForQuestion(question?.id),
}) {
  const verifiedManualReview = validateManualReview(manualReview) ? manualReview : null;
  const reviewer = verifiedManualReview
    ? MANUAL_REVIEWER_PROFILES.find((candidate) => candidate.slug === verifiedManualReview.reviewerSlug)
    : null;
  const validCorrections = (corrections || [])
    .filter(validateCorrectionRecord)
    .toSorted((left, right) => right.correctedOn.localeCompare(left.correctedOn));
  const checks = completeness?.checks || {};
  const isNumerical = question?.type === "numerical";
  const hasDiagram = Boolean(
    question?.diagram
    || question?.promptMedia?.length
    || question?.solutionMedia?.length
    || question?.imageUrl
    || question?.diagramUrl
  );
  const reportParams = new URLSearchParams({
    request_type: "content_correction",
    page_url: pathname,
  });
  return Object.freeze({
    policyVersion: TRUST_POLICY_VERSION,
    sourceMappingVerified: Boolean(sourceMappingVerified),
    internalMappingConsistent: Boolean(internalMappingConsistent),
    authoritativeSourceMapping: Object.freeze({
      status: authoritativeSourceMapping?.status || (sourceMappingVerified ? "verified" : "not-reviewed"),
      verified: Boolean(authoritativeSourceMapping?.authoritativeTextbookMappingVerified ?? sourceMappingVerified),
      detail: text(authoritativeSourceMapping?.detail) || (sourceMappingVerified
        ? "An authoritative textbook comparison is recorded."
        : "No authoritative textbook comparison is recorded."),
      evidenceUrl: text(authoritativeSourceMapping?.evidenceUrl) || null,
      evidenceLabel: text(authoritativeSourceMapping?.evidenceLabel) || null,
    }),
    exercise: text(exercise) || "Exercise not recorded in source data",
    sourcePages: normalizeSourcePages(sourcePages) || "Not recorded in source data",
    edition: text(edition) || null,
    academicYear: text(academicYear) || null,
    sourceRevision: text(sourceRevision) || "Source revision not recorded",
    publishingGateDate: publishingGateDate(reviewedAt),
    automatedAnswerGatePassed: completeness?.complete === true,
    automatedArithmeticChecksPassed: Boolean(
      isNumerical
      && checks.arithmetic === true
      && checks.arithmeticAccuracy === true
    ),
    diagramStatus: hasDiagram
      ? (diagramSourceVerified === true ? "verified" : "pending")
      : "not-applicable",
    manualReview: verifiedManualReview && reviewer ? Object.freeze({
      reviewer,
      reviewedOn: verifiedManualReview.reviewedOn,
      reviewedOnDisplay: displayDate(verifiedManualReview.reviewedOn),
      textbookEdition: text(verifiedManualReview.textbookEdition),
      academicYear: text(verifiedManualReview.academicYear),
    }) : null,
    corrections: Object.freeze(validCorrections),
    latestCorrectionDate: validCorrections[0]?.correctedOn || null,
    latestCorrectionDateDisplay: displayDate(validCorrections[0]?.correctedOn),
    reportUrl: `/contact?${reportParams.toString()}`,
  });
}

export const TRUST_TRANSPARENCY_SUMMARY = Object.freeze({
  namedAcademicReviewerCount: MANUAL_REVIEWER_PROFILES.filter(validateReviewerProfile).length,
  manuallyReviewedQuestionCount: QUESTION_MANUAL_REVIEWS.filter((review) => validateManualReview(review)).length,
  recordedCorrectionCount: QUESTION_CORRECTIONS.filter(validateCorrectionRecord).length,
});
