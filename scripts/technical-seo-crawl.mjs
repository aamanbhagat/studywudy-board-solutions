#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { streamsFor, subjectsFor } from "../comparison/stream-taxonomy.js";
import { isBookQuarantined } from "../multilingual-text-quality.mjs";
import { STUDY_CLUSTER_BASE } from "../study-cluster.mjs";
import { PHASE5_ROUTES } from "./technical-seo-markup.mjs";
import {
  STATUS,
  SEVERITY,
  checklistEntry,
  codeProvenance,
  finding,
  staticAssetProvenance,
} from "../technical-seo.mjs";

const ASSETS = "comparison/after-assets";
const FROZEN_LASTMOD_SOURCES = [
  "scripts/phase3-build-static-sitemaps.mjs:24",
  "worker.js:99311",
];

function readMaybeGzip(path) {
  const raw = readFileSync(path);
  return path.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
}

function tagValues(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gu"))].map((match) => match[1].trim());
}

// ---------------------------------------------------------------------------
// The route universe. Every internal href is resolved against this, so a
// "broken link" finding means the path cannot be produced by any generator -
// not merely that a fetch failed.
// ---------------------------------------------------------------------------

// /{board}/{grade}/streams/{stream}[/{course}[/{subject}]] is served by the base
// Next.js worker (comparison/after-worker.js:2303) and is not derivable from the
// catalog tables. Course slugs are not enumerable offline, so this validates
// board, grade, stream and - at full depth - subject, and accepts the course
// segment. Without it 232 legitimate sitemap URLs read as broken links.
//
// Returns "routable", "subject-not-in-stream" (the route resolves but the
// taxonomy says that subject does not belong to that stream) or null.
function classifyStreamRoute(path) {
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 4 || segments.length > 6 || segments[2] !== "streams") return null;
  const [board, grade, , streamId] = segments;
  if (!streamsFor(board, grade).some((stream) => stream.id === streamId)) return null;
  if (segments.length < 6) return "routable";
  return subjectsFor(board, grade, streamId).includes(segments[5]) ? "routable" : "subject-not-in-stream";
}

// comparison/after-worker.js serves one hand-built study cluster from static
// assets. The suffix list is a module-private Set, so it is read out of the
// source rather than duplicated here - if the worker's list changes, this
// follows it instead of silently reporting the difference as a broken link.
function studyClusterRoutes(root) {
  const source = readFileSync(resolve(root, "comparison/after-worker.js"), "utf8");
  const block = source.match(/const STATIC_STUDY_CLUSTER_SUFFIXES = new Set\(\[([\s\S]*?)\]\);/u);
  if (!block) throw new Error("STATIC_STUDY_CLUSTER_SUFFIXES not found in comparison/after-worker.js");
  const suffixes = [...block[1].matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
  return [STUDY_CLUSTER_BASE, ...suffixes.map((suffix) => `${STUDY_CLUSTER_BASE}/${suffix}`)];
}

function routeUniverse(database, root) {
  const hierarchy = new Set(["/", ...PHASE5_ROUTES, ...studyClusterRoutes(root)]);
  for (const board of database.prepare("SELECT slug FROM catalog_boards").all()) hierarchy.add(`/${board.slug}`);
  for (const grade of database.prepare("SELECT board_slug, slug FROM catalog_grades").all()) {
    hierarchy.add(`/${grade.board_slug}/${grade.slug}`);
  }
  for (const subject of database.prepare("SELECT board_slug, grade_slug, slug FROM catalog_subjects").all()) {
    hierarchy.add(`/${subject.board_slug}/${subject.grade_slug}/${subject.slug}`);
  }
  const bookPath = new Map();
  for (const book of database.prepare("SELECT id, board_slug, grade_slug, subject_slug, slug FROM catalog_books").all()) {
    if (isBookQuarantined(book.id)) continue;
    const path = `/${book.board_slug}/${book.grade_slug}/${book.subject_slug}/${book.slug}`;
    bookPath.set(book.id, path);
    hierarchy.add(path);
  }
  for (const chapter of database.prepare("SELECT book_id, slug FROM catalog_chapters").all()) {
    const base = bookPath.get(chapter.book_id);
    if (base) hierarchy.add(`${base}/${chapter.slug}`);
  }
  const questions = new Set();
  for (const row of database.prepare("SELECT book_id, chapter_slug, question_id FROM catalog_questions").iterate()) {
    const base = bookPath.get(row.book_id);
    if (base) questions.add(`${base}/${row.chapter_slug}/questions/${row.question_id}`);
  }
  const staticRoutes = new Set();
  const walk = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path, `${prefix}/${entry.name}`);
      else if (entry.name === "index.html") staticRoutes.add(prefix || "/");
      else if (entry.name.endsWith(".html")) staticRoutes.add(`${prefix}/${entry.name.slice(0, -5)}`);
      else staticRoutes.add(`${prefix}/${entry.name}`);
    }
  };
  walk(resolve(root, ASSETS), "");
  for (const route of [...staticRoutes]) {
    if (route.startsWith("/pages/")) staticRoutes.add(route.slice("/pages".length) || "/");
  }
  const known = new Set([...hierarchy, ...questions, ...staticRoutes]);
  return {
    hierarchy,
    questions,
    staticRoutes,
    classifyStreamRoute,
    isKnown: (path) => known.has(path) || classifyStreamRoute(path) !== null,
  };
}

