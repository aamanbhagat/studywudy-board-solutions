#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createSearchExcerpt } from "../search-excerpt.mjs";
import { CORPUS_QUALITY_FINDINGS } from "../corpus-quality.mjs";
import { CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS } from "../corpus-quality-manifest.mjs";
import { repairKnownText } from "../multilingual-text-quality.mjs";

const root = resolve(import.meta.dirname, "..");
const databasePath = resolve(root, "../data/d1/studywudy-content.sqlite3");
const outputPath = resolve(root, "comparison/after-assets/pages/corpus-quality/quadratic-equations/index.html");
const bookId = "cbse::class-10::mathematics::ncert-exemplar-mathematics-exemplar-class-10";
const chapterSlug = "quadatric-euation";
const publicPath = `/cbse/class-10/mathematics/ncert-exemplar-mathematics-exemplar-class-10/${chapterSlug}`;
const canonical = `https://studywudy.in${publicPath}`;
const sourceReviewPages = Object.freeze([
  Object.freeze({
    rowId: 61425,
    questionId: "q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-29-031",
    publicPath: "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/electric-field-and-potential/questions/q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-29-031",
    output: "source-review-61425",
    context: "CBSE · Class 12 · Physics · Electric Field and Potential",
  }),
  Object.freeze({
    rowId: 59639,
    questionId: "q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-6-052",
    publicPath: "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/friction/questions/q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-6-052",
    output: "source-review-59639",
    context: "CBSE · Class 12 · Physics · Friction",
  }),
  Object.freeze({
    rowId: 127683,
    questionId: "q-cisce-frank-mathematics-part-2-class-10-6-042",
    publicPath: "/cisce/class-10/mathematics/frank-mathematics-part-2-class-10/problems-based-on-quadratic-equations/questions/q-cisce-frank-mathematics-part-2-class-10-6-042",
    output: "source-review-127683",
    context: "CISCE · Class 10 · Mathematics · Problems Based on Quadratic Equations",
  }),
  Object.freeze({
    rowId: 998,
    questionId: "q-cbse-ncert-math-magic-class-1-12-001",
    publicPath: "/cbse/class-1/mathematics/ncert-math-magic-class-1/money/questions/q-cbse-ncert-math-magic-class-1-12-001",
    output: "source-review-998",
    context: "CBSE · Class 1 · Mathematics · Money",
    heading: "Question options under source review",
    noteTitle: "Duplicate options under source review",
    detail: "At least two normalized answer options are identical or empty. The imported choices are retained for source comparison rather than silently rewritten.",
  }),
]);
const compactChapterPages = Object.freeze([
  Object.freeze({
    bookId: "cbse::class-12::chemistry::ncert-exemplar-chemistry-exemplar-class-12",
    chapterSlug: "solid-states",
    publicPath: "/cbse/class-12/chemistry/ncert-exemplar-chemistry-exemplar-class-12/solid-states",
    output: "chapter-solid-states",
    title: "Solid States",
    context: "CBSE · Class 12 · Chemistry · NCERT Exemplar",
  }),
  Object.freeze({
    bookId: "cbse::class-12::physics::hc-verma-concepts-of-physics-volume-1-and-2-class-12",
    chapterSlug: "electric-field-and-potential",
    publicPath: "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/electric-field-and-potential",
    output: "chapter-electric-field-and-potential",
    title: "Electric Field and Potential",
    context: "CBSE · Class 12 · Physics · HC Verma",
  }),
  Object.freeze({
    bookId: "cbse::class-12::physics::hc-verma-concepts-of-physics-volume-1-and-2-class-12",
    chapterSlug: "friction",
    publicPath: "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/friction",
    output: "chapter-friction",
    title: "Friction",
    context: "CBSE · Class 12 · Physics · HC Verma",
  }),
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildPage() {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const questions = database.prepare(`SELECT question_id, display_label, type, prompt_text
      FROM catalog_questions WHERE book_id = ? AND chapter_slug = ? ORDER BY row_id`).all(bookId, chapterSlug);
    if (questions.length !== 56) throw new Error(`Expected 56 Quadratic Equations questions, found ${questions.length}`);
    const cards = questions.map((question) => {
      const href = `${publicPath}/questions/${question.question_id}`;
      const excerpt = createSearchExcerpt(question.prompt_text);
      return `<a class="question-link" href="${escapeHtml(href)}" data-question-id="${escapeHtml(question.question_id)}"><span>Question ${escapeHtml(question.display_label)}</span><strong>${escapeHtml(excerpt)}</strong><small>${escapeHtml(String(question.type).replaceAll("_", " "))} · View solution →</small></a>`;
    }).join("");
    const breadcrumbs = [
      ["Home", "/"], ["CBSE", "/cbse"], ["Class 10", "/cbse/class-10"],
      ["Mathematics", "/cbse/class-10/mathematics"],
      ["NCERT Mathematics Exemplar", "/cbse/class-10/mathematics/ncert-exemplar-mathematics-exemplar-class-10"],
      ["Quadratic Equations", publicPath],
    ];
    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Quadratic Equations – Class 10 Mathematics Exemplar",
      url: canonical,
      isPartOf: { "@type": "Book", name: "NCERT Mathematics Exemplar Class 10" },
    }).replaceAll("<", "\\u003c");
    return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quadratic Equations Solutions – Class 10 Mathematics Exemplar | StudyWudy</title><meta name="description" content="Browse all 56 NCERT Mathematics Exemplar Class 10 Quadratic Equations questions with direct links to worked solutions."><meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1"><link rel="canonical" href="${canonical}"><script type="application/ld+json">${schema}</script><style>:root{color-scheme:light;--ink:#17231d;--green:#174d31;--paper:#f7f2e8;--line:#d5cec1}*{box-sizing:border-box}body{margin:0;background:#fbfaf6;color:var(--ink);font:16px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit}.shell{width:min(1120px,calc(100% - 2rem));margin:auto}.site-header{border-bottom:1px solid var(--line);background:#fff}.site-header .shell{display:flex;justify-content:space-between;align-items:center;padding:1rem 0}.brand{font-size:1.15rem;font-weight:900;text-decoration:none}.site-header nav{display:flex;gap:1rem;font-weight:700}.breadcrumbs{border-bottom:1px solid var(--line);background:#fff}.breadcrumbs ol{display:flex;gap:.45rem;overflow:auto;margin:0;padding:.7rem 0;list-style:none;white-space:nowrap;font-size:.78rem}.breadcrumbs li+li:before{content:"/";margin-right:.45rem;color:#7b817d}.hero{padding:clamp(2rem,6vw,4.5rem) 0;background:linear-gradient(140deg,#edf5ef,var(--paper))}.eyebrow{color:var(--green);font-size:.75rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.hero h1{max-width:18ch;margin:.35rem 0 .8rem;font-size:clamp(2.2rem,7vw,4.6rem);line-height:1;letter-spacing:-.05em}.hero p{max-width:68ch;margin:.5rem 0}.source-note{margin-top:1rem;padding:.8rem 1rem;border-left:4px solid var(--green);background:#fff}.register{padding:2rem 0 4rem}.register header{display:flex;justify-content:space-between;gap:1rem;align-items:end;margin-bottom:1rem}.register h2{margin:0;font-size:clamp(1.5rem,4vw,2.4rem)}.question-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}.question-link{display:grid;gap:.35rem;padding:1rem;border:1px solid var(--line);border-radius:14px;background:#fff;text-decoration:none}.question-link:hover,.question-link:focus-visible{border-color:var(--green);box-shadow:0 8px 22px #173d2a14;outline:none}.question-link span,.question-link small{color:#476052;font-size:.76rem;font-weight:800;text-transform:capitalize}.question-link strong{font-size:.95rem}.site-footer{padding:1.5rem 0;border-top:1px solid var(--line);background:var(--ink);color:#fff}.site-footer .shell{display:flex;justify-content:space-between;gap:1rem}.site-footer nav{display:flex;flex-wrap:wrap;gap:1rem}@media(max-width:700px){.question-grid{grid-template-columns:1fr}.site-header nav a:nth-child(n+3){display:none}.register header,.site-footer .shell{align-items:flex-start;flex-direction:column}}</style></head><body><header class="site-header"><div class="shell"><a class="brand" href="/" aria-label="StudyWudy">StudyWudy</a><nav aria-label="Primary"><a href="/boards">Boards</a><a href="/search">Question Bank</a><a href="/about/methodology">Methodology</a></nav></div></header><nav class="breadcrumbs" aria-label="Breadcrumb"><ol class="shell">${breadcrumbs.map(([label, href], index) => `<li><a href="${escapeHtml(href)}"${index === breadcrumbs.length - 1 ? ' aria-current="page"' : ""}>${escapeHtml(label)}</a></li>`).join("")}</ol></nav><main><section class="hero"><div class="shell"><span class="eyebrow">CBSE · Class 10 · Mathematics</span><h1>Quadratic Equations</h1><p>Work through the NCERT Mathematics Exemplar chapter in textbook order. Use the direct links below to open each mapped answer.</p><p class="source-note"><strong>Metadata review:</strong> the imported chapter label was corrected using the official NCERT Chapter 4 PDF. The legacy URL remains unchanged so existing links continue to work. <a href="https://ncert.nic.in/pdf/publication/exemplarproblem/classX/mathematics/jeep204.pdf" rel="noopener">View NCERT source →</a></p></div></section><section class="shell register" id="question-register"><header><div><span class="eyebrow">Question register</span><h2>All 56 mapped questions</h2></div><p>MCQs, short answers and applications</p></header><div class="question-grid">${cards}</div></section></main><footer class="site-footer"><div class="shell"><strong>StudyWudy</strong><nav aria-label="Footer"><a href="/about/methodology">Publishing methodology</a><a href="/reviewers">Reviewers</a><a href="/corrections">Corrections</a><a href="/privacy">Privacy</a></nav></div></footer></body></html>`;
  } finally {
    database.close();
  }
}

