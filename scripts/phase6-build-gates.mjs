import { access, mkdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { PHASE6_CRAWL } from "../phase6-crawl.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const origin = "http://127.0.0.1:8796";
const assetVersion = "20260819-all-questions-indexable-v7";
const environment = { ...process.env, PHASE6_GATE_ORIGIN: origin };
const browserCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];
for (const candidate of browserCandidates) {
  try {
    await access(candidate, constants.X_OK);
    environment.CHROME_PATH = environment.CHROME_PATH || candidate;
    break;
  } catch {}
}

await mkdir(resolve(root, "audits/phase-6/lighthouse"), { recursive: true });

function run(command, arguments_, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, arguments_, { cwd: root, env: environment, stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${arguments_.join(" ")} exited with ${code ?? signal}`));
    });
  });
}

const server = spawn("pnpm", ["exec", "wrangler", "dev", "--config", "wrangler.after.jsonc", "--port", "8796", "--local", "--persist-to", "comparison/after-persistence"], {
  cwd: root,
  env: environment,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.pipe(process.stdout);
server.stderr.pipe(process.stderr);

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Wrangler exited before the gate server became ready (${server.exitCode})`);
    try {
      const response = await fetch(`${origin}/maharashtra-board/class-12/physics`, { headers: { accept: "text/html" } });
      if (response.ok) return;
    } catch {}
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 750));
  }
  throw new Error("Timed out waiting for the Phase 6 gate server");
}

async function verifyRumPipeline() {
  const page = `${origin}/boards`;
  const htmlResponse = await fetch(page, { headers: { accept: "text/html" } });
  const html = await htmlResponse.text();
  if (!htmlResponse.ok) throw new Error(`RUM smoke-test page returned HTTP ${htmlResponse.status}`);
  if (!html.includes('data-phase6-rum="library"') || !html.includes('data-phase6-rum="client"')) {
    throw new Error("RUM client scripts were not injected into the index template");
  }
  const rumClient = await (await fetch(`${origin}/monitoring/rum.js`)).text();
  if (!rumClient.includes("navigator.webdriver") || !rumClient.includes("HeadlessChrome") || !rumClient.includes("__sw_lab")) {
    throw new Error("RUM client does not exclude Lighthouse and browser-automation sessions from field data");
  }

  const valid = await fetch(`${origin}/api/monitoring/web-vitals`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      referer: page,
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({ name: "LCP", value: 1_850, delta: 1_850, rating: "good", navigationType: "navigate" }),
  });
  if (valid.status !== 204) throw new Error(`Valid RUM submission returned HTTP ${valid.status}`);

  const crossOrigin = await fetch(`${origin}/api/monitoring/web-vitals`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://example.invalid",
      referer: "https://example.invalid/",
      "sec-fetch-site": "cross-site",
    },
    body: JSON.stringify({ name: "CLS", value: 0, delta: 0, rating: "good", navigationType: "navigate" }),
  });
  if (crossOrigin.status !== 403) throw new Error(`Cross-origin RUM submission returned HTTP ${crossOrigin.status}, expected 403`);

  const invalid = await fetch(`${origin}/api/monitoring/web-vitals`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, referer: page },
    body: JSON.stringify({ name: "FCP", value: 100, delta: 100, rating: "good", navigationType: "navigate" }),
  });
  if (invalid.status !== 400) throw new Error(`Invalid RUM metric returned HTTP ${invalid.status}, expected 400`);
  console.log("PASS: RUM scripts injected; valid metrics accepted; cross-origin and unsupported metrics rejected.");
}

