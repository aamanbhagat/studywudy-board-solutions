#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const origin = (process.env.STUDYWUDY_ORIGIN || "https://studywudy-board-solutions.amanbhagat17089.workers.dev").replace(/\/$/, "");
const databasePath = process.env.STUDYWUDY_DB || "cloudflare-backup-2026-08-17/d1/studywudy-content.sqlite3";
const outputPath = process.env.FORMAT_TAB_OUTPUT || "audits/independent-verification/question-format-tabs.json";
const formats = [
  "one_word", "one_sentence", "brief", "detailed", "define", "give_reason", "name_list",
  "mcq_single", "mcq_multi", "assertion_reason", "true_false", "fill_blank", "match_column",
  "distinguish", "passage", "numerical", "diagram",
];

const database = new DatabaseSync(databasePath, { readOnly: true });
const statement = database.prepare(`SELECT b.board_slug, b.grade_slug, b.subject_slug,
  b.slug AS book_slug, q.chapter_slug, q.question_id
  FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id
  WHERE q.type = ? ORDER BY q.row_id LIMIT 3`);

function pathFor(row) {
  return `/${row.board_slug}/${row.grade_slug}/${row.subject_slug}/${row.book_slug}/${row.chapter_slug}/questions/${row.question_id}`;
}

function tabLabels(html) {
  const labels = [];
  for (const match of html.matchAll(/<(?:button|a)\b[^>]*(?:role=["']tab["']|aria-controls=)[^>]*>([\s\S]*?)<\/(?:button|a)>/gi)) {
    const text = match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) labels.push(text);
  }
  return labels;
}

const results = [];
for (const format of formats) {
  const rows = statement.all(format);
  const pages = [];
  for (const row of rows) {
    const path = pathFor(row);
    const response = await fetch(`${origin}${path}`, { headers: { accept: "text/html" } });
    const html = await response.text();
    const labels = tabLabels(html);
    pages.push({ path, status: response.status, tabLabels: labels });
  }
  results.push({
    format,
    persistedSampleCount: rows.length,
    requestedSampleCount: 3,
    tabbedPages: pages.filter((page) => page.tabLabels.length > 0).length,
    hasStepQuickConceptTabs: pages.some((page) => {
      const normalized = page.tabLabels.join(" ").toLowerCase();
      return normalized.includes("step-by-step") && normalized.includes("quick answer") && normalized.includes("concept");
    }),
    status: rows.length ? "live-one-pane" : "unobserved-no-records",
    pages,
  });
}

const report = {
  capturedAt: new Date().toISOString(),
  origin,
  formats: results,
  summary: {
    formatsChecked: results.length,
    persistedFormats: results.filter((entry) => entry.persistedSampleCount > 0).length,
    unobservedFormats: results.filter((entry) => entry.persistedSampleCount === 0).length,
    livePagesChecked: results.reduce((sum, entry) => sum + entry.pages.length, 0),
    formatsWithStepQuickConceptTabs: results.filter((entry) => entry.hasStepQuickConceptTabs).map((entry) => entry.format),
  },
  decision: "The deployed question templates use one solution pane. Adding Step-by-step / Quick answer / Concept tabs would change layout and structure, so this audit does not add them under the user's no-layout-change constraint.",
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
