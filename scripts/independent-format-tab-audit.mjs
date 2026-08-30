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

// The Worker ships the answer views as inert labelled spans and only lets
// solution-tabs.js promote them to role="tab"; a fetch never runs that script, so
// an audit that looks only for ARIA roles reports zero tabs on a fully tabbed page.
// Both shapes count here.
function tabLabels(html) {
  const labels = [];
  for (const match of html.matchAll(/<(?:button|a|span)\b[^>]*(?:role=["']tab["']|aria-controls=|data-solution-tab=)[^>]*>([\s\S]*?)<\/(?:button|a|span)>/gi)) {
    const text = match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text) labels.push(text);
  }
  return labels;
}

// Every view has to be in the served HTML, visible, whether or not the runtime
// ever loads. A tabset that hides answer text behind a script is worse than no
// tabset at all.
function panelCount(html) {
  return (html.match(/class="solution-tab-panel["\s]/g) || []).length;
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
    pages.push({ path, status: response.status, tabLabels: labels, panelCount: panelCount(html) });
  }
  // A page with one available view renders no tablist at all and collapses to the
  // untabbed markup, so "tabbed or single-view" is the passing condition; a page
  // with labels but fewer panels than labels is the failure this audit exists for.
  const sound = pages.filter((page) => page.panelCount === 0
    ? page.tabLabels.length === 0
    : page.panelCount === page.tabLabels.length && page.tabLabels.length >= 2);
  results.push({
    format,
    persistedSampleCount: rows.length,
    requestedSampleCount: 3,
    tabbedPages: pages.filter((page) => page.tabLabels.length > 0).length,
    singleViewPages: pages.filter((page) => page.tabLabels.length === 0).length,
    hasStepByStepAndQuickAnswerTabs: pages.some((page) => {
      const normalized = page.tabLabels.join(" ").toLowerCase();
      return normalized.includes("step-by-step") && normalized.includes("quick answer");
    }),
    status: !rows.length ? "unobserved-no-records"
      : sound.length === pages.length ? "live-tabs-sound"
      : "live-tabs-mismatched",
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
    formatsWithTabs: results.filter((entry) => entry.hasStepByStepAndQuickAnswerTabs).map((entry) => entry.format),
    formatsWithMismatchedTabs: results.filter((entry) => entry.status === "live-tabs-mismatched").map((entry) => entry.format),
  },
  decision: "The question template now renders its answer views as a tabset inside the existing .solution-body, replacing the earlier position recorded here. The tabset changes nothing outside that pane: the three-pane layout, header, footer and both rails are untouched, and the panels stay direct children of .solution-body so the shipped stylesheet keeps reaching the worked solution. Every panel ships visible and in source order, so no answer text depends on solution-tabs.js. A question with only one available view renders no tablist and keeps the untabbed markup; the Concept view is omitted while the same concept material is rendered below the article, so a typical page carries Step-by-step and Quick answer.",
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
