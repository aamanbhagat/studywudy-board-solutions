#!/usr/bin/env node

// Section 3 of my-plan.md: a read-only technical-SEO audit.
//
// This script reports; it does not fix. It opens the corpus read-only, writes
// only under audits/technical-seo/, and touches no page, no database row and no
// deployment. `pass` means the audit ran to completion - site verdicts live in
// checklist[].status and problems in findings[].

import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PRODUCTION_ORIGIN } from "./featured-study-route-smoke.mjs";
import { auditCrawl } from "./technical-seo-crawl.mjs";
import { auditDuplication } from "./technical-seo-duplication.mjs";
import { auditMarkup, collectDocuments } from "./technical-seo-markup.mjs";
import { auditMetadata } from "./technical-seo-metadata.mjs";
import { auditSurface } from "./technical-seo-surface.mjs";
import {
  CHECKLIST_ITEMS,
  STATUS,
  TECHNICAL_SEO_POLICY_VERSION,
  isCompleteHtmlDocument,
  documentTitleFromHtml,
  titleLength,
} from "../technical-seo.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(argument, next);
    index += 1;
  } else args.set(argument, true);
}

const root = resolve(import.meta.dirname, "..");
const databasePath = resolve(root, args.get("--source-db") || "../data/d1/studywudy-content.sqlite3");
const outputPath = resolve(root, args.get("--output") || "audits/technical-seo/technical-seo-audit.json");
const only = args.get("--only") === true ? null : args.get("--only");
const live = args.get("--live") === true;
const origin = args.get("--origin") || process.env.STUDYWUDY_DEPLOYMENT_URL || PRODUCTION_ORIGIN;

const GROUPS = Object.freeze({
  metadata: ["title-budget", "meta-uniqueness"],
  duplication: ["duplicate-content"],
  markup: ["structured-data", "heading-hierarchy"],
  crawl: ["sitemap", "robots", "internal-linking"],
  surface: ["core-web-vitals", "dpdp", "adsense"],
});
if (only && !Object.hasOwn(GROUPS, only)) {
  throw new Error(`--only must be one of ${Object.keys(GROUPS).join(", ")}`);
}
const wanted = (group) => !only || only === group;

// ---------------------------------------------------------------------------
// Live probes. Same 503 backoff as scripts/accessibility-text-smoke.mjs:18-43,
// re-authored because that copy is not exported.
// ---------------------------------------------------------------------------

const AVAILABILITY_ROUTES = Object.freeze(["/", "/boards", "/cbse", "/cbse/class-12", "/search", "/robots.txt"]);
const AVAILABILITY_ATTEMPTS = 3;

async function fetchWithRetry(url, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        headers: { accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.status === 503 && attempt < attempts - 1) {
        await response.body?.cancel();
        await new Promise((settle) => setTimeout(settle, 1_000 * (2 ** attempt)));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1) throw error;
      await new Promise((settle) => setTimeout(settle, 1_000 * (2 ** attempt)));
    }
  }
  throw lastError;
}

async function probeAvailability(errors) {
  const probes = [];
  for (const route of AVAILABILITY_ROUTES) {
    for (let attempt = 0; attempt < AVAILABILITY_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetchWithRetry(new URL(route, origin).href, 1);
        const body = await response.text();
        probes.push({
          route,
          attempt: attempt + 1,
          status: response.status,
          bytes: body.length,
          contentLength: response.headers.get("content-length"),
          cacheStatus: response.headers.get("cf-cache-status"),
          adMode: response.headers.get("x-studywudy-ad-mode"),
          incomplete: route.endsWith(".txt") ? false : !isCompleteHtmlDocument(body),
        });
      } catch (error) {
        probes.push({ route, attempt: attempt + 1, status: 0, error: String(error.message || error), incomplete: true });
        errors.push(`Availability probe failed for ${route}: ${error.message || error}`);
      }
    }
  }
  const byRoute = {};
  for (const route of AVAILABILITY_ROUTES) {
    const routeProbes = probes.filter((probe) => probe.route === route);
    byRoute[route] = {
      attempts: routeProbes.length,
      statuses: routeProbes.map((probe) => probe.status),
      bytes: routeProbes.map((probe) => probe.bytes ?? null),
      incomplete: routeProbes.filter((probe) => probe.incomplete).length,
      cacheStatus: [...new Set(routeProbes.map((probe) => probe.cacheStatus))],
      adMode: [...new Set(routeProbes.map((probe) => probe.adMode))],
    };
  }
  return { origin, probes, byRoute };
}

