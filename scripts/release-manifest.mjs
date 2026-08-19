#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "release/production-manifest.json");
const entrypoint = "comparison/after-worker.js";
const configuration = "wrangler.production.jsonc";
const assetsDirectory = "comparison/after-assets";
const toolchainFiles = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"];
const localImportPattern = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["'](\.{1,2}\/[^"']+)["']/g;

function normalize(pathname) {
  return pathname.replaceAll("\\", "/");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function walkFiles(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...walkFiles(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

function resolveLocalImport(importer, specifier) {
  const candidate = resolve(dirname(importer), specifier);
  for (const pathname of [candidate, `${candidate}.js`, `${candidate}.mjs`, `${candidate}.json`]) {
    if (existsSync(pathname) && statSync(pathname).isFile()) return pathname;
  }
  throw new Error(`Cannot resolve local release import ${specifier} from ${normalize(relative(root, importer))}`);
}

function importedSources(start) {
  const pending = [resolve(root, start)];
  const visited = new Set();
  while (pending.length > 0) {
    const absolute = pending.pop();
    if (visited.has(absolute)) continue;
    visited.add(absolute);
    const source = readFileSync(absolute, "utf8");
    localImportPattern.lastIndex = 0;
    let match;
    while ((match = localImportPattern.exec(source))) {
      pending.push(resolveLocalImport(absolute, match[1]));
    }
  }
  return [...visited];
}

function releaseFiles() {
  const files = new Set([
    resolve(root, configuration),
    ...toolchainFiles.map((file) => resolve(root, file)),
    ...importedSources(entrypoint),
    ...walkFiles(resolve(root, assetsDirectory)),
  ]);
  return [...files].sort((left, right) => normalize(relative(root, left)).localeCompare(normalize(relative(root, right))));
}

function describeFiles() {
  return releaseFiles().map((absolute) => {
    const bytes = readFileSync(absolute);
    return {
      path: normalize(relative(root, absolute)),
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    };
  });
}

function createManifest() {
  const files = describeFiles();
  return {
    schemaVersion: 1,
    service: "studywudy-board-solutions",
    entrypoint,
    configuration,
    assetsDirectory,
    toolchain: {
      node: "24.19.0",
      pnpm: "11.19.0",
      wrangler: "4.123.0",
    },
    externalState: {
      d1: "studywudy-content",
      r2: ["studywudy-media"],
      queues: ["studywudy-weekly-crawl", "studywudy-weekly-crawl-dlq"],
      durableObjects: ["NEXT_CACHE_DO_QUEUE"],
    },
    files,
    aggregateSha256: sha256(Buffer.from(files.map(({ path, bytes, sha256: digest }) => `${path}\0${bytes}\0${digest}\n`).join(""))),
  };
}

function writeManifest() {
  const manifest = createManifest();
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${normalize(relative(root, manifestPath))} (${manifest.files.length} inputs, ${manifest.aggregateSha256})`);
}

function verifyManifest() {
  if (!existsSync(manifestPath)) throw new Error("release/production-manifest.json is missing; run pnpm release:manifest");
  const expected = JSON.parse(readFileSync(manifestPath, "utf8"));
  const actual = createManifest();
  const expectedFiles = new Map(expected.files.map((file) => [file.path, file]));
  const actualFiles = new Map(actual.files.map((file) => [file.path, file]));
  const failures = [];

  for (const [path, file] of expectedFiles) {
    const observed = actualFiles.get(path);
    if (!observed) failures.push(`missing: ${path}`);
    else if (observed.bytes !== file.bytes || observed.sha256 !== file.sha256) failures.push(`changed: ${path}`);
  }
  for (const path of actualFiles.keys()) {
    if (!expectedFiles.has(path)) failures.push(`unexpected: ${path}`);
  }
  if (actual.aggregateSha256 !== expected.aggregateSha256) failures.push(`aggregate: expected ${expected.aggregateSha256}, got ${actual.aggregateSha256}`);
  if (failures.length > 0) throw new Error(`Production release inputs do not match the committed manifest:\n${failures.join("\n")}`);
  console.log(`PASS: ${actual.files.length} production inputs match ${actual.aggregateSha256}`);
}

const mode = process.argv[2];
if (mode === "--write") writeManifest();
else if (mode === "--verify") verifyManifest();
else throw new Error("Usage: node scripts/release-manifest.mjs --write|--verify");
