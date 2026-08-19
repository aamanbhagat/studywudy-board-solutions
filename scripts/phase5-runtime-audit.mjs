#!/usr/bin/env node

import { gunzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);

const root = resolve(import.meta.dirname, "..");
const baseUrl = (args.get("--base-url") || "http://127.0.0.1:8795").replace(/\/$/, "");
const databasePath = resolve(root, args.get("--db") || "comparison/after-persistence/v3/d1/miniflare-D1DatabaseObject/ee8d76fe32dfe0c6dc6d6dd9fdbe19939bf18065016cec33be539d964764b747.sqlite");
const outputPath = resolve(root, args.get("--output") || "audits/phase-5/runtime-audit.json");
const expectedPublisher = args.get("--publisher-id") || "pub-1111222233334444";
const database = new DatabaseSync(databasePath, { readOnly: true });

function routeFor(row) {
  return `/${row.board_slug}/${row.grade_slug}/${row.subject_slug}/${row.book_slug}/${row.chapter_slug}/questions/${row.question_id}`;
}

function sampleQuestion(gatePassed) {
  return database.prepare(`SELECT b.board_slug, b.grade_slug, b.subject_slug, b.slug AS book_slug,
    q.chapter_slug, q.question_id FROM content_publish_gate g
    JOIN catalog_questions q ON q.book_id = g.book_id AND q.chapter_slug = g.chapter_slug AND q.question_id = g.question_id
    JOIN catalog_books b ON b.id = g.book_id WHERE g.gate_passed = ? ORDER BY q.row_id LIMIT 1`).get(gatePassed);
}

async function fetchText(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { response, text: await response.text() };
}

