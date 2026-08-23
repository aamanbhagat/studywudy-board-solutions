#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { isQuestionRenderedDiagramAvailable } from "../answer-completeness.mjs";
import { corpusQuestionSearchEligible } from "../corpus-quality.mjs";
import { CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS } from "../corpus-quality-manifest.mjs";
import { extractCrawlerVisibleText } from "../crawler-visible-text.mjs";
import { getQuestionUrl, questionRecordFromCatalogRow } from "../question-routes.mjs";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { isQuestionPubliclyEligible } from "../public-question-eligibility.mjs";
import { QUESTION_SHOWCASE_ENTRIES } from "../question-showcase-manifest.mjs";
import {
  buildQuestionSearchPlan,
  normalizedQuestionType,
  parseQuestionSearchCriteria,
  questionHasNumericalEvidence,
} from "../question-search.mjs";
import { createPlainSearchText, evaluateSearchExcerptSource, truncateSearchExcerpt } from "../search-excerpt.mjs";
import { filterStaticSearchEligibility, staticSearchEligibilityFailures } from "../static-search-eligibility.mjs";
import {
  isBookQuarantined,
  languageForBookId,
  repairKnownText,
  reviewedBookTitle,
  reviewedChapterTitle,
} from "../multilingual-text-quality.mjs";
import {
  LAUNCH_HOT_PATH_DOCUMENTS,
  LAUNCH_HOT_PATH_RELEASE,
} from "../launch-hot-path.mjs";

const root = resolve(import.meta.dirname, "..");
const assetsRoot = resolve(root, "comparison/after-assets");
const databasePath = resolve(root, "../data/d1/studywudy-content.sqlite3");
const typeLabels = Object.freeze({
  one_word: "One word", one_sentence: "One sentence", brief: "Brief answer", detailed: "Detailed answer",
  define: "Definition", give_reason: "Give reason", name_list: "Name / list", mcq_single: "Single-choice MCQ",
  mcq_multi: "Multiple-choice MCQ", assertion_reason: "Assertion–reason", true_false: "True / false",
  fill_blank: "Fill in the blank", match_column: "Match the columns", distinguish: "Distinguish between",
  passage: "Passage-based", numerical: "Numerical", diagram: "Diagram-based",
});
const questionDecorativeTextStyles = '<style data-studywudy-decorative-text="pseudo-v3">.brand-mark::before{content:"S"}.board-card-meta [data-label]::before{content:attr(data-label)}</style>';

