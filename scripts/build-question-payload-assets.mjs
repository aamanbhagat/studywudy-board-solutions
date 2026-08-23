#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync, gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const databasePath = resolve(root, "../data/d1/studywudy-content.sqlite3");
const outputRoot = resolve(root, "comparison/after-assets/__studywudy_payloads");
const modulePath = resolve(root, "question-payload-assets-manifest.mjs");
const minimumBookCompressedBytes = 0;
const maximumQuestionCompressedBytes = 512 * 1024;
const maximumQuestionDecodedBytes = 4 * 1024 * 1024;
const maximumPackBytes = 25 * 1024 * 1024;
const mode = process.argv[2];

if (!new Set(["--write", "--check"]).has(mode)) {
  throw new Error("Usage: node scripts/build-question-payload-assets.mjs --write|--check");
}

function safeSlug(value, label) {
  const normalized = String(value || "");
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(normalized)) throw new Error(`Unsafe ${label}: ${normalized}`);
  return normalized;
}

function walkFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function chapterPayload(payload, chapter) {
  return {
    catalog: payload.catalog,
    textbookEdition: payload.textbookEdition,
    sourceEdition: payload.sourceEdition,
    academicYear: payload.academicYear,
    sourceAcademicYear: payload.sourceAcademicYear,
    sourceChecksum: payload.sourceChecksum,
    sourceVersion: payload.sourceVersion,
    chapters: [chapter],
  };
}

function flattenQuestions(question) {
  if (!question || typeof question !== "object") return [];
  return [question, ...(question.subQuestions || []).flatMap(flattenQuestions)];
}

function packedQuestionPayload(payload, chapter, exercise, question) {
  const { exercises: _chapterExercises, ...chapterMetadata } = chapter;
  const { questions: _exerciseQuestions, ...exerciseMetadata } = exercise;
  return chapterPayload(payload, {
    ...chapterMetadata,
    exercises: [{ ...exerciseMetadata, questions: [question] }],
  });
}

function questionIndex(records) {
  const bytes = Buffer.alloc(12 + records.length * 12);
  bytes.write("SWQP", 0, "ascii");
  bytes.writeUInt32LE(1, 4);
  bytes.writeUInt32LE(records.length, 8);
  records.forEach((record, index) => {
    const offset = 12 + index * 12;
    bytes.writeUInt32LE(record.rowId, offset);
    bytes.writeUInt32LE(record.packOffset, offset + 4);
    bytes.writeUInt32LE(record.packLength, offset + 8);
  });
  return bytes;
}

