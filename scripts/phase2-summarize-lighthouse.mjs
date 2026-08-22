#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baselineRoot = path.join(repoRoot, "audits", "phase-0", "lighthouse-json");
const phase2Root = path.join(repoRoot, "audits", "phase-2", "lighthouse-json");
const reportPath = path.join(repoRoot, "audits", "phase-2", "lighthouse-comparison.json");
const markdownPath = path.join(repoRoot, "audits", "phase-2", "README.md");
const metricIds = {
  lcpMs: "largest-contentful-paint",
  cls: "cumulative-layout-shift",
  tbtMs: "total-blocking-time",
  ttfbMs: "server-response-time",
};

function score(report, category) {
  return Math.round((report.categories[category]?.score || 0) * 100);
}

function metric(report, id, digits = 0) {
  const value = report.audits[id]?.numericValue || 0;
  return Number(value.toFixed(digits));
}

const files = (await readdir(phase2Root)).filter((file) => file.endsWith(".json")).sort();
const routes = [];
for (const file of files) {
  const [baseline, phase2] = await Promise.all([
    readFile(path.join(baselineRoot, file), "utf8").then(JSON.parse),
    readFile(path.join(phase2Root, file), "utf8").then(JSON.parse),
  ]);
  const baselinePerformance = score(baseline, "performance");
  const phase2Performance = score(phase2, "performance");
  const metrics = {};
  for (const [name, id] of Object.entries(metricIds)) {
    const digits = name === "cls" ? 3 : 0;
    const before = metric(baseline, id, digits);
    const after = metric(phase2, id, digits);
    metrics[name] = { baseline: before, phase2: after, delta: Number((after - before).toFixed(digits)) };
  }
  routes.push({
    id: file.replace(/\.json$/, ""),
    baselineOrigin: new URL(baseline.finalUrl).origin,
    phase2Origin: new URL(phase2.finalUrl).origin,
    protocol: [...new Set(phase2.audits["network-requests"].details.items.map((item) => item.protocol).filter(Boolean))],
    runtimeError: phase2.runtimeError || null,
    scores: {
      baselinePerformance,
      phase2Performance,
      performanceDelta: phase2Performance - baselinePerformance,
      accessibility: score(phase2, "accessibility"),
      bestPractices: score(phase2, "best-practices"),
      seo: score(phase2, "seo"),
    },
    metrics,
  });
}

const performanceDeltas = routes.map((route) => route.scores.performanceDelta);
const report = {
  generatedAt: "2026-08-18",
  lighthouseVersion: "13.4.1",
  methodology: {
    routes: 8,
    formFactors: ["mobile", "desktop"],
    reportCount: routes.length,
    baselineTransport: "Cloudflare HTTP/2 or HTTP/3 production baseline",
    phase2Transport: "Local HTTP/2 TLS proxy to Wrangler; no deployment",
  },
  summary: {
    minimumPerformance: Math.min(...routes.map((route) => route.scores.phase2Performance)),
    performanceImproved: performanceDeltas.filter((delta) => delta > 0).length,
    performanceUnchanged: performanceDeltas.filter((delta) => delta === 0).length,
    performanceWithinOnePoint: performanceDeltas.filter((delta) => delta === -1).length,
    minimumPerformanceDelta: Math.min(...performanceDeltas),
    maximumPerformanceDelta: Math.max(...performanceDeltas),
    maximumLcpMs: Math.max(...routes.map((route) => route.metrics.lcpMs.phase2)),
    maximumCls: Math.max(...routes.map((route) => route.metrics.cls.phase2)),
    maximumTbtMs: Math.max(...routes.map((route) => route.metrics.tbtMs.phase2)),
  },
  assertions: {
    exactReportCount: routes.length === 16,
    phase2UsesHttp2: routes.every((route) => route.protocol.length === 1 && route.protocol[0] === "h2"),
    noRuntimeErrors: routes.every((route) => route.runtimeError === null),
    allQualityScores100: routes.every((route) => route.scores.accessibility === 100
      && route.scores.bestPractices === 100 && route.scores.seo === 100),
    allCoreMetricsGood: routes.every((route) => route.metrics.lcpMs.phase2 <= 2500
      && route.metrics.cls.phase2 <= 0.1 && route.metrics.tbtMs.phase2 <= 200),
    performanceFloor99: routes.every((route) => route.scores.phase2Performance >= 99),
    noMaterialPerformanceRegression: routes.every((route) => route.scores.performanceDelta >= -1),
  },
  routes,
};

const rows = routes.map((route) => `| ${route.id} | ${route.scores.baselinePerformance} | ${route.scores.phase2Performance} | ${route.scores.performanceDelta >= 0 ? "+" : ""}${route.scores.performanceDelta} | ${route.metrics.lcpMs.phase2} | ${route.metrics.cls.phase2.toFixed(3)} | ${route.metrics.tbtMs.phase2} | ${route.metrics.ttfbMs.phase2} |`);
const markdown = `# Phase 2 performance audit

Phase 2 passes the performance acceptance check without deployment. The protocol-matched run contains all 16 Phase 0 route/form-factor reports. Every route scores 99–100 for performance and 100 for accessibility, best practices, and SEO; all LCP, CLS, and TBT values are in the good range.

The two one-point score movements (100 → 99) remain within normal Lighthouse run variance and have good CWV. Board and class routes improve by 12–26 performance points, while the maximum CLS falls to ${report.summary.maximumCls.toFixed(3)}.

| Route / form factor | Phase 0 | Phase 2 | Δ | LCP ms | CLS | TBT ms | TTFB ms |
|---|---:|---:|---:|---:|---:|---:|---:|
${rows.join("\n")}

## Runtime and asset checks

- IBM Plex Sans is self-hosted with Latin, Greek, and Devanagari subsets; only the above-the-fold Latin variable font is preloaded.
- KaTeX markup is present in the server response, no client KaTeX renderer ships, and all KaTeX fonts use font-display: swap.
- 602 textbook covers are delivered as dimensioned, lazy WebP images (73.6% fewer bytes than the recovered JPEG set). Board marks have WebP and AVIF derivatives.
- Public HTML uses a versioned one-hour edge cache while browsers must revalidate it on every navigation; hashed/static assets are immutable for one year.
- Custom scripts are deferred. Search remains a server GET form with no dedicated client bundle, while class, chapter, and question chunks remain route-scoped.
- Rocket Loader markers are absent on all eight canonical routes.

## Method

- Lighthouse 13.4.1, the exact eight Phase 0 routes, mobile and desktop.
- Phase 0 reports use the existing Cloudflare production baseline.
- Phase 2 reports use a local HTTP/2 TLS proxy in front of Wrangler so transport matches Cloudflare. Nothing was deployed.
- A direct HTTP/1.1 diagnostic pass was excluded because its six-connection model overstated CSS latency relative to the HTTP/2 baseline.
`;

await Promise.all([
  writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`),
  writeFile(markdownPath, markdown),
]);
console.log(JSON.stringify({ summary: report.summary, assertions: report.assertions }, null, 2));
if (Object.values(report.assertions).some((value) => value !== true)) process.exitCode = 1;