function buildSourceReviewPage(entry) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const row = database.prepare("SELECT question_id, display_label, prompt_text FROM catalog_questions WHERE row_id = ? LIMIT 1").get(entry.rowId);
    if (!row || row.question_id !== entry.questionId) throw new Error(`Stale source-review record ${entry.rowId}`);
    const prompt = createSearchExcerpt(row.prompt_text);
    const chapterPath = entry.publicPath.replace(/\/questions\/[^/]+$/u, "");
    const pageCanonical = `https://studywudy.in${entry.publicPath}`;
    const heading = entry.heading || "Imported question under source review";
    const noteTitle = entry.noteTitle || "Imported wording under source review";
    const detail = entry.detail || "The import contains a likely transcription defect and no verified source page is attached. The quotation is retained for comparison rather than silently rewritten.";
    return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Imported Question Under Source Review | StudyWudy</title><meta name="description" content="This imported question is retained for source comparison and excluded from search and indexing until its textbook wording is verified."><meta name="robots" content="noindex, follow"><link rel="canonical" href="${escapeHtml(pageCanonical)}"><style>:root{--ink:#17231d;--green:#174d31;--paper:#f7f2e8;--amber:#8a5a08}*{box-sizing:border-box}body{margin:0;background:#fbfaf6;color:var(--ink);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit}.shell{width:min(850px,calc(100% - 2rem));margin:auto}.site-header{border-bottom:1px solid #d5cec1;background:#fff}.site-header .shell{display:flex;justify-content:space-between;padding:1rem 0}.brand{font-weight:900;text-decoration:none}.crumbs{padding:.8rem 0;font-size:.82rem}.review{padding:clamp(2rem,6vw,5rem) 0}.eyebrow{color:var(--green);font-size:.74rem;font-weight:900;letter-spacing:.09em;text-transform:uppercase}.review h1{margin:.35rem 0 1rem;font-size:clamp(2rem,6vw,3.8rem);line-height:1.02;letter-spacing:-.045em}.source-question{margin:1rem 0;padding:1.15rem;border:1px solid #d5cec1;border-radius:14px;background:#fff;font-size:1.05rem;font-weight:700}.quality-note{margin-top:1rem;padding:1.1rem;border:1px solid #c89a4b;border-left:5px solid var(--amber);border-radius:14px;background:#fff8e8}.quality-note h2{margin:.25rem 0 .45rem;font-size:1.2rem}.quality-note p{margin:.35rem 0}.actions{display:flex;flex-wrap:wrap;gap:.65rem;margin-top:1.2rem}.actions a{padding:.65rem .8rem;border:1px solid #b9c9bd;border-radius:9px;background:#fff;font-weight:800;text-decoration:none}.site-footer{padding:1.25rem 0;background:var(--ink);color:#fff}</style></head><body><header class="site-header"><div class="shell"><a class="brand" href="/" aria-label="StudyWudy">StudyWudy</a><a href="/search">Question Bank</a></div></header><main class="shell"><nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> · <a href="${escapeHtml(chapterPath)}">Chapter</a> · <a href="${escapeHtml(entry.publicPath)}" aria-current="page">Question ${escapeHtml(row.display_label)}</a></nav><section class="review"><span class="eyebrow">${escapeHtml(entry.context)}</span><h1>${escapeHtml(heading)}</h1><div class="source-question" data-nosnippet>${escapeHtml(prompt)}</div><aside class="quality-note" data-content-quality-classification="OCR/import corruption" data-content-quality-status="source-review-required"><span class="eyebrow">Corpus quality classification</span><h2>${escapeHtml(noteTitle)}</h2><p>${escapeHtml(detail)}</p><p>This page is excluded from public search results, crawler snippets and indexing until an editor verifies the textbook wording and answer.</p></aside><div class="actions"><a href="${escapeHtml(chapterPath)}">Back to chapter</a><a href="/about/methodology">Publishing methodology</a><a href="/contact">Report source evidence</a></div></section></main><footer class="site-footer"><div class="shell">StudyWudy · Source review required</div></footer></body></html>`;
  } finally {
    database.close();
  }
}