function schemas(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

function legalSchemaErrors(html, expectedType) {
  const graph = schemas(html).flatMap((schema) => schema["@graph"] || [schema]);
  const breadcrumb = graph.find((entry) => entry["@type"] === "BreadcrumbList");
  const errors = [];
  if (!graph.some((entry) => entry["@type"] === expectedType)) errors.push(`missing ${expectedType}`);
  if (!breadcrumb || breadcrumb.itemListElement?.length !== 2) errors.push("invalid BreadcrumbList");
  return errors;
}

function footerState(html) {
  const serverFooterCount = (html.match(/id="phase5-compliance-footer"/g) || []).length;
  const clientRuntimeCount = (html.match(/id="phase5-client-runtime"/g) || []).length;
  const hydrationSource = html.replaceAll('\\"', '"');
  const links = ["/about/methodology", "/privacy", "/terms", "/contact"];
  return {
    strategy: serverFooterCount === 1 ? "server-rendered-and-hydration-guarded" : "hydration-mounted",
    serverFooterCount,
    clientRuntimeCount,
    missingLinks: links.filter((link) => !hydrationSource.includes(`href="${link}"`)),
  };
}

function policyState(html) {
  return {
    scriptCount: (html.match(/id="phase5-ad-policy"/g) || []).length,
    nonPersonalized: html.includes("requestNonPersonalizedAds=1") && html.includes('data-ad-mode="non-personalized"'),
    legacyChildSignal: html.includes('data-tag-for-child-directed-treatment="1"'),
    currentChildSignal: html.includes('data-tag-for-age-treatment="1"'),
  };
}

function cspState(response) {
  const value = response.headers.get("content-security-policy") || "";
  const domains = ["googlesyndication.com", "doubleclick.net", "googleadservices.com"];
  return {
    value,
    hasEveryDomain: domains.every((domain) => value.includes(domain)),
    hasRequiredDirectives: ["script-src", "connect-src", "frame-src", "img-src"].every((directive) => value.includes(`${directive} `)),
  };
}

const passPath = routeFor(sampleQuestion(1));
const failPath = routeFor(sampleQuestion(0));
const pagePaths = {
  home: "/",
  boards: "/boards",
  board: "/cbse",
  class: "/cbse/class-12",
  subject: "/cbse/class-12/mathematics",
  chapter: "/cbse/class-12/mathematics/rd-sharma-maths-class-12/indefinite-integrals",
  passedSolution: passPath,
  queuedSolution: failPath,
  about: "/about/methodology",
  privacy: "/privacy",
  terms: "/terms",
  contact: "/contact",
};

const pages = {};
for (const [name, path] of Object.entries(pagePaths)) {
  const { response, text } = await fetchText(path);
  pages[name] = {
    path,
    status: response.status,
    html: text,
    footer: footerState(text),
    policy: policyState(text),
    csp: cspState(response),
    adModeHeader: response.headers.get("x-studywudy-ad-mode"),
    adSlotSourceCount: (text.match(/class=\\?"phase5-ad-shell/g) || []).length,
    cacheControl: response.headers.get("cache-control"),
  };
}

const aboutRedirect = await fetch(`${baseUrl}/about`, { redirect: "manual" });
const adsTxt = await fetchText("/ads.txt");
const contactBody = new URLSearchParams({
  role: "adult_data_principal",
  name: "Phase Five Audit",
  email: `phase5-audit-${Date.now()}@example.invalid`,
  request_type: "technical",
  message: "Automated local acceptance check for the working StudyWudy contact request queue.",
  adult_attested: "yes",
  website: "",
});
const contactSubmit = await fetch(`${baseUrl}/contact`, {
  method: "POST",
  redirect: "manual",
  headers: {
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    origin: baseUrl,
  },
  body: contactBody,
});
const contactLocation = contactSubmit.headers.get("location") || "";
const contactReference = new URL(contactLocation || "/contact", baseUrl).searchParams.get("submitted");
const contactSuccess = contactLocation ? await fetchText(new URL(contactLocation, baseUrl).pathname + new URL(contactLocation, baseUrl).search) : null;
const storedContact = contactReference
  ? database.prepare("SELECT reference, submitted_by_role, request_type, adult_attested, status, expires_at - created_at AS retention_seconds FROM phase5_contact_requests WHERE reference = ?").get(contactReference)
  : null;

const sitemapIndex = await fetchText("/sitemap.xml");
const hierarchyUrl = sitemapIndex.text.match(/<loc>([^<]*\/sitemaps\/hierarchy\.xml\.gz)<\/loc>/)?.[1];
let hierarchyPaths = [];
if (hierarchyUrl) {
  const local = new URL(hierarchyUrl);
  local.protocol = new URL(baseUrl).protocol;
  local.host = new URL(baseUrl).host;
  const response = await fetch(local);
  hierarchyPaths = [...gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
}

const pageReports = Object.fromEntries(Object.entries(pages).map(([name, page]) => [name, {
  path: page.path,
  status: page.status,
  footer: page.footer,
  policy: page.policy,
  csp: page.csp,
  adModeHeader: page.adModeHeader,
  adSlotSourceCount: page.adSlotSourceCount,
  cacheControl: page.cacheControl,
}]));

const report = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  requiredPages: {
    about: { status: pages.about.status, reusedPath: pagePaths.about, redirectStatus: aboutRedirect.status, redirectLocation: aboutRedirect.headers.get("location"), structuredDataErrors: legalSchemaErrors(pages.about.html, "AboutPage") },
    privacy: { status: pages.privacy.status, structuredDataErrors: legalSchemaErrors(pages.privacy.html, "WebPage"), hasGoogleAdSettings: pages.privacy.html.includes("https://adssettings.google.com/"), namesGrievanceContact: pages.privacy.html.includes("Aman Bhagat"), disclosesCookies: pages.privacy.html.includes("Cookies, Google AdSense and advertising") },
    terms: { status: pages.terms.status, structuredDataErrors: legalSchemaErrors(pages.terms.html, "WebPage") },
    contact: { status: pages.contact.status, structuredDataErrors: legalSchemaErrors(pages.contact.html, "ContactPage"), namesGrievanceContact: pages.contact.html.includes("Aman Bhagat"), hasAdultOnlyForm: pages.contact.html.includes('name="adult_attested"') },
  },
  footerTemplates: pageReports,
  contactSubmission: {
    status: contactSubmit.status,
    location: contactLocation,
    reference: contactReference,
    successPageStatus: contactSuccess?.response.status ?? null,
    successAcknowledged: contactSuccess?.text.includes("Request received.") ?? false,
    storedContact,
  },
  adsTxt: {
    status: adsTxt.response.status,
    contentType: adsTxt.response.headers.get("content-type"),
    stateHeader: adsTxt.response.headers.get("x-studywudy-ads-txt"),
    body: adsTxt.text.trim(),
    expectedBody: `google.com, ${expectedPublisher}, DIRECT, f08c47fec0942fa0`,
  },
  advertising: {
    previewMode: true,
    homepagePolicy: pages.home.policy,
    homepageSlotSourceCount: pages.home.adSlotSourceCount,
    homepageHasFixedMobileRule: pages.home.html.includes("width:320px;height:100px"),
    homepageHasFixedDesktopRule: pages.home.html.includes("width:728px;height:90px"),
    homepageHasReservedMarker: pages.home.html.replaceAll('\\"', '"').includes('data-layout-space="reserved"'),
    homepageLoadsExternalAds: pages.home.html.includes("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client="),
    editorialSolutionSlotSourceCount: pages.queuedSolution.adSlotSourceCount,
    editorialSolutionAdHeader: pages.queuedSolution.adModeHeader,
  },
  sitemap: {
    status: sitemapIndex.response.status,
    hierarchyRequiredPaths: ["/about/methodology", "/privacy", "/terms", "/contact"],
    missingRequiredPaths: ["/about/methodology", "/privacy", "/terms", "/contact"].filter((path) => !hierarchyPaths.includes(path)),
  },
};

const everyTemplatePasses = Object.values(pages).every((page) => page.status === 200
  && (page.footer.serverFooterCount === 1 || page.footer.clientRuntimeCount === 1)
  && page.footer.missingLinks.length === 0
  && page.policy.scriptCount === 1
  && page.policy.nonPersonalized
  && page.policy.legacyChildSignal
  && page.policy.currentChildSignal
  && page.csp.hasEveryDomain
  && page.csp.hasRequiredDirectives
  && String(page.adModeHeader).startsWith("non-personalized; child-directed;"));

report.pass = everyTemplatePasses
  && report.requiredPages.about.redirectStatus === 308
  && new URL(report.requiredPages.about.redirectLocation, baseUrl).pathname === "/about/methodology"
  && Object.values(report.requiredPages).every((page) => page.status === 200 && page.structuredDataErrors.length === 0)
  && report.requiredPages.privacy.hasGoogleAdSettings
  && report.requiredPages.privacy.namesGrievanceContact
  && report.requiredPages.privacy.disclosesCookies
  && report.requiredPages.contact.namesGrievanceContact
  && report.requiredPages.contact.hasAdultOnlyForm
  && report.contactSubmission.status === 303
  && /^SW-[A-F0-9]{12}$/.test(report.contactSubmission.reference || "")
  && report.contactSubmission.successPageStatus === 200
  && report.contactSubmission.successAcknowledged
  && report.contactSubmission.storedContact?.adult_attested === 1
  && report.contactSubmission.storedContact?.status === "new"
  && Number(report.contactSubmission.storedContact?.retention_seconds) === 180 * 24 * 60 * 60
  && report.adsTxt.status === 200
  && report.adsTxt.body === report.adsTxt.expectedBody
  && report.advertising.homepagePolicy.nonPersonalized
  && report.advertising.homepagePolicy.legacyChildSignal
  && report.advertising.homepagePolicy.currentChildSignal
  && report.advertising.homepageSlotSourceCount === 1
  && report.advertising.homepageHasFixedMobileRule
  && report.advertising.homepageHasFixedDesktopRule
  && report.advertising.homepageHasReservedMarker
  && !report.advertising.homepageLoadsExternalAds
  && report.advertising.editorialSolutionSlotSourceCount === 0
  && String(report.advertising.editorialSolutionAdHeader).includes("publisher-id-missing")
  && report.sitemap.status === 200
  && report.sitemap.missingRequiredPaths.length === 0;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
database.close();
if (!report.pass) process.exitCode = 1;