// ---------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------

function auditSitemap(database, root, universe, corpusFile) {
  const indexPath = resolve(root, ASSETS, "sitemap.xml");
  const index = readFileSync(indexPath, "utf8");
  const children = [...index.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/gu)].map((match) => ({
    loc: tagValues(match[1], "loc")[0],
    lastmod: tagValues(match[1], "lastmod")[0] || null,
  }));

  const lastmodCounts = new Map();
  const locations = new Set();
  let urlCount = 0;
  let missingLastmod = 0;
  const unreadable = [];
  for (const child of children) {
    const name = child.loc.slice(child.loc.lastIndexOf("/") + 1);
    const path = resolve(root, ASSETS, "sitemaps", name);
    let xml;
    try {
      xml = readMaybeGzip(path);
    } catch (error) {
      unreadable.push({ sitemap: name, error: String(error.message || error) });
      continue;
    }
    for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/gu)) {
      urlCount += 1;
      const loc = tagValues(block[1], "loc")[0];
      if (loc) locations.add(new URL(loc).pathname);
      const lastmod = tagValues(block[1], "lastmod")[0];
      if (!lastmod) missingLastmod += 1;
      else lastmodCounts.set(lastmod, (lastmodCounts.get(lastmod) || 0) + 1);
    }
  }

  const notInUniverse = [...locations].filter((path) => !universe.isKnown(path));
  const streamSubjectMismatches = [...locations]
    .filter((path) => universe.classifyStreamRoute(path) === "subject-not-in-stream");
  const questionsInSitemap = [...locations].filter((path) => universe.questions.has(path)).length;
  const hierarchyInSitemap = [...locations].filter((path) => universe.hierarchy.has(path)).length;

  const distinctLastmod = [...lastmodCounts.entries()].sort((left, right) => right[1] - left[1]);
  const dominant = distinctLastmod[0] || null;
  const findings = [];
  if (dominant && dominant[1] / urlCount > 0.5) {
    findings.push(finding({
      id: "sitemap-lastmod-is-frozen",
      checklistItem: "sitemap",
      severity: SEVERITY.medium,
      summary: `${dominant[1].toLocaleString("en-IN")} of ${urlCount.toLocaleString("en-IN")} sitemap URLs (${((dominant[1] / urlCount) * 100).toFixed(1)}%) carry the same hardcoded lastmod ${dominant[0]}.`,
      evidence: {
        hardcodedAt: FROZEN_LASTMOD_SOURCES,
        distinctLastmodValues: distinctLastmod.length,
        distribution: Object.fromEntries(distinctLastmod.slice(0, 6)),
        note: "phase3-runtime-audit.mjs:176-212 and phase4-runtime-audit.mjs:68-92 assert only that lastmodCount === urlCount, never that the value tracks content changes. A constant lastmod tells Google nothing has changed since 2026-08-15.",
      },
    }));
  }
  if (notInUniverse.length) {
    findings.push(finding({
      id: "sitemap-lists-unroutable-urls",
      checklistItem: "sitemap",
      severity: SEVERITY.high,
      summary: `${notInUniverse.length.toLocaleString("en-IN")} sitemap URLs do not correspond to any hierarchy, question or static route the corpus can produce.`,
      evidence: { examples: notInUniverse.slice(0, 10) },
    }));
  }
  if (streamSubjectMismatches.length) {
    findings.push(finding({
      id: "stream-routes-contradict-the-stream-taxonomy",
      checklistItem: "sitemap",
      severity: SEVERITY.low,
      summary: `${streamSubjectMismatches.length} submitted stream URLs pair a stream with a subject that comparison/stream-taxonomy.js does not list under it.`,
      evidence: {
        routes: streamSubjectMismatches,
        note: "These resolve - the base Next.js worker does not validate the pair - but the stream navigation is built from the taxonomy, so the subject cannot be reached by clicking. Submitted-but-unlinkable is the orphan pattern in its smallest form.",
      },
    }));
  }
  // The interesting comparison is not sitemap-vs-corpus - most questions are
  // meant to be withheld - but sitemap-vs-publish-gate. Those two numbers should
  // agree and nothing in the repo checks that they do.
  const gateState = database.prepare("SELECT * FROM content_publish_gate_state WHERE gate_name = 'question-publish'").get() || null;
  const gatePassed = gateState ? Number(gateState.gate_passed_count) : null;
  if (gatePassed != null && questionsInSitemap !== gatePassed) {
    findings.push(finding({
      id: "sitemap-question-set-disagrees-with-the-publish-gate",
      checklistItem: "sitemap",
      severity: SEVERITY.high,
      summary: `The sitemaps list ${questionsInSitemap.toLocaleString("en-IN")} question URLs while the publish gate passed only ${gatePassed.toLocaleString("en-IN")} - a difference of ${Math.abs(questionsInSitemap - gatePassed).toLocaleString("en-IN")} pages.`,
      evidence: {
        sitemapQuestionRoutes: questionsInSitemap,
        publishGatePassed: gatePassed,
        publishGatePolicyVersion: gateState.policy_version,
        corpusQuestionRoutes: universe.questions.size,
        note: "Submitting URLs the content gate declined is the exact pattern that draws a Helpful Content style demotion on a programmatic site. Neither phase3-runtime-audit.mjs nor phase4-runtime-audit.mjs compares these two sets; they only check that lastmod is present on every URL.",
      },
    }));
  }
  const missingHierarchy = universe.hierarchy.size - hierarchyInSitemap;
  if (missingHierarchy > 0) {
    findings.push(finding({
      id: "hierarchy-pages-absent-from-sitemap",
      checklistItem: "sitemap",
      severity: SEVERITY.medium,
      summary: `${missingHierarchy.toLocaleString("en-IN")} hierarchy or legal routes exist but are absent from the sitemaps.`,
      evidence: {
        corpusHierarchyRoutes: universe.hierarchy.size,
        sitemapHierarchyRoutes: hierarchyInSitemap,
        examples: [...universe.hierarchy].filter((path) => !locations.has(path)).slice(0, 15),
      },
    }));
  }

  return checklistEntry({
    id: "sitemap",
    status: findings.length ? STATUS.fail : STATUS.pass,
    metrics: {
      sitemapIndexEntries: children.length,
      urlCount,
      missingLastmod,
      distinctLastmodValues: distinctLastmod.length,
      questionsInSitemap,
      hierarchyInSitemap,
      streamRoutesInSitemap: [...locations].filter((path) => path.includes("/streams/")).length,
      urlsNotInRouteUniverse: notInUniverse.length,
      streamSubjectMismatches: streamSubjectMismatches.length,
      publishGatePassed: gatePassed,
      unreadableSitemaps: unreadable,
    },
    findings,
    notes: [`Sitemap index lastmod values are per-file and do move (${children[0]?.lastmod}); the frozen value is inside the child sitemaps.`],
    provenance: staticAssetProvenance(`${ASSETS}/sitemap.xml and ${children.length} child sitemaps; route universe from ${corpusFile}`),
  });
}

