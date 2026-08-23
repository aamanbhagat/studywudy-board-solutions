const POLICY_VERSION = "source-correction-ledger-v1";

const RD_SHARMA_CLASS_10_BOOK_ID = "cbse::class-10::mathematics::rd-sharma-mathematics-class-10";

const CORRECTIONS = Object.freeze({
  [`${RD_SHARMA_CLASS_10_BOOK_ID}:surface-areas-and-volumes:q-cbse-rd-sharma-mathematics-class-10-14-010`]: Object.freeze({
    code: "lead-shot-dropped-digit",
    disposition: "quarantined_pending_primary_source_review",
    publishApproved: false,
    sourceReferenceKey: "cbse::class-10::mathematics::ncert-exemplar-mathematics-exemplar-class-10:surface-areas-and-volumes:q-cbse-ncert-exemplar-mathematics-exemplar-class-10-12-039",
    importedNumbers: Object.freeze(["4.2", "6", "42", "21"]),
    normalizedNumbers: Object.freeze(["4.2", "66", "42", "21"]),
    note: "A parallel exemplar record has the same wording and calculation with 66 cm, not 6 cm.",
  }),
  [`${RD_SHARMA_CLASS_10_BOOK_ID}:surface-areas-and-volumes:q-cbse-rd-sharma-mathematics-class-10-14-019`]: Object.freeze({
    code: "coin-cuboid-extra-digit",
    disposition: "quarantined_pending_primary_source_review",
    publishApproved: false,
    sourceReferenceKey: "maharashtra-board::class-10::mathematics::scert-maharashtra-geometry-mathematics-2-standard-10:mensuration:q-msb-scert-maharashtra-geometry-mathematics-2-standard-10-7-041",
    importedNumbers: Object.freeze(["1.75", "2", "11", "10", "75"]),
    normalizedNumbers: Object.freeze(["1.75", "2", "11", "10", "7"]),
    note: "A parallel source record has the same problem with a 7 cm cuboid height and the integral result 1600.",
  }),
  [`${RD_SHARMA_CLASS_10_BOOK_ID}:probability:q-cbse-rd-sharma-mathematics-class-10-16-125`]: Object.freeze({
    code: "probability-loo-to-100",
    disposition: "quarantined_pending_primary_source_review",
    publishApproved: false,
    importedNumbers: Object.freeze(["200", "50"]),
    normalizedNumbers: Object.freeze(["100", "200", "50"]),
    note: "The imported prompt says loo while every worked step interprets the count as 100.",
  }),
  [`${RD_SHARMA_CLASS_10_BOOK_ID}:probability:q-cbse-rd-sharma-mathematics-class-10-16-127`]: Object.freeze({
    code: "probability-loo-to-100",
    disposition: "quarantined_pending_primary_source_review",
    publishApproved: false,
    importedNumbers: Object.freeze(["200", "50"]),
    normalizedNumbers: Object.freeze(["100", "200", "50"]),
    note: "The imported prompt says loo while every worked step interprets the count as 100.",
  }),
  [`${RD_SHARMA_CLASS_10_BOOK_ID}:probability:q-cbse-rd-sharma-mathematics-class-10-16-129`]: Object.freeze({
    code: "probability-loo-to-100",
    disposition: "quarantined_pending_primary_source_review",
    publishApproved: false,
    importedNumbers: Object.freeze(["200", "50"]),
    normalizedNumbers: Object.freeze(["100", "200", "50"]),
    note: "The imported prompt says loo while every worked step interprets the count as 100.",
  }),
});

