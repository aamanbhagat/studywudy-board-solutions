#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "/Users/aman/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const origin = process.env.STUDYWUDY_ORIGIN ?? "http://127.0.0.1:8789";
const axePath = process.env.AXE_PATH;
const outputPath = process.env.PHASE1_BROWSER_OUTPUT ?? "audits/phase-1/browser-qa.json";
const browserExecutable = process.env.CHROME_PATH ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";

const pages = [
  ["homepage", "/"],
  ["board", "/maharashtra-board"],
  ["class", "/maharashtra-board/class-12"],
  ["subject", "/maharashtra-board/class-12/physics"],
  ["chapter", "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics"],
  ["question-mcq", "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-001"],
  ["question-numerical", "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-027"],
  ["question-written", "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-008"],
  ["search", "/search?q=electrostatics"],
];

const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
];
const themes = (process.env.PHASE1_THEMES ?? "light,dark").split(",").map((value) => value.trim()).filter(Boolean);

const browser = await chromium.launch({ executablePath: browserExecutable, headless: true });
const axeSource = axePath ? await readFile(axePath, "utf8") : null;
const runs = [];

for (const [template, path] of pages) {
  for (const viewport of viewports) {
    for (const theme of themes) {
    const context = await browser.newContext({
      viewport,
      colorScheme: theme,
      reducedMotion: "reduce",
    });
    await context.addInitScript((selectedTheme) => {
      localStorage.setItem("studywudy-theme", selectedTheme);
    }, theme);
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const ignoredAbortedPrefetches = [];
    const errorResponses = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("requestfailed", (request) => {
      const failure = { url: request.url(), error: request.failure()?.errorText ?? "unknown" };
      if (failure.error.includes("ERR_ABORTED") && failure.url.includes("_rsc=")) {
        ignoredAbortedPrefetches.push(failure);
      } else {
        failedRequests.push(failure);
      }
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && response.url().startsWith(origin)) {
        errorResponses.push({ url: response.url(), status: response.status() });
      }
    });

    const response = await page.goto(`${origin}${path}`, { waitUntil: "load", timeout: 45_000 });
    await page.waitForTimeout(1_200);

    const dom = await page.evaluate(() => {
      const visible = (element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
      };
      const labelFor = (element) => {
        if (element.labels?.length) return [...element.labels].map((label) => label.textContent?.trim()).join(" ");
        return "";
      };
      const interactives = [...document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="tab"], [role="combobox"]')]
        .filter(visible)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute("role"),
          name: element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || labelFor(element) || element.textContent?.trim() || element.getAttribute("title") || element.getAttribute("placeholder") || "",
          selector: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.classList.length ? `.${[...element.classList].join(".")}` : ""}`,
        }));
      const images = [...document.images].map((image) => ({
        src: image.currentSrc || image.src,
        alt: image.getAttribute("alt"),
        width: image.getAttribute("width"),
        height: image.getAttribute("height"),
      }));
      return {
        title: document.title,
        hydrationText: document.body.innerText.match(/hydration|server rendered HTML|did not match/gi) ?? [],
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        images,
        missingAltImages: images.filter((image) => image.alt === null),
        unnamedInteractives: interactives.filter((item) => !item.name),
        tabRoles: document.querySelectorAll('[role="tab"], [role="tablist"]').length,
        mcqButtons: document.querySelectorAll('.choice-list button, [data-question-type^="mcq"] button').length,
        activeTheme: document.documentElement.dataset.theme,
        themeToggle: (() => {
          const toggle = document.querySelector("[data-studywudy-theme-toggle]");
          return toggle ? {
            label: toggle.getAttribute("aria-label"),
            pressed: toggle.getAttribute("aria-pressed"),
            width: toggle.getBoundingClientRect().width,
            height: toggle.getBoundingClientRect().height,
          } : null;
        })(),
      };
    });

    let axeViolations = [];
    if (axeSource) {
      await page.addScriptTag({ content: axeSource });
      axeViolations = await page.evaluate(async () => {
        const result = await globalThis.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
        });
        return result.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html, summary: node.failureSummary })),
        }));
      });
    }

    runs.push({
      template,
      path,
      viewport,
      theme,
      status: response?.status() ?? null,
      consoleErrors,
      pageErrors,
      failedRequests,
      ignoredAbortedPrefetches,
      errorResponses,
      ...dom,
      axeViolations,
    });
    await context.close();
    process.stdout.write(`${template.padEnd(20)} ${String(viewport.width).padStart(4)}px ${theme.padEnd(5)} status=${response?.status()} errors=${consoleErrors.length + pageErrors.length + failedRequests.length + errorResponses.length} axe=${axeViolations.length}\n`);
    }
  }
}

await browser.close();
await mkdir(new URL("../audits/phase-1/", import.meta.url), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ capturedAt: new Date().toISOString(), origin, axeEnabled: Boolean(axeSource), runs }, null, 2)}\n`);

const failureCount = runs.reduce((count, run) => count
  + run.consoleErrors.length
  + run.pageErrors.length
  + run.failedRequests.length
  + run.errorResponses.length
  + run.unnamedInteractives.length
  + run.missingAltImages.length
  + run.axeViolations.length
  + (run.status === 200 ? 0 : 1)
  + (run.activeTheme === run.theme ? 0 : 1)
  + (run.themeToggle?.width >= 44 && run.themeToggle?.height >= 44 ? 0 : 1)
  + (run.horizontalOverflow > 1 ? 1 : 0), 0);

console.log(`wrote ${outputPath}; unresolved checks=${failureCount}`);
process.exitCode = failureCount ? 1 : 0;
