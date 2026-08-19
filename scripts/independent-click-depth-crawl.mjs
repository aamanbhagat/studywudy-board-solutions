#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const origin = (process.env.STUDYWUDY_ORIGIN || "http://127.0.0.1:8798").replace(/\/$/, "");
const output = process.env.CLICK_DEPTH_OUTPUT || "audits/independent-verification/click-depth-crawl-final.json";
const concurrency = Number(process.env.CLICK_DEPTH_CONCURRENCY || 8);

async function fetchWithRetry(url) {
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(url, { headers: { accept: "text/html,application/xml" }, signal: AbortSignal.timeout(45_000) });
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status)) return response;
    await response.body?.cancel();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200 * (attempt + 1)));
  }
  return response;
}

async function responseText(response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return gunzipSync(bytes).toString("utf8");
  return new TextDecoder().decode(bytes);
}

function locations(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].replaceAll("&amp;", "&"));
}

function hrefs(html, pageUrl) {
  const found = new Set();
  for (const match of html.matchAll(/<a\b[^>]*\bhref=(?:"([^"]+)"|'([^']+)')[^>]*>/gi)) {
    const raw = (match[1] ?? match[2]).replaceAll("&amp;", "&");
    if (!raw || /^(?:#|mailto:|tel:|javascript:)/i.test(raw)) continue;
    try {
      const parsed = new URL(raw, pageUrl);
      if (parsed.origin !== new URL(origin).origin) continue;
      parsed.hash = "";
      found.add(`${parsed.pathname}${parsed.search}`);
    } catch {}
  }
  return found;
}

async function mapConcurrent(items, limit, operation) {
  let cursor = 0;
  const results = new Array(items.length);
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await operation(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function pathOf(raw) {
  const url = new URL(raw);
  return `${url.pathname}${url.search}`;
}

const sitemapIndex = await responseText(await fetchWithRetry(`${origin}/sitemap.xml`));
const childUrls = locations(sitemapIndex).map(pathOf);
const childXml = await mapConcurrent(childUrls, 2, async (path) => responseText(await fetchWithRetry(`${origin}${path}`)));
const allSitemapPaths = childXml.flatMap(locations).map(pathOf);
const questionPaths = allSitemapPaths.filter((path) => path.includes("/questions/"));
const hierarchyPaths = allSitemapPaths.filter((path) => !path.includes("/questions/"));

const requiredClasses = new Set();
const requiredSubjects = new Set();
const requiredChapters = new Set();
for (const path of questionPaths) {
  const parts = path.split("/").filter(Boolean);
  requiredClasses.add(`/${parts.slice(0, 2).join("/")}`);
  requiredSubjects.add(`/${parts.slice(0, 3).join("/")}`);
  requiredChapters.add(path.split("/questions/")[0]);
}
const requiredChapterPages = new Set(hierarchyPaths.filter((path) => {
  const clean = path.split("?")[0];
  return requiredChapters.has(clean);
}));

const failures = [];
const homeResponse = await fetchWithRetry(`${origin}/`);
const homeLinks = hrefs(await homeResponse.text(), `${origin}/`);
for (const path of requiredClasses) if (!homeLinks.has(path)) failures.push({ depth: 1, missing: path, source: "/" });

const classes = [...requiredClasses].sort();
await mapConcurrent(classes, concurrency, async (path) => {
  const response = await fetchWithRetry(`${origin}${path}`);
  if (!response.ok) return failures.push({ depth: 1, source: path, status: response.status });
  const links = hrefs(await response.text(), `${origin}${path}`);
  const targets = [...requiredSubjects].filter((subject) => subject.startsWith(`${path}/`));
  for (const target of targets) if (!links.has(target)) failures.push({ depth: 2, missing: target, source: path });
});

const subjects = [...requiredSubjects].sort();
await mapConcurrent(subjects, concurrency, async (path, index) => {
  const response = await fetchWithRetry(`${origin}${path}`);
  if (!response.ok) return failures.push({ depth: 2, source: path, status: response.status });
  const links = hrefs(await response.text(), `${origin}${path}`);
  const targets = [...requiredChapterPages].filter((chapter) => chapter.split("?")[0].startsWith(`${path}/`));
  for (const target of targets) if (!links.has(target)) failures.push({ depth: 3, missing: target, source: path });
  if ((index + 1) % 50 === 0) process.stdout.write(`subjects ${index + 1}/${subjects.length}\n`);
});

const reachedQuestions = new Set();
const chapterPages = [...requiredChapterPages].sort();
await mapConcurrent(chapterPages, concurrency, async (path, index) => {
  const response = await fetchWithRetry(`${origin}${path}`);
  if (!response.ok) return failures.push({ depth: 3, source: path, status: response.status });
  const links = hrefs(await response.text(), `${origin}${path}`);
  for (const link of links) if (link.includes("/questions/")) reachedQuestions.add(link);
  if ((index + 1) % 250 === 0) process.stdout.write(`chapter pages ${index + 1}/${chapterPages.length}\n`);
});

const missingQuestions = questionPaths.filter((path) => !reachedQuestions.has(path));
for (const path of missingQuestions.slice(0, 100)) failures.push({ depth: 4, missing: path, source: "chapter-or-pagination-page" });

const report = {
  capturedAt: new Date().toISOString(),
  origin,
  method: "Breadth-first HTTP crawl of every required class, subject, chapter and pagination page, with exact link-set comparison against every valid indexable question in the sitemap.",
  sitemapQuestionLeaves: questionPaths.length,
  crawled: {
    homepage: 1,
    classes: classes.length,
    subjects: subjects.length,
    chapterAndPaginationPages: chapterPages.length,
  },
  reachedQuestionLeaves: questionPaths.length - missingQuestions.length,
  missingQuestionLeaves: missingQuestions.length,
  maximumClickDepth: 4,
  failures,
};
report.pass = failures.length === 0 && missingQuestions.length === 0;
await mkdir(new URL("../audits/independent-verification/", import.meta.url), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
