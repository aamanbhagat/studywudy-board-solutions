#!/usr/bin/env node

import { gunzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  formulaRepresentations,
  invalidRenderedMathFound,
  unsupportedTexCommands,
  validateFormulaStructure,
} from "../semantic-math.mjs";

const argumentsMap = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    argumentsMap.set(argument, next);
    index += 1;
  } else {
    argumentsMap.set(argument, true);
  }
}

const root = resolve(import.meta.dirname, "..");
const sourcePath = resolve(root, argumentsMap.get("--source-db") || "../data/d1/studywudy-content.sqlite3");
const outputPath = resolve(root, argumentsMap.get("--output") || "audits/sitewide/sitewide-math-audit.json");
const database = new DatabaseSync(sourcePath, { readOnly: true });
const formulaPattern = /\$\$(?<display>[\s\S]*?)\$\$|\$(?<inline>[^$]+?)\$|\\\((?<parenthesized>[\s\S]*?)\\\)|\\\[(?<bracketed>[\s\S]*?)\\\]|(?<bareEnvironment>\\begin\s*\{(?<environment>[bpvV]?matrix|smallmatrix|array|cases|aligned(?:at)?|align\*?|gathered|split)\}[\s\S]*?\\end\s*\{\k<environment>\})/gu;
const formulas = new Map();
let formulaOccurrences = 0;

function formulaFromMatch(match) {
  return match?.groups?.display
    || match?.groups?.inline
    || match?.groups?.parenthesized
    || match?.groups?.bracketed
    || match?.groups?.bareEnvironment
    || "";
}

function inspectStrings(value, location) {
  if (typeof value === "string") {
    // Currency signs and code syntax can resemble TeX delimiters. Code blocks
    // are audited by the code renderer, not by the mathematics renderer.
    const withoutCodeFences = value.replace(/```[\s\S]*?```/gu, "");
    for (const match of withoutCodeFences.matchAll(formulaPattern)) {
      const source = formulaFromMatch(match).trim();
      if (!source || source.length > 600) continue;
      if (!/(?:\\|=|[_^]|[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]|[+×·÷∮∫Σ√])/u.test(source)) continue;
      formulaOccurrences += 1;
      if (!formulas.has(source)) formulas.set(source, location);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectStrings(entry, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:code|sourceCode|codeBlock)$/iu.test(key)) continue;
    inspectStrings(entry, `${location}.${key}`);
  }
}

const bookIds = database.prepare("SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id").all();
for (const [bookIndex, { book_id: bookId }] of bookIds.entries()) {
  const chunks = database.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index").all(bookId);
  const payload = JSON.parse(gunzipSync(Buffer.concat(chunks.map((row) => Buffer.from(row.content_chunk)))).toString("utf8"));
  inspectStrings(payload, bookId);
  if ((bookIndex + 1) % 100 === 0) process.stdout.write(`Scanned ${bookIndex + 1}/${bookIds.length} books\n`);
}

const unsupportedCounts = new Map();
const structuralErrorCounts = new Map();
const samples = { unsupportedCommand: [], invalidStructure: [], renderedCommandLeak: [] };
let validFormulaCount = 0;
let structurallyInvalidFormulaCount = 0;
let unsupportedFormulaCount = 0;
let renderedLeakCount = 0;

for (const [formulaIndex, [source, location]] of [...formulas.entries()].entries()) {
  const unsupported = unsupportedTexCommands(source);
  if (unsupported.length) {
    unsupportedFormulaCount += 1;
    unsupported.forEach((command) => unsupportedCounts.set(command, (unsupportedCounts.get(command) || 0) + 1));
    if (samples.unsupportedCommand.length < 20) samples.unsupportedCommand.push({ location, source, unsupported });
    continue;
  }
  const structure = validateFormulaStructure(source);
  if (!structure.complete) {
    structurallyInvalidFormulaCount += 1;
    structure.errors.forEach((error) => structuralErrorCounts.set(error, (structuralErrorCounts.get(error) || 0) + 1));
    if (samples.invalidStructure.length < 20) samples.invalidStructure.push({ location, source, errors: structure.errors });
    continue;
  }
  validFormulaCount += 1;
  const representation = formulaRepresentations(source);
  const leaks = invalidRenderedMathFound(`${representation.plainText}\n${representation.spokenText}\n${representation.mathml}`);
  if (leaks.length || /\\[A-Za-z]+\b/u.test(representation.plainText)) {
    renderedLeakCount += 1;
    if (samples.renderedCommandLeak.length < 40) samples.renderedCommandLeak.push({ location, source, leaks, plainText: representation.plainText });
  }
  if ((formulaIndex + 1) % 25_000 === 0) process.stdout.write(`Validated ${formulaIndex + 1}/${formulas.size} unique formulas\n`);
}

const report = {
  generatedAt: new Date().toISOString(),
  sourcePath,
  booksScanned: bookIds.length,
  formulaOccurrences,
  uniqueFormulaCount: formulas.size,
  validFormulaCount,
  structurallyInvalidFormulaCount,
  unsupportedFormulaCount,
  renderedLeakCount,
  rendererCoveragePass: unsupportedFormulaCount === 0 && renderedLeakCount === 0,
  unsupportedCommands: [...unsupportedCounts].sort((left, right) => right[1] - left[1]).map(([command, count]) => ({ command, count })),
  structuralErrors: [...structuralErrorCounts].sort((left, right) => right[1] - left[1]).map(([error, count]) => ({ error, count })),
  samples,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.rendererCoveragePass) process.exitCode = 1;