function buildCompactChapterPage(entry) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const rows = database.prepare(`SELECT row_id, question_id, display_label, type, prompt_text
      FROM catalog_questions WHERE book_id = ? AND chapter_slug = ? ORDER BY row_id`).all(entry.bookId, entry.chapterSlug);
    if (!rows.length) throw new Error(`No questions found for ${entry.bookId}/${entry.chapterSlug}`);
    const duplicateRows = new Set(CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS);
    const cards = rows.map((row) => {
      const href = `${entry.publicPath}/questions/${row.question_id}`;
      const finding = CORPUS_QUALITY_FINDINGS[row.question_id];
      if (finding || duplicateRows.has(Number(row.row_id))) {
        const classification = finding?.classification || "OCR/import corruption";
        return `<a class="question-link source-review" href="${escapeHtml(href)}" data-question-id="${escapeHtml(row.question_id)}" data-nosnippet><span>Question ${escapeHtml(row.display_label)}</span><strong>Source review note available</strong><small>${escapeHtml(classification)} · Open record →</small></a>`;
      }
      const excerpt = createSearchExcerpt(repairKnownText(entry.bookId, row.prompt_text));
      return `<a class="question-link" href="${escapeHtml(href)}" data-question-id="${escapeHtml(row.question_id)}"><span>Question ${escapeHtml(row.display_label)}</span><strong>${escapeHtml(excerpt)}</strong><small>${escapeHtml(String(row.type).replaceAll("_", " "))} · View solution →</small></a>`;
    }).join("");
    const canonicalUrl = `https://studywudy.in${entry.publicPath}`;
    return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(entry.title)} Questions and Solutions | StudyWudy</title><meta name="description" content="Browse ${rows.length} mapped ${escapeHtml(entry.title)} questions with direct solution links and source-review exclusions for unverified imports."><meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1"><link rel="canonical" href="${escapeHtml(canonicalUrl)}"><style>:root{--ink:#17231d;--green:#174d31;--paper:#f7f2e8;--line:#d5cec1}*{box-sizing:border-box}body{margin:0;background:#fbfaf6;color:var(--ink);font:16px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit}.shell{width:min(1080px,calc(100% - 2rem));margin:auto}.site-header{border-bottom:1px solid var(--line);background:#fff}.site-header .shell{display:flex;justify-content:space-between;padding:1rem 0}.brand{font-weight:900;text-decoration:none}.crumbs{padding:.75rem 0;font-size:.82rem}.hero{padding:clamp(2rem,6vw,4rem) 0;background:linear-gradient(135deg,#e9f3ec,var(--paper))}.eyebrow{color:var(--green);font-size:.74rem;font-weight:900;letter-spacing:.09em;text-transform:uppercase}.hero h1{margin:.35rem 0 .7rem;font-size:clamp(2.2rem,7vw,4.5rem);line-height:1;letter-spacing:-.05em}.register{padding:2rem 0 4rem}.register h2{margin:.2rem 0 1rem}.question-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}.question-link{display:grid;gap:.35rem;padding:1rem;border:1px solid var(--line);border-radius:14px;background:#fff;text-decoration:none}.question-link span,.question-link small{color:#476052;font-size:.76rem;font-weight:800}.question-link strong{font-size:.95rem}.source-review{border-color:#c89a4b;background:#fff8e8}.site-footer{padding:1.25rem 0;background:var(--ink);color:#fff}@media(max-width:700px){.question-grid{grid-template-columns:1fr}}</style></head><body><header class="site-header"><div class="shell"><a class="brand" href="/" aria-label="StudyWudy">StudyWudy</a><a href="/search">Question Bank</a></div></header><main><nav class="shell crumbs" aria-label="Breadcrumb"><a href="/">Home</a> · <a href="${escapeHtml(entry.publicPath)}" aria-current="page">${escapeHtml(entry.title)}</a></nav><section class="hero"><div class="shell"><span class="eyebrow">${escapeHtml(entry.context)}</span><h1>${escapeHtml(entry.title)}</h1><p>Open any mapped question below. Records with unresolved source or option issues are clearly marked and excluded from crawler snippets.</p></div></section><section class="shell register"><span class="eyebrow">Question register</span><h2>All ${rows.length} mapped questions</h2><div class="question-grid">${cards}</div></section></main><footer class="site-footer"><div class="shell">StudyWudy · Source-aware question catalogue</div></footer></body></html>`;
  } finally {
    database.close();
  }
}

