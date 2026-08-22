import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { extractCrawlerVisibleText } from "../crawler-visible-text.mjs";

import {
  PUBLIC_BRAND_HYGIENE_RELEASE,
  PUBLIC_BRAND_REPLACEMENT,
  TEMPORARY_DEPLOYMENT_ORIGIN,
  inspectPublicBrandHtml,
  publicDocumentUrl,
  repairPublicBrandCopy,
  rewritePublicAssetPath,
  rewritePublicInfrastructureOrigin,
  rewritePublicMetadataValue,
} from "../public-brand-hygiene.mjs";
import {
  PUBLIC_BRAND_DISCOVERY_ROUTES,
  PUBLIC_BRAND_HTML_ROUTES,
  smokePublicBrandHygiene,
} from "../scripts/public-brand-hygiene-smoke.mjs";

const LEGACY_HOMEPAGE_COPY =
  "StudyWudy’s renderer mirrors all nine structural patterns in Boardly, covering 17 specific question types.";

function cleanHtml(origin, body = PUBLIC_BRAND_REPLACEMENT) {
  return `<!doctype html><html><head><title>StudyWudy</title><link rel="canonical" href="${origin}/"><meta property="og:url" content="${origin}/"><script type="application/ld+json">{"@context":"https://schema.org","url":"${origin}/","name":"StudyWudy"}</script></head><body><main><p class="eyebrow">One system, every question</p><p>${body}</p></main></body></html>`;
}

test("old Boardly homepage and question-card copy has exact StudyWudy replacements", () => {
  assert.equal(repairPublicBrandCopy(LEGACY_HOMEPAGE_COPY), PUBLIC_BRAND_REPLACEMENT);
  assert.equal(repairPublicBrandCopy("Boardly pattern B"), "Answer format B");
  assert.equal(repairPublicBrandCopy("Try another class or subject from the Boardly catalog."), "Try another class or subject from the StudyWudy catalog.");
  assert.equal(repairPublicBrandCopy("Study Wudy"), "StudyWudy");
});

test("public metadata uses the request's real origin and the neutral media alias", () => {
  const realPage = "https://learn.studywudy.example/cbse/class-10?utm_source=test";
  const input = `{"name":"Boardly","url":"${TEMPORARY_DEPLOYMENT_ORIGIN}/cbse/class-10","image":"${TEMPORARY_DEPLOYMENT_ORIGIN}/boardly-media/a.png"}`;
  const rewritten = rewritePublicMetadataValue(input, realPage);
  assert.match(rewritten, /"name":"StudyWudy"/u);
  assert.match(rewritten, /https:\/\/learn\.studywudy\.example\/cbse\/class-10/u);
  assert.match(rewritten, /\/studywudy-media\/a\.png/u);
  assert.doesNotMatch(rewritten, /Boardly|workers\.dev|amanbhagat17089/iu);
  assert.equal(publicDocumentUrl(realPage), "https://learn.studywudy.example/cbse/class-10");
  assert.equal(rewritePublicInfrastructureOrigin(`Sitemap: ${TEMPORARY_DEPLOYMENT_ORIGIN}/sitemap.xml`, realPage), "Sitemap: https://learn.studywudy.example/sitemap.xml");
  assert.equal(rewritePublicAssetPath("/boardly-media/example.png"), "/studywudy-media/example.png");
});

test("brand inspector separates legitimate preview origins from public-copy and real-domain leaks", () => {
  assert.deepEqual(inspectPublicBrandHtml(cleanHtml(TEMPORARY_DEPLOYMENT_ORIGIN), {
    pageUrl: TEMPORARY_DEPLOYMENT_ORIGIN,
  }).failures, []);

  const dirty = `<!doctype html><html><head><title>Study Wudy</title><link rel="canonical" href="${TEMPORARY_DEPLOYMENT_ORIGIN}/"><script type="application/ld+json">{"name":"Boardly","url":"${TEMPORARY_DEPLOYMENT_ORIGIN}/"}</script></head><body><p>${LEGACY_HOMEPAGE_COPY}</p><span title="Boardly pattern A">A</span><img src="/boardly-media/a.png" alt="Diagram"></body></html>`;
  const inspection = inspectPublicBrandHtml(dirty, { pageUrl: "https://learn.studywudy.example/" });
  assert.ok(inspection.failures.includes("public copy contains Boardly"));
  assert.ok(inspection.failures.includes("public copy contains Study Wudy"));
  assert.ok(inspection.failures.includes("metadata/JSON-LD contains workers.dev"));
  assert.ok(inspection.failures.includes("public asset URL contains Boardly"));
});

test("committed homepage output contains the requested sentence and no public brand leak", () => {
  const html = readFileSync(new URL("../comparison/after-assets/index.html", import.meta.url), "utf8");
  assert.ok(html.includes(PUBLIC_BRAND_REPLACEMENT));
  assert.ok(!html.includes(LEGACY_HOMEPAGE_COPY));
  const crawlerText = extractCrawlerVisibleText(html);
  assert.equal(crawlerText.split(PUBLIC_BRAND_REPLACEMENT).length - 1, 1);
  assert.match(crawlerText, /One system, every question/u);
  assert.deepEqual(inspectPublicBrandHtml(html, { pageUrl: TEMPORARY_DEPLOYMENT_ORIGIN }).failures, []);
});

test("production smoke checks representative HTML, JSON-LD, robots and sitemap responses", async () => {
  const origin = "https://deployment.example";
  const requests = [];
  const results = await smokePublicBrandHygiene({
    deploymentUrl: origin,
    interRequestDelayMs: 0,
    fetchImpl: async (url) => {
      requests.push(url.toString());
      const pathname = new URL(url).pathname;
      const body = PUBLIC_BRAND_DISCOVERY_ROUTES.includes(pathname)
        ? pathname === "/robots.txt"
          ? `User-Agent: *\nSitemap: ${origin}/sitemap.xml\n`
          : `<?xml version="1.0"?><sitemapindex><loc>${origin}/sitemaps/questions.xml.gz</loc></sitemapindex>`
        : cleanHtml(origin);
      return new Response(body, {
        status: 200,
        headers: { "content-type": pathname.endsWith(".xml") ? "application/xml" : "text/html", "x-studywudy-brand-hygiene": PUBLIC_BRAND_HYGIENE_RELEASE },
      });
    },
  });
  assert.equal(results.length, PUBLIC_BRAND_HTML_ROUTES.length + PUBLIC_BRAND_DISCOVERY_ROUTES.length);
  assert.equal(requests.length, results.length);
});

test("the Worker homepage rewrite preserves the eyebrow and targets only descriptive copy", () => {
  const source = readFileSync(new URL("../comparison/after-worker.js", import.meta.url), "utf8");
  assert.match(source, /\.section-heading\.centered-heading > p:not\(\.eyebrow\)/u);
  assert.doesNotMatch(source, /\.on\("\.section-heading\.centered-heading > p",/u);
});
