#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";

const origin = process.env.STUDYWUDY_ORIGIN ?? "http://127.0.0.1:8789";
const outputPath = process.env.PHASE1_LINK_OUTPUT ?? "audits/phase-1/link-crawl.json";
const sampleTarget = Number(process.env.PHASE1_SAMPLE_TARGET ?? 500);
const concurrency = Number(process.env.PHASE1_CRAWL_CONCURRENCY ?? 12);

function xmlLocations(xml) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((match) => match[1].replaceAll("&amp;", "&"));
}

function classify(rawUrl) {
  const url = new URL(rawUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.includes("questions")) return "question";
  if (parts[2] === "streams" && parts.length === 6) return "subject";
  if (parts[2] === "streams") return "other";
  if (parts.length === 5 && parts[1]?.startsWith("class-")) return "chapter";
  if (parts.length === 3 && parts[1]?.startsWith("class-") && parts[2] !== "streams") return "subject";
  if (parts.length === 2 && parts[1]?.startsWith("class-")) return "class";
  if (parts.length === 1 && ["maharashtra-board", "cbse", "cisce", "tamil-nadu-board"].includes(parts[0])) return "board";
  return "other";
}

function evenlySample(items, target) {
  if (items.length <= target) return [...items];
  return Array.from({ length: target }, (_, index) => items[Math.floor(index * (items.length - 1) / (target - 1))]);
}

function localUrl(rawUrl) {
  const source = new URL(rawUrl);
  return new URL(`${source.pathname}${source.search}`, origin).href;
}

function internalLinks(html, pageUrl) {
  const links = [];
  for (const match of html.matchAll(/<a\b([^>]*)>/gi)) {
    const attributes = match[1];
    const hrefMatch = attributes.match(/\bhref=(?:"([^"]*)"|'([^']*)')/i);
    if (!hrefMatch) continue;
    const rawHref = (hrefMatch[1] ?? hrefMatch[2]).replaceAll("&amp;", "&");
    if (!rawHref || rawHref.startsWith("#") || /^(mailto|tel|javascript):/i.test(rawHref)) continue;
    let resolved;
    try {
      resolved = new URL(rawHref, pageUrl);
    } catch {
      continue;
    }
    if (resolved.origin !== new URL(origin).origin) continue;
    resolved.hash = "";
    links.push({
      href: `${resolved.pathname}${resolved.search}`,
      related: /\bclass=(?:"[^"]*\brelated-question-link\b[^"]*"|'[^']*\brelated-question-link\b[^']*')/i.test(attributes),
    });
  }
  return links;
}

async function mapConcurrent(items, limit, operation) {
  const output = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await operation(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(45_000), ...options });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const sitemapIndexResponse = await fetchWithRetry(`${origin}/sitemap.xml`);
const sitemapIndexXml = await sitemapIndexResponse.text();
const childSitemaps = xmlLocations(sitemapIndexXml);
const childResults = await mapConcurrent(childSitemaps, 10, async (child) => {
  const response = await fetchWithRetry(localUrl(child));
  const xml = await response.text();
  return { child, status: response.status, urls: xmlLocations(xml) };
});

const sitemapUrls = childResults.flatMap((result) => result.urls);
const inventory = { board: [], class: [], subject: [], chapter: [], question: [] };
for (const url of sitemapUrls) {
  const type = classify(url);
  if (type in inventory) inventory[type].push(url);
}

const samples = Object.fromEntries(Object.entries(inventory).map(([type, urls]) => [type, evenlySample(urls, sampleTarget)]));
const sampledPages = Object.entries(samples).flatMap(([type, urls]) => urls.map((url) => ({ type, sitemapUrl: url, url: localUrl(url) })));
const internalHrefSources = new Map();
const relatedHrefs = new Set();
const sourceFailures = [];
let nullPageRowsHidden = 0;
let populatedPageRows = 0;
let emptyPagePlaceholders = 0;

