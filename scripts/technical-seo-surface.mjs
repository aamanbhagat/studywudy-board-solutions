#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  STATUS,
  SEVERITY,
  checklistEntry,
  codeProvenance,
  finding,
  liveOriginProvenance,
  staticAssetProvenance,
} from "../technical-seo.mjs";

// Ordered newest first. This used to be the single hardcoded string
// "audits/phase-0/lighthouse-json", which is a frozen 2026-08-18 capture, so the
// audit reported the BEFORE column of a before/after pair as present state - the
// homepage CLS breach it named is against code that has since been deleted, and
// the class breach is against code that has since gained an explicit first-paint
// reservation. Reading the newest capture that exists, and saying out loud how
// far behind HEAD it is, is what stops that from recurring.
const LIGHTHOUSE_DIRECTORIES = Object.freeze([
  "audits/phase-6/lighthouse-json",
  "audits/phase-2/lighthouse-json",
  "audits/phase-0/lighthouse-json",
]);
const CWV_AUDITS = Object.freeze({
  "largest-contentful-paint": { label: "LCP", goodMs: 2_500 },
  "cumulative-layout-shift": { label: "CLS", good: 0.1 },
  "total-blocking-time": { label: "TBT", goodMs: 200 },
  "first-contentful-paint": { label: "FCP", goodMs: 1_800 },
});

// ---------------------------------------------------------------------------
// Core Web Vitals, ISR and availability
// ---------------------------------------------------------------------------

// The files that decide what a hub page's CLS is. A capture taken before the
// newest commit touching any of them is measuring code that no longer exists.
const MEASURED_SURFACE = Object.freeze([
  "comparison/after-assets/quick-find.js",
  "comparison/after-assets/quick-find.css",
  "comparison/quick-find-critical.mjs",
  "comparison/after-worker.js",
]);

