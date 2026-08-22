import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { isQuestionPubliclyEligible } from "../public-question-eligibility.mjs";
import {
  QUESTION_SHOWCASE_ENTRIES,
  QUESTION_SHOWCASE_SOURCE_GATE,
} from "../question-showcase-manifest.mjs";
import {
  QUESTION_SHOWCASE_POLICY_VERSION,
  QUESTION_SHOWCASE_PREFERRED_QUESTION_IDS,
  evaluateQuestionShowcaseContent,
  questionHasDuplicateOptions,
  questionHasUnresolvedContent,
  questionRuntimePayloadIsSafe,
  validateQuestionShowcase,
} from "../question-showcase.mjs";
import { evaluatePostGenerationAnswerQuality } from "../answer-semantic-quality.mjs";
import {
  inspectQuestionShowcaseHtml,
  smokeQuestionShowcase,
} from "../scripts/question-showcase-smoke.mjs";

test("the generated showroom has quality-screened evidence and deterministic diversity", () => {
  const result = validateQuestionShowcase(QUESTION_SHOWCASE_ENTRIES);
  assert.equal(result.pass, true, result.failures.join("; "));
  assert.equal(QUESTION_SHOWCASE_SOURCE_GATE.policyVersion, QUESTION_SHOWCASE_POLICY_VERSION);
  assert.equal(QUESTION_SHOWCASE_SOURCE_GATE.answerGatePolicyVersion, PHASE4_GATE_MANIFEST.policyVersion);
  assert.deepEqual(
    QUESTION_SHOWCASE_ENTRIES.slice(0, QUESTION_SHOWCASE_PREFERRED_QUESTION_IDS.length).map(({ questionId }) => questionId),
    QUESTION_SHOWCASE_PREFERRED_QUESTION_IDS,
  );
  assert.deepEqual(result.diversity.boardCounts, {
    "maharashtra-board": 4,
    cbse: 4,
    cisce: 4,
    "tamil-nadu-board": 4,
  });
});

test("reported incomplete and duplicate-option examples cannot enter the showroom", () => {
  const ids = new Set(QUESTION_SHOWCASE_ENTRIES.map(({ questionId }) => questionId));
  assert.equal(ids.has("q-msb-balbharati-book-keeping-and-accountancy-standard-12-1-001"), false);
  assert.equal(ids.has("q-cisce-c-b-gupta-business-studies-class-12-1-001"), false);
  assert.equal(ids.has("q-msb-balbharati-marathi-composite-antarbharati-standard-10-11-001"), false);
  assert.equal([...ids].some((questionId) => /^q-msb-balbharati-sanskrit-(?:amod|anand-composite)-standard-(?:9|10)-(?:22|25)-/u.test(questionId)), false);
  assert.equal(questionHasDuplicateOptions({ choices: [
    { content: "Selection" }, { content: "Recruitment" }, { content: "Human resource planning" }, { content: "Selection" },
  ] }), true);
  assert.equal(questionHasDuplicateOptions({ choices: [{ content: "Selection" }, { content: "Recruitment" }] }), false);
  assert.equal(questionHasUnresolvedContent({ answer: "Answer goes here" }), true);
  assert.equal(questionRuntimePayloadIsSafe({ prompt: { blocks: [{ code: "x".repeat(6_995) }] } }), false);
  assert.equal(questionRuntimePayloadIsSafe({ prompt: "A concise, renderable question." }), true);
  assert.equal(evaluateQuestionShowcaseContent(
    { type: "mcq_single", prompt: "We did not ____________ in the class." },
    { chapter_title: "Strange Talk" },
  ).pass, false);
  assert.equal(evaluateQuestionShowcaseContent(
    { type: "detailed", prompt: "List the cereals that you eat and explain how they reach your home." },
    { chapter_title: "From HuntingGathering to Growing Food" },
  ).pass, false);
  assert.equal(evaluateQuestionShowcaseContent(
    { type: "one_sentence", prompt: "Write a complete sentence using the word given in brackets." },
    { chapter_title: "डसपटक" },
  ).pass, false);
  const damagedSanskrit = evaluateQuestionShowcaseContent(
    { type: "brief", prompt: "Identify and explain the requested grammatical form in a complete answer." },
    { chapter_title: "अ लटलकर दवतय भवषयतकल" },
  );
  assert.equal(damagedSanskrit.pass, false);
  assert.equal(damagedSanskrit.nativeScriptValidationPassed, false);
  const brokenTamil = {
    type: "mcq_single",
    prompt: "______ is an internal organ.",
    choices: [{ id: "a", content: "Nose" }, { id: "b", content: "Brain" }],
    correctChoiceId: "b",
    explanation: "The brain is inside the skull, while the nose is an external organ is an internal organ.",
  };
  assert.equal(evaluatePostGenerationAnswerQuality(brokenTamil).complete, false);
  assert.equal(evaluatePostGenerationAnswerQuality({
    ...brokenTamil,
    explanation: "The brain is an internal organ because it is located inside the skull. The nose is an external organ.",
  }).complete, true);
});