const sourceResults = await mapConcurrent(sampledPages, concurrency, async (sample, index) => {
  try {
    const response = await fetchWithRetry(sample.url);
    const html = await response.text();
    const robots = html.match(/<meta[^>]+name="robots"[^>]+content="([^"]*)"/i)?.[1] ?? "";
    const links = internalLinks(html, sample.url);
    for (const link of links) {
      if (!internalHrefSources.has(link.href)) internalHrefSources.set(link.href, sample.url);
      if (link.related) relatedHrefs.add(link.href);
    }
    if (sample.type === "question") {
      if (!/<dt>Page<\/dt>/i.test(html)) nullPageRowsHidden += 1;
      else if (/<dt>Page<\/dt>\s*<dd>\s*(?:—|-)?\s*<\/dd>/i.test(html)) emptyPagePlaceholders += 1;
      else populatedPageRows += 1;
    }
    if (response.status !== 200 || /\bnoindex\b/i.test(robots)) {
      sourceFailures.push({ type: sample.type, url: sample.url, status: response.status, robots });
    }
    if ((index + 1) % 100 === 0) process.stdout.write(`source pages ${index + 1}/${sampledPages.length}\n`);
    return { type: sample.type, url: sample.url, status: response.status, linkCount: links.length };
  } catch (error) {
    sourceFailures.push({ type: sample.type, url: sample.url, error: String(error) });
    return { type: sample.type, url: sample.url, status: null, linkCount: 0 };
  }
});

const uniqueInternalHrefs = [...internalHrefSources.keys()].sort();
const sitemapPaths = new Set(sitemapUrls.map((url) => {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}));
const sitemapResolvedTargets = uniqueInternalHrefs.filter((href) => sitemapPaths.has(href));
const nonSitemapTargets = uniqueInternalHrefs.filter((href) => !sitemapPaths.has(href));
const transportSample = evenlySample(uniqueInternalHrefs, sampleTarget);
const httpTargets = [...new Set([...nonSitemapTargets, ...transportSample])].sort();
const brokenLinks = [];
await mapConcurrent(httpTargets, concurrency, async (href, index) => {
  try {
    let response = await fetchWithRetry(new URL(href, origin).href, { method: "HEAD" });
    if (response.status < 200 || response.status >= 400) {
      response = await fetchWithRetry(new URL(href, origin).href);
    }
    if (response.status < 200 || response.status >= 400) {
      brokenLinks.push({ href, source: internalHrefSources.get(href), status: response.status });
    }
    await response.body?.cancel();
  } catch (error) {
    brokenLinks.push({ href, source: internalHrefSources.get(href), error: String(error) });
  }
  if ((index + 1) % 100 === 0) process.stdout.write(`HTTP targets ${index + 1}/${httpTargets.length}\n`);
});

const questionSitemapPaths = new Set(inventory.question.map((url) => {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}));
const invalidRelatedLinks = [...relatedHrefs]
  .filter((href) => !questionSitemapPaths.has(href))
  .map((href) => ({ href, source: internalHrefSources.get(href), reason: "not present in the indexable question sitemap" }));

const sampleSummary = Object.fromEntries(Object.entries(samples).map(([type, urls]) => [type, {
  population: inventory[type].length,
  sampled: urls.length,
  target: sampleTarget,
  populationBelowTarget: inventory[type].length < sampleTarget,
}]));
const report = {
  capturedAt: new Date().toISOString(),
  origin,
  sitemap: {
    status: sitemapIndexResponse.status,
    childSitemaps: childSitemaps.length,
    failedChildren: childResults.filter((result) => result.status !== 200).map(({ child, status }) => ({ child, status })),
    totalUrls: sitemapUrls.length,
  },
  samples: sampleSummary,
  sampledSourcePages: sampledPages.length,
  sampledSourceLinks: sourceResults.reduce((sum, result) => sum + result.linkCount, 0),
  validationMethod: "Every unique internal content target is matched exactly against the current indexable sitemap; every non-sitemap target plus a deterministic 500-target transport sample is also requested over HTTP.",
  uniqueInternalTargetsValidated: uniqueInternalHrefs.length,
  sitemapResolvedTargets: sitemapResolvedTargets.length,
  nonSitemapTargets: nonSitemapTargets.length,
  httpTargetsChecked: httpTargets.length,
  relatedLinksChecked: relatedHrefs.size,
  pageField: { nullRowsHidden: nullPageRowsHidden, populatedRows: populatedPageRows, emptyPlaceholders: emptyPagePlaceholders },
  sourceFailures,
  brokenLinks,
  invalidRelatedLinks,
};

await mkdir(new URL("../audits/phase-1/", import.meta.url), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
const failures = sourceFailures.length + brokenLinks.length + invalidRelatedLinks.length + emptyPagePlaceholders;
console.log(`wrote ${outputPath}; sources=${sampledPages.length}; internalTargets=${uniqueInternalHrefs.length}; HTTP=${httpTargets.length}; related=${relatedHrefs.size}; failures=${failures}`);
process.exitCode = failures ? 1 : 0;
