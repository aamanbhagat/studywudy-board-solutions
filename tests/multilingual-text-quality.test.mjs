import assert from "node:assert/strict";
import test from "node:test";

import {
  EXEMPLAR_HINDI_BOOK_ID,
  FRANK_MATHEMATICS_BOOK_ID,
  STANDARD_HINDI_BOOK_ID,
  applyKnownPayloadRepairs,
  equivalenceAlternates,
  isBookQuarantined,
  languageForBookId,
  localizationForPathname,
  repairKnownText,
  validateImportedText,
} from "../multilingual-text-quality.mjs";

test("normalizes Unicode NFC without losing native text", () => {
  const decomposed = "e\u0301";
  const result = validateImportedText(decomposed);
  assert.equal(result.value, "é");
  assert.equal(result.complete, true);
  assert.deepEqual(result.repairs.map(({ code }) => code), ["unicode-nfc"]);
});

test("repairs a Cyrillic confusable inside a Latin word", () => {
  const result = validateImportedText("Goods and Services Taх", { field: "principal" });
  assert.equal(result.value, "Goods and Services Tax");
  assert.equal(result.complete, true);
  assert.equal(result.repairs[0].code, "mixed-script-confusable");
});

test("rejects unresolved mixed-script tokens", () => {
  const result = validateImportedText("Taж", { field: "principal" });
  assert.equal(result.complete, false);
  assert(result.issues.some(({ code }) => code === "mixed-script-token"));
});

test("detects stripped Devanagari vowel marks but accepts the verified Hindi title", () => {
  const damaged = validateImportedText("रसयनक अभकरयए एव समकरण", {
    expectedLanguage: "hi",
    field: "principal",
  });
  const corrected = validateImportedText("रासायनिक अभिक्रियाएँ एवं समीकरण", {
    expectedLanguage: "hi",
    field: "principal",
  });
  assert.equal(damaged.complete, false);
  assert(damaged.issues.some(({ code }) => code === "missing-devanagari-vowel-marks"));
  assert.equal(corrected.complete, true);
});

test("rejects Hindi and Tamil transliteration in principal titles", () => {
  const hindi = validateImportedText("Rasayanik Abhikriyaen", { expectedLanguage: "hi", field: "principal" });
  const tamil = validateImportedText("Kanakku", { expectedLanguage: "ta", field: "principal" });
  assert(hindi.issues.some(({ code }) => code === "transliteration-instead-of-native-text"));
  assert(tamil.issues.some(({ code }) => code === "transliteration-instead-of-native-text"));
});

test("detects OCR and Tamil combining corruption", () => {
  const ocr = validateImportedText("Science � Chapter");
  const tamil = validateImportedText("ாதமிழ்", { expectedLanguage: "ta", field: "principal" });
  assert(ocr.issues.some(({ code }) => code === "ocr-or-encoding-corruption"));
  assert(tamil.issues.some(({ code }) => code === "broken-tamil-combining-sequence"));
});

test("rejects malformed scientific notation, symbols, and detached units", () => {
  const result = validateImportedText("1 0^-8 x 2   kg", { kind: "formula" });
  const codes = new Set(result.issues.map(({ code }) => code));
  assert(codes.has("incorrect-multiplication-symbol"));
  assert(codes.has("ascii-hyphen-as-minus"));
  assert(codes.has("repeated-whitespace-in-scientific-notation"));
  assert(codes.has("detached-unit"));
});

test("applies the verified Hindi and Tax title repairs to imported payloads", () => {
  const hindiPayload = {
    catalog: { book: { title: "NCERT Vigyaan Hindi Class 10" } },
    chapters: [{ slug: "chapter-1", title: "रसयनक अभकरयए एव समकरण", summary: "रसयनक अभकरयए एव समकरण revision." }],
  };
  applyKnownPayloadRepairs(STANDARD_HINDI_BOOK_ID, hindiPayload);
  assert.equal(hindiPayload.catalog.book.title, "एनसीईआरटी विज्ञान — कक्षा 10");
  assert.equal(hindiPayload.chapters[0].title, "रासायनिक अभिक्रियाएँ एवं समीकरण");
  assert.match(hindiPayload.chapters[0].summary, /रासायनिक अभिक्रियाएँ एवं समीकरण/u);
  assert.equal(
    repairKnownText(EXEMPLAR_HINDI_BOOK_ID, "वददत धर क चबकय परभव"),
    "विद्युत धारा के चुंबकीय प्रभाव",
  );
  assert.equal(
    repairKnownText(EXEMPLAR_HINDI_BOOK_ID, "CO_(2) देता हैजबकि Bगरम करने पर SO_(2) देता हैइनको"),
    "CO_(2) देता है जबकि B गरम करने पर SO_(2) देता है। इनको",
  );
  assert.equal(repairKnownText(STANDARD_HINDI_BOOK_ID, "संlद्रता"), "सांद्रता");
  assert.equal(repairKnownText(FRANK_MATHEMATICS_BOOK_ID, "Goods and Services Taх"), "Goods and Services Tax");
});

test("recognizes language editions and quarantines unreviewed imports", () => {
  assert.equal(languageForBookId(STANDARD_HINDI_BOOK_ID), "hi");
  assert.equal(languageForBookId("cbse::class-8::tamil::ncert-tamil-class-8"), "ta");
  assert.equal(isBookQuarantined(STANDARD_HINDI_BOOK_ID), false);
  assert.equal(isBookQuarantined(EXEMPLAR_HINDI_BOOK_ID), false);
  assert.equal(isBookQuarantined("cbse::class-9::science::ncert-science-hindi-class-9"), true);
});

test("provides reciprocal hreflang only for verified equivalent URLs", () => {
  const english = "/cbse/class-10/science/ncert-science-class-10/chemical-reactions-and-equations";
  const hindi = "/cbse/class-10/science/ncert-vigyaan-hindi-class-10/chapter-1";
  assert.deepEqual(equivalenceAlternates(english), { en: english, hi: hindi });
  assert.deepEqual(equivalenceAlternates(hindi), { en: english, hi: hindi });
  assert.equal(equivalenceAlternates(`${hindi}/questions/example`), null);
});

test("returns native metadata and self-route identity for a Hindi chapter", () => {
  const pathname = "/cbse/class-10/science/ncert-vigyaan-hindi-class-10/chapter-1";
  const localized = localizationForPathname(pathname);
  assert.equal(localized.pathname, pathname);
  assert.equal(localized.language, "hi");
  assert.equal(localized.bookTitle, "एनसीईआरटी विज्ञान — कक्षा 10");
  assert.equal(localized.chapterTitle, "रासायनिक अभिक्रियाएँ एवं समीकरण");
  assert.equal(localized.quarantined, false);
});
