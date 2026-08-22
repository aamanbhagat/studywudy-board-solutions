#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const mode = process.argv[2];
if (!["--check", "--write"].includes(mode)) {
  throw new Error("Usage: node scripts/apply-accessibility-markup.mjs --check|--write");
}

function walkHtml(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(directory, entry.name);
    return entry.isDirectory() ? walkHtml(absolute) : entry.isFile() && entry.name.endsWith(".html") ? [absolute] : [];
  });
}

const files = [resolve(root, "worker.js"), ...walkHtml(resolve(root, "comparison/after-assets"))];
let changedFiles = 0;
let replacements = 0;
for (const path of files) {
  const source = readFileSync(path, "utf8");
  let output = source;
  const rules = path.endsWith("worker.js") ? [
    [/(?<!"aria-label": "StudyWudy", )className: "brand brand-footer", href: "\/"/gu, '"aria-label": "StudyWudy", className: "brand brand-footer", href: "/"'],
    [/(?<!"aria-label": "StudyWudy", )className: "brand", href: "\/"/gu, '"aria-label": "StudyWudy", className: "brand", href: "/"'],
    [/(?<!"aria-hidden": "true", )className: "board-card-meta", children:/gu, '"aria-hidden": "true", className: "board-card-meta", children:'],
  ] : [
    [/<a class="brand([^"]*)" href="\/">/gu, '<a aria-label="StudyWudy" class="brand$1" href="/">'],
    [/<span class="brand-mark" aria-hidden="true">S<\/span>/gu, '<span aria-hidden="true" class="brand-mark" data-nosnippet></span>'],
    [/<span aria-hidden="true" class="brand-mark">S<\/span>/gu, '<span aria-hidden="true" class="brand-mark" data-nosnippet></span>'],
    [/<div class="board-card-meta">/gu, '<div aria-hidden="true" class="board-card-meta" data-nosnippet>'],
    [/<div aria-hidden="true" class="board-card-meta">/gu, '<div aria-hidden="true" class="board-card-meta" data-nosnippet>'],
    [/<div aria-hidden="true" class="board-card-meta" data-nosnippet><small>([^<]*)<\/small><span>([^<]*)<\/span><\/div>/gu,
      (_match, region, badge) => `<div aria-hidden="true" class="board-card-meta" data-nosnippet><small data-label="${region}"></small><span data-label="${badge}"></span></div>`],
    [/<div aria-hidden="true" class="study-field-art">/gu, '<div aria-hidden="true" class="study-field-art" data-nosnippet>'],
  ];
  for (const [pattern, replacement] of rules) {
    output = output.replace(pattern, (...args) => {
      replacements += 1;
      return typeof replacement === "function" ? replacement(...args) : args[0].replace(pattern, replacement);
    });
  }
  if (output === source) continue;
  changedFiles += 1;
  if (mode === "--write") writeFileSync(path, output);
}

const remaining = files.flatMap((path) => {
  const source = readFileSync(path, "utf8");
  const failures = [];
  if (path.endsWith("worker.js")) {
    if (/(?<!"aria-label": "StudyWudy", )className: "brand(?: brand-footer)?", href: "\/"/u.test(source)) failures.push("unlabelled Worker brand link");
    if (/(?<!"aria-hidden": "true", )className: "board-card-meta", children:/u.test(source)) failures.push("exposed Worker board badge row");
  } else {
    if (/<a class="brand(?: [^"]*)?" href="\/">/u.test(source)) failures.push("unlabelled static brand link");
    if (/<div class="board-card-meta">/u.test(source)) failures.push("exposed static board badge row");
    if (/<span(?: [^>]*)?class="brand-mark"(?: [^>]*)?>S<\/span>/u.test(source)) failures.push("text-bearing static brand monogram");
    if (/<div aria-hidden="true" class="board-card-meta">/u.test(source)) failures.push("snippet-visible static board badge row");
    if (/<div[^>]*class="board-card-meta"[^>]*><small>[^<]+<\/small>/u.test(source)) failures.push("text-bearing static board badge row");
    if (/<div aria-hidden="true" class="study-field-art">/u.test(source)) failures.push("snippet-visible static charge decoration");
  }
  return failures.map((failure) => `${path}: ${failure}`);
});

if (mode === "--check" && (changedFiles || remaining.length)) {
  throw new Error(`Accessibility markup is stale (${changedFiles} files would change).\n${remaining.join("\n")}`);
}
if (remaining.length) throw new Error(remaining.join("\n"));
console.log(`${mode === "--write" ? "Updated" : "PASS:"} accessibility markup in ${files.length} built files (${replacements} replacements)`);