// Offline title generation is only trustworthy if it agrees with what the origin
// serves. Any body that fails the </html> check is recorded as incomplete rather
// than counted as drift - otherwise the truncation incident manufactures
// findings. Drift on question and chapter routes is expected until the Section 2
// commits deploy.
async function probeGeneratorDrift(sampleEntries, errors) {
  const results = [];
  for (const entry of sampleEntries) {
    try {
      const response = await fetchWithRetry(new URL(entry.path, origin).href);
      const body = await response.text();
      if (!isCompleteHtmlDocument(body)) {
        results.push({ path: entry.path, template: entry.template, verdict: "incomplete-response", status: response.status, bytes: body.length });
        continue;
      }
      const liveTitle = documentTitleFromHtml(body);
      results.push({
        path: entry.path,
        template: entry.template,
        verdict: liveTitle === entry.title ? "match" : "generator-drift",
        offlineLength: titleLength(entry.title),
        liveLength: titleLength(liveTitle),
        liveTitle: liveTitle === entry.title ? undefined : liveTitle,
      });
    } catch (error) {
      results.push({ path: entry.path, template: entry.template, verdict: "unreachable", error: String(error.message || error) });
      errors.push(`Generator-drift probe failed for ${entry.path}: ${error.message || error}`);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const errors = [];
const corpusStat = statSync(databasePath);
const database = new DatabaseSync(databasePath, { readOnly: true });
const corpus = {
  path: databasePath,
  bytes: corpusStat.size,
  mtime: corpusStat.mtime.toISOString(),
  questionRows: database.prepare("SELECT COUNT(*) AS total FROM catalog_questions").get().total,
  chapterRows: database.prepare("SELECT COUNT(*) AS total FROM catalog_chapters").get().total,
  bookRows: database.prepare("SELECT COUNT(*) AS total FROM catalog_books").get().total,
};

// A document that fails the </html> check is discarded rather than parsed, and
// recorded in scope.documentsSkipped. That is a measurement, not an audit
// failure, so it does not touch `errors`.
const { documents, skipped, redirects } = await collectDocuments(root);

const checklist = [];
let metadataEntries = null;
if (wanted("metadata")) {
  metadataEntries = auditMetadata({ database, root, corpus });
  checklist.push(...metadataEntries);
}
if (wanted("duplication")) checklist.push(...auditDuplication({ database, root, corpus }));
if (wanted("markup")) checklist.push(...auditMarkup({ documents }));
if (wanted("crawl")) checklist.push(...auditCrawl({ database, root, documents, redirects, corpusFile: databasePath }));

let availability = null;
let generatorDrift = null;
if (live) {
  availability = await probeAvailability(errors);
  if (metadataEntries) {
    const longest = metadataEntries[0].metrics.longestTitles || [];
    const sample = [];
    const seenTemplates = new Set();
    for (const entry of longest) {
      if (seenTemplates.has(entry.template)) continue;
      seenTemplates.add(entry.template);
      sample.push(entry);
    }
    generatorDrift = await probeGeneratorDrift(sample.slice(0, 20), errors);
  }
}
if (wanted("surface")) checklist.push(...auditSurface({ root, documents, availability }));

database.close();

const OPEN_BACKLOG = Object.freeze([
  Object.freeze({
    id: "search-input-focus-indicator",
    state: "logged-not-fixed",
    severity: "high",
    summary: "The search input has no visible focus indicator on any viewport (WCAG 2.4.7 and 2.4.11).",
    evidence: "audits/phase-1/keyboard-qa.json: 3 of 12 runs fail, template `search`, at 390x844, 768x1024 and 1440x1000 - outline none, 0px width, no shadow. Commit 84e96c26 records the deployed Worker failing the same 3, so this predates the Section 2 work.",
  }),
  Object.freeze({
    id: "corpus-vintage-divergence",
    state: "logged-not-fixed",
    severity: "medium",
    summary: "The local corpus and the deployed D1 are different vintages, so every corpus-derived number here is unverified against production.",
    evidence: "/search?type=numerical returns 36 rows from the local build and data-search-result-count=\"50\" live. Separately, catalog_questions.prompt_text disagrees with the reconciled chunk text on 19,897 of 299,458 rows; that migration is deliberately unrun. Every checklist entry with provenance.dataSource === \"corpus\" carries productionVerification: \"unverified-against-production\" for this reason.",
  }),
  Object.freeze({
    id: "production-resource-limit-and-truncation",
    state: "logged-not-fixed",
    severity: "critical",
    summary: "P0: production returns HTTP 503 `error code: 1102` (Worker exceeded resource limits) on hub routes and streams truncated HTML on Worker-rendered routes.",
    evidence: "Measured 2026-08-30 against the production Worker. Routes served with a content-length (static assets, e.g. /search at a deterministic 40,067 bytes ending </html>) are complete; routes streamed through HTMLRewriter carry no content-length and truncate non-deterministically. /boards has no cf-cache-status header at all, so it always reaches the Worker and 503s. This is on the currently-deployed code and is unrelated to Section 2. It is the pre-deploy baseline for Part A step 4.",
  }),
]);

const covered = new Set(checklist.map((entry) => entry.id));
const statusCounts = {};
for (const entry of checklist) statusCounts[entry.status] = (statusCounts[entry.status] || 0) + 1;

const report = {
  generatedAt: new Date().toISOString(),
  pass: errors.length === 0,
  policy: TECHNICAL_SEO_POLICY_VERSION,
  policyNote: "pass reports whether the audit ran to completion, not whether the site is clean. Site verdicts are in checklist[].status; problems are in findings[].",
  sourceDatabase: databasePath,
  corpus,
  scope: {
    only: only || "all",
    live,
    origin: live ? origin : null,
    documentsInspected: documents.length,
    documentsSkipped: skipped,
    checklistItemsCovered: [...covered].sort(),
    checklistItemsNotRun: CHECKLIST_ITEMS.map((item) => item.id).filter((id) => !covered.has(id)),
  },
  statusCounts,
  findingCount: checklist.reduce((total, entry) => total + entry.findings.length, 0),
  checklist,
  generatorDrift,
  openBacklog: OPEN_BACKLOG,
  errors,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  generatedAt: report.generatedAt,
  pass: report.pass,
  policy: report.policy,
  statusCounts,
  findingCount: report.findingCount,
  checklist: checklist.map((entry) => ({
    id: entry.id,
    status: entry.status,
    findings: entry.findings.map((item) => `${item.severity}: ${item.summary}`),
  })),
  output: outputPath,
  errors,
}, null, 2));
if (!report.pass) process.exitCode = 1;
