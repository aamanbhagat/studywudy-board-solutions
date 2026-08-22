import { extractCrawlerVisibleText } from "./crawler-visible-text.mjs";

export const BOARD_HUB_SSR_RELEASE = "board-hub-complete-html-v2";

export const BOARD_HUB_ASSERTIONS = Object.freeze({
  "/cbse": Object.freeze([
    'href="/cbse/class-1"',
    'href="/cbse/class-10"',
    'href="/cbse/class-12"',
    "Select your class",
    "© 2026 StudyWudy",
  ]),
  "/maharashtra-board": Object.freeze([
    'href="/maharashtra-board/class-5"',
    'href="/maharashtra-board/class-10"',
    'href="/maharashtra-board/class-12"',
    "Select your class",
    "© 2026 StudyWudy",
  ]),
});

export const CBSE_CLASS_PATHS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => `/cbse/class-${index + 1}`),
);

export const CBSE_SERVER_CLASS_NAVIGATION = `<nav class="cbse-server-class-nav" aria-label="Browse CBSE classes" data-studywudy-board-ssr="direct-class-links-v1">${CBSE_CLASS_PATHS.map((pathname, index) => `<a href="${pathname}">CBSE Class ${index + 1}</a>`).join("")}</nav>`;

export const CBSE_SERVER_BOARD_VALUE = '<span class="course-finder-board-value" aria-label="Selected education board">CBSE</span>';

export const CBSE_SERVER_RENDERED_STYLES = `<style data-studywudy-board-ssr="cbse-v1">
.cbse-server-class-nav{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:1rem}
.cbse-server-class-nav a{border:1px solid var(--ink);border-radius:999px;background:var(--paper);padding:.42rem .68rem;font-size:.65rem;font-weight:850}
.cbse-server-class-nav a:hover,.cbse-server-class-nav a:focus-visible{background:var(--gold-soft);text-decoration:underline;text-underline-offset:2px}
.course-finder-board-value{box-sizing:border-box;border:2px solid var(--ink);width:100%;min-width:0;height:48px;color:var(--ink);box-shadow:2px 3px 0 var(--ink);background:var(--paper);border-radius:4px;align-items:center;padding:0 12px;font-size:.69rem;font-weight:850;display:flex}
@media(max-width:540px){.cbse-server-class-nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.cbse-server-class-nav a{text-align:center}.course-finder-board-value{height:43px;font-size:.66rem}}
</style>`;

const CBSE_SUPPORTING_TEXT = Object.freeze([
  "Select your class",
  "CBSE solutions and NCERT textbook answers by class",
  "official NCERT textbook portal",
  "CBSE Academic",
  "Frequently asked questions",
]);

export function inspectCbseBoardLandingHtml(renderedHtml) {
  const html = String(renderedHtml || "");
  const crawlerText = extractCrawlerVisibleText(html);
  const failures = [];
  const navStart = html.indexOf('aria-label="Browse CBSE classes"');
  const boardValueStart = html.indexOf('class="course-finder-board-value"');
  const gradeGridStart = html.indexOf('class="grade-grid"');

  if (navStart < 0) failures.push("server-rendered CBSE class navigation is missing");
  if (boardValueStart < 0 || /<input\b[^>]*aria-label=["']Selected education board["']/iu.test(html)) {
    failures.push("the board value is still an interactive-only input");
  }
  if (navStart >= 0 && boardValueStart >= 0 && navStart > boardValueStart) {
    failures.push("direct CBSE links appear after the finder control");
  }

  for (const [index, pathname] of CBSE_CLASS_PATHS.entries()) {
    const anchor = `<a href="${pathname}">CBSE Class ${index + 1}</a>`;
    if (!html.includes(anchor)) failures.push(`${pathname} is missing from the direct server navigation`);
    if (!crawlerText.includes(`CBSE Class ${index + 1}`)) failures.push(`${pathname} has no crawler-visible label`);
    if (gradeGridStart < 0 || html.indexOf(`href="${pathname}"`, gradeGridStart) < 0) {
      failures.push(`${pathname} is missing from the server-rendered class cards`);
    }
  }

  if (!html.includes('href="/cbse/class-10/science"')) failures.push("the server-rendered subject link is missing");
  for (const expectedText of CBSE_SUPPORTING_TEXT) {
    if (!crawlerText.includes(expectedText)) failures.push(`supporting content is missing: ${expectedText}`);
  }
  if (!/<footer\b[^>]*class=["'][^"']*site-footer/iu.test(html)
    || !crawlerText.includes("Privacy Policy")
    || !crawlerText.includes("Contact Us")) {
    failures.push("the normal footer is not crawler-visible");
  }
  if (!/<\/body>\s*<\/html>\s*$/iu.test(html)) failures.push("the HTML response is truncated");

  return Object.freeze({
    crawlerText,
    failures: Object.freeze([...new Set(failures)]),
  });
}

export function inspectBoardHubHtml(pathname, renderedHtml) {
  const route = String(pathname || "").replace(/\/+$/u, "") || "/";
  const expectedStrings = BOARD_HUB_ASSERTIONS[route];
  if (!expectedStrings) throw new Error(`Unsupported board hub assertion route: ${route}`);
  const html = String(renderedHtml || "");
  const crawlerText = extractCrawlerVisibleText(html);
  const failures = route === "/cbse"
    ? [...inspectCbseBoardLandingHtml(html).failures]
    : [];

  for (const expected of expectedStrings) {
    if (!html.includes(expected) && !crawlerText.includes(expected)) {
      failures.push(`${route} is missing SSR content: ${expected}`);
    }
  }
  if (!/<main\b/iu.test(html)) failures.push(`${route} is missing its server-rendered main content`);
  if (!/<footer\b[^>]*class=["'][^"']*site-footer/iu.test(html)) failures.push(`${route} is missing its server-rendered footer`);
  if (!/<\/body>\s*<\/html>\s*$/iu.test(html)) failures.push(`${route} returned partial or truncated HTML`);

  return Object.freeze({
    route,
    crawlerText,
    failures: Object.freeze([...new Set(failures)]),
  });
}
