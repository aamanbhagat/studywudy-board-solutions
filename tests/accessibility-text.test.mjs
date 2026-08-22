import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ACCESSIBILITY_TEXT_RELEASE,
  extractAssistiveText,
  inspectAccessibilityHtml,
} from "../accessibility-text.mjs";
import { STUDY_CLUSTER_BASE } from "../study-cluster.mjs";
import { STUDY_CLUSTER_RUNTIME_PAGES } from "../study-cluster-runtime.mjs";
import {
  ACCESSIBILITY_TEXT_ROUTES,
  smokeAccessibilityText,
} from "../scripts/accessibility-text-smoke.mjs";

const CLEAN_SHELL = `<!doctype html><html><body>
  <a aria-label="StudyWudy" class="brand" href="/"><span aria-hidden="true" class="brand-mark" data-nosnippet></span><span>Study<span>Wudy</span></span></a>
  <a class="board-card" href="/maharashtra-board"><div aria-hidden="true" class="board-card-meta" data-nosnippet><small data-label="Maharashtra"></small><span data-label="Maharashtra"></span></div><h2>Maharashtra State Board</h2><p>English medium</p></a>
  <section><div aria-hidden="true" class="study-field-art" data-nosnippet><b aria-hidden="true">+</b><i aria-hidden="true"></i><b aria-hidden="true">−</b></div><h1>Electrostatics revision</h1></section>
</body></html>`;

test("assistive text uses the explicit logo label and excludes decorative descendants", () => {
  const text = extractAssistiveText(CLEAN_SHELL);
  assert.match(text, /^StudyWudy Maharashtra State Board English medium Electrostatics revision$/u);
  assert.doesNotMatch(text, /SStudyWudy|\+−|Maharashtra\s+Maharashtra/u);
  const inspection = inspectAccessibilityHtml(CLEAN_SHELL);
  assert.doesNotMatch(inspection.crawlerText, /SStudyWudy|\+−|Maharashtra\s+Maharashtra/u);
  assert.doesNotMatch(inspection.domText, /SStudyWudy|Maharashtra\s+Maharashtra/u);
  assert.deepEqual(inspection.failures, []);
});

test("aria-hidden alone cannot mask duplicate labels from crawler text", () => {
  const dirty = `<!doctype html><html><body>
    <a aria-label="StudyWudy" class="brand" href="/"><span aria-hidden="true" class="brand-mark">S</span><span>StudyWudy</span></a>
  </body></html>`;
  const failures = inspectAccessibilityHtml(dirty).failures;
  assert.ok(failures.includes("brand monogram is snippet-visible"));
  assert.ok(failures.includes("crawler text contains duplicated logo monogram"));
});

test("accessibility inspector rejects every reported decorative-label regression", () => {
  const dirty = `<!doctype html><html><body>
    <a class="brand" href="/"><span class="brand-mark">S</span><span>StudyWudy</span></a>
    <div class="board-card-meta"><small>India</small><span>CBSE</span></div>
    <div aria-hidden="true" class="study-field-art"><b>+</b><b>−</b></div>
  </body></html>`;
  const failures = inspectAccessibilityHtml(dirty).failures;
  assert.ok(failures.includes("brand link is missing aria-label=StudyWudy"));
  assert.ok(failures.includes("brand monogram is exposed"));
  assert.ok(failures.includes("board badge row is exposed"));
  assert.ok(failures.includes("charge-decoration child is not directly hidden"));
  assert.ok(failures.includes("assistive text contains duplicated logo monogram"));
  assert.ok(failures.includes("assistive text contains decorative CBSE region badge"));
});

test("committed homepage and generated study pages satisfy the accessible-name contract", () => {
  const homepage = readFileSync(new URL("../comparison/after-assets/index.html", import.meta.url), "utf8");
  assert.deepEqual(inspectAccessibilityHtml(homepage).failures, []);

  for (const pathname of [
    `${STUDY_CLUSTER_BASE}/revision`,
    `${STUDY_CLUSTER_BASE}/concepts/coulombs-law`,
  ]) {
    const page = STUDY_CLUSTER_RUNTIME_PAGES[pathname];
    assert.ok(page, `${pathname} should be generated`);
    assert.deepEqual(inspectAccessibilityHtml(page.html).failures, []);
  }
});

test("production smoke requests the homepage, revision and concept pages", async () => {
  const requests = [];
  const results = await smokeAccessibilityText({
    deploymentUrl: "https://deployment.example",
    interRequestDelayMs: 0,
    fetchImpl: async (url) => {
      requests.push(new URL(url).pathname);
      return new Response(CLEAN_SHELL, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-studywudy-accessibility-text": ACCESSIBILITY_TEXT_RELEASE,
        },
      });
    },
  });
  assert.deepEqual(requests, ACCESSIBILITY_TEXT_ROUTES);
  assert.equal(results.length, ACCESSIBILITY_TEXT_ROUTES.length);
});
