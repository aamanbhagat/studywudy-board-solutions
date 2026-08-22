#!/usr/bin/env node

import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

import {
  FORBIDDEN_PUBLIC_BRAND_PATTERNS,
  TEMPORARY_DEPLOYMENT_ORIGIN,
  inspectPublicBrandHtml,
} from "../public-brand-hygiene.mjs";

const root = resolve(import.meta.dirname, "..");
const assetsRoot = resolve(root, "comparison/after-assets");
const databasePath = resolve(root, "../data/d1/studywudy-content.sqlite3");
const failures = [];

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : entry.isFile() ? [absolute] : [];
  });
}

function cleanTemporaryOrigin(value) {
  return String(value).replaceAll(TEMPORARY_DEPLOYMENT_ORIGIN, "");
}

function forbidden(value) {
  return FORBIDDEN_PUBLIC_BRAND_PATTERNS
    .filter(({ pattern }) => pattern.test(value))
    .map(({ label }) => label);
}

const assetFiles = walk(assetsRoot);
let htmlCount = 0;
let discoveryCount = 0;
let infrastructureBoardlyMediaReferences = 0;
let temporaryDeploymentReferences = 0;
for (const absolute of assetFiles) {
  const path = relative(root, absolute).replaceAll("\\", "/");
  const extension = extname(path).toLowerCase();
  if (extension === ".html" || extension === ".htm") {
    htmlCount += 1;
    const html = readFileSync(absolute, "utf8");
    const inspection = inspectPublicBrandHtml(html, { pageUrl: TEMPORARY_DEPLOYMENT_ORIGIN });
    failures.push(...inspection.failures.map((failure) => `${path}: ${failure}`));
    infrastructureBoardlyMediaReferences += (html.match(/\/boardly-media/giu) || []).length;
    temporaryDeploymentReferences += (html.match(/studywudy-board-solutions\.amanbhagat17089\.workers\.dev/giu) || []).length;
    continue;
  }
  if (path.endsWith(".xml.gz")) {
    discoveryCount += 1;
    const xml = gunzipSync(readFileSync(absolute)).toString("utf8");
    for (const label of forbidden(cleanTemporaryOrigin(xml))) failures.push(`${path}: discovery metadata contains ${label}`);
    temporaryDeploymentReferences += (xml.match(/studywudy-board-solutions\.amanbhagat17089\.workers\.dev/giu) || []).length;
    continue;
  }
  if ([".xml", ".txt", ".webmanifest", ".json", ".js", ".css"].includes(extension)) {
    const source = readFileSync(absolute, "utf8");
    infrastructureBoardlyMediaReferences += (source.match(/\/boardly-media/giu) || []).length;
    temporaryDeploymentReferences += (source.match(/studywudy-board-solutions\.amanbhagat17089\.workers\.dev/giu) || []).length;
    if ([".xml", ".txt", ".webmanifest", ".json"].includes(extension)) {
      discoveryCount += 1;
      for (const label of forbidden(cleanTemporaryOrigin(source))) failures.push(`${path}: public metadata contains ${label}`);
    }
  }
}

const workerSource = readFileSync(resolve(root, "worker.js"), "utf8");
const forbiddenBuiltCopy = [
  "mirrors all nine structural patterns in Boardly",
  "Boardly pattern",
  "Boardly catalog",
  "Unable to serve Boardly media from R2",
  "Study Wudy",
  "boardly.in",
];
for (const literal of forbiddenBuiltCopy) {
  if (workerSource.toLocaleLowerCase("en-IN").includes(literal.toLocaleLowerCase("en-IN"))) {
    failures.push(`worker.js retains public-copy literal ${JSON.stringify(literal)}`);
  }
}
infrastructureBoardlyMediaReferences += (workerSource.match(/boardly[-_]media/giu) || []).length;
temporaryDeploymentReferences += (workerSource.match(/studywudy-board-solutions\.amanbhagat17089\.workers\.dev/giu) || []).length;

const database = new DatabaseSync(databasePath, { readOnly: true });
const catalogTables = [
  "catalog_boards", "catalog_books", "catalog_chapters", "catalog_grades", "catalog_questions", "catalog_subjects",
];
let catalogRows = 0;
for (const table of catalogTables) {
  const columns = database.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all()
    .filter((column) => String(column.type).toUpperCase().includes("TEXT"))
    .map((column) => column.name);
  for (const row of database.prepare(`SELECT ${columns.join(", ")} FROM ${table}`).iterate()) {
    catalogRows += 1;
    for (const [column, value] of Object.entries(row)) {
      for (const label of forbidden(String(value ?? ""))) failures.push(`${table}.${column}: catalog copy contains ${label}`);
    }
  }
}

function inspectPayloadValue(value, path, bookId, counters) {
  if (typeof value === "string") {
    const labels = forbidden(value);
    for (const label of labels) {
      const allowedProvenance = label === "Boardly" && /\.(?:importedBy|sourceName)$/u.test(path);
      if (allowedProvenance) counters.provenance += 1;
      else failures.push(`${bookId}${path}: imported content contains ${label}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectPayloadValue(entry, `${path}[${index}]`, bookId, counters));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) inspectPayloadValue(entry, `${path}.${key}`, bookId, counters);
}

let payloadCount = 0;
const counters = { provenance: 0 };
const chunkStatement = database.prepare(
  "SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index",
);
for (const { id } of database.prepare("SELECT id FROM catalog_books ORDER BY id").iterate()) {
  const chunks = chunkStatement.all(id);
  const payload = JSON.parse(gunzipSync(Buffer.concat(chunks.map(({ content_chunk }) => Buffer.from(content_chunk)))));
  inspectPayloadValue(payload, "", id, counters);
  payloadCount += 1;
}

let enrichmentCount = 0;
for (const row of database.prepare("SELECT book_id, chapter_slug, question_id, content_gzip FROM question_enrichments").iterate()) {
  const content = gunzipSync(Buffer.from(row.content_gzip)).toString("utf8");
  for (const label of forbidden(content)) {
    failures.push(`${row.book_id}/${row.chapter_slug}/${row.question_id}: enrichment contains ${label}`);
  }
  enrichmentCount += 1;
}
database.close();

if (failures.length) throw new Error(`Public-brand hygiene gate failed:\n${failures.slice(0, 100).join("\n")}`);
console.log(JSON.stringify({
  pass: true,
  htmlFiles: htmlCount,
  discoveryMetadataFiles: discoveryCount,
  builtAssetFiles: assetFiles.length,
  catalogRows,
  importedPayloads: payloadCount,
  enrichments: enrichmentCount,
  allowedInternalProvenanceReferences: counters.provenance,
  allowedInfrastructureBoardlyMediaReferences: infrastructureBoardlyMediaReferences,
  allowedTemporaryDeploymentReferences: temporaryDeploymentReferences,
}, null, 2));
