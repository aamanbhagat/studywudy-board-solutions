import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ACCOUNTANCY_SAMPLE_PATH,
  ACCOUNTANCY_SAMPLE_TITLE,
  HOMEPAGE_DOCUMENT_TITLE,
  PUBLIC_TITLE_QUALITY_RELEASE,
  inspectPublicTitle,
  metadataTitleFromHtml,
  titleFromHtml,
} from "../public-title-quality.mjs";
import {
  PUBLIC_TITLE_ROUTES,
  smokePublicTitleQuality,
} from "../scripts/public-title-quality-smoke.mjs";

function htmlWithTitle(title, { homepage = false } = {}) {
  const social = homepage
    ? `<meta property="og:title" content="${title}"><meta name="twitter:title" content="${title}">`
    : "";
  return `<!doctype html><html><head><title>${title}</title>${social}</head><body></body></html>`;
}

test("public title inspector accepts the descriptive homepage and statement-specific Accountancy title", () => {
  const homepage = htmlWithTitle(HOMEPAGE_DOCUMENT_TITLE, { homepage: true });
  assert.equal(titleFromHtml(homepage), HOMEPAGE_DOCUMENT_TITLE);
  assert.equal(metadataTitleFromHtml(homepage, "og:title"), HOMEPAGE_DOCUMENT_TITLE);
  assert.deepEqual(inspectPublicTitle({ html: homepage, pathname: "/" }).failures, []);

  const question = htmlWithTitle(ACCOUNTANCY_SAMPLE_TITLE);
  assert.deepEqual(inspectPublicTitle({
    html: question,
    pathname: ACCOUNTANCY_SAMPLE_PATH,
    privateRowId: 39_148,
  }).failures, []);
});

test("public title inspector rejects generic fragments, private IDs and stale social metadata", () => {
  const homepage = htmlWithTitle(HOMEPAGE_DOCUMENT_TITLE, { homepage: true })
    .replace(`content="${HOMEPAGE_DOCUMENT_TITLE}"`, 'content="Textbook answers, made clear"');
  assert.match(inspectPublicTitle({ html: homepage, pathname: "/" }).failures.join("; "), /Open Graph/u);

  const weak = htmlWithTitle("whether the following… Answer – Class 12 Accountancy Ch 1 · Q1 · 39148 | StudyWudy");
  const failures = inspectPublicTitle({ html: weak, pathname: ACCOUNTANCY_SAMPLE_PATH, privateRowId: 39_148 }).failures;
  assert.ok(failures.includes("Accountancy sample title is not question-specific"));
  assert.ok(failures.includes("title starts with a generic instruction fragment"));
  assert.ok(failures.includes("title exposes a private database row ID"));
});

test("committed homepage output carries the descriptive document and social titles", () => {
  const html = readFileSync(new URL("../comparison/after-assets/index.html", import.meta.url), "utf8");
  assert.deepEqual(inspectPublicTitle({ html, pathname: "/" }).failures, []);
});

test("production smoke checks the homepage and sampled Accountancy response", async () => {
  const requests = [];
  const results = await smokePublicTitleQuality({
    deploymentUrl: "https://deployment.example",
    interRequestDelayMs: 0,
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      requests.push(pathname);
      const title = pathname === "/" ? HOMEPAGE_DOCUMENT_TITLE : ACCOUNTANCY_SAMPLE_TITLE;
      return new Response(htmlWithTitle(title, { homepage: pathname === "/" }), {
        status: 200,
        headers: {
          "content-type": "text/html",
          "x-studywudy-public-title": PUBLIC_TITLE_QUALITY_RELEASE,
        },
      });
    },
  });
  assert.deepEqual(requests, PUBLIC_TITLE_ROUTES);
  assert.equal(results.length, 2);
});
