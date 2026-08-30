#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { handlePhase5Request } from "../phase5-compliance.mjs";
import {
  FORBIDDEN_STRUCTURED_DATA_TYPES,
  STATUS,
  SEVERITY,
  checklistEntry,
  codeProvenance,
  extractHeadingOutline,
  finding,
  inspectHeadingOutline,
  isCompleteHtmlDocument,
  staticAssetProvenance,
  structuredDataBlocks,
  structuredDataTypes,
} from "../technical-seo.mjs";

// Routes phase5-compliance.mjs answers in-process (comparison/after-worker.js
// delegates to it). These render from the working tree, so they are the only
// documents here that reflect current code rather than a build artefact.
const PHASE5_ROUTES = Object.freeze([
  "/about", "/about/methodology", "/reviewers", "/reviewers/aman-bhagat",
  "/reviewers/studywudy-editorial-process", "/corrections", "/privacy",
  "/terms", "/contact",
]);

// Roots that look like a board slug positionally but are not part of the
// board/class/subject/book/chapter hierarchy. Without this, /study-cluster/chapter
// is counted as a class page and its findings are attributed to the wrong template.
const NON_HIERARCHY_ROOTS = new Set([
  "about", "boards", "contact", "corpus-quality", "corrections", "launch-hot-path",
  "privacy", "reviewers", "search", "study-cluster", "terms",
]);

function templateOf(route) {
  const segments = route.split("/").filter(Boolean);
  if (route === "/") return "home";
  if (route === "/search") return "search";
  if (route === "/boards") return "boards";
  if (segments.includes("questions")) return "question";
  if (segments[0] === "launch-hot-path") return "launch-hot-path";
  if (segments[0] === "study-cluster") return "study-cluster";
  if (NON_HIERARCHY_ROOTS.has(segments[0])) return "static";
  if (segments.length === 1) return "board";
  if (segments.length === 2) return "class";
  if (segments.length === 3) return "subject";
  if (segments.length === 4) return "textbook";
  if (segments.length === 5) return "chapter";
  return "static";
}

function walkFiles(directory, predicate) {
  const found = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (predicate(entry.name)) found.push(path);
    }
  };
  walk(directory);
  return found.sort();
}

export async function collectDocuments(root) {
  const documents = [];
  const skipped = [];

  const assetsBase = resolve(root, "comparison/after-assets");
  for (const path of walkFiles(assetsBase, (name) => name.endsWith(".html"))) {
    const route = `/${path.slice(assetsBase.length + 1).replace(/(?:^|\/)index\.html$/u, "").replace(/\.html$/u, "")}`
      .replace(/^\/pages/u, "") || "/";
    documents.push({ route, source: "after-assets", html: readFileSync(path, "utf8") });
  }

  // 142 gzipped SSR snapshots, one per route. Last rebuilt at 6b8c5e4f
  // (2026-08-24) while comparison/after-worker.js last changed 87eafb5a
  // (2026-08-30), so these are a pre-check, not proof of what ships today.
  const snapshotsBase = resolve(root, "vercel-preview/snapshots");
  for (const path of walkFiles(snapshotsBase, (name) => name.endsWith(".html.gz"))) {
    const route = `/${path.slice(snapshotsBase.length + 1).replace(/(?:^|\/)index\.html\.gz$/u, "")}` || "/";
    documents.push({ route: route === "/" ? "/" : route, source: "vercel-snapshot", html: gunzipSync(readFileSync(path)).toString("utf8") });
  }

  const redirects = [];
  for (const route of PHASE5_ROUTES) {
    const response = await handlePhase5Request(new Request(`https://studywudy.example${route}`), {});
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      redirects.push({ from: route, status: response.status, to: location ? new URL(location, "https://studywudy.example").pathname : null });
      skipped.push({ route, reason: `phase5 returned ${response.status} to ${location}` });
      continue;
    }
    const html = await response.text();
    if (response.status !== 200) {
      skipped.push({ route, reason: `phase5 returned ${response.status}` });
      continue;
    }
    documents.push({ route, source: "in-process-render", html });
  }

  const usable = [];
  for (const document of documents) {
    if (!isCompleteHtmlDocument(document.html)) {
      skipped.push({ route: document.route, source: document.source, reason: "incomplete-response" });
      continue;
    }
    usable.push({ ...document, template: templateOf(document.route) });
  }
  return { documents: usable, skipped, redirects };
}

