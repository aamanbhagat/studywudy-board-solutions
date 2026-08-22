#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { CHAPTER_PAGE_EXPERIENCE_STYLES } from "../chapter-page-experience.mjs";
import { createSearchExcerpt } from "../search-excerpt.mjs";
import { SEMANTIC_MATH_STYLES } from "../semantic-math.mjs";
import { STUDY_CLUSTER_STYLES } from "../study-cluster.mjs";
import {
  STUDY_CLUSTER_CHAPTER_RUNTIME,
  STUDY_CLUSTER_RUNTIME_PAGES,
} from "../study-cluster-runtime.mjs";
import { repairKnownText } from "../multilingual-text-quality.mjs";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { isQuestionPubliclyEligible } from "../public-question-eligibility.mjs";

const root = resolve(import.meta.dirname, "..");
const databasePath = resolve(root, "../data/d1/studywudy-content.sqlite3");
const outputRoot = resolve(root, "comparison/after-assets/pages/study-cluster");
const productionOrigin = "https://studywudy.in";
const previewOrigin = "https://studywudy-board-solutions.amanbhagat17089.workers.dev";
const chapterPath = STUDY_CLUSTER_CHAPTER_RUNTIME.pathname;
const bookId = "maharashtra-board::class-12::physics::balbharati-physics-standard-12";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function productionHtml(value) {
  return String(value || "").replaceAll(previewOrigin, productionOrigin);
}

function routeAssetDirectory(pathname) {
  if (pathname === chapterPath) return "chapter";
  return pathname.slice(chapterPath.length + 1);
}

function pageShell({ pathname, title, description, robots, body, extraStyles = "" }) {
  const canonical = `${productionOrigin}${pathname}`;
  return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="${escapeHtml(robots)}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:title" content="${escapeHtml(title.replace(/ \| StudyWudy$/u, ""))}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonical)}"><meta name="twitter:title" content="${escapeHtml(title.replace(/ \| StudyWudy$/u, ""))}"><meta name="twitter:description" content="${escapeHtml(description)}"><style>:root{--ink:#17231d;--green:#174d31;--paper:#f7f2e8;--line:#d5cec1}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#fbfaf6;color:var(--ink);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit}.shell{width:min(1120px,calc(100% - 2rem));margin-inline:auto}.site-header{border-bottom:1px solid var(--line);background:#fff}.site-header .shell{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 0}.brand{font-size:1.15rem;font-weight:900;text-decoration:none}.site-header nav,.site-footer nav{display:flex;flex-wrap:wrap;gap:1rem;font-weight:750}.site-footer{padding:1.5rem 0;background:var(--ink);color:#fff}.site-footer .shell{display:flex;justify-content:space-between;gap:1rem}.question-register{padding:2rem 0 4rem}.question-register h2{margin:.2rem 0 1rem;font-size:clamp(1.5rem,4vw,2.4rem)}.question-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}.question-link{display:grid;gap:.35rem;padding:1rem;border:1px solid var(--line);border-radius:14px;background:#fff;text-decoration:none}.question-link span,.question-link small{color:#476052;font-size:.76rem;font-weight:800}.question-link strong{font-size:.95rem}@media(max-width:700px){.question-grid{grid-template-columns:1fr}.site-header nav a:nth-child(n+3){display:none}.site-footer .shell{flex-direction:column}}</style>${SEMANTIC_MATH_STYLES}${STUDY_CLUSTER_STYLES}${extraStyles}<script src="/semantic-math.js" defer data-studywudy-semantic-math="runtime"></script></head><body><header class="site-header"><div class="shell"><a class="brand" href="/" aria-label="StudyWudy">StudyWudy</a><nav aria-label="Primary"><a href="/boards">Boards</a><a href="/search">Question Bank</a><a href="/about/methodology">Methodology</a></nav></div></header><main id="main-content">${productionHtml(body)}</main><footer class="site-footer"><div class="shell"><strong>StudyWudy</strong><nav aria-label="Footer"><a href="/about/methodology">Publishing methodology</a><a href="/reviewers">Reviewers</a><a href="/corrections">Corrections</a><a href="/privacy">Privacy</a></nav></div></footer></body></html>`;
}

function chapterQuestionRegister() {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const rows = database.prepare(`SELECT row_id, question_id, display_label, type, prompt_text
      FROM catalog_questions WHERE book_id = ? AND chapter_slug = 'electrostatics' ORDER BY row_id`).all(bookId);
    const eligibleRows = rows.filter((row) => isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, Number(row.row_id)));
    const cards = eligibleRows.map((row) => {
      const excerpt = createSearchExcerpt(repairKnownText(bookId, row.prompt_text));
      const href = `${chapterPath}/questions/${row.question_id}`;
      return `<a class="question-link" href="${escapeHtml(href)}" data-question-id="${escapeHtml(row.question_id)}"><span>Question ${escapeHtml(row.display_label)}</span><strong>${escapeHtml(excerpt)}</strong><small>${escapeHtml(String(row.type).replaceAll("_", " "))} · View solution →</small></a>`;
    }).join("");
    return `<section class="shell question-register" id="question-register"><span>Question register</span><h2>${eligibleRows.length} complete, publishable textbook questions</h2><div class="question-grid">${cards}</div></section>`;
  } finally {
    database.close();
  }
}

function buildChapterPage() {
  const runtime = STUDY_CLUSTER_CHAPTER_RUNTIME;
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: runtime.searchMetadata.socialTitle,
    description: runtime.searchMetadata.description,
    url: `${productionOrigin}${runtime.pathname}`,
  }).replaceAll("<", "\\u003c");
  const body = `${runtime.experience.hub}${chapterQuestionRegister()}${runtime.experience.directory}<script type="application/ld+json">${schema}</script>`;
  return pageShell({
    pathname: runtime.pathname,
    title: runtime.searchMetadata.documentTitle,
    description: runtime.searchMetadata.description,
    robots: "index, follow, max-image-preview:large, max-snippet:-1",
    body,
    extraStyles: CHAPTER_PAGE_EXPERIENCE_STYLES,
  });
}

const outputs = [
  {
    path: resolve(outputRoot, "chapter/index.html"),
    source: buildChapterPage(),
    pathname: chapterPath,
  },
  ...Object.entries(STUDY_CLUSTER_RUNTIME_PAGES).map(([pathname, page]) => ({
    path: resolve(outputRoot, routeAssetDirectory(pathname), "index.html"),
    source: pageShell({ pathname, ...page }),
    pathname,
  })),
];

const mode = process.argv[2];
if (mode === "--write") {
  for (const output of outputs) {
    mkdirSync(dirname(output.path), { recursive: true });
    writeFileSync(output.path, output.source);
    console.log(`Wrote ${output.path} (${Buffer.byteLength(output.source)} bytes)`);
  }
} else if (mode === "--check") {
  for (const output of outputs) {
    if (readFileSync(output.path, "utf8") !== output.source) throw new Error(`${output.pathname} static page is stale`);
  }
  console.log(`PASS: ${outputs.length} static Electrostatics routes are current`);
} else {
  throw new Error("Usage: node scripts/build-study-cluster-static-pages.mjs --write|--check");
}
