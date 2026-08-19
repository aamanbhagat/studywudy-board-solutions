#!/usr/bin/env node

import { DatabaseSync } from "node:sqlite";
import { gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const databasePath = resolve(root, process.argv[2] || "cloudflare-backup-2026-08-17/d1/studywudy-content.sqlite3");
const outputDirectory = resolve(root, process.argv[3] || "comparison/after-assets/sitemaps");
const origin = "https://studywudy-board-solutions.amanbhagat17089.workers.dev";
const blockSize = 10_000;
const contentPublishedAt = "2026-08-15T03:30:10Z";
const contentPublishedEpoch = Math.floor(Date.parse(contentPublishedAt) / 1_000);
const methodologyEpoch = Math.floor(Date.parse("2026-08-18T10:30:00Z") / 1_000);
const policyEpoch = Math.floor(Date.parse("2026-08-18T00:00:00+05:30") / 1_000);

function xmlEscape(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function epoch(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return contentPublishedEpoch;
  return numeric > 1e12 ? Math.floor(numeric / 1_000) : Math.floor(numeric);
}

function lastmod(...values) {
  return new Date(1_000 * Math.max(contentPublishedEpoch, ...values.map(epoch)))
    .toISOString().replace(/\.000Z$/, "Z");
}

function urlEntry(pathname, updatedAt) {
  return `  <url><loc>${xmlEscape(new URL(pathname, `${origin}/`).toString())}</loc><lastmod>${lastmod(updatedAt)}</lastmod></url>`;
}

function writeGzip(name, entries) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
  const compressed = gzipSync(xml, { level: 9, mtime: 0 });
  writeFileSync(resolve(outputDirectory, name), compressed);
  return { compressedBytes: compressed.byteLength, uncompressedBytes: Buffer.byteLength(xml), urlCount: entries.length };
}

function streamPathsFromWorker() {
  const worker = readFileSync(resolve(root, "worker.js"), "utf8");
  const match = worker.match(/var PHASE3_STREAM_PATHS = (\[[\s\S]*?\n\]);/);
  if (!match) throw new Error("PHASE3_STREAM_PATHS was not found in worker.js");
  return JSON.parse(match[1]);
}

mkdirSync(outputDirectory, { recursive: true });
const database = new DatabaseSync(databasePath, { readOnly: true });
const count = Number(database.prepare("SELECT COUNT(*) AS count FROM catalog_questions").get().count);
const children = [];
const report = { generatedAt: new Date().toISOString(), origin, catalogQuestionCount: count, blockSize, children: [] };

const hierarchyRows = database.prepare(`SELECT b.board_slug, b.grade_slug, b.subject_slug,
  b.slug AS book_slug, b.updated_at AS book_updated_at, c.slug AS chapter_slug,
  c.updated_at AS chapter_updated_at, c.question_count, MAX(q.updated_at) AS question_updated_at
  FROM catalog_chapters c JOIN catalog_books b ON b.id = c.book_id
  LEFT JOIN catalog_questions q ON q.book_id = c.book_id AND q.chapter_slug = c.slug
  GROUP BY c.id ORDER BY b.board_slug, b.grade_slug, b.subject_slug, b.slug, c.position`).all();
const timestamps = new Map([
  ["/", contentPublishedEpoch], ["/boards", contentPublishedEpoch],
  ["/about/methodology", methodologyEpoch], ["/privacy", policyEpoch],
  ["/terms", policyEpoch], ["/contact", policyEpoch],
]);
const record = (pathname, ...values) => {
  const timestamp = Math.max(contentPublishedEpoch, ...values.map(epoch));
  timestamps.set(pathname, Math.max(timestamps.get(pathname) || 0, timestamp));
};
for (const pathname of streamPathsFromWorker()) record(pathname, contentPublishedEpoch);
for (const row of hierarchyRows) {
  const board = `/${row.board_slug}`;
  const grade = `${board}/${row.grade_slug}`;
  const subject = `${grade}/${row.subject_slug}`;
  const book = `${subject}/${row.book_slug}`;
  const chapter = `${book}/${row.chapter_slug}`;
  const descendantsUpdated = Math.max(epoch(row.book_updated_at), epoch(row.chapter_updated_at), epoch(row.question_updated_at));
  record(board, descendantsUpdated);
  record(grade, descendantsUpdated);
  record(subject, descendantsUpdated);
  record(book, descendantsUpdated);
  record(chapter, row.book_updated_at, row.chapter_updated_at, row.question_updated_at);
  const pageCount = Math.max(1, Math.ceil(Number(row.question_count) / 40));
  for (let page = 2; page <= pageCount; page += 1) record(`${chapter}?page=${page}`, row.book_updated_at, row.chapter_updated_at, row.question_updated_at);
}
const hierarchy = writeGzip("hierarchy.xml.gz", [...timestamps].map(([pathname, timestamp]) => urlEntry(pathname, timestamp)));
children.push({ pathname: "/sitemaps/hierarchy.xml.gz", updatedAt: Math.max(...timestamps.values()) });
report.children.push({ pathname: "/sitemaps/hierarchy.xml.gz", ...hierarchy });

const questionStatement = database.prepare(`SELECT q.row_id, q.chapter_slug, q.question_id,
  q.updated_at AS question_updated_at, b.board_slug, b.grade_slug, b.subject_slug,
  b.slug AS book_slug, b.updated_at AS book_updated_at, c.updated_at AS chapter_updated_at
  FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id
  JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
  WHERE q.row_id >= ? AND q.row_id < ? ORDER BY q.row_id`);
for (let cursor = 1; cursor <= count; cursor += blockSize) {
  const rows = questionStatement.all(cursor, cursor + blockSize);
  const entries = rows.map((row) => urlEntry(`/${row.board_slug}/${row.grade_slug}/${row.subject_slug}/${row.book_slug}/${row.chapter_slug}/questions/${row.question_id}`, Math.max(epoch(row.question_updated_at), epoch(row.chapter_updated_at), epoch(row.book_updated_at))));
  const name = `questions-${cursor}.xml.gz`;
  const child = writeGzip(name, entries);
  const updatedAt = Math.max(...rows.map((row) => Math.max(epoch(row.question_updated_at), epoch(row.chapter_updated_at), epoch(row.book_updated_at))));
  children.push({ pathname: `/sitemaps/${name}`, updatedAt });
  report.children.push({ pathname: `/sitemaps/${name}`, ...child });
}

const indexBody = children.map((child) => `  <sitemap><loc>${xmlEscape(`${origin}${child.pathname}`)}</loc><lastmod>${lastmod(child.updatedAt)}</lastmod></sitemap>`).join("\n");
writeFileSync(resolve(outputDirectory, "..", "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexBody}\n</sitemapindex>\n`);
writeFileSync(resolve(root, "audits/phase-3/static-sitemap-build.json"), `${JSON.stringify(report, null, 2)}\n`);
database.close();
console.log(JSON.stringify({ catalogQuestionCount: count, hierarchyUrlCount: hierarchy.urlCount, questionChildCount: report.children.length - 1, questionUrlCount: report.children.slice(1).reduce((sum, child) => sum + child.urlCount, 0), pass: count === report.children.slice(1).reduce((sum, child) => sum + child.urlCount, 0) }, null, 2));