function auditStructuredData(documents) {
  const byType = new Map();
  const forbidden = new Map();
  const perTemplate = new Map();
  let documentsWithJsonLd = 0;
  let unparseableBlocks = 0;

  for (const document of documents) {
    const blocks = structuredDataBlocks(document.html);
    if (!blocks.length) continue;
    documentsWithJsonLd += 1;
    const types = structuredDataTypes(blocks);
    if (types.includes("__unparseable__")) unparseableBlocks += 1;
    for (const type of types) {
      byType.set(type, (byType.get(type) || 0) + 1);
      if (!FORBIDDEN_STRUCTURED_DATA_TYPES.includes(type)) continue;
      const routes = forbidden.get(type) || [];
      routes.push(`${document.route} (${document.source})`);
      forbidden.set(type, routes);
    }
    const templateTypes = perTemplate.get(document.template) || new Set();
    for (const type of types) templateTypes.add(type);
    perTemplate.set(document.template, templateTypes);
  }

  const findings = [];
  for (const [type, routes] of forbidden) {
    findings.push(finding({
      id: `forbidden-structured-data-${type.toLowerCase()}`,
      checklistItem: "structured-data",
      severity: type === "FAQPage" ? SEVERITY.high : SEVERITY.medium,
      summary: `${type} JSON-LD is emitted on ${routes.length} document${routes.length === 1 ? "" : "s"}.`,
      evidence: {
        routes: routes.slice(0, 10),
        note: type === "FAQPage"
          ? "my-plan.md §3 says not to rely on FAQ rich results - Google deprecated them in May 2026. selective-structured-data-gate.mjs forbids only QAPage and MathSolver, so FAQPage passes every existing gate."
          : "selective-structured-data-gate.mjs forbids this type; these documents predate or bypass that gate.",
      },
    }));
  }
  const templatesWithoutSchema = [...new Set(documents.map((document) => document.template))]
    .filter((template) => !perTemplate.has(template));
  if (templatesWithoutSchema.length) {
    findings.push(finding({
      id: "templates-without-structured-data",
      checklistItem: "structured-data",
      severity: SEVERITY.low,
      summary: `${templatesWithoutSchema.length} templates emit no JSON-LD at all: ${templatesWithoutSchema.join(", ")}.`,
      evidence: { templatesWithoutSchema },
    }));
  }

  return checklistEntry({
    id: "structured-data",
    status: findings.some((entry) => entry.severity === SEVERITY.high) ? STATUS.fail
      : findings.length ? STATUS.warn : STATUS.pass,
    metrics: {
      documentsInspected: documents.length,
      documentsWithJsonLd,
      unparseableBlocks,
      typeCounts: Object.fromEntries([...byType.entries()].sort((left, right) => right[1] - left[1])),
      typesPerTemplate: Object.fromEntries([...perTemplate.entries()].sort().map(([template, types]) => [template, [...types].sort()])),
      forbiddenTypes: FORBIDDEN_STRUCTURED_DATA_TYPES,
    },
    findings,
    notes: ["Question pages are represented by prerendered and snapshot documents only; the ~300K live question pages are not individually inspected."],
    provenance: staticAssetProvenance("comparison/after-assets, vercel-preview/snapshots and in-process phase5-compliance renders"),
  });
}

function auditHeadings(documents) {
  const perTemplate = new Map();
  const offenders = [];
  for (const document of documents) {
    const inspection = inspectHeadingOutline(extractHeadingOutline(document.html));
    const bucket = perTemplate.get(document.template) || {
      documents: 0, withoutH1: 0, withMultipleH1: 0, withSkippedLevel: 0, withEmptyHeading: 0,
    };
    bucket.documents += 1;
    if (inspection.h1Count === 0) bucket.withoutH1 += 1;
    if (inspection.h1Count > 1) bucket.withMultipleH1 += 1;
    if (inspection.failures.some((failure) => failure.includes("skips a level"))) bucket.withSkippedLevel += 1;
    if (inspection.failures.some((failure) => failure.startsWith("empty H"))) bucket.withEmptyHeading += 1;
    perTemplate.set(document.template, bucket);
    if (inspection.failures.length) {
      offenders.push({
        route: document.route,
        source: document.source,
        template: document.template,
        h1Count: inspection.h1Count,
        levelCounts: inspection.levelCounts,
        failures: inspection.failures.slice(0, 4),
      });
    }
  }

  const findings = [];
  const withoutH1 = offenders.filter((entry) => entry.h1Count === 0);
  const multipleH1 = offenders.filter((entry) => entry.h1Count > 1);
  const skipped = offenders.filter((entry) => entry.failures.some((failure) => failure.includes("skips a level")));
  if (withoutH1.length) {
    findings.push(finding({
      id: "documents-without-an-h1",
      checklistItem: "heading-hierarchy",
      severity: SEVERITY.medium,
      summary: `${withoutH1.length} of ${documents.length} inspected documents have no H1.`,
      evidence: {
        note: "Nothing in the repo counts H1s: phase0-run-lighthouse.mjs runs heading-order but not page-has-heading-one, and phase1-browser-qa.mjs:124 restricts axe to wcag* tags, which excludes both rules because they are tagged best-practice.",
        routes: withoutH1.slice(0, 12).map((entry) => `${entry.route} (${entry.source})`),
      },
    }));
  }
  if (multipleH1.length) {
    findings.push(finding({
      id: "documents-with-multiple-h1",
      checklistItem: "heading-hierarchy",
      severity: SEVERITY.low,
      summary: `${multipleH1.length} documents contain more than one H1.`,
      evidence: { routes: multipleH1.slice(0, 12).map((entry) => `${entry.route} (${entry.h1Count} H1s)`) },
    }));
  }
  if (skipped.length) {
    findings.push(finding({
      id: "heading-levels-skipped",
      checklistItem: "heading-hierarchy",
      severity: SEVERITY.low,
      summary: `${skipped.length} documents skip a heading level.`,
      evidence: { examples: skipped.slice(0, 10).map((entry) => ({ route: entry.route, failures: entry.failures })) },
    }));
  }

  return checklistEntry({
    id: "heading-hierarchy",
    status: findings.length ? STATUS.fail : STATUS.pass,
    metrics: {
      documentsInspected: documents.length,
      templatesInspected: perTemplate.size,
      perTemplate: Object.fromEntries([...perTemplate.entries()].sort()),
      offenders: offenders.slice(0, 25),
    },
    findings,
    notes: [
      "Measured on server HTML only. quick-find.js injects <h2 id=\"qf-heading\"> after hydration, so a browser-side audit of /, board and class routes will see one more H2 than this does - which is where the single historical heading-order failure lived.",
    ],
    provenance: staticAssetProvenance("comparison/after-assets, vercel-preview/snapshots and in-process phase5-compliance renders"),
  });
}

export function auditMarkup({ documents }) {
  return [auditStructuredData(documents), auditHeadings(documents)];
}

export { PHASE5_ROUTES, templateOf };