function expectedAssets() {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const books = database.prepare(`SELECT book_id, SUM(LENGTH(content_chunk)) AS compressed_bytes
    FROM catalog_book_chunks
    GROUP BY book_id
    HAVING compressed_bytes > ?
    ORDER BY book_id`).all(minimumBookCompressedBytes);
  const chunksForBook = database.prepare(
    "SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index",
  );
  const catalogQuestionsForBook = database.prepare(
    "SELECT row_id, chapter_slug, question_id FROM catalog_questions WHERE book_id = ? ORDER BY row_id",
  );
  const files = new Map();
  let decodedBytes = 0;
  let compressedBytes = 0;
  let indexBytes = 0;
  let questionCount = 0;
  let chapterCount = 0;
  const missingCatalogQuestions = [];

  for (const book of books) {
    const route = String(book.book_id).split("::");
    if (route.length !== 4) throw new Error(`Unexpected book id: ${book.book_id}`);
    const [board, grade, subject, bookSlug] = route.map((part, index) => safeSlug(part, `book route segment ${index + 1}`));
    const chunks = chunksForBook.all(book.book_id).map((row) => Buffer.from(row.content_chunk));
    const payload = JSON.parse(gunzipSync(Buffer.concat(chunks)).toString("utf8"));
    const catalogRowsByChapter = new Map();
    for (const row of catalogQuestionsForBook.all(book.book_id)) {
      if (!catalogRowsByChapter.has(row.chapter_slug)) catalogRowsByChapter.set(row.chapter_slug, []);
      catalogRowsByChapter.get(row.chapter_slug).push(row);
    }
    for (const chapter of payload.chapters || []) {
      const chapterSlug = safeSlug(chapter.slug, "chapter slug");
      const payloadQuestions = new Map();
      for (const exercise of chapter.exercises || []) {
        for (const question of (exercise.questions || []).flatMap(flattenQuestions)) {
          if (question?.id) payloadQuestions.set(question.id, { exercise, question });
        }
      }
      const records = [];
      const packed = [];
      let packOffset = 0;
      for (const row of catalogRowsByChapter.get(chapter.slug) || []) {
        const context = payloadQuestions.get(row.question_id);
        if (!context) {
          missingCatalogQuestions.push(`${book.book_id}:${chapter.slug}:${row.question_id}`);
          continue;
        }
        const decoded = Buffer.from(JSON.stringify(packedQuestionPayload(payload, chapter, context.exercise, context.question)));
        const compressed = gzipSync(decoded, { level: 9 });
        if (decoded.byteLength > maximumQuestionDecodedBytes || compressed.byteLength > maximumQuestionCompressedBytes) {
          throw new Error(`Question payload exceeds the runtime bound: ${book.book_id}:${chapterSlug}:${row.question_id}`);
        }
        records.push({ rowId: Number(row.row_id), packOffset, packLength: compressed.byteLength });
        packed.push(compressed);
        packOffset += compressed.byteLength;
        decodedBytes += decoded.byteLength;
        compressedBytes += compressed.byteLength;
        questionCount += 1;
      }
      if (!records.length) continue;
      const pack = Buffer.concat(packed);
      if (pack.byteLength > maximumPackBytes) throw new Error(`Question pack exceeds the static asset limit: ${book.book_id}:${chapterSlug}`);
      const index = questionIndex(records);
      const pathname = `${board}/${grade}/${subject}/${bookSlug}/${chapterSlug}`;
      files.set(`${pathname}.idx`, index);
      files.set(`${pathname}.pack`, pack);
      indexBytes += index.byteLength;
      chapterCount += 1;
    }
  }
  database.close();

  if (missingCatalogQuestions.length) {
    throw new Error(`${missingCatalogQuestions.length} catalog questions are missing from packed source payloads:\n${missingCatalogQuestions.slice(0, 20).join("\n")}`);
  }

  const manifest = {
    policyVersion: "all-question-payload-pack-v3",
    minimumBookCompressedBytes,
    maximumQuestionCompressedBytes,
    maximumQuestionDecodedBytes,
    maximumPackBytes,
    bookCount: books.length,
    bookIds: books.map((book) => book.book_id),
    chapterCount,
    questionCount,
    decodedBytes,
    compressedBytes,
    indexBytes,
    contentSha256: createHash("sha256")
      .update([...files.entries()].map(([pathname, bytes]) => `${pathname}\0${createHash("sha256").update(bytes).digest("hex")}\n`).join(""))
      .digest("hex"),
  };
  files.set("manifest.json", Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  const moduleSource = `// Generated by scripts/build-question-payload-assets.mjs. Do not edit by hand.\nexport const QUESTION_PAYLOAD_ASSET_MANIFEST = Object.freeze(${JSON.stringify(manifest)});\n`;
  return { files, manifest, moduleSource };
}

function writeAssets(files, moduleSource) {
  rmSync(outputRoot, { recursive: true, force: true });
  for (const [pathname, bytes] of files) {
    const destination = resolve(outputRoot, pathname);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
  }
  writeFileSync(modulePath, moduleSource);
}

function checkAssets(files, moduleSource) {
  const expected = new Set(files.keys());
  const failures = [];
  for (const [pathname, bytes] of files) {
    const destination = resolve(outputRoot, pathname);
    if (!existsSync(destination)) failures.push(`missing: ${pathname}`);
    else if (!readFileSync(destination).equals(bytes)) failures.push(`changed: ${pathname}`);
  }
  for (const absolute of walkFiles(outputRoot)) {
    const pathname = relative(outputRoot, absolute).replaceAll("\\", "/");
    if (!expected.has(pathname)) failures.push(`unexpected: ${pathname}`);
  }
  if (!existsSync(modulePath)) failures.push("missing: question-payload-assets-manifest.mjs");
  else if (readFileSync(modulePath, "utf8") !== moduleSource) failures.push("changed: question-payload-assets-manifest.mjs");
  if (failures.length) throw new Error(`Question payload assets are stale:\n${failures.slice(0, 30).join("\n")}`);
}

const { files, manifest, moduleSource } = expectedAssets();
if (mode === "--write") {
  writeAssets(files, moduleSource);
  console.log(`Wrote ${manifest.questionCount} bounded question payloads in ${manifest.chapterCount} chapter packs (${manifest.compressedBytes} compressed bytes)`);
} else {
  checkAssets(files, moduleSource);
  console.log(`PASS: ${manifest.questionCount} bounded question payloads match ${manifest.contentSha256}`);
}
