#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { HOMEPAGE_DOCUMENT_TITLE } from "../public-title-quality.mjs";

const root = resolve(import.meta.dirname, "..");
const mode = process.argv[2];
if (!["--check", "--write"].includes(mode)) {
  throw new Error("Usage: node scripts/apply-public-title-copy.mjs --check|--write");
}

const homepagePageTitle = HOMEPAGE_DOCUMENT_TITLE.replace(/\s+\|\s+StudyWudy$/u, "");
const files = Object.freeze([
  Object.freeze({
    relativePath: "comparison/after-assets/index.html",
    replacements: Object.freeze([
      Object.freeze({ before: "Textbook answers, made clear | StudyWudy", after: HOMEPAGE_DOCUMENT_TITLE }),
    ]),
    required: Object.freeze([
      `<title>${HOMEPAGE_DOCUMENT_TITLE}</title>`,
      `<meta property="og:title" content="${HOMEPAGE_DOCUMENT_TITLE}"/>`,
      `<meta name="twitter:title" content="${HOMEPAGE_DOCUMENT_TITLE}"/>`,
    ]),
  }),
  Object.freeze({
    relativePath: "worker.js",
    replacements: Object.freeze([
      Object.freeze({
        before: 'pageMetadata)({ title: "Textbook answers, made clear", description:',
        after: `pageMetadata)({ title: ${JSON.stringify(homepagePageTitle)}, description:`,
      }),
    ]),
    required: Object.freeze([
      `pageMetadata)({ title: ${JSON.stringify(homepagePageTitle)}, description:`,
    ]),
  }),
]);

const failures = [];
let changedFiles = 0;
let replacementCount = 0;
for (const file of files) {
  const absolutePath = resolve(root, file.relativePath);
  const original = readFileSync(absolutePath, "utf8");
  let updated = original;
  for (const replacement of file.replacements) {
    const count = updated.split(replacement.before).length - 1;
    replacementCount += count;
    updated = updated.replaceAll(replacement.before, replacement.after);
  }
  for (const required of file.required) {
    if (!updated.includes(required)) failures.push(`${file.relativePath} is missing ${JSON.stringify(required)}`);
  }
  if (updated === original) continue;
  changedFiles += 1;
  if (mode === "--write") writeFileSync(absolutePath, updated);
  else failures.push(`${file.relativePath} needs the public-title copy rewrite`);
}

if (failures.length) throw new Error(`Public-title copy check failed:\n${failures.join("\n")}`);
console.log(`${mode === "--write" ? "Applied" : "PASS"}: descriptive homepage title (${changedFiles} changed files; ${replacementCount} replacements)`);
