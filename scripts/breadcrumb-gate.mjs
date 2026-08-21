#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  academicBreadcrumbItems,
  breadcrumbStructuredData,
  renderBreadcrumbNavigation,
} from "../breadcrumbs.mjs";
import {
  isBookQuarantined,
  repairKnownText,
  reviewedBookTitle,
  reviewedChapterTitle,
} from "../multilingual-text-quality.mjs";

const root = resolve(import.meta.dirname, "..");
const databasePath = resolve(root, "../data/d1/studywudy-content.sqlite3");
const outputPath = resolve(root, "audits/phase-4/breadcrumb-quality.json");
const database = new DatabaseSync(databasePath, { readOnly: true });
const failures = [];
const counts = { board: 0, class: 0, subject: 0, textbook: 0, chapter: 0, question: 0 };

function fail(type, path, reason) {
  if (failures.length < 50) failures.push({ type, path, reason });
}

function expectedPath(record, type) {
  const segments = [record.board_slug];
  if (type !== "board") segments.push(record.grade_slug);
  if (!["board", "class"].includes(type)) segments.push(record.subject_slug);
  if (["textbook", "chapter", "question"].includes(type)) segments.push(record.book_slug);
  if (["chapter", "question"].includes(type)) segments.push(record.chapter_slug);
  if (type === "question") segments.push("questions", record.question_id);
  return `/${segments.join("/")}`;
}

function validate(type, record, expectedDepth) {
  const currentPath = expectedPath(record, type);
  counts[type] += 1;
  try {
    const items = academicBreadcrumbItems(record);
    const navigation = renderBreadcrumbNavigation(items);
    const schema = breadcrumbStructuredData(items);
    const anchorHrefs = [...navigation.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>/gu)].map((match) => match[1]);
    const schemaItems = schema.itemListElement;

    if (items.length !== expectedDepth) fail(type, currentPath, `expected ${expectedDepth} levels, received ${items.length}`);
    if (items.at(-1)?.href !== currentPath) fail(type, currentPath, `current href is ${items.at(-1)?.href || "missing"}`);
    if (anchorHrefs.length !== items.length) fail(type, currentPath, "one or more visible levels is not an anchor with href");
    if (navigation.includes("<span") || !navigation.includes('aria-current="page"')) {
      fail(type, currentPath, "current level is not a linked aria-current page");
    }
    if (schemaItems.length !== items.length) fail(type, currentPath, "BreadcrumbList length does not match visible trail");

    for (let index = 0; index < items.length; index += 1) {
      const visible = items[index];
      const structured = schemaItems[index];
      if (anchorHrefs[index] !== visible.href) fail(type, currentPath, `anchor ${index + 1} does not match its model`);
      if (structured.position !== index + 1 || structured.name !== visible.name || !structured.item) {
        fail(type, currentPath, `structured item ${index + 1} does not match its visible level`);
      }
      if (new URL(structured.item).pathname !== visible.href) {
        fail(type, currentPath, `structured destination ${index + 1} does not match its anchor`);
      }
    }
  } catch (error) {
    fail(type, currentPath, error instanceof Error ? error.message : String(error));
  }
}

for (const record of database.prepare(`SELECT slug AS board_slug, name AS board_name,
  short_name AS board_short_name FROM catalog_boards ORDER BY slug`).iterate()) {
  validate("board", record, 2);
}

for (const record of database.prepare(`SELECT g.board_slug, g.slug AS grade_slug,
  g.class_number, g.label AS grade_label, bo.name AS board_name, bo.short_name AS board_short_name
  FROM catalog_grades g JOIN catalog_boards bo ON bo.slug = g.board_slug
  ORDER BY g.board_slug, g.class_number`).iterate()) {
  validate("class", record, 3);
}

for (const record of database.prepare(`SELECT s.board_slug, s.grade_slug, s.slug AS subject_slug,
  s.name AS subject_name, g.class_number, g.label AS grade_label,
  bo.name AS board_name, bo.short_name AS board_short_name
  FROM catalog_subjects s
  JOIN catalog_boards bo ON bo.slug = s.board_slug
  JOIN catalog_grades g ON g.board_slug = s.board_slug AND g.slug = s.grade_slug
  ORDER BY s.board_slug, s.grade_slug, s.slug`).iterate()) {
  validate("subject", record, 4);
}

for (const record of database.prepare(`SELECT b.id AS book_id, b.board_slug, b.grade_slug,
  b.subject_slug, b.slug AS book_slug, b.title AS book_title,
  bo.name AS board_name, bo.short_name AS board_short_name,
  g.class_number, g.label AS grade_label, s.name AS subject_name
  FROM catalog_books b
  JOIN catalog_boards bo ON bo.slug = b.board_slug
  JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
  JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
    AND s.slug = b.subject_slug
  ORDER BY b.id`).iterate()) {
  if (isBookQuarantined(record.book_id)) continue;
  record.book_title = reviewedBookTitle(record.book_id, repairKnownText(record.book_id, record.book_title));
  validate("textbook", record, 5);
}