const mode = process.argv[2];
const outputs = [
  { path: outputPath, source: buildPage(), label: "Quadratic Equations chapter" },
  ...sourceReviewPages.map((entry) => ({
    path: resolve(root, `comparison/after-assets/pages/corpus-quality/${entry.output}/index.html`),
    source: buildSourceReviewPage(entry),
    label: `source review ${entry.rowId}`,
  })),
  ...compactChapterPages.map((entry) => ({
    path: resolve(root, `comparison/after-assets/pages/corpus-quality/${entry.output}/index.html`),
    source: buildCompactChapterPage(entry),
    label: `compact chapter ${entry.title}`,
  })),
];
if (mode === "--write") {
  for (const output of outputs) {
    mkdirSync(dirname(output.path), { recursive: true });
    writeFileSync(output.path, output.source);
    console.log(`Wrote ${output.path} (${Buffer.byteLength(output.source)} bytes)`);
  }
} else if (mode === "--check") {
  for (const output of outputs) {
    if (readFileSync(output.path, "utf8") !== output.source) throw new Error(`${output.label} is stale; run pnpm build:corpus-quality-static`);
  }
  console.log(`PASS: ${outputs.length} static corpus pages are current; Quadratic Equations exposes 56 clean question links`);
} else {
  throw new Error("Usage: node scripts/build-corpus-quality-static-pages.mjs --write|--check");
}
