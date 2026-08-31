#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { streamsFor, subjectsFor } from "../comparison/stream-taxonomy.js";
import { isBookQuarantined } from "../multilingual-text-quality.mjs";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS } from "../corpus-quality-manifest.mjs";
import { isQuestionSitemapEligible } from "../public-question-eligibility.mjs";
import { STUDY_CLUSTER_BASE, STUDY_CLUSTER_INDEXABLE_PATHS } from "../study-cluster.mjs";
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
// This finding used to read as a hardcode in the generator. It is not one any
// more, and the audit must not keep saying it is: every lastmod now comes from
// catalog_content_revisions, and the builder fails the build on a URL with no
// row rather than falling back to a constant. What remains is a fact about the
// corpus, not the code - the log holds exactly one revision per entity because
// no page has been rewritten since publication.
const FROZEN_LASTMOD_SOURCES = [
  "catalog_content_revisions (one revision per entity; the log is the sole lastmod source)",
  "scripts/phase3-content-revisions.mjs (writes the log; --check reports insertCount 0 while content is unchanged)",
  "scripts/phase3-build-static-sitemaps.mjs revisionEpoch() (reads it; fails closed on a miss)",
  "worker.js:99311 (legacy bundle, not the deployed entrypoint)",
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

// One question is submitted in its own sitemap ahead of the publishing manifest,
// because the Worker admits it on verified official-source evidence instead
// (comparison/after-worker.js:1808, `publishingManifestEligible ||
// priorityQuestionSourceVerified`). Read out of the source for the same reason
// as the cluster suffixes: a third copy of the path would drift.
function priorityQuestionPilotPath(root) {
  const source = readFileSync(resolve(root, "comparison/after-worker.js"), "utf8");
  const match = source.match(/^const PRIORITY_QUESTION_PILOT_PATH = "([^"]+)";$/mu);
  if (!match) throw new Error("PRIORITY_QUESTION_PILOT_PATH not found in comparison/after-worker.js");
  return match[1];
}

// Existing and submittable are different questions, and conflating them is what
// made this audit report 26 correctly-withheld routes as missing. A sitemap
// should carry canonical 200 routes only, so three classes are excluded:
// redirect-only Phase 5 routes, study-cluster surfaces the cluster itself marks
// non-indexable, and subject routes whose entire book set is quarantined and
// which therefore render with nothing to list.
function redirectOnlyPhase5Routes(root) {
  const source = readFileSync(resolve(root, "phase5-compliance.mjs"), "utf8");
  return new Set([...source.matchAll(/url\.pathname === "([^"]+)"\)\s*\{\s*return Response\.redirect/gu)]
    .map((match) => match[1]));
}