const QUESTION_REWRITES = Object.freeze({
  "q-cbse-rd-sharma-mathematics-class-10-14-010": Object.freeze({
    replacements: Object.freeze([
      Object.freeze(["dimensions 6 cm, 42 cm and 21 cm", "dimensions 66 cm, 42 cm and 21 cm"]),
      Object.freeze(["l=6\\text{ cm}", "l=66\\text{ cm}"]),
      Object.freeze(["\\frac{6\\times42\\times21}", "\\frac{66\\times42\\times21}"]),
      Object.freeze(["6\\times42\\times21=5292", "66\\times42\\times21=58212"]),
      Object.freeze([
        "\\frac{5292}{38.808}=136\\frac{4}{11}\\quad\\therefore\\quad N=136\\text{ complete shots}",
        "\\frac{58212}{38.808}=1500\\quad\\therefore\\quad N=1500\\text{ complete shots}",
      ]),
    ]),
    overrides: Object.freeze({ finalAnswer: "$\\boxed{1500\\text{ spherical lead shots}}$" }),
  }),
  "q-cbse-rd-sharma-mathematics-class-10-14-019": Object.freeze({
    replacements: Object.freeze([
      Object.freeze(["11\\text{ cm}\\times10\\text{ cm}\\times75\\text{ cm}", "11\\text{ cm}\\times10\\text{ cm}\\times7\\text{ cm}"]),
      Object.freeze(["H=75\\text{ cm}", "H=7\\text{ cm}"]),
      Object.freeze(["11\\times10\\times75=8250", "11\\times10\\times7=770"]),
      Object.freeze(["\\frac{8250}{77/160}", "\\frac{770}{77/160}"]),
      Object.freeze([
        "\\frac{8250\\times160}{77}=\\frac{120000}{7}=17142\\frac{6}{7}",
        "\\frac{770\\times160}{77}=1600",
      ]),
      Object.freeze(["Simplifying gives a non-integral value.", "Simplifying gives a whole-number count."]),
    ]),
    overrides: Object.freeze({ finalAnswer: "$\\boxed{1600\\text{ coins}}$" }),
  }),
  "q-cbse-rd-sharma-mathematics-class-10-16-125": Object.freeze({
    replacements: Object.freeze([
      Object.freeze(["Interpreting “loo red cards” as $100$ red cards,", "The box contains $100$ red cards,"]),
      Object.freeze(["Interpreting “100 red cards” as $100$ red cards,", "The box contains $100$ red cards,"]),
    ]),
  }),
  "q-cbse-rd-sharma-mathematics-class-10-16-127": Object.freeze({
    replacements: Object.freeze([
      Object.freeze(["Interpreting “loo red cards” as the apparent typo “100 red cards,”", "Using the stated $100$ red cards,"]),
      Object.freeze(["Interpreting “100 red cards” as the apparent typo “100 red cards,”", "Using the stated $100$ red cards,"]),
    ]),
  }),
});

function rewriteStrings(value, replacements) {
  if (typeof value === "string") {
    let output = value;
    for (const [source, replacement] of replacements) output = output.replaceAll(source, replacement);
    return output;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) value[index] = rewriteStrings(value[index], replacements);
    return value;
  }
  if (!value || typeof value !== "object") return value;
  for (const [key, entry] of Object.entries(value)) value[key] = rewriteStrings(entry, replacements);
  return value;
}

function applyVerifiedQuestionCorrections(bookId, payload) {
  if (bookId !== RD_SHARMA_CLASS_10_BOOK_ID || !payload || typeof payload !== "object") return payload;
  for (const chapter of payload.chapters || []) {
    for (const exercise of chapter.exercises || []) {
      for (const question of exercise.questions || []) {
        const rewrite = QUESTION_REWRITES[question?.id];
        if (!rewrite) continue;
        rewriteStrings(question, rewrite.replacements || []);
        Object.assign(question, rewrite.overrides || {});
      }
    }
  }
  return payload;
}

function sourceCorrectionForKey(key) {
  return CORRECTIONS[String(key || "")] || null;
}

export {
  CORRECTIONS as SOURCE_CORRECTION_LEDGER,
  POLICY_VERSION,
  RD_SHARMA_CLASS_10_BOOK_ID,
  applyVerifiedQuestionCorrections,
  sourceCorrectionForKey,
};
