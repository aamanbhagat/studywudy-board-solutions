#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";

import {
  POLICY_VERSION,
  REVIEWED_LOCALIZED_BOOK_TITLES,
  applyKnownPayloadRepairs,
  bookIdFromPathname,
  equivalenceAlternates,
  isBookQuarantined,
  languageForBookId,
  repairKnownText,
  reviewedBookTitle,
  reviewedChapterTitle,
  validateImportedText,
} from "../multilingual-text-quality.mjs";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);

function option(name, fallback = null) {
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) return args[index + 1];
  return fallback;
}

function importPayloadGate(inputPath) {
  const absolute = resolve(root, inputPath);
  const payload = JSON.parse(readFileSync(absolute, "utf8"));
  const bookId = option("--book-id") || [
    payload.catalog?.board?.slug,
    payload.catalog?.gradeLevel?.slug,
    payload.catalog?.subject?.slug,
    payload.catalog?.book?.slug,
  ].filter(Boolean).join("::");
  const expectedLanguage = option("--expected-language", languageForBookId(bookId) || "");
  applyKnownPayloadRepairs(bookId, payload);
  const checks = [];
  const inspect = (path, value, field = "text", kind = "prose") => {
    const evaluation = validateImportedText(value, { expectedLanguage, field, kind });
    checks.push({ path, ...evaluation });
  };
  inspect("catalog.book.title", payload.catalog?.book?.title || "", "principal");
  for (const [chapterIndex, chapter] of (payload.chapters || []).entries()) {
    inspect(`chapters[${chapterIndex}].title`, chapter.title || "", "principal");
    inspect(`chapters[${chapterIndex}].summary`, chapter.summary || "");
  }
  const walk = (value, path = "payload") => {
    if (typeof value === "string") {
      if (!/^(?:catalog\.book\.title|chapters\[\d+\]\.(?:title|summary))$/u.test(path)) {
        const formula = /(?:^|\.)(?:formula|equation|source|plainText)$/u.test(path);
        inspect(path, value, "text", formula ? "formula" : "prose");
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
  };
  walk(payload);
  const failures = checks.filter((check) => !check.complete);
  const result = {
    policyVersion: POLICY_VERSION,
    mode: "strict-import",
    input: absolute,
    bookId,
    expectedLanguage: expectedLanguage || null,
    checkedStringCount: checks.length,
    normalizedStringCount: checks.filter((check) => check.changed).length,
    failureCount: failures.length,
    failures: failures.slice(0, 100).map(({ path, input, issues }) => ({ path, input, issues })),
    pass: failures.length === 0,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
}

function sitemapPaths(directory) {
  if (!existsSync(directory)) return [];
  const files = readdirSync(directory).filter((name) => name.endsWith(".xml.gz"));
  const paths = [];
  for (const name of files) {
    const xml = gunzipSync(readFileSync(resolve(directory, name))).toString("utf8");
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/gu)) {
      try { paths.push(new URL(match[1]).pathname); } catch { paths.push(match[1]); }
    }
  }
  return paths;
}

function releaseDatabaseGate() {
  const databasePath = resolve(root, option("--database", "../data/d1/studywudy-content.sqlite3"));
  const outputPath = resolve(root, option("--output", "audits/phase-4/multilingual-text-quality.json"));
  const sitemapDirectory = resolve(root, option("--sitemaps", "comparison/after-assets/sitemaps"));
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const books = database.prepare(`SELECT id, board_slug, grade_slug, subject_slug, slug, title,
    chapter_count, question_count FROM catalog_books ORDER BY id`).all();
  const chaptersByBook = new Map();
  for (const row of database.prepare(`SELECT book_id, slug, number, position, title, summary
    FROM catalog_chapters ORDER BY book_id, position`).iterate()) {
    const list = chaptersByBook.get(row.book_id) || [];
    list.push(row);
    chaptersByBook.set(row.book_id, list);
  }

  const failures = [];
  const corrections = [];
  const localizedBooks = [];
  let checkedTitleCount = 0;
  let sourceDefectCount = 0;
  let checkedLocalizedPromptCount = 0;
  let localizedPromptDefectCount = 0;
  for (const book of books) {
    const language = languageForBookId(book.id);
    const quarantined = isBookQuarantined(book.id);
    const correctedBookTitle = reviewedBookTitle(book.id, repairKnownText(book.id, book.title));
    const originalBook = validateImportedText(book.title, { expectedLanguage: language || "", field: language ? "principal" : "text" });
    const repairedBook = validateImportedText(correctedBookTitle, { expectedLanguage: language || "", field: language ? "principal" : "text" });
    checkedTitleCount += 1;
    if (!originalBook.complete || originalBook.changed || correctedBookTitle !== book.title) sourceDefectCount += 1;
    if (correctedBookTitle !== book.title) corrections.push({ bookId: book.id, field: "book.title", source: book.title, replacement: correctedBookTitle });
    const unresolved = [];
    if (!repairedBook.complete) unresolved.push({ field: "book.title", value: correctedBookTitle, issues: repairedBook.issues });
    for (const chapter of chaptersByBook.get(book.id) || []) {
      const corrected = reviewedChapterTitle(book.id, chapter.slug, repairKnownText(book.id, chapter.title));
      const original = validateImportedText(chapter.title, { expectedLanguage: language || "", field: language ? "principal" : "text" });
      const repaired = validateImportedText(corrected, { expectedLanguage: language || "", field: language ? "principal" : "text" });
      checkedTitleCount += 1;
      if (!original.complete || original.changed || corrected !== chapter.title) sourceDefectCount += 1;
      if (corrected !== chapter.title) corrections.push({ bookId: book.id, chapterSlug: chapter.slug, field: "chapter.title", source: chapter.title, replacement: corrected });
      if (!repaired.complete) unresolved.push({ field: "chapter.title", chapterSlug: chapter.slug, value: corrected, issues: repaired.issues });
    }
    if (language) {
      localizedBooks.push({
        bookId: book.id,
        language,
        quarantined,
        questionCount: Number(book.question_count),
        unresolvedTitleCount: unresolved.length,
      });
    }
    if (unresolved.length > 0 && !quarantined) {
      failures.push({ code: "unresolved-publishable-language-text", bookId: book.id, unresolved: unresolved.slice(0, 20) });
    }
    if (language && quarantined !== (unresolved.length > 0 || !Object.hasOwn(REVIEWED_LOCALIZED_BOOK_TITLES, book.id))) {
      failures.push({ code: "quarantine-policy-mismatch", bookId: book.id, quarantined, unresolvedTitleCount: unresolved.length });
    }
  }

  const reviewedBookIds = new Set(localizedBooks.filter(({ quarantined }) => !quarantined).map(({ bookId }) => bookId));
  for (const question of database.prepare(`SELECT book_id, question_id, prompt_text
    FROM catalog_questions ORDER BY book_id, row_id`).iterate()) {
    if (!reviewedBookIds.has(question.book_id)) continue;
    checkedLocalizedPromptCount += 1;
    const corrected = repairKnownText(question.book_id, question.prompt_text);
    const original = validateImportedText(question.prompt_text, { expectedLanguage: languageForBookId(question.book_id) || "" });
    const repaired = validateImportedText(corrected, { expectedLanguage: languageForBookId(question.book_id) || "" });
    if (!original.complete || original.changed || corrected !== question.prompt_text) localizedPromptDefectCount += 1;
    if (corrected !== question.prompt_text) {
      corrections.push({
        bookId: question.book_id,
        questionId: question.question_id,
        field: "question.prompt",
        source: question.prompt_text,
        replacement: corrected,
      });
    }
    if (!repaired.complete) {
      failures.push({
        code: "unresolved-publishable-language-text",
        bookId: question.book_id,
        questionId: question.question_id,
        unresolved: [{ field: "question.prompt", value: corrected, issues: repaired.issues }],
      });
    }
  }

  const sitemapEntries = sitemapPaths(sitemapDirectory);
  const quarantinedSitemapPaths = sitemapEntries.filter((pathname) => {
    const bookId = bookIdFromPathname(pathname);
    return bookId && isBookQuarantined(bookId);
  });
  if (quarantinedSitemapPaths.length > 0) {
    failures.push({ code: "quarantined-route-in-sitemap", count: quarantinedSitemapPaths.length, examples: quarantinedSitemapPaths.slice(0, 20) });
  }

  const standardEnglish = "/cbse/class-10/science/ncert-science-class-10/chemical-reactions-and-equations";
  const standardHindi = "/cbse/class-10/science/ncert-vigyaan-hindi-class-10/chapter-1";
  const englishAlternates = equivalenceAlternates(standardEnglish);
  const hindiAlternates = equivalenceAlternates(standardHindi);
  if (!englishAlternates || !hindiAlternates
    || englishAlternates.en !== hindiAlternates.en || englishAlternates.hi !== hindiAlternates.hi) {
    failures.push({ code: "non-reciprocal-hreflang-registry" });
  }

  const workerSource = readFileSync(resolve(root, "comparison/after-worker.js"), "utf8");
  const sourceContracts = {
    runtimeQuarantine: /isBookQuarantined/u.test(workerSource),
    pageLanguage: /setAttribute\("lang", localization\.language\)/u.test(workerSource),
    selfCanonical: /localizedCanonicalUrl/u.test(workerSource),
    reciprocalHreflang: /hreflang/u.test(workerSource),
    importPayloadRepairs: /applyKnownPayloadRepairs/u.test(workerSource),
  };
  for (const [contract, pass] of Object.entries(sourceContracts)) {
    if (!pass) failures.push({ code: "runtime-source-contract", contract });
  }

  const correctedTax = corrections.some(({ source, replacement }) => source === "Goods and Services Taх" && replacement === "Goods and Services Tax");
  const correctedHindiExample = corrections.filter(({ source, replacement }) =>
    source === "रसयनक अभकरयए एव समकरण" && replacement === "रासायनिक अभिक्रियाएँ एवं समीकरण"
  ).length === 2;
  if (!correctedTax) failures.push({ code: "reported-tax-confusable-not-repaired" });
  if (!correctedHindiExample) failures.push({ code: "reported-hindi-title-not-repaired-in-both-books" });

  const localizedQuestionCount = localizedBooks.reduce((total, book) => total + book.questionCount, 0);
  const quarantinedQuestionCount = localizedBooks.filter((book) => book.quarantined)
    .reduce((total, book) => total + book.questionCount, 0);
  const report = {
    generatedAt: new Date().toISOString(),
    policyVersion: POLICY_VERSION,
    sourceDatabase: databasePath,
    importValidation: {
      unicodeNormalization: "NFC is applied before validation.",
      mixedScriptConfusables: "Safe Latin-token confusables are repaired; unresolved mixed-script tokens fail.",
      devanagari: "Consonant-heavy Hindi titles with missing dependent marks fail.",
      ocr: "Replacement, mojibake, invalid-control, and cross-script residue fail.",
      mathematics: "Numeric multiplication, exponent minus, scientific spacing, and unit attachment are checked in formula fields.",
      tamil: "Dependent signs must remain attached and ordered; Latin transliteration cannot replace a Tamil principal title.",
    },
    corpus: {
      bookCount: books.length,
      checkedTitleCount,
      checkedLocalizedPromptCount,
      sourceDefectCount,
      localizedPromptDefectCount,
      safeOrVerifiedCorrectionCount: corrections.length,
      localizedBookCount: localizedBooks.length,
      localizedQuestionCount,
      reviewedLocalizedBookCount: localizedBooks.filter((book) => !book.quarantined).length,
      quarantinedLocalizedBookCount: localizedBooks.filter((book) => book.quarantined).length,
      quarantinedQuestionCount,
      tamilLanguageBookCount: localizedBooks.filter((book) => book.language === "ta").length,
    },
    routing: {
      separateLanguageUrls: true,
      selfCanonicalLanguagePages: true,
      verifiedReciprocalHreflangPairsOnly: true,
      hindiOrTamilCanonicalizedToEnglish: false,
      quarantinedSitemapPathCount: quarantinedSitemapPaths.length,
    },
    sourceContracts,
    correctedExamples: corrections.filter(({ source }) => source === "रसयनक अभकरयए एव समकरण" || source === "Goods and Services Taх"),
    localizedBooks,
    sampleCorrections: corrections.slice(0, 80),
    failureCount: failures.length,
    failures,
    pass: failures.length === 0,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  database.close();
  console.log(JSON.stringify({
    policyVersion: report.policyVersion,
    checkedTitleCount,
    checkedLocalizedPromptCount,
    correctionCount: corrections.length,
    reviewedLocalizedBookCount: report.corpus.reviewedLocalizedBookCount,
    quarantinedLocalizedBookCount: report.corpus.quarantinedLocalizedBookCount,
    quarantinedQuestionCount,
    failureCount: failures.length,
    pass: report.pass,
  }, null, 2));
  if (!report.pass) process.exitCode = 1;
}

const input = option("--input");
if (input) importPayloadGate(input);
else releaseDatabaseGate();
