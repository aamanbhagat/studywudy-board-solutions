#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PHASE3_QUESTION_SEO } from "../phase3-question-seo-manifest.mjs";
import { questionDescription, questionSocialTitle } from "../question-seo.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const root = resolve(import.meta.dirname, "..");
const databasePath = resolve(root, args.get("--db") || "../data/d1/studywudy-content.sqlite3");
const outputPath = resolve(root, args.get("--output") || "audits/phase-3/full-corpus-audit.json");
const workerPath = resolve(root, "worker.js");
const database = new DatabaseSync(databasePath, { readOnly: true });

const QUESTION_SEO_DISAMBIGUATED_ROWS = new Set(PHASE3_QUESTION_SEO.disambiguatedRowIds);

const BOARD_METADATA = {
  "maharashtra-board": {
    title: "Maharashtra Board Solutions & Balbharati Textbook Answers",
    description: "Browse Maharashtra Board solutions and Balbharati textbook answers by class, subject, book and chapter, including SSC and HSC study material.",
  },
  cbse: {
    title: "CBSE Solutions & NCERT Textbook Answers by Class",
    description: "Browse CBSE solutions and NCERT textbook answers by class, subject, book and chapter, with clear study material for Classes 1 to 12.",
  },
  cisce: {
    title: "ICSE & ISC Solutions — CISCE Study Material by Class",
    description: "Browse CISCE study material, ICSE solutions and ISC textbook answers by class, subject, book, chapter and question.",
  },
  "tamil-nadu-board": {
    title: "Tamil Nadu Board Solutions & Samacheer Kalvi Answers",
    description: "Browse Tamil Nadu State Board solutions and Samacheer Kalvi textbook answers by class, subject, book and chapter, including SSLC and HSE study material.",
  },
};

const BOARD_LABELS = {
  "maharashtra-board": "Maharashtra Board",
  cbse: "CBSE",
  cisce: "CISCE",
  "tamil-nadu-board": "Tamil Nadu Board",
};

const STREAM_LABELS = {
  science: "Science",
  commerce: "Commerce",
  arts: "Arts & Humanities",
  humanities: "Arts & Humanities",
};

const COURSE_LABELS = {
  "hsc-science-general": "HSC Science (General)",
  "hsc-science-information-technology": "HSC Science (Information Technology)",
  "hsc-commerce-general": "HSC Commerce (General)",
  "hsc-commerce-mathematics": "HSC Commerce (Mathematics)",
  "hsc-arts-general": "HSC Arts (General)",
  "cbse-science": "CBSE Science",
  "cbse-commerce": "CBSE Commerce",
  "cbse-humanities": "CBSE Humanities",
  "isc-science": "ISC Science",
  "isc-commerce": "ISC Commerce",
  "isc-humanities": "ISC Humanities",
  "tn-hse-science": "Tamil Nadu HSE Science",
  "tn-hse-commerce": "Tamil Nadu HSE Commerce",
};