test("the preferred Accountancy sample remains fully release-eligible", () => {
  const [entry] = QUESTION_SHOWCASE_ENTRIES;
  assert.equal(entry.questionId, "q-cbse-ncert-accountancy-company-accounts-and-analysis-of-financial-statements-class-12-1-001");
  assert.equal(entry.internalMappingConsistent, true);
  assert.equal(entry.knownAuthoritativeMappingMismatch, false);
  assert.equal(entry.authoritativeTextbookMappingVerified, false);
  assert.equal(entry.nativeScriptValidationPassed, true);
  assert.equal(entry.searchExcerptClean, true);
  assert.equal(entry.automatedGatePassed, true);
  assert.equal(entry.finalPublishingGatePassed, true);
  assert.equal(entry.unresolvedContent, false);
  assert.equal(entry.brokenMedia, false);
  assert.equal(entry.duplicateOptions, false);
  assert.equal(entry.runtimePayloadSafe, true);
  assert.equal(entry.contentQualityPassed, true);
  assert.equal(isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, entry.rowId), true);
});

test("every manifest row still matches D1 metadata and the release bitset", () => {
  const database = new DatabaseSync(new URL("../../data/d1/studywudy-content.sqlite3", import.meta.url), { readOnly: true });
  try {
    const statement = database.prepare("SELECT row_id, question_id, book_id, chapter_slug, type FROM catalog_questions WHERE row_id = ?");
    for (const entry of QUESTION_SHOWCASE_ENTRIES) {
      const row = statement.get(entry.rowId);
      assert.ok(row, `missing D1 row ${entry.rowId}`);
      assert.equal(row.question_id, entry.questionId);
      assert.equal(row.book_id, entry.bookId);
      assert.equal(row.chapter_slug, entry.chapterSlug);
      assert.equal(row.type, entry.type);
      assert.equal(isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, row.row_id), true);
    }
  } finally {
    database.close();
  }
});

function card(entry) {
  return `<a href="/fixture/${entry.questionId}" data-question-row-id="${entry.rowId}" data-question-id="${entry.questionId}" data-question-type="${entry.type}" data-question-board="${entry.boardSlug}" data-question-class="${entry.gradeSlug}" data-question-subject="${entry.subjectSlug}" data-question-book="${entry.bookId}" data-question-language="${entry.language}" data-has-diagram="${entry.hasDiagram}" data-search-priority="9" data-search-match="quality-screened-showcase" data-showcase-quality-screened="true" data-internal-mapping-consistent="true" data-authoritative-textbook-mapping-verified="false" data-known-authoritative-mapping-mismatch="false" data-native-script-validation-passed="true" data-search-excerpt-clean="true" data-automated-gate-passed="true" data-final-publishing-gate-passed="true" data-unresolved-content="false" data-broken-media="false" data-duplicate-options="false" data-runtime-payload-safe="true" data-content-quality-passed="true"></a>`;
}

test("crawler-visible showroom inspection rejects missing gate evidence", () => {
  const good = `<h2>Quality-screened sample questions</h2>${QUESTION_SHOWCASE_ENTRIES.map(card).join("")}`;
  assert.deepEqual(inspectQuestionShowcaseHtml(good).failures, []);
  const bad = good.replace('data-automated-gate-passed="true"', 'data-automated-gate-passed="false"');
  assert.ok(inspectQuestionShowcaseHtml(bad).failures.some((failure) => failure.includes("automated gate")));
});

test("production smoke requires the release marker and all 16 quality-screened cards", async () => {
  const html = `<h2>Quality-screened sample questions</h2>${QUESTION_SHOWCASE_ENTRIES.map(card).join("")}`;
  const requests = [];
  const inspection = await smokeQuestionShowcase({
    deploymentUrl: "https://deployment.example/ignored",
    interRequestDelayMs: 0,
    batchPauseMs: 0,
    fetchImpl: async (url) => {
      requests.push(url.toString());
      if (new URL(url).pathname !== "/search") {
        return new Response("<main>Complete answer</main>", {
          status: 200,
          headers: { "x-studywudy-publish-gate": `${PHASE4_GATE_MANIFEST.policyVersion}; complete` },
        });
      }
      return new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-studywudy-question-showcase": QUESTION_SHOWCASE_POLICY_VERSION,
        },
      });
    },
  });
  assert.equal(inspection.cards.length, 16);
  assert.equal(inspection.destinations.length, 16);
  assert.equal(requests.length, 17);
});

test("production smoke rejects a featured answer that is noindex", async () => {
  const html = `<h2>Quality-screened sample questions</h2>${QUESTION_SHOWCASE_ENTRIES.map(card).join("")}`;
  await assert.rejects(
    smokeQuestionShowcase({
      deploymentUrl: "https://deployment.example/ignored",
      interRequestDelayMs: 0,
      batchPauseMs: 0,
      fetchImpl: async (url) => new URL(url).pathname === "/search"
        ? new Response(html, {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-studywudy-question-showcase": QUESTION_SHOWCASE_POLICY_VERSION,
          },
        })
        : new Response("<main>Complete answer</main>", {
          status: 200,
          headers: {
            "x-robots-tag": "noindex, follow",
            "x-studywudy-publish-gate": `${PHASE4_GATE_MANIFEST.policyVersion}; complete`,
          },
        }),
    }),
    /noindex despite being featured/u,
  );
});

test("the Worker queries the generated manifest instead of first database rows", async () => {
  const source = await readFile(new URL("../comparison/after-worker.js", import.meta.url), "utf8");
  assert.match(source, /QUESTION_SHOWCASE_ENTRIES\.map/u);
  assert.match(source, /WHERE q\.row_id = \?/u);
  assert.match(source, /Verified showcase record is missing or stale/u);
  assert.doesNotMatch(source, /ORDER BY CAST\(SUBSTR\(b\.grade_slug, 7\).*LIMIT 4/su);
  assert.match(source, /x-studywudy-question-showcase/u);
});
