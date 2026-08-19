#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const baselineDirectory = process.env.LIGHTHOUSE_BASELINE_DIRECTORY || "audits/phase-0/lighthouse-json";
const currentDirectory = process.env.LIGHTHOUSE_CURRENT_DIRECTORY || "audits/independent-verification/lighthouse-live-final-v6";
const outputPath = process.env.LIGHTHOUSE_COMPARISON_OUTPUT || "audits/independent-verification/lighthouse-comparison-final.json";
const categories = ["performance", "accessibility", "best-practices", "seo"];
const metrics = {
  lcpMs: ["largest-contentful-paint", 0],
  cls: ["cumulative-layout-shift", 3],
  tbtMs: ["total-blocking-time", 0],
  ttfbMs: ["server-response-time", 0],
};

function score(report, category) {
  return Math.round(Number(report.categories[category]?.score || 0) * 100);
}

function metric(report, id, digits) {
  return Number(Number(report.audits[id]?.numericValue || 0).toFixed(digits));
}

const files = (await readdir(currentDirectory)).filter((file) => file.endsWith(".json")).sort();
const runs = [];
for (const file of files) {
  const [baseline, current] = await Promise.all([
    readFile(join(baselineDirectory, file), "utf8").then(JSON.parse),
    readFile(join(currentDirectory, file), "utf8").then(JSON.parse),
  ]);
  const categoryResults = Object.fromEntries(categories.map((category) => {
    const before = score(baseline, category);
    const after = score(current, category);
    return [category, { baseline: before, current: after, delta: after - before }];
  }));
  const metricResults = Object.fromEntries(Object.entries(metrics).map(([name, [id, digits]]) => {
    const before = metric(baseline, id, digits);
    const after = metric(current, id, digits);
    return [name, { baseline: before, current: after, delta: Number((after - before).toFixed(digits)) }];
  }));
  const regressions = [
    ...Object.entries(categoryResults).filter(([, value]) => value.delta < 0).map(([name, value]) => ({ name, ...value })),
    ...Object.entries(metricResults).filter(([, value]) => value.delta > 0).map(([name, value]) => ({ name, ...value })),
  ];
  runs.push({
    id: basename(file, ".json"),
    fetchTime: current.fetchTime,
    categories: categoryResults,
    metrics: metricResults,
    inp: { baseline: null, current: null, reason: "Lighthouse does not produce lab INP; field INP is reported from the RUM pipeline." },
    runtimeError: current.runtimeError || null,
    regressions,
    budgets: {
      lcp: metricResults.lcpMs.current <= 2_500,
      cls: metricResults.cls.current <= 0.1,
      tbtProxyForInp: metricResults.tbtMs.current <= 200,
    },
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  baselineDirectory,
  currentDirectory,
  reportCount: runs.length,
  summary: {
    exactExpectedReportCount: runs.length === 16,
    minimumPerformance: Math.min(...runs.map((run) => run.categories.performance.current)),
    minimumAccessibility: Math.min(...runs.map((run) => run.categories.accessibility.current)),
    minimumBestPractices: Math.min(...runs.map((run) => run.categories["best-practices"].current)),
    minimumSeo: Math.min(...runs.map((run) => run.categories.seo.current)),
    maximumLcpMs: Math.max(...runs.map((run) => run.metrics.lcpMs.current)),
    maximumCls: Math.max(...runs.map((run) => run.metrics.cls.current)),
    maximumTbtMs: Math.max(...runs.map((run) => run.metrics.tbtMs.current)),
    maximumTtfbMs: Math.max(...runs.map((run) => run.metrics.ttfbMs.current)),
    allBudgetsPass: runs.every((run) => Object.values(run.budgets).every(Boolean)),
    runsWithAnyRegression: runs.filter((run) => run.regressions.length > 0).map((run) => run.id),
    totalFlaggedRegressions: runs.reduce((sum, run) => sum + run.regressions.length, 0),
  },
  runs,
};

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
