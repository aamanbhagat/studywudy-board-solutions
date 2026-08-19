#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "/Users/aman/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const origin = process.env.STUDYWUDY_ORIGIN ?? "http://127.0.0.1:8789";
const outputPath = process.env.PHASE1_KEYBOARD_OUTPUT ?? "audits/phase-1/keyboard-qa.json";
const browserExecutable = process.env.CHROME_PATH ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";

const pages = [
  ["homepage", "/"],
  ["search", "/search?q=electrostatics"],
  ["question-mcq", "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-001"],
  ["question-numerical", "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-027"],
];
const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
];

const browser = await chromium.launch({ executablePath: browserExecutable, headless: true });
const runs = [];

for (const [template, path] of pages) {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    await context.addInitScript(() => localStorage.setItem("studywudy-theme", "light"));
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
    page.on("pageerror", (error) => runtimeErrors.push(String(error)));
    const response = await page.goto(`${origin}${path}`, { waitUntil: "load", timeout: 45_000 });
    await page.waitForTimeout(1_000);

    const sequence = [];
    const fingerprints = new Map();
    for (let index = 0; index < 60; index += 1) {
      await page.keyboard.press("Tab");
      await page.waitForTimeout(20);
      const focus = await page.evaluate(() => {
        const element = document.activeElement;
        if (!element || element === document.body) return null;
        const style = getComputedStyle(element);
        const label = element.getAttribute("aria-label")
          || (element.labels?.length ? [...element.labels].map((item) => item.textContent?.trim()).join(" ") : "")
          || element.textContent?.trim()
          || element.getAttribute("title")
          || element.getAttribute("placeholder")
          || "";
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id,
          classes: [...element.classList],
          label,
          href: element.getAttribute("href"),
          inHeader: Boolean(element.closest(".site-header")),
          isThemeToggle: element.hasAttribute("data-studywudy-theme-toggle"),
          isSearchInput: element.matches('.search-form input[type="search"], .search-form input[name="q"]'),
          isSearchButton: element.matches('.search-form button[type="submit"]'),
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          boxShadow: style.boxShadow,
        };
      });
      if (!focus) continue;
      const fingerprint = `${focus.tag}|${focus.id}|${focus.classes.join(".")}|${focus.href}|${focus.label}`;
      fingerprints.set(fingerprint, (fingerprints.get(fingerprint) ?? 0) + 1);
      if (fingerprints.get(fingerprint) > 1) break;
      sequence.push(focus);
    }

    const state = await page.evaluate(() => ({
      visibleDesktopNav: [...document.querySelectorAll(".desktop-nav a")].some((element) => element.getBoundingClientRect().width > 0),
      mcqOptionCount: document.querySelectorAll(".choice-list li").length,
      mcqOptionButtonCount: document.querySelectorAll(".choice-list button").length,
      tabRoleCount: document.querySelectorAll('[role="tab"], [role="tablist"]').length,
      focusableDemoLabels: document.querySelectorAll('.demo-tabs [tabindex], .demo-tabs button, .demo-tabs [role="tab"]').length,
    }));

    const failures = [];
    if (response?.status() !== 200) failures.push(`status ${response?.status()}`);
    if (runtimeErrors.length) failures.push(`${runtimeErrors.length} runtime errors`);
    if (!sequence.some((item) => item.inHeader)) failures.push("header navigation is not keyboard reachable");
    if (!sequence.some((item) => item.isThemeToggle)) failures.push("theme toggle is not keyboard reachable");
    for (const item of sequence) {
      if (!item.label) failures.push(`unnamed keyboard target: ${item.tag}.${item.classes.join(".")}`);
      const outlineWidth = Number.parseFloat(item.outlineWidth) || 0;
      if (!item.isSearchInput && (item.outlineStyle === "none" || outlineWidth < 2) && item.boxShadow === "none") {
        failures.push(`no visible focus indicator: ${item.tag}.${item.classes.join(".")}`);
      }
    }

    if (template === "search") {
      if (!sequence.some((item) => item.isSearchInput)) failures.push("search input is not in the tab order");
      if (!sequence.some((item) => item.isSearchButton)) failures.push("search submit button is not in the tab order");
      const searchInput = page.locator('.search-form input[name="q"]');
      await searchInput.focus();
      await page.waitForTimeout(50);
      const searchFocus = await searchInput.evaluate((element) => {
        const style = getComputedStyle(element);
        return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) || 0 };
      });
      if (searchFocus.outlineStyle === "none" || searchFocus.outlineWidth < 2) failures.push("search input has no visible focus indicator");
      await searchInput.fill("electrostatics");
      await Promise.all([
        page.waitForNavigation({ waitUntil: "load", timeout: 45_000 }),
        page.keyboard.press("Enter"),
      ]);
      if (!new URL(page.url()).searchParams.get("q")) failures.push("keyboard search submission lost the query");
    }

    if (template === "question-mcq") {
      if (!state.mcqOptionCount) failures.push("MCQ options are missing");
      if (state.mcqOptionButtonCount) failures.push("read-only answer options unexpectedly expose quiz buttons");
    }
    if (template.startsWith("question") && state.tabRoleCount) failures.push("question page exposes undocumented solution tabs");
    if (template === "homepage" && state.focusableDemoLabels) failures.push("illustrative homepage answer labels are falsely keyboard-focusable");

    const themeToggle = page.locator("[data-studywudy-theme-toggle]");
    await themeToggle.focus();
    await page.keyboard.press("Space");
    const toggled = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      label: document.querySelector("[data-studywudy-theme-toggle]")?.getAttribute("aria-label"),
      pressed: document.querySelector("[data-studywudy-theme-toggle]")?.getAttribute("aria-pressed"),
    }));
    if (toggled.theme !== "dark" || toggled.pressed !== "true" || toggled.label !== "Switch to light mode") {
      failures.push("theme toggle did not activate correctly from the keyboard");
    }

    runs.push({ template, path, viewport, status: response?.status() ?? null, sequence, state, toggled, runtimeErrors, failures });
    process.stdout.write(`${template.padEnd(20)} ${String(viewport.width).padStart(4)}px targets=${String(sequence.length).padStart(2)} failures=${failures.length}\n`);
    await context.close();
  }
}

await browser.close();
const report = {
  capturedAt: new Date().toISOString(),
  origin,
  interpretation: {
    mcq: "Options on published solution pages are read-only answer content, not an interactive quiz; no MCQ option buttons exist.",
    solutionTabs: "No live question format exposes a tablist. Homepage labels are a non-interactive illustrative group and are removed from the tab order.",
  },
  runs,
  failures: runs.flatMap((run) => run.failures.map((failure) => ({ template: run.template, viewport: run.viewport, failure }))),
};
await mkdir(new URL("../audits/phase-1/", import.meta.url), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`wrote ${outputPath}; failures=${report.failures.length}`);
process.exitCode = report.failures.length ? 1 : 0;
