#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  STATUS,
  SEVERITY,
  checklistEntry,
  codeProvenance,
  finding,
  liveOriginProvenance,
  staticAssetProvenance,
} from "../technical-seo.mjs";

const LIGHTHOUSE_DIRECTORY = "audits/phase-0/lighthouse-json";
const CWV_AUDITS = Object.freeze({
  "largest-contentful-paint": { label: "LCP", goodMs: 2_500 },
  "cumulative-layout-shift": { label: "CLS", good: 0.1 },
  "total-blocking-time": { label: "TBT", goodMs: 200 },
  "first-contentful-paint": { label: "FCP", goodMs: 1_800 },
});

// ---------------------------------------------------------------------------
// Core Web Vitals, ISR and availability
// ---------------------------------------------------------------------------

function auditCoreWebVitals(root, availability) {
  const directory = resolve(root, LIGHTHOUSE_DIRECTORY);
  const reports = [];
  for (const name of readdirSync(directory).filter((entry) => entry.endsWith(".json")).sort()) {
    const report = JSON.parse(readFileSync(resolve(directory, name), "utf8"));
    const metrics = {};
    for (const [id, definition] of Object.entries(CWV_AUDITS)) {
      const audit = report.audits?.[id];
      if (!audit) continue;
      metrics[definition.label] = Number(audit.numericValue?.toFixed(3));
    }
    reports.push({
      run: name.replace(/\.json$/u, ""),
      url: report.finalDisplayedUrl || report.finalUrl || null,
      capturedAt: report.fetchTime || null,
      performanceScore: report.categories?.performance?.score ?? null,
      seoScore: report.categories?.seo?.score ?? null,
      metrics,
    });
  }

  const findings = [];
  const capturedAt = reports.map((report) => report.capturedAt).filter(Boolean).sort();
  const templates = new Set(reports.map((report) => report.run.replace(/-(?:mobile|desktop)$/u, "")));
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
        note: "CLS above 0.25 is Google's 'poor' band. Every breach is on a board or class hub - the same templates that carry the client-side quick-find injection and the catalog artwork - not on question or chapter pages. lighthouserc.cjs asserts the aggregate performance score, so a run can pass its budget with CLS near 1.0.",
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
    status: findings.some((entry) => entry.severity === SEVERITY.critical || entry.severity === SEVERITY.high) ? STATUS.fail
      : failing.length || breaches.length ? STATUS.warn : STATUS.notMeasured,
    metrics: {
      lighthouseRuns: reports.length,
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
    provenance: availability
      ? liveOriginProvenance(availability.origin, `${LIGHTHOUSE_DIRECTORY} plus ${availability.probes.length} live probes`)
      : staticAssetProvenance(`${LIGHTHOUSE_DIRECTORY} (captured ${capturedAt[0]?.slice(0, 10)})`),
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
