#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { PUBLIC_BRAND_REPLACEMENT } from "../public-brand-hygiene.mjs";

const root = resolve(import.meta.dirname, "..");
const mode = process.argv[2];
if (!["--check", "--write"].includes(mode)) {
  throw new Error("Usage: node scripts/apply-public-brand-copy.mjs --check|--write");
}

const replacements = Object.freeze([
  Object.freeze({
    before: "StudyWudy’s renderer mirrors all nine structural patterns in Boardly, covering 17 specific question types.",
    after: PUBLIC_BRAND_REPLACEMENT,
  }),
  Object.freeze({
    before: "StudyWudy\\u2019s renderer mirrors all nine structural patterns in Boardly, covering 17 specific question types.",
    after: PUBLIC_BRAND_REPLACEMENT.replace("’", "\\u2019"),
  }),
  Object.freeze({ before: "Boardly pattern ", after: "Answer format " }),
  Object.freeze({ before: "Boardly catalog", after: "StudyWudy catalog" }),
  Object.freeze({ before: "Unable to serve Boardly media from R2", after: "Unable to serve legacy media from R2" }),
]);

const files = Object.freeze([
  "worker.js",
  "comparison/after-assets/index.html",
]);

const failures = [];
let changedFiles = 0;
let replacementCount = 0;
for (const relativePath of files) {
  const absolutePath = resolve(root, relativePath);
  const original = readFileSync(absolutePath, "utf8");
  let updated = original;
  for (const { before, after } of replacements) {
    const count = updated.split(before).length - 1;
    if (count > 0) {
      replacementCount += count;
      updated = updated.replaceAll(before, after);
    }
  }
  for (const { before } of replacements) {
    if (updated.includes(before)) failures.push(`${relativePath} retains ${JSON.stringify(before)}`);
  }
  if (updated === original) continue;
  changedFiles += 1;
  if (mode === "--write") writeFileSync(absolutePath, updated);
  else failures.push(`${relativePath} needs the public-brand copy rewrite`);
}

if (failures.length) throw new Error(`Public-brand copy check failed:\n${failures.join("\n")}`);
console.log(`${mode === "--write" ? "Applied" : "PASS"}: public-brand copy is clean (${changedFiles} changed files; ${replacementCount} replacements)`);
