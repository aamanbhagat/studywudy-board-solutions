import assert from "node:assert/strict";
import test from "node:test";

import {
  BOARD_HUB_ASSERTIONS,
  BOARD_HUB_SSR_RELEASE,
  CBSE_CLASS_PATHS,
  CBSE_SERVER_BOARD_VALUE,
  CBSE_SERVER_CLASS_NAVIGATION,
  inspectBoardHubHtml,
  inspectCbseBoardLandingHtml,
} from "../board-landing-ssr.mjs";
import {
  BOARD_HUB_PATHS,
  BOARD_HUB_SSR_MODES,
  CBSE_BOARD_SSR_MODES,
  smokeBoardHubSsr,
  smokeCbseBoardSsr,
} from "../scripts/board-landing-ssr-smoke.mjs";

function completeCbseFixture() {
  const cards = CBSE_CLASS_PATHS.map((pathname, index) => `<a href="${pathname}">Class ${index + 1}</a>`).join("");
  return `<!doctype html><html><body><main><header class="course-finder-header">Find your study path</header>${CBSE_SERVER_CLASS_NAVIGATION}<form>${CBSE_SERVER_BOARD_VALUE}</form><div class="grade-grid">${cards}<a href="/cbse/class-10/science">CBSE Science</a></div><h2>Select your class</h2><h2>CBSE solutions and NCERT textbook answers by class</h2><a href="https://ncert.nic.in/textbook.php">official NCERT textbook portal</a><a href="https://cbseacademic.nic.in/">CBSE Academic</a><h2>Frequently asked questions</h2></main><footer class="site-footer"><span>© 2026 StudyWudy</span><a href="/privacy">Privacy Policy</a><a href="/contact">Contact Us</a></footer></body></html>`;
}

function completeMaharashtraFixture() {
  return `<!doctype html><html><body><main><h1>Maharashtra Board</h1><h2>Select your class</h2><nav aria-label="Browse Maharashtra Board classes"><a href="/maharashtra-board/class-5">Class 5</a><a href="/maharashtra-board/class-10">Class 10</a><a href="/maharashtra-board/class-12">Class 12</a></nav></main><footer class="site-footer"><span>© 2026 StudyWudy</span></footer></body></html>`;
}

test("CBSE direct navigation is server HTML with all twelve real anchors", () => {
  assert.match(CBSE_SERVER_CLASS_NAVIGATION, /^<nav class="cbse-server-class-nav" aria-label="Browse CBSE classes"/u);
  assert.equal((CBSE_SERVER_CLASS_NAVIGATION.match(/<a href=/gu) || []).length, 12);
  for (const [index, pathname] of CBSE_CLASS_PATHS.entries()) {
    assert.ok(CBSE_SERVER_CLASS_NAVIGATION.includes(`<a href="${pathname}">CBSE Class ${index + 1}</a>`));
  }
});

test("CBSE crawler contract covers navigation, cards, subjects, content and footer", () => {
  const inspection = inspectCbseBoardLandingHtml(completeCbseFixture());
  assert.deepEqual(inspection.failures, []);
  assert.ok(inspection.crawlerText.includes("CBSE Class 10"));
});

test("CBSE crawler contract rejects the reported input cutoff shape", () => {
  const inspection = inspectCbseBoardLandingHtml('<html><body><h2>Find your study path</h2><span>01 Board</span><input aria-label="Selected education board" value="CBSE">');
  assert.ok(inspection.failures.includes("server-rendered CBSE class navigation is missing"));
  assert.ok(inspection.failures.includes("the board value is still an interactive-only input"));
  assert.ok(inspection.failures.includes("the HTML response is truncated"));
});

test("both major board hubs require complete server HTML, direct classes and footer", () => {
  assert.deepEqual(Object.keys(BOARD_HUB_ASSERTIONS), ["/cbse", "/maharashtra-board"]);
  assert.deepEqual(inspectBoardHubHtml("/cbse", completeCbseFixture()).failures, []);
  assert.deepEqual(inspectBoardHubHtml("/maharashtra-board", completeMaharashtraFixture()).failures, []);
  const partial = inspectBoardHubHtml("/maharashtra-board", "<html><body><main>8 classes · 78 subjects ·");
  assert.ok(partial.failures.some((failure) => failure.includes("/maharashtra-board/class-10")));
  assert.ok(partial.failures.some((failure) => failure.includes("partial or truncated HTML")));
});

test("production smoke checks cached HTML and the uncached Worker response", async () => {
  const requests = [];
  const results = await smokeCbseBoardSsr({
    deploymentUrl: "https://deployment.example/ignored",
    fetchImpl: async (url, init) => {
      requests.push({ url: url.toString(), init });
      return new Response(completeCbseFixture(), {
        status: 200,
        headers: { "content-type": "text/html", "x-studywudy-board-ssr": BOARD_HUB_SSR_RELEASE },
      });
    },
  });
  assert.deepEqual(results.map(({ mode }) => mode), CBSE_BOARD_SSR_MODES.map(({ name }) => name));
  assert.ok(requests.every(({ url }) => new URL(url).pathname === "/cbse"));
  assert.deepEqual(requests.map(({ init }) => init.headers.accept), ["text/html", "*/*"]);
});

test("deployment smoke asserts complete cached and uncached HTML for both board hubs", async () => {
  const requests = [];
  const results = await smokeBoardHubSsr({
    deploymentUrl: "https://deployment.example/ignored",
    fetchImpl: async (url, init) => {
      const route = new URL(url).pathname;
      requests.push({ route, init });
      return new Response(route === "/cbse" ? completeCbseFixture() : completeMaharashtraFixture(), {
        status: 200,
        headers: { "content-type": "text/html", "x-studywudy-board-ssr": BOARD_HUB_SSR_RELEASE },
      });
    },
  });
  assert.equal(results.length, BOARD_HUB_PATHS.length * BOARD_HUB_SSR_MODES.length);
  assert.deepEqual(new Set(requests.map(({ route }) => route)), new Set(BOARD_HUB_PATHS));
  assert.deepEqual(new Set(requests.map(({ init }) => init.headers.accept)), new Set(["text/html", "*/*"]));
});
