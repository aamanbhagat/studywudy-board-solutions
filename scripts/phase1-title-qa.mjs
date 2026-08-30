#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const origin = process.env.STUDYWUDY_ORIGIN ?? "http://127.0.0.1:8789";
const database = process.env.STUDYWUDY_DB ?? "comparison/after-persistence/v3/d1/miniflare-D1DatabaseObject/ee8d76fe32dfe0c6dc6d6dd9fdbe19939bf18065016cec33be539d964764b747.sqlite";
const outputPath = process.env.PHASE1_TITLE_OUTPUT ?? "audits/phase-1/title-qa.json";

const sql = `
WITH candidates AS (
  SELECT
    b.board_slug,
    b.grade_slug,
    b.subject_slug,
    b.slug AS book_slug,
    b.title AS book_title,
    c.slug AS chapter_slug,
    c.number AS chapter_number,
    c.title AS chapter_title,
    q.question_id,
    q.display_label,
    q.type,
    ROW_NUMBER() OVER (
      PARTITION BY b.subject_slug
      ORDER BY LENGTH(b.title) + LENGTH(c.title) DESC, q.row_id
    ) AS subject_rank
  FROM catalog_questions q
  JOIN catalog_books b ON b.id = q.book_id
  JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
  WHERE b.subject_slug IN (
    'physics', 'chemistry', 'mathematics', 'science', 'biology', 'history',
    'geography', 'english', 'economics', 'political-science', 'marathi',
    'tamil', 'hindi', 'commerce', 'information-technology', 'psychology'
  )
)
SELECT * FROM candidates
WHERE subject_rank = 1
   OR question_id = 'q-msb-balbharati-physics-standard-12-8-001'
ORDER BY subject_slug, question_id;
`;

const records = JSON.parse(execFileSync("sqlite3", ["-json", database, sql], { encoding: "utf8" }) || "[]");

function decode(value) {
  return String(value ?? "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function tag(html, pattern) {
  const match = html.match(pattern);
  return decode(match?.[1] ?? "");
}

const results = [];
for (const record of records) {
  const path = `/${record.board_slug}/${record.grade_slug}/${record.subject_slug}/${record.book_slug}/${record.chapter_slug}/questions/${record.question_id}`;
  const response = await fetch(`${origin}${path}`);
  const html = await response.text();
  const title = tag(html, /<title>([\s\S]*?)<\/title>/i);
  const openGraphTitle = tag(html, /<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i);
  const twitterTitle = tag(html, /<meta[^>]+name="twitter:title"[^>]+content="([^"]*)"/i);
  const failures = [];
  const charCount = [...title].length;
  const generatedEllipses = [...title].filter((character) => character === "…").length;

  if (response.status !== 200) failures.push(`status ${response.status}`);
  if (charCount > 60) failures.push(`title length ${charCount} exceeds 60`);
  // The <title> and og:title are separate generators now. The document title is
  // identifier-first and unsuffixed so its distinguishing tokens survive
  // Google's clip; og:title stays prompt-first and long for the social card.
  if (/\|\s*StudyWudy\s*$/.test(title)) failures.push("question document title still carries the site suffix");
  if (title === openGraphTitle) failures.push("document title was not rewritten away from the social title");
  if (openGraphTitle !== twitterTitle) failures.push("og:title and twitter:title differ");
  if (generatedEllipses > 1) failures.push(`${generatedEllipses} generated ellipses indicate colliding truncation`);
  // "{book code} Cl{n} {subject} Ch{n} Q{label}: {prompt…}" — the chapter and
  // question tokens are what separate two sibling questions, so they have to be
  // present and inside the 60 characters checked above.
  if (!title.includes(` Ch${record.chapter_number} Q`)) failures.push("chapter and question identity is missing from the document title");

  results.push({
    ...record,
    path,
    status: response.status,
    title,
    openGraphTitle,
    twitterTitle,
    titleCharacters: charCount,
    generatedEllipses,
    failures,
  });
  process.stdout.write(`${record.subject_slug.padEnd(20)} ${String(charCount).padStart(2)} chars ${failures.length ? "FAIL" : "PASS"} ${record.book_title}\n`);
}

const report = {
  capturedAt: new Date().toISOString(),
  origin,
  sampledPages: results.length,
  subjects: [...new Set(results.map((result) => result.subject_slug))],
  longestTextbookCharacters: Math.max(...results.map((result) => [...result.book_title].length)),
  longestChapterCharacters: Math.max(...results.map((result) => [...result.chapter_title].length)),
  failures: results.flatMap((result) => result.failures.map((failure) => ({ path: result.path, failure }))),
  results,
};

await mkdir(new URL("../audits/phase-1/", import.meta.url), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`wrote ${outputPath}; sampled=${results.length}; failures=${report.failures.length}`);
process.exitCode = report.failures.length ? 1 : 0;
