import assert from "node:assert/strict";
import test from "node:test";

import {
  buildQuestionTrustRecord,
  MANUAL_REVIEWER_PROFILES,
  QUESTION_CORRECTIONS,
  TRUST_TRANSPARENCY_PATHS,
  TRUST_TRANSPARENCY_SUMMARY,
  validateCorrectionRecord,
  validateManualReview,
  validateReviewerProfile,
} from "../trust-transparency.mjs";

test("human review fails closed when no verified reviewer registry entry exists", () => {
  assert.equal(MANUAL_REVIEWER_PROFILES.length, 0);
  assert.equal(TRUST_TRANSPARENCY_SUMMARY.namedAcademicReviewerCount, 0);
  assert.equal(TRUST_TRANSPARENCY_SUMMARY.manuallyReviewedQuestionCount, 0);
  assert.equal(validateManualReview({
    reviewerSlug: "unregistered-person",
    questionId: "q-example",
    reviewedOn: "2026-08-21",
    textbookEdition: "2026–27",
    academicYear: "2026–27",
  }), false);
});

test("a future manual review requires a real profile and every evidence field", () => {
  const profile = {
    slug: "real-reviewer",
    name: "Real Reviewer",
    qualification: "MSc Physics",
    bio: "Reviews senior-secondary physics answers.",
  };
  const review = {
    reviewerSlug: profile.slug,
    questionId: "q-example",
    reviewedOn: "2026-08-21",
    textbookEdition: "2026–27 edition",
    academicYear: "2026–27",
  };
  assert.equal(validateReviewerProfile(profile), true);
  assert.equal(validateManualReview(review, [profile]), true);
  assert.equal(validateManualReview({ ...review, reviewedOn: null }, [profile]), false);
  assert.equal(validateManualReview({ ...review, textbookEdition: "" }, [profile]), false);
});

test("automated arithmetic and diagram labels require explicit evidence", () => {
  const record = buildQuestionTrustRecord({
    question: { id: "q-example", type: "numerical", solutionMedia: [{ src: "/diagram.svg" }] },
    pathname: "/board/class-12/physics/book/chapter/questions/q-example",
    sourceMappingVerified: true,
    exercise: "Exercise 4",
    sourcePages: [212, 213],
    edition: null,
    academicYear: null,
    sourceRevision: "Checksum abc123",
    reviewedAt: 1_787_270_400,
    completeness: {
      complete: true,
      checks: { arithmetic: true, arithmeticAccuracy: true },
    },
  });
  assert.equal(record.sourcePages, "Pages 212–213");
  assert.equal(record.automatedArithmeticChecksPassed, true);
  assert.equal(record.diagramStatus, "pending");
  assert.equal(record.manualReview, null);
  assert.match(record.reportUrl, /request_type=content_correction/);
});

test("correction dates publish only from valid dated answer-change records", () => {
  assert.equal(QUESTION_CORRECTIONS.length, 0);
  const correction = { questionId: "q-example", pathname: "/questions/q-example", correctedOn: "2026-08-21", summary: "Corrected the final unit." };
  assert.equal(validateCorrectionRecord(correction), true);
  assert.equal(validateCorrectionRecord({ ...correction, correctedOn: "" }), false);
  const record = buildQuestionTrustRecord({
    question: { id: "q-example", type: "brief" },
    pathname: "/questions/q-example",
    sourceMappingVerified: true,
    exercise: "Exercise 1",
    reviewedAt: 1_787_270_400,
    completeness: { complete: true, checks: {} },
    corrections: [correction],
  });
  assert.equal(record.latestCorrectionDateDisplay, "21 August 2026");
});

test("reviewer and correction transparency routes are first-class public paths", () => {
  assert.deepEqual(TRUST_TRANSPARENCY_PATHS, [
    "/reviewers",
    "/reviewers/aman-bhagat",
    "/reviewers/studywudy-editorial-process",
    "/corrections",
  ]);
});