function outputPath(entry) {
  return resolve(assetsRoot, entry.assetPath.replace(/^\//u, ""), "index.html");
}

function occurrences(value, pattern) {
  return [...String(value || "").matchAll(pattern)].length;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function preserveAccessibleQuestionTheme(html) {
  let output = String(html || "")
    .replaceAll('<span class="brand-mark" aria-hidden="true">S</span>', '<span aria-hidden="true" class="brand-mark" data-nosnippet></span>')
    .replaceAll('<span aria-hidden="true" class="brand-mark">S</span>', '<span aria-hidden="true" class="brand-mark" data-nosnippet></span>');
  if (!output.includes('data-studywudy-decorative-text="pseudo-v3"')) {
    output = output.replace("</head>", `${questionDecorativeTextStyles}</head>`);
  }
  return output;
}

function conceptTags(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function searchCardMarkup(row) {
  const href = getQuestionUrl(questionRecordFromCatalogRow(row));
  const type = normalizedQuestionType(row);
  const tags = conceptTags(row.concept_tags)
    .map((tag) => repairKnownText(row.book_id, tag.replaceAll("-", " ")))
    .slice(0, 4);
  const context = [
    reviewedBookTitle(row.book_id, repairKnownText(row.book_id, row.book_title)),
    reviewedChapterTitle(row.book_id, row.chapter_slug, repairKnownText(row.book_id, row.chapter_title)),
    ...tags,
  ].filter(Boolean).join(" · ");
  const plainPrompt = createPlainSearchText(repairKnownText(row.book_id, row.prompt_text));
  const prompt = truncateSearchExcerpt(plainPrompt);
  const anchorVerb = type === "numerical" ? "Calculate"
    : /derive|prove|show that/iu.test(prompt) ? "Derive"
      : type === "mcq_single" ? "Test your understanding of" : "Explain";
  const anchorSubject = truncateSearchExcerpt(
    plainPrompt.replace(/^(?:choose the correct(?: option)?|calculate|derive|explain|find)\s*:?\s*/iu, ""),
    110,
  );
  const descriptiveAnchor = `${anchorVerb} ${anchorSubject.charAt(0).toLocaleLowerCase("en-IN")}${anchorSubject.slice(1)}`;
  const showcase = row.showcase || null;
  const verification = showcase
    ? ` data-showcase-quality-screened="true" data-internal-mapping-consistent="${showcase.internalMappingConsistent}" data-authoritative-textbook-mapping-verified="${showcase.authoritativeTextbookMappingVerified}" data-known-authoritative-mapping-mismatch="${showcase.knownAuthoritativeMappingMismatch}" data-native-script-validation-passed="${showcase.nativeScriptValidationPassed}" data-search-excerpt-clean="${showcase.searchExcerptClean}" data-automated-gate-passed="${showcase.automatedGatePassed}" data-final-publishing-gate-passed="${showcase.finalPublishingGatePassed !== false}" data-unresolved-content="${showcase.unresolvedContent}" data-broken-media="${showcase.brokenMedia}" data-duplicate-options="${showcase.duplicateOptions}" data-runtime-payload-safe="${showcase.runtimePayloadSafe}" data-content-quality-passed="${showcase.contentQualityPassed}"`
    : "";
  return `<a href="${escapeHtml(href)}" data-question-row-id="${Number(row.row_id)}" data-question-id="${escapeHtml(row.question_id)}" data-question-type="${escapeHtml(type)}" data-question-board="${escapeHtml(row.board_slug)}" data-question-class="${escapeHtml(row.grade_slug)}" data-question-subject="${escapeHtml(row.subject_slug)}" data-question-book="${escapeHtml(row.book_id)}" data-question-language="${escapeHtml(showcase?.language || languageForBookId(row.book_id) || "en")}" data-has-diagram="${row.has_rendered_diagram ? "true" : "false"}" data-public-search-eligible="true" data-search-priority="${Number(row.search_priority) || 9}" data-search-match="${escapeHtml(row.search_match || "sample")}"${verification}><div><span>Question ${escapeHtml(row.display_label)}</span><i>${escapeHtml(typeLabels[type] || "Answer")}</i></div><h2 data-search-excerpt="plain-v2">${escapeHtml(prompt)}</h2><p>${escapeHtml(context)}</p><b data-search-description="plain-v2">${escapeHtml(descriptiveAnchor)} →</b></a>`;
}

const searchProjection = `SELECT q.row_id, q.question_id, q.display_label, q.type, q.prompt_text, q.concept_tags,
  b.id AS book_id, b.board_slug, b.grade_slug, b.subject_slug, b.slug AS book_slug, b.title AS book_title,
  q.chapter_slug, c.title AS chapter_title`;

function searchRows(database, entry) {
  if (!entry.search) {
    const byRowId = new Map();
    const statement = database.prepare(`${searchProjection}
      FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id
      JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
      WHERE q.row_id = ? LIMIT 1`);
    for (const showcase of QUESTION_SHOWCASE_ENTRIES) {
      const row = statement.get(showcase.rowId);
      if (!row) throw new Error(`Showcase row ${showcase.rowId} is missing from D1`);
      byRowId.set(showcase.rowId, { ...row, showcase, has_rendered_diagram: showcase.hasDiagram, search_match: "quality-screened-showcase" });
    }
    return QUESTION_SHOWCASE_ENTRIES.map(({ rowId }) => byRowId.get(rowId));
  }
  const criteria = parseQuestionSearchCriteria(new URLSearchParams(entry.search));
  const plan = buildQuestionSearchPlan(criteria, searchProjection);
  const buildSql = criteria.type ? plan.sql.replace(/LIMIT \d+\s*$/u, "LIMIT 10000") : plan.sql;
  return database.prepare(buildSql).all(...plan.bindings).map((row) => ({
    ...row,
    has_rendered_diagram: isQuestionRenderedDiagramAvailable(PHASE4_GATE_MANIFEST, Number(row.row_id)),
  })).filter((row) => !isBookQuarantined(row.book_id)
    && isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, Number(row.row_id), {
      requiresDiagram: criteria.hasDiagram === true,
      hasRenderedDiagram: Boolean(row.has_rendered_diagram),
    })
    && corpusQuestionSearchEligible(row, CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS)
    && evaluateSearchExcerptSource(row.prompt_text).pass
    && (criteria.type !== "numerical" || questionHasNumericalEvidence(row))
    && (criteria.hasDiagram == null || Boolean(row.has_rendered_diagram) === criteria.hasDiagram))
    .slice(0, 50);
}

function replaceSearchCards(html, cards) {
  const source = String(html || "");
  const listStart = source.search(/<div\b[^>]*\bclass=["']search-result-list["'][^>]*>/iu);
  if (listStart < 0) throw new Error("Static search result list is missing");
  const openingEnd = source.indexOf(">", listStart) + 1;
  const listEnd = source.indexOf("</div></section></main>", openingEnd);
  if (openingEnd <= 0 || listEnd < 0) throw new Error("Static search result list boundary is missing");
  return `${source.slice(0, openingEnd)}${cards.join("")}${source.slice(listEnd)}`;
}

function refreshSearchDocuments() {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    for (const entry of LAUNCH_HOT_PATH_DOCUMENTS.filter(({ kind }) => kind === "question-search")) {
      const path = outputPath(entry);
      const rows = searchRows(database, entry);
      const refreshed = filterStaticSearchEligibility(replaceSearchCards(readFileSync(path, "utf8"), rows.map(searchCardMarkup)), PHASE4_GATE_MANIFEST);
      if (refreshed.removedCount) throw new Error(`${entry.publicPath} rebuilt ${refreshed.removedCount} ineligible cards`);
      writeFileSync(path, refreshed.html);
      console.log(`REFRESH ${entry.publicPath} (${refreshed.resultCount} eligible cards)`);
    }
  } finally {
    database.close();
  }
}

function inspect(entry, html) {
  const failures = [];
  const source = String(html || "");
  const text = extractCrawlerVisibleText(source);
  if (!/^<!doctype html>/iu.test(source) || !/<\/html>\s*$/iu.test(source)) failures.push("document is not complete HTML");
  if (/self\.__next_f|<script\b[^>]*src=["']\/_next\/static\/chunks\//iu.test(source)) failures.push("Next hydration payload remains");
  if (/class=["'][^"']*\b(?:math-plain-text|math-semantic-only|katex(?:-display)?)\b|<annotation\b/iu.test(source)) {
    failures.push("a duplicate equation representation remains");
  }
  if (/\\(?:frac|varepsilon|epsilon|text|mathrm|times)\b|\$\$/u.test(text)) failures.push("raw TeX is crawler-visible");
  if (entry.kind.endsWith("-question")) {
    if (!source.includes(`id="${entry.questionId}"`)) failures.push("question identity is missing");
    if (!source.includes('data-studywudy-question-template="original-theme-v1"')) failures.push("original StudyWudy question template is missing");
    if (!source.includes('/_next/static/chunks/3utpp1hmg6_bb.css')) failures.push("original StudyWudy question stylesheet is missing");
    if (!source.includes('data-studywudy-decorative-text="pseudo-v3"')) failures.push("accessible brand monogram styling is missing");
    if (/<span(?: [^>]*)?class=["']brand-mark["'](?: [^>]*)?>S<\/span>/iu.test(source)) failures.push("brand monogram remains crawler-visible text");
    if (!/class=["'][^"']*\bquestion-chapter-rail\b/iu.test(source)) failures.push("chapter question rail is missing");
    if (!/class=["'][^"']*\banswer-context\b/iu.test(source)) failures.push("study context rail is missing");
    if (!/(?:Automated (?:completeness gate passed|answer checks incomplete)|Equation review pending)/u.test(text)) failures.push("publishing evidence is missing");
    if (entry.questionId.endsWith("-002")) {
      if (!/Dielectric Slab Capacitor MCQ Solution/u.test(source)) failures.push("Q2 title does not use the normalized MCQ type");
      if (/Dielectric Slab Capacitor Numerical/u.test(source)) failures.push("Q2 title still uses the imported Numerical classification");
    }
    if (entry.inspection === "corrected-semantic-answer") {
      if (!/The brain is inside the skull, while the nose is an external organ\./u.test(text)) failures.push("corrected answer explanation is missing");
      if (/external organ is an internal organ/u.test(text)) failures.push("joined contradictory answer remains");
    }
    if (entry.inspection === "authoritative-mapping-mismatch") {
      if (!/Authoritative textbook mapping mismatch/u.test(text)) failures.push("authoritative mapping mismatch is not disclosed");
      if (!/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/iu.test(source)) failures.push("authoritative mapping mismatch is still indexable");
      if (!/डासपीटिका[^.]{0,100}chapter 10|chapter 10[^.]{0,100}डासपीटिका/iu.test(text)) failures.push("official chapter-order evidence is missing");
    }
    if (entry.inspection === "verified-source-typo-retained") {
      if (!/Verified source typo retained/u.test(text)) failures.push("verified source-typo note is missing");
      if (/positvely/u.test(text)) failures.push("retained source typo is crawler-visible");
      if (!source.includes('data-content-quality-classification="source typo retained with note"')) failures.push("source-typo classification is missing");
      if (!/\bdata-nosnippet(?:\s|=|>)/u.test(source)) failures.push("source quotation is not snippet-excluded");
    }
    if (entry.inspection === "gauss-law-density-repair") {
      if (!/density ρ/u.test(text)) failures.push("repaired charge density is missing");
      if (/density ρρ/u.test(text)) failures.push("duplicated charge-density symbol remains");
      if (!/Gauss’s Law/u.test(text) || /Gausss Law/u.test(text)) failures.push("Gauss’s Law title repair is missing");
    }
    if (entry.inspection === "fixed-charges-grammar-repair") {
      if (!/two fixed charges/u.test(text)) failures.push("fixed-charges grammar repair is missing");
      if (/two fixed charged/u.test(text)) failures.push("fixed charged grammar defect remains");
    }
    if (entry.inspection === "lr-semantic-roundtrip") {
      if (!/<math\b[^>]*aria-label=["'][^"']*integral[^"']*["']/iu.test(source)) failures.push("LR integral is missing from semantic MathML");
      if (!/<math\b[^>]*aria-label=["'][^"']*epsilon[^"']*["']/iu.test(source)) failures.push("LR epsilon is missing from semantic MathML");
      if (!/U sub B equals one half L i squared/iu.test(source)) failures.push("LR one-half magnetic-energy relation is missing");
    }
  } else {
    failures.push(...staticSearchEligibilityFailures(source, PHASE4_GATE_MANIFEST));
    const declared = Number(source.match(/\bdata-search-result-count=["'](\d+)["']/iu)?.[1]);
    const cards = occurrences(source, /<a\b[^>]*\bdata-question-id=["'][^"']+["'][^>]*>/giu);
    if (!Number.isInteger(declared)) failures.push("server-rendered result count is missing");
    else if (declared !== cards) failures.push(`declared ${declared} results but rendered ${cards} cards`);
    if (!cards && entry.search === "") failures.push("no question cards are server-rendered");
    if (entry.search === "" && cards !== 16) failures.push(`default showroom has ${cards} cards instead of 16`);
    if (entry.search === "" && !/Quality-screened sample questions/iu.test(text)) failures.push("default showroom still makes a misleading verified claim");
    if (entry.search === "" && /data-showcase-verified|data-source-mapping-verified/iu.test(source)) failures.push("default showroom still conflates internal and authoritative mapping");
    if (entry.search !== "" && /\breviewed matches\b/iu.test(text)) failures.push("filtered summary overclaims human review");
    if (entry.search !== "" && !/\d+ eligible (?:match is|matches are) rendered below\./iu.test(text)) failures.push("filtered summary does not describe eligible matches");
    if (/डसपटक|HuntingGathering|We did not\s+(?:blank|in the class)|literal blank|_{3,}/iu.test(text)) {
      failures.push("a reported showroom defect remains");
    }
    if (entry.search === "type=numerical" && /boron trifluoride|which theory explains it|electrode potential of copper|write (?:the )?SQL quer|structured query language/iu.test(text)) {
      failures.push("a conceptual or SQL question remains classified as numerical");
    }
    if (entry.search === "hasDiagram=true" && /assassination of Julius Caesar|giving graphic details|write the newspaper report/iu.test(text)) {
      failures.push("a non-diagram writing prompt remains classified as diagram-based");
    }
  }
  return Object.freeze(failures);
}

function verifyFiles() {
  for (const entry of LAUNCH_HOT_PATH_DOCUMENTS) {
    const path = outputPath(entry);
    const failures = inspect(entry, readFileSync(path, "utf8"));
    if (failures.length) throw new Error(`${entry.publicPath}: ${failures.join("; ")}`);
  }
}

async function fetchDocuments(origin, { refreshQuestionTheme = false } = {}) {
  const documents = [];
  for (const entry of LAUNCH_HOT_PATH_DOCUMENTS) {
    const url = new URL(entry.publicPath, `${origin}/`);
    if (refreshQuestionTheme && entry.kind.endsWith("-question")) {
      url.searchParams.set("__studywudy_question_template", "original-theme-v1");
    }
    const response = await fetch(url, {
      headers: {
        accept: "text/html",
        "cache-control": "no-cache",
        "x-studywudy-static-build": LAUNCH_HOT_PATH_RELEASE,
        "user-agent": `StudyWudy ${LAUNCH_HOT_PATH_RELEASE} release builder`,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
    if (response.status !== 200) throw new Error(`${entry.publicPath} returned ${response.status}`);
    if (!(response.headers.get("content-type") || "").includes("text/html")) throw new Error(`${entry.publicPath} did not return HTML`);
    const responseHtml = await response.text();
    const html = entry.kind.endsWith("-question") ? preserveAccessibleQuestionTheme(responseHtml) : responseHtml;
    const failures = inspect(entry, html);
    if (failures.length) throw new Error(`${entry.publicPath}: ${failures.join("; ")}`);
    documents.push(Object.freeze({ entry, html }));
    console.log(`CAPTURE ${entry.publicPath}`);
  }
  return documents;
}

const mode = process.argv[2];
if (mode === "--check") {
  verifyFiles();
  console.log(`PASS: ${LAUNCH_HOT_PATH_DOCUMENTS.length} ${LAUNCH_HOT_PATH_RELEASE} documents`);
} else if (mode === "--write") {
  const originFlag = process.argv.indexOf("--origin");
  const origin = new URL(originFlag >= 0 ? process.argv[originFlag + 1] : "http://127.0.0.1:8789").origin;
  const documents = await fetchDocuments(origin, { refreshQuestionTheme: process.argv.includes("--refresh-question-theme") });
  for (const { entry, html } of documents) {
    const path = outputPath(entry);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, html);
  }
  verifyFiles();
  console.log(`Wrote ${documents.length} ${LAUNCH_HOT_PATH_RELEASE} documents`);
} else if (mode === "--refresh-gates") {
  refreshSearchDocuments();
  verifyFiles();
  console.log(`Refreshed final publishing gates in ${LAUNCH_HOT_PATH_DOCUMENTS.length} ${LAUNCH_HOT_PATH_RELEASE} documents`);
} else {
  throw new Error("Usage: node scripts/build-launch-hot-path-static.mjs --write [--origin URL] [--refresh-question-theme] | --refresh-gates | --check");
}
