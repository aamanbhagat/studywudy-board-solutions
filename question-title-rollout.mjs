// Staged rollout of the identity-first question <title> (70cf3c09).
//
// The title is computed per request (comparison/after-worker.js, both
// standaloneQuestionResponse and questionMetadataResponse), so a plain deploy
// would rewrite every question page at once. This module is the switch that
// makes the rewrite a staged rollout instead: a row inside the current stage
// gets questionDocumentTitle, every other row keeps questionLegacyDocumentTitle
// and therefore the exact byte string it served before.
//
// A percentage or hash-based split would be wrong here. The same URL has to
// return the same title on every request, or Google sees a page whose title
// flickers; membership is therefore an explicit row-id set, not a sample.
//
// Stage "canary-1": 150 pages spanning 4 boards, 12 classes,
// 23 subjects, 88 books and 103 chapters. 119 of them are in a
// sitemap; the rest are deliberate noindex controls. Selected by
// scripts/question-title-rollout-audit.mjs --select, which forces in:
//    61  representative-spread
//    27  prerendered-launch-hot-path
//    10  noindex-control
//     8  book-code-mid-string-ellipsis
//     8  devanagari-prompt
//     6  instruction-only-window
//     6  devanagari-sanskrit
//     6  duplicate-book-rows
//     5  longest-titles
//     4  shortest-prompt-window
//     4  true-false-layout
//     4  numbered-book-code
//     1  ci-pinned:public-title-quality
//     1  ci-pinned:search-metadata-gate
//
// Stage "release-gates": the 28 rows that cannot serve the legacy title in any
// stage. It exists so the sitemap, lastmod and CLS work can ship on its own
// deploy without dragging the title rewrite along - the five Section-3 commits
// are stacked with the title commit oldest, so holding it back at the row level
// is the only way to separate them without rewriting history.
export const QUESTION_TITLE_ROLLOUT_STAGE = "release-gates";

// Not optional in any stage, for two independent reasons.
//   27 rows are prerendered under comparison/after-assets/pages/launch-hot-path/**
//   and answered by launchHotPathStaticResponse (comparison/after-worker.js:3765)
//   before question routing is reached at :3781. That HTML already carries the
//   identity-first title on disk, so those pages flip the moment the assets
//   deploy whatever this switch says; the generator has to agree or
//   questionMetadataResponse describes a page with a title it does not serve.
//   2 rows - 39148 and 229911, the second already in the 27 - are pinned to an
//   exact identity-first string by public-title-quality.mjs:7 and
//   scripts/search-metadata-gate.mjs:162. The first is compared against served
//   HTML, so a stage without it fails check:release and the production smoke as
//   a title bug rather than reporting the rollout state it actually describes.
export const QUESTION_TITLE_PINNED_ROWS = Object.freeze([
  39148, 43145, 61547, 62208, 63247, 190697, 229910, 229911, 229912, 229913,
  229914, 229915, 229916, 229917, 229918, 229919, 229920, 229921, 229922, 229923,
  229924, 229925, 229926, 229927, 229928, 229929, 229930, 284673,
]);

export const QUESTION_TITLE_ROLLOUT_ROWS = Object.freeze([
  1, 462, 1734, 2432, 3183, 3202, 4746, 5025, 5026, 5027, 5028, 5030,
  5334, 6266, 8413, 8417, 8418, 8426, 8430, 8431, 8434, 8439, 8857, 9638,
  9973, 15726, 17138, 17139, 17140, 17352, 17548, 17553, 17590, 17647, 17649, 17660,
  17662, 17664, 17698, 17701, 18108, 19946, 20810, 21045, 21046, 21299, 21582, 23391,
  23563, 25662, 26017, 26250, 27061, 27684, 28301, 29919, 36051, 36983, 37419, 37742,
  38716, 39015, 39148, 39437, 39892, 40506, 42045, 42283, 43145, 45684, 46111, 46344,
  46920, 47329, 48417, 49601, 49865, 61547, 62208, 63247, 63693, 63950, 64473, 64637,
  65848, 65935, 66726, 67231, 67604, 68679, 69811, 69961, 70325, 71544, 72490, 72908,
  74550, 75877, 78483, 79784, 83953, 85053, 85174, 85177, 85179, 85180, 85636, 87171,
  90720, 91054, 92399, 92401, 92450, 92475, 92521, 92706, 99730, 109703, 119676, 124456,
  126628, 190697, 229910, 229911, 229912, 229913, 229914, 229915, 229916, 229917, 229918, 229919,
  229920, 229921, 229922, 229923, 229924, 229925, 229926, 229927, 229928, 229929, 229930, 268387,
  268392, 268394, 268395, 268396, 268397, 284673,
]);

const STAGE_ROWS = Object.freeze({
  "release-gates": QUESTION_TITLE_PINNED_ROWS,
  "canary-1": QUESTION_TITLE_ROLLOUT_ROWS,
});

/** The rows serving the identity-first title in the checked-in stage. */
export const QUESTION_TITLE_STAGE_ROWS = STAGE_ROWS[QUESTION_TITLE_ROLLOUT_STAGE] || QUESTION_TITLE_ROLLOUT_ROWS;

const ROLLED_OUT = new Set(QUESTION_TITLE_STAGE_ROWS);

/** True when this row serves the identity-first title rather than the legacy one. */
export function questionTitleRolledOut(rowId) {
  if (QUESTION_TITLE_ROLLOUT_STAGE === "all") return true;
  const value = Number(rowId);
  return Number.isFinite(value) && ROLLED_OUT.has(value);
}