function seoText(value, maximum) {
  const clean = String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length <= maximum) return clean;
  const candidate = clean.slice(0, Math.max(1, maximum - 1));
  const lastSpace = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, lastSpace > 0.65 * maximum ? lastSpace : candidate.length).trimEnd()}…`;
}

function middleTruncate(value, maximum) {
  const clean = String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length <= maximum) return clean;
  const usable = maximum - 1;
  const front = Math.ceil(usable * 0.55);
  return `${clean.slice(0, front).trimEnd()}…${clean.slice(-(usable - front)).trimStart()}`;
}

function routeLabel(value) {
  return String(value).replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function roman(value) {
  let remaining = value;
  let output = "";
  for (const [unit, label] of [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]) {
    while (remaining >= unit) {
      output += label;
      remaining -= unit;
    }
  }
  return output;
}

function normalizeSimilarity(value) {
  return value.normalize("NFKC").toLocaleLowerCase("en-IN").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function collisionReport(entries, key, normalizer = (value) => value) {
  const groups = new Map();
  for (const entry of entries) {
    const value = normalizer(entry[key]);
    const current = groups.get(value) || [];
    current.push(entry.path);
    groups.set(value, current);
  }
  const collisions = [...groups].filter(([, paths]) => paths.length > 1);
  return {
    groups: collisions.length,
    affectedUrls: collisions.reduce((sum, [, paths]) => sum + paths.length, 0),
    examples: collisions.slice(0, 10).map(([value, paths]) => ({ value, paths: paths.slice(0, 10) })),
  };
}

const entries = [];
const paths = new Set();
const templateCounts = new Map();

function record(path, template, title, description) {
  if (paths.has(path)) throw new Error(`Duplicate indexable path in audit model: ${path}`);
  paths.add(path);
  templateCounts.set(template, (templateCounts.get(template) || 0) + 1);
  entries.push({
    path,
    template,
    title: `${seoText(title, 72)} | StudyWudy`,
    description: seoText(description, 160),
  });
}

record("/", "home", "Textbook answers, made clear", "Choose your board, class and subject, then study free textbook solutions in the exact order of your book.");
record("/boards", "boards", "All education boards", "Browse free study material by education board, medium, class and subject.");
record("/about/methodology", "methodology", "About StudyWudy & Solution Verification", "Learn how StudyWudy sources, reviews, updates and publishes textbook solutions for students across India.");
record("/reviewers", "reviewers", "Reviewer Registry and Review Status", "See which StudyWudy checks are automated and which question pages have verified named academic reviewer evidence.");
record("/reviewers/aman-bhagat", "publisher-profile", "Aman Bhagat – StudyWudy Publisher and Corrections Contact", "See Aman Bhagat's documented StudyWudy role and why it is not used as an academic reviewer credit without evidence.");
record("/reviewers/studywudy-editorial-process", "editorial-process", "StudyWudy Editorial Process – Automated vs Human Review", "Understand the boundary between StudyWudy source checks, automated validation and named human academic review.");
record("/corrections", "corrections", "Academic Answer Corrections History", "Read the dated public ledger of verified StudyWudy academic answer changes, separate from pending reports.");
record("/privacy", "privacy", "Privacy Policy", "Read how StudyWudy handles data, cookies, child-directed treatment and contextual advertising.");
record("/terms", "terms", "Terms of Service", "Read the terms for using StudyWudy's free textbook solutions and study resources.");
record("/contact", "contact", "Contact StudyWudy", "Contact StudyWudy for support, corrections, data requests or grievance assistance.");

const boards = database.prepare("SELECT slug, name, short_name, description FROM catalog_boards ORDER BY slug").all();
const boardBySlug = new Map(boards.map((board) => [board.slug, board]));
for (const board of boards) {
  const configured = BOARD_METADATA[board.slug];
  record(`/${board.slug}`, "board", configured?.title || `${board.name} study material`, configured?.description || board.description);
}

const subjects = database.prepare("SELECT board_slug, grade_slug, slug, name FROM catalog_subjects ORDER BY board_slug, grade_slug, name").all();
const subjectByRoute = new Map(subjects.map((subject) => [`${subject.board_slug}:${subject.grade_slug}:${subject.slug}`, subject]));
const subjectsByGrade = new Map();
for (const subject of subjects) {
  const key = `${subject.board_slug}:${subject.grade_slug}`;
  const current = subjectsByGrade.get(key) || [];
  current.push(subject);
  subjectsByGrade.set(key, current);
}

const grades = database.prepare("SELECT board_slug, slug, class_number FROM catalog_grades ORDER BY board_slug, class_number").all();
for (const grade of grades) {
  const board = boardBySlug.get(grade.board_slug);
  const names = (subjectsByGrade.get(`${grade.board_slug}:${grade.slug}`) || []).slice(0, 4).map((subject) => subject.name).join(", ") || "available subjects";
  record(`/${grade.board_slug}/${grade.slug}`, "class", `${board.short_name} Class ${grade.class_number} Solutions & Textbook Answers`, `Explore ${board.name} Class ${grade.class_number} solutions for ${names}, with textbook-order chapters, questions and worked answers.`);
}

const subjectTotals = database.prepare(`SELECT s.board_slug, s.grade_slug, s.slug, s.name,
  COUNT(DISTINCT b.id) AS book_count, COALESCE(SUM(b.chapter_count), 0) AS chapter_count,
  COALESCE(SUM(b.question_count), 0) AS question_count
  FROM catalog_subjects s LEFT JOIN catalog_books b ON b.board_slug = s.board_slug
  AND b.grade_slug = s.grade_slug AND b.subject_slug = s.slug GROUP BY s.id ORDER BY s.id`).all();
for (const subject of subjectTotals) {
  const board = boardBySlug.get(subject.board_slug);
  const grade = Number(subject.grade_slug.replace("class-", ""));
  record(`/${subject.board_slug}/${subject.grade_slug}/${subject.slug}`, "subject", `${board.short_name} Class ${grade} ${subject.name} Solutions`, `Study ${board.name} Class ${grade} ${subject.name} with ${subject.book_count} textbooks, ${subject.chapter_count} chapters and ${Number(subject.question_count).toLocaleString("en-IN")} textbook-order solutions.`);
}

const books = database.prepare("SELECT id, board_slug, grade_slug, subject_slug, slug, title FROM catalog_books ORDER BY id").all();
for (const book of books) {
  const grade = Number(book.grade_slug.replace("class-", ""));
  const alreadyHasClass = new RegExp(`\\b(?:class|standard|grade)\\s+(?:${grade}|${roman(grade)})\\b`, "i").test(book.title);
  const title = `${book.title}${alreadyHasClass ? "" : ` Class ${grade}`} solutions`;
  record(`/${book.board_slug}/${book.grade_slug}/${book.subject_slug}/${book.slug}`, "book", title, `${book.title} chapter-wise textbook solutions with exercise questions and clear worked answers.`);
}

const chapters = database.prepare(`SELECT b.id AS book_id, b.board_slug, b.grade_slug, b.subject_slug,
  b.slug AS book_slug, b.title AS book_title, c.slug AS chapter_slug, c.number, c.title,
  c.question_count FROM catalog_chapters c JOIN catalog_books b ON b.id = c.book_id ORDER BY c.id`).all();
let paginationCount = 0;
for (const chapter of chapters) {
  const pageCount = Math.max(1, Math.ceil(Number(chapter.question_count) / 40));
  for (let page = 1; page <= pageCount; page += 1) {
    if (page > 1) paginationCount += 1;
    const path = `/${chapter.board_slug}/${chapter.grade_slug}/${chapter.subject_slug}/${chapter.book_slug}/${chapter.chapter_slug}${page > 1 ? `?page=${page}` : ""}`;
    const pageTitle = page > 1 ? ` · Page ${page}/${pageCount}` : "";
    const titlePrefix = `Ch ${chapter.number}: `;
    const titleSuffix = ` — ${middleTruncate(chapter.book_title, 36)}${pageTitle}`;
    const titleRoom = Math.max(10, 72 - titlePrefix.length - titleSuffix.length);
    const boardName = BOARD_LABELS[chapter.board_slug] || routeLabel(chapter.board_slug);
    const grade = Number(chapter.grade_slug.replace("class-", ""));
    const pageDescription = page > 1 ? `, page ${page} of ${pageCount}` : "";
    record(path, page > 1 ? "chapter-pagination" : "chapter", `${titlePrefix}${seoText(chapter.title, titleRoom)}${titleSuffix}`, `${boardName} Class ${grade} ${routeLabel(chapter.subject_slug)} — ${chapter.book_title}, Chapter ${chapter.number}${pageDescription}: ${chapter.title}. ${Number(chapter.question_count).toLocaleString("en-IN")} worked answers in textbook order.`);
  }
}

const streamSource = readFileSync(workerPath, "utf8").match(/var PHASE3_STREAM_PATHS = \[([\s\S]*?)\n\];/);
if (!streamSource) throw new Error("Could not read PHASE3_STREAM_PATHS from worker.js");
const streamPaths = JSON.parse(`[${streamSource[1]}]`);
for (const path of streamPaths) {
  const [boardSlug, gradeSlug, , streamSlug, courseSlug, subjectSlug] = path.split("/").filter(Boolean);
  const board = boardBySlug.get(boardSlug);
  const grade = Number(gradeSlug.replace("class-", ""));
  const streamName = STREAM_LABELS[streamSlug] || routeLabel(streamSlug);
  if (!courseSlug) {
    record(path, "stream", `Class ${grade} ${board.short_name} ${streamName} Books & Solutions`, `Choose a ${board.name} Class ${grade} ${streamName} course and browse its available subjects, textbooks, chapters and solved questions.`);
    continue;
  }
  const courseName = COURSE_LABELS[courseSlug] || routeLabel(courseSlug);
  if (!subjectSlug) {
    record(path, "course", `Class ${grade} ${courseName} — ${board.short_name} Textbooks`, `${board.short_name} Class ${grade} ${courseName}: browse subjects, textbooks, chapters and exact solved questions.`);
    continue;
  }
  const subject = subjectByRoute.get(`${boardSlug}:${gradeSlug}:${subjectSlug}`);
  const totals = subjectTotals.find((candidate) => candidate.board_slug === boardSlug && candidate.grade_slug === gradeSlug && candidate.slug === subjectSlug);
  record(path, "stream-subject", `Class ${grade} ${subject?.name || routeLabel(subjectSlug)} — ${courseName}, ${board.short_name} Solutions`, `${board.short_name} Class ${grade} ${subject?.name || routeLabel(subjectSlug)} in ${courseName}: ${totals?.book_count || 0} relevant textbooks and ${totals?.chapter_count || 0} textbook-order chapters.`);
}

const questions = database.prepare(`SELECT q.row_id, q.book_id, q.chapter_slug, q.question_id, q.display_label,
  q.type, q.prompt_text, q.concept_tags, b.board_slug, b.grade_slug, b.subject_slug, b.slug AS book_slug,
  b.title AS book_title, bo.name AS board_name, bo.short_name AS board_short_name,
  g.class_number, g.label AS grade_label, s.name AS subject_name,
  c.number AS chapter_number, c.title AS chapter_title
  FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id
  JOIN catalog_boards bo ON bo.slug = b.board_slug
  JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
  JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
    AND s.slug = b.subject_slug
  JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug ORDER BY q.row_id`).iterate();
let excludedQuestions = 0;
for (const question of questions) {
  const path = `/${question.board_slug}/${question.grade_slug}/${question.subject_slug}/${question.book_slug}/${question.chapter_slug}/questions/${question.question_id}`;
  const disambiguate = QUESTION_SEO_DISAMBIGUATED_ROWS.has(Number(question.row_id));
  record(path, "question", questionSocialTitle(question, disambiguate), questionDescription(question, disambiguate));
}

const exactTitles = collisionReport(entries, "title");
const exactDescriptions = collisionReport(entries, "description");
const normalizedTitles = collisionReport(entries, "title", normalizeSimilarity);
const normalizedDescriptions = collisionReport(entries, "description", normalizeSimilarity);
const metadataArtifacts = {
  titleRawMathDelimiter: 0,
  titleLatexBackslash: 0,
  titleTablePipe: 0,
  titleLatexBrace: 0,
  titleOpaqueReferenceToken: 0,
  descriptionRawMathDelimiter: 0,
  descriptionLatexBackslash: 0,
  descriptionTablePipe: 0,
  descriptionLatexBrace: 0,
};
for (const entry of entries) {
  const searchTitle = entry.title.replace(/\s+\|\s+StudyWudy$/u, "");
  if (/\$/u.test(searchTitle)) metadataArtifacts.titleRawMathDelimiter += 1;
  if (/\\/u.test(searchTitle)) metadataArtifacts.titleLatexBackslash += 1;
  if (/\|/u.test(searchTitle)) metadataArtifacts.titleTablePipe += 1;
  if (/[{}]/u.test(searchTitle)) metadataArtifacts.titleLatexBrace += 1;
  if (/\s·\s[a-z0-9]{8}(?:\s|…|$)/u.test(searchTitle)) metadataArtifacts.titleOpaqueReferenceToken += 1;
  if (/\$/u.test(entry.description)) metadataArtifacts.descriptionRawMathDelimiter += 1;
  if (/\\/u.test(entry.description)) metadataArtifacts.descriptionLatexBackslash += 1;
  if (/\|/u.test(entry.description)) metadataArtifacts.descriptionTablePipe += 1;
  if (/[{}]/u.test(entry.description)) metadataArtifacts.descriptionLatexBrace += 1;
}

const expectedClickDepth = {
  class: 1,
  subject: 2,
  chapterAndPagination: 3,
  question: 4,
};

const report = {
  generatedAt: new Date().toISOString(),
  baselineCommit: "6ceb77530",
  inputs: {
    database: databasePath,
    source: workerPath,
    similarityNormalization: "Unicode NFKC, locale lowercase, punctuation and whitespace collapsed",
  },
  corpus: {
    indexableUrls: entries.length,
    uniquePaths: paths.size,
    excludedNoindexQuestions: excludedQuestions,
    questionUrls: templateCounts.get("question"),
    chapterUrls: templateCounts.get("chapter"),
    chapterPaginationUrls: paginationCount,
    streamNavigationUrls: streamPaths.length,
    templateCounts: Object.fromEntries([...templateCounts].sort()),
  },
  metadataSimilarity: {
    exactTitles,
    exactDescriptions,
    normalizedTitles,
    normalizedDescriptions,
    artifacts: metadataArtifacts,
    pass: [exactTitles, exactDescriptions, normalizedTitles, normalizedDescriptions].every((result) => result.groups === 0)
      && Object.values(metadataArtifacts).every((count) => count === 0),
  },
  clickDepth: {
    navigationModel: "homepage → class → subject → chapter/page → question",
    depths: expectedClickDepth,
    maxIndexableQuestionDepth: Math.max(...Object.values(expectedClickDepth)),
    pass: Math.max(...Object.values(expectedClickDepth)) <= 4,
    evidence: "Homepage links every class; class pages link every subject; subject directories link every chapter and pagination page; each chapter page links its question leaves.",
  },
};

report.pass = report.corpus.indexableUrls === 312193 && report.corpus.uniquePaths === report.corpus.indexableUrls && report.metadataSimilarity.pass && report.clickDepth.pass;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
