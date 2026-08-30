#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PHASE3_QUESTION_SEO } from "../phase3-question-seo-manifest.mjs";
import { isBookQuarantined } from "../multilingual-text-quality.mjs";
import { SERP_TITLE_BUDGET, questionDocumentTitle, questionSocialTitle } from "../question-seo.mjs";
import {
  bookSearchMetadata,
  chapterSearchMetadata,
  subjectSearchMetadata,
} from "../search-metadata.mjs";
import { serpCollisionGroups } from "../technical-seo.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(argument, next);
    index += 1;
  } else args.set(argument, true);
}

const root = resolve(import.meta.dirname, "..");
const databasePath = resolve(root, args.get("--source-db") || "../data/d1/studywudy-content.sqlite3");
const outputPath = resolve(root, args.get("--output") || "audits/phase-4/search-metadata-quality.json");
const database = new DatabaseSync(databasePath, { readOnly: true });

const books = database.prepare(`SELECT b.id AS book_id, b.slug AS book_slug, b.title AS book_title,
  b.board_slug, b.grade_slug, b.subject_slug, b.chapter_count, b.question_count,
  bo.name AS board_name, bo.short_name AS board_short_name,
  g.class_number, g.label AS grade_label, s.name AS subject_name
  FROM catalog_books b
  JOIN catalog_boards bo ON bo.slug = b.board_slug
  JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
  JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
    AND s.slug = b.subject_slug
  ORDER BY b.id`).all().filter((book) => !isBookQuarantined(book.book_id));

const records = [];
const booksBySubject = new Map();
for (const book of books) {
  const key = `${book.board_slug}/${book.grade_slug}/${book.subject_slug}`;
  const group = booksBySubject.get(key) || [];
  group.push(book);
  booksBySubject.set(key, group);
}

for (const [path, subjectBooks] of booksBySubject) {
  const metadata = subjectSearchMetadata({
    ...subjectBooks[0],
    book_count: subjectBooks.length,
    chapter_count: subjectBooks.reduce((total, book) => total + Number(book.chapter_count), 0),
    question_count: subjectBooks.reduce((total, book) => total + Number(book.question_count), 0),
  });
  records.push({ type: "subject", path: `/${path}`, ...metadata });
}

for (const book of books) {
  records.push({
    type: "book",
    path: `/${book.board_slug}/${book.grade_slug}/${book.subject_slug}/${book.book_slug}`,
    ...bookSearchMetadata({ ...book, book_code: PHASE3_QUESTION_SEO.bookTitleCodes[book.book_id] }),
  });
}

const questionsByChapter = new Map();
for (const question of database.prepare(`SELECT book_id, chapter_slug, type, prompt_text
  FROM catalog_questions ORDER BY row_id`).iterate()) {
  const key = `${question.book_id}\u0000${question.chapter_slug}`;
  const questions = questionsByChapter.get(key) || [];
  questions.push(question);
  questionsByChapter.set(key, questions);
}

for (const chapter of database.prepare(`SELECT c.book_id, c.slug AS chapter_slug,
  c.number AS chapter_number, c.title AS chapter_title, c.question_count,
  b.slug AS book_slug, b.title AS book_title, b.board_slug, b.grade_slug, b.subject_slug,
  bo.name AS board_name, bo.short_name AS board_short_name,
  g.class_number, g.label AS grade_label, s.name AS subject_name
  FROM catalog_chapters c
  JOIN catalog_books b ON b.id = c.book_id
  JOIN catalog_boards bo ON bo.slug = b.board_slug
  JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
  JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
    AND s.slug = b.subject_slug
  ORDER BY c.book_id, c.position`).iterate()) {
  if (isBookQuarantined(chapter.book_id)) continue;
  const questions = questionsByChapter.get(`${chapter.book_id}\u0000${chapter.chapter_slug}`) || [];
  records.push({
    type: "chapter",
    path: `/${chapter.board_slug}/${chapter.grade_slug}/${chapter.subject_slug}/${chapter.book_slug}/${chapter.chapter_slug}`,
    ...chapterSearchMetadata({ ...chapter, book_code: PHASE3_QUESTION_SEO.bookTitleCodes[chapter.book_id] }, questions),
  });
}

