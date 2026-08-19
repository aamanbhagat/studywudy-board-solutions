#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "/Users/aman/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const origin = process.env.STUDYWUDY_ORIGIN ?? "http://127.0.0.1:8789";
const outputPath = process.env.PHASE1_CONTENT_OUTPUT ?? "audits/phase-1/content-rendering-qa.json";
const executablePath = process.env.CHROME_PATH ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const path = "/cbse/class-11/chemistry/ncert-chemistry-and-2-part-1-class-11/structure-of-atom/questions/q-cbse-ncert-chemistry-and-2-part-1-class-11-2-028";

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const runtimeErrors = [];
const fontResponses = [];
page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
page.on("pageerror", (error) => runtimeErrors.push(String(error)));
page.on("response", (response) => {
  if (/KaTeX_.*\.(?:woff2?|ttf)(?:$|\?)/.test(response.url())) fontResponses.push({ url: response.url(), status: response.status() });
});
const response = await page.goto(`${origin}${path}`, { waitUntil: "networkidle", timeout: 45_000 });

const dom = await page.evaluate(() => {
  const math = (selector) => [...document.querySelectorAll(`${selector} [role="math"]`)].map((node) => ({
    label: node.getAttribute("aria-label"),
    hasSuperscriptStructure: Boolean(node.querySelector(".msupsub")),
    text: node.textContent,
  }));
  const breadcrumbSchema = [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((script) => { try { return JSON.parse(script.textContent); } catch { return null; } })
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .find((value) => value?.["@type"] === "BreadcrumbList");
  return {
    documentTitle: document.title,
    fullBodyMath: math(":is(.question-card, .solution-card)"),
    relatedMath: math(".related-question-copy"),
    breadcrumb: [...document.querySelectorAll(".breadcrumb-list li")].map((item) => ({
      text: item.textContent?.replace(/\s+/g, " ").trim(),
      href: item.querySelector("a")?.getAttribute("href") ?? null,
    })),
    breadcrumbSchema: breadcrumbSchema?.itemListElement ?? null,
    pageRows: [...document.querySelectorAll(".study-context dt")].filter((node) => node.textContent?.trim() === "Page").length,
    emptyPagePlaceholder: [...document.querySelectorAll(".study-context dd")].some((node) => node.textContent?.trim() === "—"),
    liveTabRoles: document.querySelectorAll('[role="tab"], [role="tablist"]').length,
  };
});

const superscriptPattern = /[⁻⁺⁰¹²³⁴⁵⁶⁷⁸⁹]/u;
const fullScientific = dom.fullBodyMath.filter((item) => superscriptPattern.test(item.label ?? ""));
const relatedScientific = dom.relatedMath.filter((item) => superscriptPattern.test(item.label ?? ""));
const expectedBreadcrumb = ["Home", "CBSE", "Class 11", "Chemistry", "NCERT Chemistry and 2 Part 1 Class 11", "Structure of Atom", "Question 28"];
const failures = [];
if (response?.status() !== 200) failures.push(`status ${response?.status()}`);
if (runtimeErrors.length) failures.push(`${runtimeErrors.length} runtime errors`);
if (!fullScientific.length || fullScientific.some((item) => !item.hasSuperscriptStructure)) failures.push("scientific notation is not superscripted in the question/solution body");
if (!relatedScientific.length || relatedScientific.some((item) => !item.hasSuperscriptStructure)) failures.push("scientific notation is not superscripted in related-question previews");
if (!fontResponses.length || fontResponses.some((item) => item.status !== 200)) failures.push("KaTeX font resources did not all load successfully");
if (JSON.stringify(dom.breadcrumb.map((item) => item.text)) !== JSON.stringify(expectedBreadcrumb)) failures.push("visible breadcrumb does not match the full URL hierarchy");
if (dom.breadcrumbSchema?.length !== expectedBreadcrumb.length) failures.push("BreadcrumbList schema depth differs from the visible hierarchy");
if (dom.pageRows || dom.emptyPagePlaceholder) failures.push("null textbook page number is still exposed");
if (dom.liveTabRoles) failures.push("live question page unexpectedly exposes solution tabs");

const report = {
  capturedAt: new Date().toISOString(),
  origin,
  path,
  status: response?.status() ?? null,
  scientificNotationFinding: "false positive: the shared rich-content renderer already emits KaTeX superscript structures in full answers and related previews; missing KaTeX font assets were the adjacent real defect and are restored",
  fullScientific,
  relatedScientific,
  fontResponses,
  runtimeErrors,
  dom,
  expectedBreadcrumb,
  failures,
};
await browser.close();
await mkdir(new URL("../audits/phase-1/", import.meta.url), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`wrote ${outputPath}; fullScientific=${fullScientific.length}; relatedScientific=${relatedScientific.length}; failures=${failures.length}`);
process.exitCode = failures.length ? 1 : 0;