function routeUniverse(database, root) {
  const hierarchy = new Set(["/", ...PHASE5_ROUTES, ...studyClusterRoutes(root)]);
  const redirectOnly = redirectOnlyPhase5Routes(root);
  const submittableHierarchy = new Set(["/",
    ...PHASE5_ROUTES.filter((path) => !redirectOnly.has(path)),
    ...STUDY_CLUSTER_INDEXABLE_PATHS,
  ]);
  const add = (path, submittable = true) => {
    hierarchy.add(path);
    if (submittable) submittableHierarchy.add(path);
  };
  for (const board of database.prepare("SELECT slug FROM catalog_boards").all()) add(`/${board.slug}`);
  for (const grade of database.prepare("SELECT board_slug, slug FROM catalog_grades").all()) {
    add(`/${grade.board_slug}/${grade.slug}`);
  }
  const bookPath = new Map();
  const subjectsWithLiveBooks = new Set();
  for (const book of database.prepare("SELECT id, board_slug, grade_slug, subject_slug, slug FROM catalog_books").all()) {
    if (isBookQuarantined(book.id)) continue;
    const path = `/${book.board_slug}/${book.grade_slug}/${book.subject_slug}/${book.slug}`;
    bookPath.set(book.id, path);
    subjectsWithLiveBooks.add(`/${book.board_slug}/${book.grade_slug}/${book.subject_slug}`);
    add(path);
  }
  for (const subject of database.prepare("SELECT board_slug, grade_slug, slug FROM catalog_subjects").all()) {
    const path = `/${subject.board_slug}/${subject.grade_slug}/${subject.slug}`;
    add(path, subjectsWithLiveBooks.has(path));
  }
  for (const chapter of database.prepare("SELECT book_id, slug FROM catalog_chapters").all()) {
    const base = bookPath.get(chapter.book_id);
    if (base) add(`${base}/${chapter.slug}`);
  }
  const questions = new Set();
  // The set a sitemap may legitimately submit is not the corpus and not the
  // publishing manifest either: the Worker conjoins the manifest with
  // corpusQuestionIndexEligible before emitting `index, follow`
  // (comparison/after-worker.js:1799-1812). Deriving it here is what lets the
  // sitemap audit compare like with like instead of subtracting two unrelated
  // scalars.
  const sitemapEligible = new Set();
  for (const row of database.prepare("SELECT row_id, book_id, chapter_slug, question_id FROM catalog_questions").iterate()) {
    const base = bookPath.get(row.book_id);
    if (!base) continue;
    const path = `${base}/${row.chapter_slug}/questions/${row.question_id}`;
    questions.add(path);
    if (isQuestionSitemapEligible(PHASE4_GATE_MANIFEST, {
      rowId: Number(row.row_id),
      questionId: row.question_id,
      duplicateRowIds: CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS,
    })) sitemapEligible.add(path);
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
    submittableHierarchy,
    questions,
    sitemapEligible,
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
      summary: `${dominant[1].toLocaleString("en-IN")} of ${urlCount.toLocaleString("en-IN")} sitemap URLs (${((dominant[1] / urlCount) * 100).toFixed(1)}%) share the lastmod ${dominant[0]}, because no page has changed since publication.`,
      evidence: {
        lastmodSources: FROZEN_LASTMOD_SOURCES,
        distinctLastmodValues: distinctLastmod.length,
        distribution: Object.fromEntries(distinctLastmod.slice(0, 6)),
        note: "Open by design, not by defect. The generator no longer carries a floor constant: catalog_content_revisions supplies every lastmod, and phase3-build-static-sitemaps.mjs exits 1 on a URL with no revision row instead of substituting a date. The log currently holds one revision per entity, so one date is the honest answer - catalog_questions, catalog_chapters and catalog_books have zero non-null updated_at across 299,458 / 7,715 / 606 rows, and PHASE4_GATE_MANIFEST.catalogMaxUpdatedAt is 0. Making this metric move without content changing would mean fabricating modification times, which is the pattern Google discounts. It closes when the content pipeline rewrites pages, and the log is seeded now so those rewrites carry real dates instead of silently reusing this one.",
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
  // An earlier revision of this audit subtracted content_publish_gate's row count
  // from the sitemap URL count and called the difference "pages submitted that
  // the quality gate rejected". That subtraction was invalid: the two
  // populations are not nested. Measured on this corpus, 13,577 rows are in both,
  // 18,785 are gate-passed but absent from the sitemap, and 83,959 sitemap URLs
  // have no content_publish_gate row at all, so the difference of two scalars
  // described nothing. It is replaced by three separate checks that each compare
  // one thing to one thing.

  // (a) The claim a sitemap actually makes: every URL in it will be served
  // `index, follow`. This intersects the sets rather than differencing counts.
  const pilotPath = priorityQuestionPilotPath(root);
  const submittedButNotIndexable = [...locations]
    .filter((path) => path !== pilotPath)
    .filter((path) => universe.questions.has(path) && !universe.sitemapEligible.has(path));
  const sitemapMinusPublishGate = questionsInSitemap - universe.sitemapEligible.size
    - (locations.has(pilotPath) && !universe.sitemapEligible.has(pilotPath) ? 1 : 0);
  if (submittedButNotIndexable.length) {
    findings.push(finding({
      id: "sitemap-submits-urls-the-site-serves-noindex",
      checklistItem: "sitemap",
      severity: SEVERITY.high,
      summary: `${submittedButNotIndexable.length.toLocaleString("en-IN")} submitted question URLs fail the predicate the Worker applies before emitting index, follow, so they are requested for indexing and then declined on arrival.`,
      evidence: {
        examples: submittedButNotIndexable.slice(0, 10),
        sitemapQuestionRoutes: questionsInSitemap,
        sitemapEligibleRoutes: universe.sitemapEligible.size,
        corpusQuestionRoutes: universe.questions.size,
        predicate: "public-question-eligibility.mjs questionSitemapEligibility = publishing manifest AND corpus-quality clearance",
        exempt: `${pilotPath} is submitted on verified official-source evidence rather than the manifest and is excluded from this count.`,
      },
    }));
  }

  // (b) The manifest is a compiled bitset; the Worker re-runs the live
  // validators. When the generator's policy version moves without the manifest
  // being regenerated, the bitset stops meaning what the Worker means and rows
  // are submitted that render `noindex, follow` for reasons no filter can see.
  const gateScriptSource = readFileSync(resolve(root, "scripts/phase4-content-gate.mjs"), "utf8");
  const gateScriptPolicyVersion = gateScriptSource.match(/^const POLICY_VERSION = "([^"]+)";$/mu)?.[1] || null;
  if (gateScriptPolicyVersion && gateScriptPolicyVersion !== PHASE4_GATE_MANIFEST.policyVersion) {
    findings.push(finding({
      id: "publishing-manifest-has-drifted-from-its-generator",
      checklistItem: "sitemap",
      severity: SEVERITY.high,
      summary: `phase4-publish-manifest.mjs was compiled under ${PHASE4_GATE_MANIFEST.policyVersion} while scripts/phase4-content-gate.mjs now declares ${gateScriptPolicyVersion}, so the checked-in bitset no longer states what the current validators decide.`,
      evidence: {
        manifestPolicyVersion: PHASE4_GATE_MANIFEST.policyVersion,
        generatorPolicyVersion: gateScriptPolicyVersion,
        note: "comparison/after-worker.js imports ../semantic-math.mjs rather than bundling it, so the deployed Worker evaluates today's validators against whatever vintage the bitset was compiled at. Run pnpm build:phase4-gate.",
      },
    }));
  }

  // (c) content_publish_gate itself. It is retained here as a named dead
  // artefact rather than a comparison, because reading it as current state is
  // what produced the invalid subtraction above.
  const gateState = database.prepare("SELECT * FROM content_publish_gate_state WHERE gate_name = 'question-publish'").get() || null;
  const gatePassed = gateState ? Number(gateState.gate_passed_count) : null;
  if (gateState) {
    findings.push(finding({
      id: "content-publish-gate-is-a-dead-artefact",
      checklistItem: "sitemap",
      severity: SEVERITY.low,
      summary: `content_publish_gate still holds ${gatePassed?.toLocaleString("en-IN")} rows under policy ${gateState.policy_version}, three generations behind ${PHASE4_GATE_MANIFEST.policyVersion}, and no build or request path reads it.`,
      evidence: {
        publishGatePassed: gatePassed,
        publishGatePolicyVersion: gateState.policy_version,
        currentPolicyVersion: PHASE4_GATE_MANIFEST.policyVersion,
        note: "Every row is gate_passed=1, so the table cannot express rejection. Its 150-word depth floor was deliberately retired - the manifest records completenessPolicy 'question-type-aware; no minimum word count'. Publishing decisions live in phase4-publish-manifest.mjs; this table should be dropped rather than reconciled.",
      },
    }));
  }
  const missingSubmittableHierarchy = [...universe.submittableHierarchy].filter((path) => !locations.has(path));
  if (missingSubmittableHierarchy.length) {
    findings.push(finding({
      id: "hierarchy-pages-absent-from-sitemap",
      checklistItem: "sitemap",
      severity: SEVERITY.medium,
      summary: `${missingSubmittableHierarchy.length.toLocaleString("en-IN")} hierarchy or legal routes are canonical, indexable and non-empty, yet absent from the sitemaps.`,
      evidence: {
        corpusHierarchyRoutes: universe.hierarchy.size,
        submittableHierarchyRoutes: universe.submittableHierarchy.size,
        sitemapHierarchyRoutes: hierarchyInSitemap,
        examples: missingSubmittableHierarchy.slice(0, 15),
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
      // Stored so the frozen-lastmod finding is assertable without reading a
      // date-shaped key that the fix itself renames.
      dominantLastmod: dominant ? dominant[0] : null,
      dominantLastmodUrlCount: dominant ? dominant[1] : 0,
      questionsInSitemap,
      sitemapEligibleQuestions: universe.sitemapEligible.size,
      sitemapSubmittedButNotIndexable: submittedButNotIndexable.length,
      // Kept as a named metric because the summary string is not assertable, but
      // read it as "sitemap minus what the site will index", not as the invalid
      // sitemap-minus-content_publish_gate subtraction it replaces.
      sitemapMinusPublishGate,
      hierarchyInSitemap,
      streamRoutesInSitemap: [...locations].filter((path) => path.includes("/streams/")).length,
      urlsNotInRouteUniverse: notInUniverse.length,
      streamSubjectMismatches: streamSubjectMismatches.length,
      publishGatePassed: gatePassed,
      publishGatePolicyVersion: gateState ? gateState.policy_version : null,
      publishingManifestPolicyVersion: PHASE4_GATE_MANIFEST.policyVersion,
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