function measuredSurfaceLastChanged(root) {
  const result = spawnSync("git", ["log", "-1", "--format=%cI", "--", ...MEASURED_SURFACE], {
    cwd: root, encoding: "utf8",
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

// after-worker.js:3003: quick-find is injected on /{board} and /{board}/class-N
// and nowhere else, so those are the only runs whose CLS the injection can move.
function isFinderUrl(url) {
  if (!url) return false;
  const segments = new URL(url).pathname.split("/").filter(Boolean);
  return segments.length === 1 || (segments.length === 2 && /^class-\d+$/u.test(segments[1]));
}

// A finder run with no quick-find request in it did not measure the Worker.
// audits/phase-2 is exactly this: 26 requests on class-mobile and not one
// /quick-find.*, which is impossible under after-worker.js:3194-3199 and is why
// it recorded a CLS of 0.001 that nothing in production ever produced. Without
// this check a static-asset server reads as a clean pass.
function loadedQuickFind(report) {
  const items = report.audits?.["network-requests"]?.details?.items;
  if (!Array.isArray(items)) return null;
  return items.some((item) => typeof item.url === "string" && item.url.includes("/quick-find."));
}

// The injection surface, served-vs-worktree. measuredSurfaceLastChanged compares
// a worktree commit date against a capture of some origin, which proves nothing
// when that origin is production and production trails HEAD - the ordering can
// come out "current" by ten minutes of coincidence. Lighthouse records each
// request's uncompressed resourceSize, and for a text asset that is the file's
// byte length, so comparing it against the checked-in file establishes directly
// that the run measured the same bytes this repo would deploy.
const SERVED_ASSETS = Object.freeze({
  "/quick-find.js": "comparison/after-assets/quick-find.js",
  "/quick-find.css": "comparison/after-assets/quick-find.css",
});

function servedAssetDrift(report, root) {
  const items = report.audits?.["network-requests"]?.details?.items;
  if (!Array.isArray(items)) return [];
  const drift = [];
  for (const [route, file] of Object.entries(SERVED_ASSETS)) {
    const item = items.find((entry) => typeof entry.url === "string" && new URL(entry.url).pathname === route);
    if (!item || !Number.isFinite(item.resourceSize)) continue;
    const path = resolve(root, file);
    if (!existsSync(path)) continue;
    const worktreeBytes = statSync(path).size;
    if (item.resourceSize !== worktreeBytes) drift.push({ route, file, servedBytes: item.resourceSize, worktreeBytes });
  }
  return drift;
}

function auditCoreWebVitals(root, availability) {
  const relativeDirectory = LIGHTHOUSE_DIRECTORIES.find((candidate) => existsSync(resolve(root, candidate)));
  if (!relativeDirectory) throw new Error(`No Lighthouse capture directory exists; looked for ${LIGHTHOUSE_DIRECTORIES.join(", ")}`);
  const directory = resolve(root, relativeDirectory);
  const reports = [];
  for (const name of readdirSync(directory).filter((entry) => entry.endsWith(".json")).sort()) {
    const report = JSON.parse(readFileSync(resolve(directory, name), "utf8"));
    const metrics = {};
    for (const [id, definition] of Object.entries(CWV_AUDITS)) {
      const audit = report.audits?.[id];
      if (!audit) continue;
      metrics[definition.label] = Number(audit.numericValue?.toFixed(3));
    }
    const url = report.finalDisplayedUrl || report.finalUrl || null;
    const finder = isFinderUrl(url);
    reports.push({
      run: name.replace(/\.json$/u, ""),
      url,
      capturedAt: report.fetchTime || null,
      performanceScore: report.categories?.performance?.score ?? null,
      seoScore: report.categories?.seo?.score ?? null,
      isFinderPage: finder,
      quickFindLoaded: finder ? loadedQuickFind(report) : null,
      servedAssetDrift: finder ? servedAssetDrift(report, root) : [],
      metrics,
    });
  }

  const findings = [];
  const capturedAt = reports.map((report) => report.capturedAt).filter(Boolean).sort();
  const templates = new Set(reports.map((report) => report.run.replace(/-(?:mobile|desktop)$/u, "")));
  const surfaceChangedAt = measuredSurfaceLastChanged(root);
  const stale = Boolean(surfaceChangedAt && capturedAt.at(-1) && Date.parse(surfaceChangedAt) > Date.parse(capturedAt.at(-1)));
  // Which host these numbers came from. measuredSurfaceLastChanged is a
  // worktree fact and the capture is an origin fact, so the two can only be
  // compared once the origin is on the record: a capture of production is
  // current for HEAD only while the delta between them leaves the measured
  // surface untouched, which is what servedAssetDrift checks directly.
  const measuredOrigins = [...new Set(reports.map((report) => (report.url ? new URL(report.url).origin : null)).filter(Boolean))];
  const remoteOrigins = measuredOrigins.filter((origin) => !/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::|$)/u.test(origin));
  const finderRuns = reports.filter((report) => report.isFinderPage);
  const finderRunsWithoutQuickFind = finderRuns.filter((report) => report.quickFindLoaded === false);
  if (!finderRuns.length) {
    findings.push(finding({
      id: "cwv-capture-covers-no-guided-finder-template",
      checklistItem: "core-web-vitals",
      severity: SEVERITY.medium,
      summary: "No Lighthouse run in this capture is a guided-finder template, so the one script that injects layout after hydration was never exercised.",
      evidence: {
        directory: relativeDirectory,
        runs: reports.map((report) => report.run),
        note: "quick-find.js loads only on /{board} and /{board}/class-N. lighthouserc.cjs now gates /maharashtra-board and /maharashtra-board/class-12 at both form factors; scripts/phase0-run-lighthouse.mjs already captures both as the board and class runs.",
      },
    }));
  } else if (finderRunsWithoutQuickFind.length) {
    findings.push(finding({
      id: "cwv-capture-measured-an-origin-without-the-worker",
      checklistItem: "core-web-vitals",
      severity: SEVERITY.high,
      summary: `${finderRunsWithoutQuickFind.length} of ${finderRuns.length} finder-template runs issued no /quick-find.* request, so they did not measure the deployed Worker and their CLS readings are meaningless.`,
      evidence: {
        directory: relativeDirectory,
        runs: finderRunsWithoutQuickFind.map((report) => ({ run: report.run, url: report.url, cls: report.metrics.CLS })),
        note: "A prerendered-only static server serves the markup but not the runtime, and produces CLS near zero on exactly the templates whose CLS is at issue. Re-measure against an origin running the current Worker.",
      },
    }));
  }
  const driftingRuns = finderRuns.filter((report) => report.servedAssetDrift.length);
  if (driftingRuns.length) {
    findings.push(finding({
      id: "cwv-capture-served-a-different-quick-find-build",
      checklistItem: "core-web-vitals",
      severity: SEVERITY.high,
      summary: `${driftingRuns.length} of ${finderRuns.length} finder-template runs were served a quick-find asset whose byte length differs from the checked-in file, so their CLS describes a build this repo would not deploy.`,
      evidence: {
        directory: relativeDirectory,
        origins: [...new Set(driftingRuns.map((report) => (report.url ? new URL(report.url).origin : null)).filter(Boolean))],
        drift: driftingRuns.map((report) => ({ run: report.run, assets: report.servedAssetDrift })),
        note: "Lighthouse's resourceSize is the uncompressed byte length, which for a text asset equals the file's size on disk. A mismatch means the measured origin trails or leads this worktree on the exact files that produce the shift. Redeploy, or re-capture against an origin at this revision.",
      },
    }));
  }
  if (stale) {
    findings.push(finding({
      id: "lighthouse-capture-predates-the-code-it-measures",
      checklistItem: "core-web-vitals",
      severity: SEVERITY.high,
      summary: `Every Core Web Vitals number below was captured ${capturedAt.at(-1)?.slice(0, 10)}, before the ${surfaceChangedAt.slice(0, 10)} commit that last changed the code they measure. Treat them as a superseded baseline, not present state.`,
      evidence: {
        directory: relativeDirectory,
        newestCapture: capturedAt.at(-1),
        measuredSurfaceLastChanged: surfaceChangedAt,
        measuredSurface: MEASURED_SURFACE,
        note: "This is the defect that made the CLS finding misleading rather than wrong: it named a homepage breach against a quick-find injection that after-worker.js:3130-3149 now strips from / entirely, and a class breach against a template that has since gained the explicit first-paint reservation phase6-build-gates.mjs:185-190 enforces. Re-measure with pnpm run audit:lighthouse:both against an origin running the current Worker - a prerendered-only static server silently produces CLS 0, which is how audits/phase-2 came to record an 'after' of 0.001 with zero /quick-find.* requests in it. scripts/phase0-run-lighthouse.mjs:37-40 skips output files that already exist, so the capture directory must be moved aside first.",
      },
    }));
  }
  findings.push(finding({
    id: "cwv-coverage-is-a-fixed-eight-template-sample",
    checklistItem: "core-web-vitals",
    severity: SEVERITY.info,
    summary: `Lighthouse covers ${templates.size} templates × 2 form factors, captured ${capturedAt[0]?.slice(0, 10)}; ISR, stale-while-revalidate and edge cache-hit rate are not measured by any artefact in the repo.`,
    evidence: {
      templates: [...templates].sort(),
      capturedRange: [capturedAt[0] || null, capturedAt.at(-1) || null],
      note: "audits/phase-2/README.md:31 and render-consistency.mjs:6 disagree about whether ISR is in use; neither is backed by a measurement.",
      unmeasured: ["edge cache-hit rate", "stale-while-revalidate behaviour", "ISR revalidation window", "field CrUX data"],
    },
  }));

  // The Lighthouse performance score blends five weighted metrics, so a run can
  // sit at 0.88 while one Core Web Vital is an order of magnitude out of band.
  // Score alone is not a Core Web Vitals verdict; each metric is checked against
  // its own "good" threshold.
  const breaches = [];
  for (const report of reports) {
    for (const definition of Object.values(CWV_AUDITS)) {
      const value = report.metrics[definition.label];
      if (value == null) continue;
      const threshold = definition.goodMs ?? definition.good;
      if (value > threshold) breaches.push({ run: report.run, metric: definition.label, value, threshold });
    }
  }
  const clsBreaches = breaches.filter((entry) => entry.metric === "CLS");
  if (clsBreaches.length) {
    findings.push(finding({
      id: "cumulative-layout-shift-outside-the-good-threshold",
      checklistItem: "core-web-vitals",
      severity: clsBreaches.some((entry) => entry.value >= 0.25) ? SEVERITY.high : SEVERITY.medium,
      summary: `${clsBreaches.length} of ${reports.length} Lighthouse runs exceed the 0.1 CLS threshold, worst ${Math.max(...clsBreaches.map((entry) => entry.value))} on ${clsBreaches.slice().sort((left, right) => right.value - left.value)[0].run}.`,
      evidence: {
        breaches: clsBreaches.sort((left, right) => right.value - left.value),
        capturedAt: capturedAt.at(-1) || null,
        supersededByLaterCode: stale,
        // The diagnosis of the 2026-08-18 breach, kept as the first place to
        // look rather than as an attribution for whatever fired now: it was
        // derived from that capture's own layout-shifts rows, and this finding
        // cannot know they describe the breach in front of it. Confirm against
        // the current run's layout-shifts audit before acting on it.
        priorDiagnosis: {
          capturedAt: "2026-08-18",
          // Named from the raw layout-shifts audit, not guessed. The per-event
          // scores summed to each run's reported CLS with exact float equality,
          // so nothing else contributed. The note this replaced blamed "the
          // catalog artwork"; the artifacts it was derived from contradict that
          // - unsized-images, image-aspect-ratio and image-size-responsive all
          // scored 1 with 0 items on every hub run, every <img> carried
          // explicit width and height, and no shift row carried a font-swap
          // cause.
          shiftingNode: "main#main-content > section.shell (the catalog section), plus div.qf-copy > h2#qf-heading and p.qf-status on the deeper runs",
          cause: "comparison/after-assets/quick-find.js mounts after hydration and reserves no space: :99-117 insertAdjacentHTML a full-height <section class=\"qf-section\">, then delete the server-rendered .course-finder underneath in the same task. mountQuickFindAfterHydration (:445-454) polls rAF for next-route-announcer for up to 300 frames, so the insertion lands after first paint by construction. Solving Lighthouse's score formula against the recorded bounding rects gives 736.6px of displacement per event on homepage-desktop and 540.0px on class-mobile - twice each, from a duplicated /api/quick-find request whose likely re-entry source is the MutationObserver at :473-475.",
          candidateFix: "Stop deleting .course-finder at quick-find.js:104 - that is the exact selector the :has(> .course-finder) first-paint reservation in quick-find-critical.mjs is keyed to, so removing the node retracts the reservation in the same task that needs it.",
          resolvedBy: "Not patched. The 2026-08-31 capture against the deployed Worker, with all four finder runs served this worktree's quick-find bytes, measured 0.008 on class-mobile and 0.000 on homepage-desktop - the reservation added in quick-find-critical.mjs and the removal of quick-find from / had already closed it.",
        },
        note: "CLS above 0.25 is Google's 'poor' band. The claim that lighthouserc.cjs only asserts the aggregate score is wrong - it asserts cumulative-layout-shift <= 0.1 directly. The real hole was URL coverage: until this change, not one gated URL was a finder page, so the only script that produces these shifts was never loaded under the assertion. Field data agrees with the current synthetic numbers at the metric Google assesses: phase6_web_vitals p75 CLS is 0.0000 on home, subject, question and chapter and 0.0126 on index, across 294 CLS samples.",
      },
    }));
  }
  const otherBreaches = breaches.filter((entry) => entry.metric !== "CLS");
  if (otherBreaches.length) {
    findings.push(finding({
      id: "core-web-vitals-outside-the-good-thresholds",
      checklistItem: "core-web-vitals",
      severity: SEVERITY.medium,
      summary: `${otherBreaches.length} LCP/TBT/FCP reading${otherBreaches.length === 1 ? " is" : "s are"} outside the "good" band (LCP 2500ms, TBT 200ms, FCP 1800ms), across ${new Set(otherBreaches.map((entry) => entry.run)).size} of ${reports.length} runs.`,
      evidence: { breaches: otherBreaches.sort((left, right) => right.value / right.threshold - left.value / left.threshold) },
    }));
  }

  const failing = reports.filter((report) => (report.performanceScore ?? 1) < 0.9);
  if (failing.length) {
    findings.push(finding({
      id: "lighthouse-performance-below-threshold",
      checklistItem: "core-web-vitals",
      severity: SEVERITY.medium,
      summary: `${failing.length} of ${reports.length} Lighthouse runs score below 0.90 on performance.`,
      evidence: { runs: failing.map((report) => ({ run: report.run, score: report.performanceScore, metrics: report.metrics })) },
    }));
  }

  if (availability) {
    const broken = availability.probes.filter((probe) => probe.status >= 500 || probe.incomplete);
    if (broken.length) {
      findings.push(finding({
        id: "production-routes-unavailable-or-truncated",
        checklistItem: "core-web-vitals",
        severity: SEVERITY.critical,
        summary: `${broken.length} of ${availability.probes.length} production probes returned a 5xx or a body that does not end in </html>.`,
        evidence: {
          origin: availability.origin,
          byRoute: availability.byRoute,
          note: "Availability and body completeness are treated as Core Web Vitals inputs here: a route that 503s has no LCP at all. See backlog item 3.",
        },
      }));
    }
  }

  return checklistEntry({
    id: "core-web-vitals",
    // The final branch used to be notMeasured, which was unreachable while
    // every capture breached something and became actively misleading the
    // moment one did not: 16 runs with zero threshold breaches is a measured
    // pass, not an absence of data. notMeasured is now reserved for the case it
    // names - no reports at all.
    status: !reports.length ? STATUS.notMeasured
      : findings.some((entry) => entry.severity === SEVERITY.critical || entry.severity === SEVERITY.high) ? STATUS.fail
      : failing.length || breaches.length ? STATUS.warn : STATUS.pass,
    metrics: {
      lighthouseRuns: reports.length,
      lighthouseDirectory: relativeDirectory,
      lighthouseCapturedAt: capturedAt.at(-1) || null,
      lighthouseCaptureIsStale: stale,
      measuredSurfaceLastChanged: surfaceChangedAt,
      measuredOrigins,
      finderRuns: finderRuns.length,
      finderRunsThatLoadedQuickFind: finderRuns.filter((report) => report.quickFindLoaded === true).length,
      finderRunsServedWorktreeQuickFind: finderRuns.filter((report) => report.quickFindLoaded === true && !report.servedAssetDrift.length).length,
      templatesCovered: [...templates].sort(),
      thresholdBreaches: breaches.length,
      worstCls: Math.max(0, ...reports.map((report) => report.metrics.CLS ?? 0)),
      reports,
      availability: availability || null,
    },
    findings,
    notes: availability
      ? []
      : ["Availability was not probed: run with --live to add production availability and body-completeness measurements."],
    // A Lighthouse capture taken against a remote origin is production
    // evidence whether or not --live added availability probes, so the fallback
    // is no longer staticAssetProvenance unconditionally: that stamped
    // "unverified-against-production" on numbers measured against production,
    // and its unverifiedReason - that the deployed Worker matches no known tree
    // - is the opposite of what servedAssetDrift established for this capture.
    provenance: availability
      ? liveOriginProvenance(availability.origin, `${relativeDirectory} (captured ${capturedAt.at(-1)?.slice(0, 10)}${stale ? ", superseded by later code" : ""}) plus ${availability.probes.length} live probes`)
      : remoteOrigins.length
        ? liveOriginProvenance(remoteOrigins.join(", "), `${relativeDirectory} (captured ${capturedAt.at(-1)?.slice(0, 10)}${stale ? ", superseded by later code" : ""}) against ${remoteOrigins.join(", ")}; no availability probes, run with --live to add them`)
        : staticAssetProvenance(`${relativeDirectory} (captured ${capturedAt.at(-1)?.slice(0, 10)}${stale ? ", superseded by later code" : ""}) against ${measuredOrigins.join(", ") || "an unrecorded origin"}`),
  });
}

// ---------------------------------------------------------------------------
// DPDP
// ---------------------------------------------------------------------------

function auditDpdp(root, documents) {
  const source = readFileSync(resolve(root, "phase5-compliance.mjs"), "utf8");
  const privacy = documents.find((document) => document.route === "/privacy");
  const evidence = {
    childDirectedSitewide: /child-directed/iu.test(source),
    citesDpdpSection9: /Section 9/u.test(source),
    declaresNoTargetedAdvertising: /no-tracking\/no-targeted-advertising/u.test(source),
    requestsNonPersonalizedAdsOnly: /requestNonPersonalizedAds\s*:\s*1/u.test(source),
    hasConsentBanner: /consent[- ]?banner|cookie[- ]?banner|cmp|__tcfapi/iu.test(source),
    privacyPageRendered: Boolean(privacy),
    privacyPageMentionsGrievanceOfficer: privacy ? /grievance/iu.test(privacy.html) : null,
    privacyPageMentionsDataPrincipalRights: privacy ? /data principal/iu.test(privacy.html) : null,
  };

  const findings = [];
  if (!evidence.hasConsentBanner) {
    findings.push(finding({
      id: "no-consent-management-surface",
      checklistItem: "dpdp",
      severity: SEVERITY.medium,
      summary: "No consent banner, cookie notice or TCF consent-management integration exists anywhere in the codebase.",
      evidence: {
        note: "This is a deliberate posture, not an omission: phase5-compliance.mjs:143 treats the service as child-directed sitewide and holds ads back rather than asking students to consent. The audit records it because the posture is only safe while adDecision actually runs - see the ad-gate bypass under the adsense item.",
        holdbackReasons: ["publisher-id-missing", "slot-id-missing", "tcf-v2.3-region-holdback", "unknown-region-holdback", "noindex-content-gate", "required-page"],
      },
    }));
  }
  findings.push(finding({
    id: "privacy-policy-accuracy-unverified",
    checklistItem: "dpdp",
    severity: SEVERITY.low,
    summary: "Nothing compares the privacy policy's stated data collection against what the deployment actually collects.",
    evidence: {
      note: "Production sends Report-To and NEL headers to a.nel.cloudflare.com (observed live 2026-08-30). Those are Cloudflare platform defaults rather than application code, which is exactly why no code-level gate would ever notice them.",
      unverifiable: ["Cloudflare-injected telemetry headers", "analytics beacons added at the zone level", "third-party subrequests"],
    },
  }));

  return checklistEntry({
    id: "dpdp",
    status: STATUS.warn,
    metrics: evidence,
    findings,
    notes: ["scripts/phase5-compliance.mjs and scripts/phase5-static-audit.mjs already assert the required legal pages exist and are reachable; this item does not re-check that."],
    provenance: codeProvenance("phase5-compliance.mjs plus the in-process /privacy render"),
  });
}

// ---------------------------------------------------------------------------
// AdSense
// ---------------------------------------------------------------------------

function auditAdsense(root, documents) {
  const worker = readFileSync(resolve(root, "comparison/after-worker.js"), "utf8");
  const lines = worker.split("\n");
  const lineOf = (predicate) => lines.findIndex(predicate) + 1;
  const enhanceLines = lines
    .map((line, index) => (line.includes("enhanceResponse(") ? index + 1 : null))
    .filter(Boolean);
  const questionReturnLine = lineOf((line) => line.includes("return edgeHtmlCacheStore(request, standaloneQuestion, ctx"));
  const launchHotPathLine = lineOf((line) => line.includes("if (launchHotPath) return launchHotPath;"));

  const adDocuments = documents.filter((document) => /adsbygoogle|phase5-ad-shell/u.test(document.html));
  const adDensity = adDocuments.map((document) => ({
    route: document.route,
    template: document.template,
    adSlots: (document.html.match(/class="adsbygoogle/gu) || []).length,
    bytes: document.html.length,
  }));

  const findings = [];
  if (questionReturnLine) {
    findings.push(finding({
      id: "question-route-bypasses-the-ad-gate",
      checklistItem: "adsense",
      severity: SEVERITY.high,
      summary: `The standalone question route returns without enhanceResponse, so adDecision never runs for roughly 300,000 pages.`,
      evidence: {
        bypassAt: `comparison/after-worker.js:${questionReturnLine}`,
        secondBypassAt: launchHotPathLine ? `comparison/after-worker.js:${launchHotPathLine} (launch-hot-path static documents)` : null,
        enhanceResponseCallSites: enhanceLines,
        note: "Every other terminal branch wraps its response in enhanceResponse, which is where adDecision and the x-studywudy-ad-mode header are applied. Confirmed live: /cbse carries x-studywudy-ad-mode; question pages and /search do not.",
        consequence: "Harmless while ADSENSE_PUBLISHER_ID is unset, because no ad markup is injected anywhere. It becomes a policy failure the moment a publisher id is configured: the noindex-content-gate holdback would stop applying on exactly the ~267K pages that fail the depth floor.",
      },
    }));
  }
  findings.push(finding({
    id: "no-ad-density-measurement",
    checklistItem: "adsense",
    severity: SEVERITY.low,
    summary: "No script in the repo measures ad density or ad-to-content ratio, and adDecision has no unit test.",
    evidence: {
      documentsCarryingAdMarkup: adDocuments.length,
      note: "scripts/phase5-runtime-audit.mjs:80 throws a TypeError on the current corpus because content_publish_gate holds no gate_passed = 0 rows, so the one runtime ad audit that exists cannot run.",
    },
  }));

  return checklistEntry({
    id: "adsense",
    status: STATUS.fail,
    metrics: {
      adsTxtState: "placeholder; X-StudyWudy-Ads-Txt: awaiting-publisher-id until ADSENSE_PUBLISHER_ID is set",
      documentsInspected: documents.length,
      documentsCarryingAdMarkup: adDocuments.length,
      adDensity,
      adGateBypasses: [questionReturnLine, launchHotPathLine].filter(Boolean).map((line) => `comparison/after-worker.js:${line}`),
    },
    findings,
    notes: ["Zero ads are served today, so nothing here is a live policy violation; both findings are about what happens on the day a publisher id is configured."],
    provenance: codeProvenance("comparison/after-worker.js and phase5-compliance.mjs"),
  });
}

export function auditSurface({ root, documents, availability = null }) {
  return [
    auditCoreWebVitals(root, availability),
    auditDpdp(root, documents),
    auditAdsense(root, documents),
  ];
}