// ---------------------------------------------------------------------------
// Robots
// ---------------------------------------------------------------------------

function auditRobots(root) {
  const asset = readFileSync(resolve(root, ASSETS, "robots.txt"), "utf8");
  const worker = readFileSync(resolve(root, "comparison/after-worker.js"), "utf8");
  const match = worker.match(/const body = `(User-agent:[\s\S]*?)`;/u);
  if (!match) throw new Error("Unable to read the synthesized robots.txt body from comparison/after-worker.js");
  const synthesized = match[1]
    .replaceAll("\\n", "\n")
    .replaceAll("${origin}", "https://studywudy-board-solutions.amanbhagat17089.workers.dev");

  const directives = (text) => text.split("\n")
    .map((line) => line.trim())
    .filter((line) => /^disallow:/iu.test(line))
    .map((line) => line.slice(line.indexOf(":") + 1).trim());
  const assetDisallow = directives(asset);
  const workerDisallow = directives(synthesized);

  const findings = [];
  const onlyInWorker = workerDisallow.filter((rule) => !assetDisallow.includes(rule));
  const onlyInAsset = assetDisallow.filter((rule) => !workerDisallow.includes(rule));
  if (onlyInWorker.length || onlyInAsset.length) {
    findings.push(finding({
      id: "robots-asset-and-worker-disagree",
      checklistItem: "robots",
      severity: SEVERITY.medium,
      summary: `The checked-in ${ASSETS}/robots.txt and the body the Worker synthesizes at comparison/after-worker.js:3625 disallow different paths.`,
      evidence: {
        staticAssetDisallow: assetDisallow,
        workerDisallow,
        onlyInWorker,
        onlyInAsset,
        note: "The Worker intercepts /robots.txt before assets, so the checked-in file is dead weight - but nothing asserts the two agree, so a future asset-only edit would be silently ignored.",
      },
    }));
  }
  if (!workerDisallow.some((rule) => rule.startsWith("/search"))) {
    findings.push(finding({
      id: "search-facets-are-crawlable",
      checklistItem: "robots",
      severity: SEVERITY.high,
      summary: "Nothing disallows /search, so every faceted query-string combination is crawlable on a ~300K-page site.",
      evidence: {
        workerDisallow,
        note: "/search accepts type, board, class, subject, diagram and free-text parameters. Their product is unbounded and every combination returns a 200 with near-identical markup.",
      },
    }));
  }
  const noindexRules = /noindex/iu.test(synthesized);
  return checklistEntry({
    id: "robots",
    status: findings.length ? STATUS.fail : STATUS.pass,
    metrics: {
      workerDisallow,
      staticAssetDisallow: assetDisallow,
      declaresSitemap: /^sitemap:/imu.test(synthesized),
      declaresHost: /^host:/imu.test(synthesized),
      usesUnsupportedNoindexDirective: noindexRules,
    },
    findings,
    notes: ["The thin-page noindex half of this checklist item lives in page markup, not robots.txt; it is measured under the heading/markup item instead."],
    provenance: codeProvenance("comparison/after-worker.js:3623-3626 plus comparison/after-assets/robots.txt"),
  });
}