for (const record of database.prepare(`SELECT c.book_id, c.slug AS chapter_slug,
  c.number AS chapter_number, c.title AS chapter_title,
  b.board_slug, b.grade_slug, b.subject_slug, b.slug AS book_slug, b.title AS book_title,
  bo.name AS board_name, bo.short_name AS board_short_name,
  g.class_number, g.label AS grade_label, s.name AS subject_name
  FROM catalog_chapters c
  JOIN catalog_books b ON b.id = c.book_id
  JOIN catalog_boards bo ON bo.slug = b.board_slug
  JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
  JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
    AND s.slug = b.subject_slug
  ORDER BY c.book_id, c.position`).iterate()) {
  if (isBookQuarantined(record.book_id)) continue;
  record.book_title = reviewedBookTitle(record.book_id, repairKnownText(record.book_id, record.book_title));
  record.chapter_title = reviewedChapterTitle(
    record.book_id,
    record.chapter_slug,
    repairKnownText(record.book_id, record.chapter_title),
  );
  validate("chapter", record, 6);
}

for (const record of database.prepare(`SELECT q.book_id, q.question_id, q.display_label,
  q.chapter_slug, c.number AS chapter_number, c.title AS chapter_title,
  b.board_slug, b.grade_slug, b.subject_slug, b.slug AS book_slug, b.title AS book_title,
  bo.name AS board_name, bo.short_name AS board_short_name,
  g.class_number, g.label AS grade_label, s.name AS subject_name
  FROM catalog_questions q
  JOIN catalog_books b ON b.id = q.book_id
  JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
  JOIN catalog_boards bo ON bo.slug = b.board_slug
  JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
  JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
    AND s.slug = b.subject_slug
  ORDER BY q.row_id`).iterate()) {
  if (isBookQuarantined(record.book_id)) continue;
  record.book_title = reviewedBookTitle(record.book_id, repairKnownText(record.book_id, record.book_title));
  record.chapter_title = reviewedChapterTitle(
    record.book_id,
    record.chapter_slug,
    repairKnownText(record.book_id, record.chapter_title),
  );
  validate("question", record, 7);
}

const workerSource = readFileSync(resolve(root, "comparison/after-worker.js"), "utf8");
const sourceContract = {
  replacesVisibleTrail: /nav\[aria-label="Breadcrumb"\][\s\S]*element\.replace\(navigation, \{ html: true \}\)/u.test(workerSource),
  replacesExistingSchema: /main > script\[type="application\/ld\+json"\]:first-child[\s\S]*element\.setInnerContent\(structuredData\)/u.test(workerSource),
  marksCurrentAnchor: /aria-current="page"/u.test(readFileSync(resolve(root, "breadcrumbs.mjs"), "utf8")),
  emitsObservabilityHeader: /X-StudyWudy-Breadcrumbs/u.test(workerSource),
  coversBoardPages: /boardLandingResponse[\s\S]*addCanonicalBreadcrumbHandlers/u.test(workerSource),
  coversClassPages: /classCatalogArtworkResponse[\s\S]*addCanonicalBreadcrumbHandlers/u.test(workerSource),
  coversCatalogPages: /academicSearchMetadataResponse[\s\S]*addCanonicalBreadcrumbHandlers/u.test(workerSource),
  coversChapterPages: /chapterPageExperienceResponse[\s\S]*addCanonicalBreadcrumbHandlers/u.test(workerSource),
  coversQuestionPages: /questionMetadataResponse[\s\S]*addCanonicalBreadcrumbHandlers/u.test(workerSource),
};
for (const [name, passed] of Object.entries(sourceContract)) {
  if (!passed) fail("source", "/comparison/after-worker.js", name);
}

const target = academicBreadcrumbItems({
  board_slug: "maharashtra-board",
  grade_slug: "class-12",
  subject_slug: "physics",
  subject_name: "Physics",
  book_slug: "balbharati-physics-standard-12",
  book_title: "Balbharati Physics Standard 12",
  chapter_slug: "electrostatics",
  chapter_number: 8,
  chapter_title: "Electrostatics",
  question_id: "q-msb-balbharati-physics-standard-12-8-002",
  display_label: "2",
});
const expectedTargetLabels = [
  "Home",
  "Maharashtra Board",
  "Class 12",
  "Physics",
  "Balbharati Physics",
  "Chapter 8 Electrostatics",
  "Question 2",
];
if (target.map((item) => item.name).join("\u0000") !== expectedTargetLabels.join("\u0000")) {
  fail("target", target.at(-1).href, "requested hierarchy labels do not match");
}

const report = {
  generatedAt: new Date().toISOString(),
  policy: "Every published board/class/subject/textbook/chapter/question breadcrumb level is a crawlable anchor. Visible and BreadcrumbList labels and destinations come from one canonical route model.",
  counts,
  totalPages: Object.values(counts).reduce((total, count) => total + count, 0),
  sourceContract,
  targetLabels: target.map((item) => item.name),
  failures,
  pass: failures.length === 0,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
database.close();
if (!report.pass) process.exitCode = 1;
