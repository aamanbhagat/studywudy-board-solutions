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
      solutionTabLists: document.querySelectorAll(".solution-body .solution-tab-list").length,
      solutionTabs: document.querySelectorAll(".solution-body .solution-tab").length,
      solutionPanels: document.querySelectorAll(".solution-body .solution-tab-panel").length,
      // The panels ship visible; only the runtime hides the inactive ones. If a
      // panel were ever absent from the DOM the answer text would be JS-gated.
      solutionPanelText: [...document.querySelectorAll(".solution-body .solution-tab-panel")]
        .map((panel) => panel.textContent.trim().length),
      themeTogglePresent: Boolean(document.querySelector("[data-studywudy-theme-toggle]")),
    }));

    const failures = [];
    if (response?.status() !== 200) failures.push(`status ${response?.status()}`);
    if (runtimeErrors.length) failures.push(`${runtimeErrors.length} runtime errors`);
    if (!sequence.some((item) => item.inHeader)) failures.push("header navigation is not keyboard reachable");
    if (state.themeTogglePresent && !sequence.some((item) => item.isThemeToggle)) failures.push("theme toggle is not keyboard reachable");
    // `outline-style: auto` is the browser's own focus ring. Chromium reports its
    // computed width as either 1px or 3px for the same element from one run to the
    // next, so measuring the width there flags a perfectly visible ring about half
    // the time; only an authored outline gets the width test.
    const hasVisibleFocusRing = (item) => item.boxShadow !== "none"
      || item.outlineStyle === "auto"
      || (item.outlineStyle !== "none" && (Number.parseFloat(item.outlineWidth) || 0) >= 2);
    for (const item of sequence) {
      if (!item.label) failures.push(`unnamed keyboard target: ${item.tag}.${item.classes.join(".")}`);
      if (!item.isSearchInput && !hasVisibleFocusRing(item)) {
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
        return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow };
      });
      if (!hasVisibleFocusRing(searchFocus)) failures.push("search input has no visible focus indicator");
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
    // The solution pane ships its answer views as a tabset. Every panel is in the
    // DOM and carries its text before solution-tabs.js runs, so the checks below
    // are about the keyboard contract, not about whether the answer is present.
    let solutionTabKeyboard = null;
    if (template.startsWith("question") && state.solutionTabLists) {
      if (state.solutionTabs !== state.solutionPanels) failures.push(`solution tabset has ${state.solutionTabs} labels for ${state.solutionPanels} panels`);
      if (state.solutionPanelText.some((length) => !length)) failures.push("a solution panel rendered with no text");
      if (!state.tabRoleCount) failures.push("solution tabset was never promoted to a tablist");

      const tabs = page.locator(".solution-body .solution-tab");
      await tabs.first().focus();
      const focusedFirst = await page.evaluate(() => document.activeElement?.dataset.solutionTab ?? null);
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(50);
      solutionTabKeyboard = await page.evaluate(() => {
        const list = document.querySelector(".solution-body .solution-tab-list");
        const all = [...document.querySelectorAll(".solution-body .solution-tab")];
        const active = document.querySelector(".solution-body .solution-tab.is-active");
        return {
          listRole: list?.getAttribute("role") ?? null,
          focused: document.activeElement?.dataset.solutionTab ?? null,
          activeTab: active?.dataset.solutionTab ?? null,
          selected: all.filter((tab) => tab.getAttribute("aria-selected") === "true").length,
          // Roving tabindex: exactly one tab in the tab order at a time.
          inTabOrder: all.filter((tab) => tab.tabIndex === 0).length,
          activePanels: document.querySelectorAll(".solution-body .solution-tab-panel.is-active").length,
          visiblePanels: [...document.querySelectorAll(".solution-body .solution-tab-panel")]
            .filter((panel) => panel.getBoundingClientRect().height > 0).length,
        };
      });
      solutionTabKeyboard.focusedBeforeArrow = focusedFirst;
      if (solutionTabKeyboard.listRole !== "tablist") failures.push("solution tab list is not exposed as a tablist");
      if (solutionTabKeyboard.focused === focusedFirst) failures.push("ArrowRight did not move focus between solution tabs");
      if (solutionTabKeyboard.focused !== solutionTabKeyboard.activeTab) failures.push("arrow-key focus and the active solution panel disagree");
      if (solutionTabKeyboard.selected !== 1) failures.push(`${solutionTabKeyboard.selected} solution tabs report aria-selected="true"`);
      if (solutionTabKeyboard.inTabOrder !== 1) failures.push(`${solutionTabKeyboard.inTabOrder} solution tabs are in the tab order`);
      if (solutionTabKeyboard.activePanels !== 1) failures.push(`${solutionTabKeyboard.activePanels} solution panels are active`);
      if (solutionTabKeyboard.visiblePanels !== 1) failures.push(`${solutionTabKeyboard.visiblePanels} solution panels are visible after enhancement`);
    }
    if (template === "homepage" && state.focusableDemoLabels) failures.push("illustrative homepage answer labels are falsely keyboard-focusable");

    // The theme toggle was retired from the shipped header after this audit was
    // written; record its absence rather than failing on it, and keep the
    // keyboard contract checked for as long as the control exists.
    let toggled = null;
    if (state.themeTogglePresent) {
      const themeToggle = page.locator("[data-studywudy-theme-toggle]");
      await themeToggle.focus();
      await page.keyboard.press("Space");
      toggled = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        label: document.querySelector("[data-studywudy-theme-toggle]")?.getAttribute("aria-label"),
        pressed: document.querySelector("[data-studywudy-theme-toggle]")?.getAttribute("aria-pressed"),
      }));
      if (toggled.theme !== "dark" || toggled.pressed !== "true" || toggled.label !== "Switch to light mode") {
        failures.push("theme toggle did not activate correctly from the keyboard");
      }
    }

    runs.push({ template, path, viewport, status: response?.status() ?? null, sequence, state, solutionTabKeyboard, toggled, runtimeErrors, failures });
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
    solutionTabs: "Question pages render their answer views as a tabset inside the existing .solution-body. Every panel ships visible and in source order, and solution-tabs.js then promotes the labels to a tablist with roving tabindex and arrow-key navigation. A question with a single available view renders no tablist. Homepage labels remain a non-interactive illustrative group and stay out of the tab order.",
    themeToggle: "The header theme toggle was retired after this audit was first written; runs record themeTogglePresent so its absence is visible rather than silently passing.",
  },
  runs,
  failures: runs.flatMap((run) => run.failures.map((failure) => ({ template: run.template, viewport: run.viewport, failure }))),
};
await mkdir(new URL("../audits/phase-1/", import.meta.url), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`wrote ${outputPath}; failures=${report.failures.length}`);
process.exitCode = report.failures.length ? 1 : 0;