function normalized(value) {
  return value.normalize("NFKC").toLocaleLowerCase("en-IN").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function duplicateGroups(field) {
  const groups = new Map();
  const seenPaths = new Set();
  for (const record of records) {
    if (seenPaths.has(record.path)) continue;
    seenPaths.add(record.path);
    const key = normalized(record[field]);
    const group = groups.get(key) || [];
    group.push({ type: record.type, path: record.path, value: record[field] });
    groups.set(key, group);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

const targetSubjectPath = "/maharashtra-board/class-12/physics";
const targetBookPath = `${targetSubjectPath}/balbharati-physics-standard-12`;
const targetChapterPath = `${targetBookPath}/electrostatics`;
const targetSubject = records.find((record) => record.path === targetSubjectPath);
const targetBook = records.find((record) => record.path === targetBookPath);
const targetChapter = records.find((record) => record.path === targetChapterPath);
const targetQuestion = database.prepare(`SELECT q.row_id, q.book_id, q.question_id, q.display_label,
  q.type, q.prompt_text, q.concept_tags, b.title AS book_title,
  b.board_slug, b.grade_slug, b.subject_slug,
  bo.name AS board_name, bo.short_name AS board_short_name,
  g.class_number, g.label AS grade_label, s.name AS subject_name,
  c.number AS chapter_number, c.title AS chapter_title
  FROM catalog_questions q
  JOIN catalog_books b ON b.id = q.book_id
  JOIN catalog_boards bo ON bo.slug = b.board_slug
  JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
  JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
    AND s.slug = b.subject_slug
  JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
  WHERE q.question_id = ? LIMIT 1`).get("q-msb-balbharati-physics-standard-12-8-002");
const disambiguatedQuestionRows = new Set(PHASE3_QUESTION_SEO.disambiguatedRowIds);
// The document title takes the book's group-minimal code so its identifying
// tokens land inside the SERP window; the social title stays prompt-first and
// takes the appended qualifier, which og:title has room for.
const targetQuestionTitle = questionDocumentTitle(
  targetQuestion,
  PHASE3_QUESTION_SEO.bookTitleCodes[targetQuestion.book_id],
);
const targetQuestionSocialTitle = questionSocialTitle(
  targetQuestion,
  disambiguatedQuestionRows.has(Number(targetQuestion.row_id)),
);

const duplicateDescriptions = duplicateGroups("description");
const duplicateTitles = duplicateGroups("documentTitle");
const titleLengths = records.map((record) => [...record.documentTitle].length);
const descriptionLengths = records.map((record) => [...record.description].length);
const exactTemplates = {
  subject: targetSubject?.documentTitle === "Maharashtra Board Class 12 Physics Textbook Solutions | StudyWudy",
  textbook: targetBook?.documentTitle === "Balbharati Class 12 Physics Solutions | StudyWudy",
  chapter: targetChapter?.documentTitle === "Balbharati Cl12 Physics Ch8: Electrostatics Solutions | StudyWudy",
  normalizedQuestionType: targetQuestionSocialTitle === "Dielectric Slab Capacitor MCQ Solution – Class 12 Physics Chapter 8",
};
const serpEvidence = {
  questionIdentityLeadsTitle: targetQuestionTitle === "Balbharati Cl12 Physics Ch8 Q2: A slab of material of…",
  questionTitleWithinSerpBudget: [...targetQuestionTitle].length <= SERP_TITLE_BUDGET,
  // Google appends the site name to the SERP line itself; spending 12 characters
  // of a 60-character budget repeating it is what pushed the identity out of view.
  questionTitleDropsBrandSuffix: !/\|\s*StudyWudy\s*$/u.test(targetQuestionTitle),
  hubTitlesKeepBrandSuffix: [targetSubject, targetBook, targetChapter]
    .every((record) => /\|\s*StudyWudy\s*$/u.test(record?.documentTitle || "")),
};
// Google clips the SERP line by pixel width, so the cut floats: a hub title that
// is unique at 60 characters can still be a duplicate at 50. Measuring one budget
// is what let 1,439 hub pages ship a shared visible title.
const HUB_SERP_BUDGETS = [45, 50, 55, 60];
const hubSerpEntries = records.map((record) => ({ path: record.path, title: record.documentTitle }));
const hubSerpCollisions = Object.fromEntries(HUB_SERP_BUDGETS.map((budget) => {
  const report = serpCollisionGroups(hubSerpEntries, budget);
  return [budget, {
    collisionGroups: report.collisionGroups,
    collidingPages: report.collidingPages,
    paths: report.largestGroups.flatMap((group) => group.examplePaths).sort(),
  }];
}));
// Two Maharashtra subjects are named "Information Technology" and "Information
// Technology (Commerce)", so a board-first subject title cannot separate them
// before character 51. Naming the pair rather than allowing a count keeps the
// gate tight: any *other* hub collision at 45 or 50 still fails it.
const KNOWN_TIGHT_BUDGET_COLLISION = [
  "/maharashtra-board/class-12/information-technology",
  "/maharashtra-board/class-12/information-technology-commerce",
];
const hubSerpEvidence = {
  noHubCollisionsAtSixty: hubSerpCollisions[60].collidingPages === 0,
  noHubCollisionsAtFiftyFive: hubSerpCollisions[55].collidingPages === 0,
  onlyKnownHubCollisionsWhenClippedTight: [45, 50].every((budget) =>
    JSON.stringify(hubSerpCollisions[budget].paths) === JSON.stringify(KNOWN_TIGHT_BUDGET_COLLISION)),
};
const descriptionEvidence = {
  electrostaticsHasRealTypeMix: /including MCQs, brief answers, capacitor numericals/iu.test(targetChapter?.description || ""),
  electrostaticsNamesSourceTextbook: /Balbharati Physics Standard 12/iu.test(targetChapter?.description || ""),
  noDuplicateDescriptions: duplicateDescriptions.length === 0,
};
const report = {
  generatedAt: new Date().toISOString(),
  sourceDatabase: databasePath,
  policy: "Titles use board/class/subject/book/chapter/question intent; descriptions use catalogue counts, type mix and source identity. Visible question H1 text is not rewritten by this gate.",
  corpus: {
    subjects: records.filter((record) => record.type === "subject").length,
    textbooks: records.filter((record) => record.type === "book").length,
    chapters: records.filter((record) => record.type === "chapter").length,
    totalPages: records.length,
  },
  exactTemplates,
  serpEvidence,
  hubSerpEvidence,
  hubSerpCollisions,
  descriptionEvidence,
  duplicateTitleGroups: duplicateTitles.length,
  duplicateTitleCompositions: Object.fromEntries([...duplicateTitles.reduce((counts, group) => {
    const composition = [...new Set(group.map((entry) => entry.type))].sort().join("+");
    counts.set(composition, (counts.get(composition) || 0) + 1);
    return counts;
  }, new Map())].sort()),
  duplicateTitleSamples: duplicateTitles.slice(0, 12),
  duplicateDescriptionGroups: duplicateDescriptions.length,
  titleLength: { minimum: Math.min(...titleLengths), maximum: Math.max(...titleLengths) },
  descriptionLength: { minimum: Math.min(...descriptionLengths), maximum: Math.max(...descriptionLengths) },
  questionCorpus: {
    count: PHASE3_QUESTION_SEO.corpusCount,
    disambiguatedCount: PHASE3_QUESTION_SEO.disambiguatedCount,
    bookTitleCodeCount: Object.keys(PHASE3_QUESTION_SEO.bookTitleCodes).length,
    targetQuestionDocumentTitle: targetQuestionTitle,
    targetNormalizedQuestionTitle: targetQuestionSocialTitle,
  },
  targetElectrostatics: {
    title: targetChapter?.documentTitle,
    description: targetChapter?.description,
  },
};
report.pass = Object.values(exactTemplates).every(Boolean)
  && Object.values(serpEvidence).every(Boolean)
  && Object.values(hubSerpEvidence).every(Boolean)
  && Object.values(descriptionEvidence).every(Boolean)
  && report.duplicateTitleGroups === 0
  && report.titleLength.maximum <= 160;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
database.close();
if (!report.pass) process.exitCode = 1;