// ---------------------------------------------------------------------------
// Internal linking
// ---------------------------------------------------------------------------

function internalHrefs(html) {
  const hrefs = [];
  for (const match of html.matchAll(/<a\b[^>]*\shref\s*=\s*("([^"]*)"|'([^']*)')/giu)) {
    const raw = (match[2] ?? match[3] ?? "").trim();
    if (!raw || raw.startsWith("#") || /^[a-z]+:/iu.test(raw) || raw.startsWith("//")) continue;
    hrefs.push(raw);
  }
  return hrefs;
}

// Anchors that point at media rather than pages. /boardly-media/ is a separate
// asset namespace the Worker rewrites wholesale (comparison/after-worker.js:3050),
// so resolving these against the page route universe would report every diagram
// as a broken link. They are counted, not resolved.
const ASSET_LINK_PREFIXES = ["/boardly-media/", "/studywudy-media/", "/_next/", "/images/", "/fonts/", "/catalog-artwork/"];
const isAssetLink = (path) => ASSET_LINK_PREFIXES.some((prefix) => path.startsWith(prefix)) || /\.[a-z0-9]{2,5}$/iu.test(path);

function auditInternalLinking(root, universe, documents, redirects) {
  const sourcesByTarget = new Map();
  const assetTargets = new Set();
  for (const document of documents) {
    for (const href of internalHrefs(document.html)) {
      const target = href.startsWith("/") ? href : `${document.route.replace(/\/$/u, "")}/${href}`;
      const path = target.split("#")[0].split("?")[0].replace(/(?!^)\/$/u, "");
      if (isAssetLink(path)) {
        assetTargets.add(path);
        continue;
      }
      const sources = sourcesByTarget.get(path) || new Set();
      sources.add(document.route);
      sourcesByTarget.set(path, sources);
    }
  }

  const unresolved = [...sourcesByTarget.keys()].filter((path) => !universe.isKnown(path));
  const linkedBoards = new Set();
  const linkedSubjects = new Set();
  const linkedBooks = new Set();
  for (const path of sourcesByTarget.keys()) {
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 1) linkedBoards.add(path);
    if (segments.length === 3) linkedSubjects.add(path);
    if (segments.length === 4) linkedBooks.add(path);
  }
  const hierarchyBySegments = (count) => [...universe.hierarchy].filter((path) => path.split("/").filter(Boolean).length === count);
  const orphanSubjects = hierarchyBySegments(3).filter((path) => !linkedSubjects.has(path));
  const orphanBooks = hierarchyBySegments(4).filter((path) => !linkedBooks.has(path));

  const findings = [];
  if (unresolved.length) {
    findings.push(finding({
      id: "links-to-routes-the-corpus-cannot-produce",
      checklistItem: "internal-linking",
      severity: SEVERITY.high,
      summary: `${unresolved.length} internal link targets in the prerendered documents match no hierarchy, question or static route.`,
      evidence: {
        // Listed in full up to 60. A truncated list here reads as "these are the
        // ones that matter" when it only means "these sorted first".
        listed: Math.min(unresolved.length, 60),
        truncated: Math.max(0, unresolved.length - 60),
        targets: unresolved.slice(0, 60).map((path) => ({ path, linkedFrom: [...(sourcesByTarget.get(path) || [])].slice(0, 3) })),
        note: "Each was checked against the corpus by hand: the q-physics-* ids are seeded demo results baked into the prerendered /search document and match zero catalog_questions rows, and catalog_grades holds no class-11 row for cisce. release-link-integrity-gate.mjs does not catch either, because it crawls a preview origin where the base Next.js worker answers any path-shaped URL.",
      },
    }));
  }
  const linkedRedirects = redirects
    .map((redirect) => ({ ...redirect, linkedFrom: [...(sourcesByTarget.get(redirect.from) || [])] }))
    .filter((redirect) => redirect.linkedFrom.length);
  if (linkedRedirects.length) {
    findings.push(finding({
      id: "internal-links-point-at-redirects",
      checklistItem: "internal-linking",
      severity: SEVERITY.low,
      summary: `${linkedRedirects.length} redirecting route${linkedRedirects.length === 1 ? " is" : "s are"} linked directly rather than at the destination, adding a hop to every crawl of them.`,
      evidence: {
        redirects: linkedRedirects.map((redirect) => ({
          from: redirect.from,
          status: redirect.status,
          to: redirect.to,
          linkedFromDocuments: redirect.linkedFrom.length,
          examples: redirect.linkedFrom.slice(0, 3),
        })),
        note: "One hop only - no chains found in the offline surface. Chain detection past the first hop needs a live origin and runs under --live.",
      },
    }));
  }
  if (orphanSubjects.length || orphanBooks.length) {
    findings.push(finding({
      id: "hierarchy-orphans-in-the-crawlable-surface",
      checklistItem: "internal-linking",
      severity: SEVERITY.medium,
      summary: `${orphanSubjects.length} subject routes and ${orphanBooks.length} textbook routes receive no link from any prerendered document.`,
      evidence: {
        note: "Measured over the prerendered surface only. A subject reachable solely through a Worker-rendered board page will appear here as an orphan; that is itself the finding, because the Worker-rendered hub routes are the ones currently returning 503 (backlog item 3).",
        exampleOrphanSubjects: orphanSubjects.slice(0, 5),
        exampleOrphanBooks: orphanBooks.slice(0, 5),
      },
    }));
  }

  return checklistEntry({
    id: "internal-linking",
    status: findings.length ? STATUS.fail : STATUS.pass,
    metrics: {
      documentsCrawled: documents.length,
      knownRedirects: redirects,
      distinctLinkTargets: sourcesByTarget.size,
      resolvedTargets: sourcesByTarget.size - unresolved.length,
      unresolvedTargets: unresolved.length,
      assetTargetsExcluded: assetTargets.size,
      linkedBoards: linkedBoards.size,
      linkedSubjects: linkedSubjects.size,
      linkedBooks: linkedBooks.size,
      corpusSubjects: hierarchyBySegments(3).length,
      corpusBooks: hierarchyBySegments(4).length,
      mostLinkedTargets: [...sourcesByTarget.entries()]
        .sort((left, right) => right[1].size - left[1].size)
        .slice(0, 10)
        .map(([path, sources]) => ({ path, inboundDocuments: sources.size })),
    },
    findings,
    notes: [
      "Redirect-chain detection needs a live origin and runs only under --live; comparison/after-worker.js:2096 is the single 308 in the Worker (search canonicalisation).",
      "scripts/release-link-integrity-gate.mjs already builds this graph against a live origin at :216-217 and discards it without checking orphans or chains.",
    ],
    provenance: staticAssetProvenance(`${documents.length} prerendered documents under ${ASSETS}`),
  });
}

export function auditCrawl({ database, root, documents, redirects = [], corpusFile }) {
  const universe = routeUniverse(database, root);
  return [
    auditSitemap(database, root, universe, corpusFile),
    auditRobots(root),
    auditInternalLinking(root, universe, documents, redirects),
  ];
}

export { routeUniverse };