async function verifyRecurringCrawlConfiguration() {
  const [configuration, source] = await Promise.all([
    readFile(resolve(root, "wrangler.production.jsonc"), "utf8"),
    readFile(resolve(root, "phase6-crawl.mjs"), "utf8"),
  ]);
  if (PHASE6_CRAWL.consumerBatchSize !== 5
    || PHASE6_CRAWL.maxConsumerConcurrency !== 1
    || PHASE6_CRAWL.shardCount !== 48
    || PHASE6_CRAWL.fullCoverageDays !== 48
    || !configuration.includes('"17 2 * * *"')
    || !configuration.includes('"max_batch_size": 5')
    || !configuration.includes('"max_concurrency": 1')
    || !source.includes("valid.filter((url) => belongsToRunShard(url, body.runId))")) {
    throw new Error("The recurring crawl is not safely sharded and batch-limited for the production Queue allowance");
  }
  console.log("PASS: recurring crawl uses one of 48 daily corpus shards with batch size 5 and concurrency 1.");
}

async function verifyUiRegressions() {
  const homepageResponse = await fetch(`${origin}/`, { headers: { accept: "text/html" } });
  const homepage = await homepageResponse.text();
  if (!homepageResponse.ok) throw new Error(`Homepage UI smoke test returned HTTP ${homepageResponse.status}`);
  if (homepageResponse.headers.get("permissions-policy") !== "camera=(), microphone=(), geolocation=()") {
    throw new Error("The production-safe Permissions-Policy header is missing or contains unsupported directives");
  }
  const fontStylesheet = await (await fetch(`${origin}/_next/static/chunks/1j8ahw0e9ui5v.css`)).text();
  if (!fontStylesheet.includes("font-display:swap") || fontStylesheet.includes("font-display:optional")) {
    throw new Error("Self-hosted IBM Plex font faces must use font-display: swap");
  }
  if (homepage.includes("data-studywudy-theme") || homepage.includes("/theme.js") || homepage.includes("data-theme=")) {
    throw new Error("Dark-mode assets or state are still present in homepage HTML");
  }
  if (!homepage.includes('class="shell explorer-wrap"') || !homepage.includes('id="quick-find"')) {
    throw new Error("The server-rendered homepage board picker is missing or has no stable quick-find anchor");
  }
  if (!homepage.includes(`/navigation-feedback.css?v=${assetVersion}`)
    || !homepage.includes(`/navigation-feedback.js?v=${assetVersion}`)) {
    throw new Error("Sitewide navigation feedback assets are missing from homepage HTML");
  }
  if (!homepage.includes(`/home-finder.js?v=${assetVersion}`)) {
    throw new Error("The hydration-free homepage finder runtime is missing from homepage HTML");
  }
  if (homepage.includes('src="/_next/static/chunks/')) {
    throw new Error("The homepage still ships the mismatched Next.js hydration runtime");
  }
  const navigationTemplatePaths = [
    "/boards",
    "/maharashtra-board/class-12/biology?stream=science",
    "/maharashtra-board/class-12/biology/balbharati-biology-standard-12",
    "/about/methodology",
    "/contact",
  ];
  for (const path of navigationTemplatePaths) {
    const response = await fetch(`${origin}${path}`, { headers: { accept: "text/html" } });
    const html = await response.text();
    if (!response.ok
      || !html.includes(`/navigation-feedback.css?v=${assetVersion}`)
      || !html.includes(`/navigation-feedback.js?v=${assetVersion}`)) {
      throw new Error(`Sitewide navigation feedback assets are missing on ${path}`);
    }
  }
  if (homepage.includes("/quick-find.js") || homepage.includes("/quick-find.css") || homepage.includes('data-studywudy-quick-find="critical"')) {
    throw new Error("The homepage still loads the delayed quick-find replacement");
  }

  const finderTemplatePaths = [
    "/maharashtra-board",
    "/maharashtra-board/class-12",
    "/cbse",
    "/cbse/class-10",
    "/cisce",
    "/cisce/class-10",
    "/tamil-nadu-board",
    "/tamil-nadu-board/class-10",
  ];
  for (const path of finderTemplatePaths) {
    const response = await fetch(`${origin}${path}`, { headers: { accept: "text/html" } });
    const html = await response.text();
    if (!response.ok) throw new Error(`Guided finder template ${path} returned HTTP ${response.status}`);
    if (!html.includes(`/quick-find.js?v=${assetVersion}`)
      || !html.includes(`/quick-find.css?v=${assetVersion}`)
      || !html.includes('data-studywudy-quick-find="critical"')
      || !html.includes(".catalog-section:has(> .course-finder) { margin-top:")) {
      throw new Error(`Guided finder replacement or its first-paint layout reservation is missing on ${path}`);
    }
  }
  const [finderRuntimeResponse, finderStylesResponse] = await Promise.all([
    fetch(`${origin}/quick-find.js?v=${assetVersion}`),
    fetch(`${origin}/quick-find.css?v=${assetVersion}`),
  ]);
  const [finderRuntime, finderStyles] = await Promise.all([
    finderRuntimeResponse.text(),
    finderStylesResponse.text(),
  ]);
  if (!finderRuntimeResponse.ok
    || !finderRuntime.includes("ensureQuickFindCriticalStyle")
    || !finderRuntime.includes("ensureQuickFindStyles")
    || !finderRuntime.includes("quickFindStylesheetHref")
    || !finderRuntime.includes("mutationMayChangeRouteContent(records)")
    || !finderRuntime.includes("subjectToneFor(item.id)")) {
    throw new Error("Guided finder runtime is missing its hydration-safe stylesheet recovery");
  }
  if (!finderStylesResponse.ok
    || finderStyles.includes('.hero:not(:has(+ .qf-section))')
    || !finderStyles.includes('.hero + .explorer-wrap + .section[aria-labelledby="boards-heading"]')
    || !finderStyles.includes(".qf-option-subject")
    || !finderStyles.includes(".qf-subject-tone-emerald")
    || !finderStyles.includes("--qf-subject-accent")) {
    throw new Error("Guided finder stylesheet can still reserve a blank homepage block after client navigation");
  }

  const [navigationRuntimeResponse, navigationStylesResponse] = await Promise.all([
    fetch(`${origin}/navigation-feedback.js?v=${assetVersion}`),
    fetch(`${origin}/navigation-feedback.css?v=${assetVersion}`),
  ]);
  const [navigationRuntime, navigationStyles] = await Promise.all([
    navigationRuntimeResponse.text(),
    navigationStylesResponse.text(),
  ]);
  if (!navigationRuntimeResponse.ok
    || !navigationRuntime.includes("event.preventDefault()")
    || !navigationRuntime.includes("location.assign(destination.url.href)")
    || !navigationRuntime.includes("sw-route-slow")
    || !navigationRuntime.includes("navigationType !== \"traverse\"")) {
    throw new Error("Sitewide navigation runtime is missing document-navigation and feedback safeguards");
  }
  if (!navigationStylesResponse.ok
    || !navigationStyles.includes("@view-transition")
    || !navigationStyles.includes(".sw-route-loader")
    || !navigationStyles.includes("prefers-reduced-motion")) {
    throw new Error("Sitewide navigation feedback styles are incomplete");
  }

  const subjectPath = "/maharashtra-board/class-12/biology?stream=science";
  const subjectResponse = await fetch(`${origin}${subjectPath}`, { headers: { accept: "text/html" } });
  const subject = await subjectResponse.text();
  if (!subjectResponse.ok) throw new Error(`Biology textbook listing returned HTTP ${subjectResponse.status}`);
  const bookPath = "/maharashtra-board/class-12/biology/balbharati-biology-standard-12";
  const coverPath = "/catalog-artwork/books/covers/maharashtra-board/class-12/balbharati-biology-standard-12.webp";
  if (!subject.includes('class="catalog-real-book-cover"') || !subject.includes(coverPath)) {
    throw new Error("The Biology card does not render its real cover in the initial HTML");
  }
  if (!subject.includes(`href="${bookPath}"`)) {
    throw new Error("The Biology book card has no working textbook link");
  }

  const [coverResponse, bookResponse, runtimeResponse] = await Promise.all([
    fetch(`${origin}${coverPath}`),
    fetch(`${origin}${bookPath}`, { headers: { accept: "text/html" } }),
    fetch(`${origin}/catalog-artwork.js?v=${assetVersion}`),
  ]);
  if (!coverResponse.ok || !(coverResponse.headers.get("content-type") || "").startsWith("image/webp")) {
    throw new Error(`Real Biology cover returned HTTP ${coverResponse.status} with ${coverResponse.headers.get("content-type")}`);
  }
  if (!bookResponse.ok) throw new Error(`Linked Biology textbook returned HTTP ${bookResponse.status}`);
  const runtime = await runtimeResponse.text();
  if (!runtimeResponse.ok
    || !runtime.includes("setSubjectCoverSet(card, covers)")
    || !runtime.includes("summary.textContent !== summaryText")
    || !runtime.includes("mutationAffectsArtwork(records)")
    || !runtime.includes("__STUDYWUDY_ARTWORK_RUNTIME_ACTIVE__")
    || runtime.includes("picture.replaceChildren")
    || runtime.includes("new MutationObserver(scheduleArtwork)")) {
    throw new Error("Catalog artwork runtime is missing its idempotent, filtered MutationObserver guards");
  }

  const manifest = JSON.parse(await readFile(resolve(root, "comparison/catalog-artwork-manifest.json"), "utf8"));
  const classGroups = new Map();
  for (const catalogBook of manifest.books) {
    const key = `${catalogBook.board}/${catalogBook.grade}`;
    classGroups.set(key, (classGroups.get(key) || 0) + 1);
  }
  let renderedCoverCount = 0;
  const renderedSources = new Set();
  for (const [classPath] of classGroups) {
    const response = await fetch(`${origin}/${classPath}`, { headers: { accept: "text/html" } });
    const html = await response.text();
    if (!response.ok) throw new Error(`Class cover template /${classPath} returned HTTP ${response.status}`);
    const coverSets = [...html.matchAll(/<span aria-hidden="true" class="catalog-subject-book-covers[^>]*>([\s\S]*?)<\/span>/g)];
    const actualCount = coverSets.reduce((total, match) => {
      for (const image of match[1].matchAll(/<img [^>]*src="([^"]+)"/g)) renderedSources.add(image[1].split("?")[0]);
      return total + (match[1].match(/<img /g) || []).length;
    }, 0);
    if (!actualCount) throw new Error(`Class cover template /${classPath} rendered no textbook covers`);
    renderedCoverCount += actualCount;
  }
  const expectedSources = new Set(manifest.books.map((book) => book.asset_path.replace(/\.jpg$/, ".webp")));
  const missingSources = [...expectedSources].filter((source) => !renderedSources.has(source));
  if (missingSources.length) {
    throw new Error(`Sitewide class templates are missing ${missingSources.length}/${expectedSources.size} distinct textbook covers (first: ${missingSources[0]})`);
  }
  console.log(`PASS: light-only UI, stable finder, working textbook links, and all ${renderedSources.size} distinct covers for ${manifest.books.length} catalog records verified across ${classGroups.size} class templates (${renderedCoverCount} visible placements).`);
}

try {
  await waitForServer();
  await verifyRecurringCrawlConfiguration();
  await verifyRumPipeline();
  await verifyUiRegressions();
  await run(process.execPath, ["scripts/phase6-structured-data-gate.mjs", `--origin=${origin}`]);
  await run("pnpm", ["exec", "lhci", "autorun", "--config=lighthouserc.cjs"]);
} finally {
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolvePromise) => {
      const timeout = setTimeout(() => {
        if (server.exitCode === null) server.kill("SIGKILL");
        resolvePromise();
      }, 5_000);
      server.once("exit", () => {
        clearTimeout(timeout);
        resolvePromise();
      });
    });
  }
}
