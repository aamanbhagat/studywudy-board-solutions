#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PHASE5_COMPLIANCE } from "../phase5-compliance.mjs";

const root = resolve(import.meta.dirname, "..");
const outputPath = resolve(root, process.argv[2] || "audits/phase-5/static-audit.json");
const moduleSource = readFileSync(resolve(root, "phase5-compliance.mjs"), "utf8");
const migrationSource = readFileSync(resolve(root, "migrations/0002_phase5_contact_requests.sql"), "utf8");
const runtimeSources = [
  readFileSync(resolve(root, "comparison/after-worker.js"), "utf8"),
  moduleSource,
  ...["wrangler.production.jsonc", "wrangler.after.jsonc", "wrangler.recovered.jsonc"].map((file) => readFileSync(resolve(root, file), "utf8")),
].join("\n");

const requiredPages = ["/privacy", "/terms", "/about/methodology", "/contact"];
const footerLinks = ["/about/methodology", "/privacy", "/terms", "/contact"];
const configs = ["wrangler.production.jsonc", "wrangler.after.jsonc", "wrangler.recovered.jsonc"].map((file) => ({
  file,
  source: readFileSync(resolve(root, file), "utf8"),
}));

const checks = {
  requiredRoutesImplemented: requiredPages.every((path) => moduleSource.includes(path)),
  aboutReusesMethodology: moduleSource.includes('url.pathname === "/about"') && moduleSource.includes('new URL("/about/methodology"'),
  footerContainsEveryRequiredLink: footerLinks.every((path) => moduleSource.includes(`href="${path}"`)),
  privacyDisclosesCookiesAndGoogle: /Cookies, Google AdSense and advertising/.test(moduleSource) && moduleSource.includes("https://adssettings.google.com/"),
  privacyNamesContact: moduleSource.includes('PHASE5_CONTACT_NAME = "Aman Bhagat"') && /named business and grievance contact/.test(moduleSource),
  privacyIsMinorSpecific: moduleSource.includes("defines a child as a person under 18") && moduleSource.includes("prohibits tracking or behavioural monitoring"),
  termsImplemented: moduleSource.includes('heading: "Terms of Service"'),
  contactIsWorkingQueue: moduleSource.includes("INSERT INTO phase5_contact_requests") && migrationSource.includes("CREATE TABLE IF NOT EXISTS phase5_contact_requests"),
  contactIsAdultOnly: moduleSource.includes('name="adult_attested"') && moduleSource.includes("For adults only"),
  adsTxtRootImplemented: moduleSource.includes('url.pathname === "/ads.txt"') && moduleSource.includes("f08c47fec0942fa0"),
  adsTxtDoesNotFabricatePublisher: moduleSource.includes("currently has no authorized advertising sellers") && !configs.some(({ source }) => /ADSENSE_PUBLISHER_ID\s*["']?\s*:\s*["'](?:ca-)?pub-\d{16}/.test(source)),
  nonPersonalizedDefault: PHASE5_COMPLIANCE.adMode === "non-personalized" && PHASE5_COMPLIANCE.requestNonPersonalizedAds === 1 && moduleSource.includes("requestNonPersonalizedAds=1"),
  nonPersonalizedSetBeforeLoader: moduleSource.indexOf("requestNonPersonalizedAds=1") >= 0 && moduleSource.indexOf("requestNonPersonalizedAds=1") < moduleSource.indexOf('document.createElement("script")'),
  childTreatmentOnRequest: PHASE5_COMPLIANCE.tagForChildDirectedTreatment === 1 && PHASE5_COMPLIANCE.tagForAgeTreatment === 1 && moduleSource.includes('data-tag-for-child-directed-treatment="1"') && moduleSource.includes('data-tag-for-age-treatment="1"'),
  tcfV23Holdback: PHASE5_COMPLIANCE.tcfVersion === "2.3" && moduleSource.includes("tcf-v2.3-region-holdback") && moduleSource.includes('country !== "IN" && !tcfReady'),
  fixedAdDimensions: moduleSource.includes("grid-template-rows:18px 100px") && moduleSource.includes("width:320px;height:100px") && moduleSource.includes("width:728px;height:90px") && moduleSource.includes('data-layout-space="reserved"'),
  cspAllowlist: ["googlesyndication.com", "doubleclick.net", "googleadservices.com"].every((domain) => moduleSource.includes(domain)),
  contactRetentionJob: moduleSource.includes("cleanupPhase5ContactRequests") && configs.every(({ source }) => source.includes('"17 2 * * *"')),
  allRoutesReachWorker: configs.every(({ source }) => ["/privacy", "/terms", "/contact", "/ads.txt", "/about"].every((path) => source.includes(`"${path}"`))),
};

const analyticsSignals = [
  /googletagmanager\.com/i,
  /google-analytics\.com/i,
  /\bgtag\s*\(/i,
  /posthog/i,
  /plausible\.io/i,
  /segment\.com\/analytics/i,
];
const analyticsMatches = analyticsSignals.filter((pattern) => pattern.test(runtimeSources)).map((pattern) => String(pattern));

const report = {
  generatedAt: new Date().toISOString(),
  policy: PHASE5_COMPLIANCE,
  contact: {
    namedGrievanceContact: PHASE5_COMPLIANCE.contactName,
    method: "adult-only first-party web form persisted to D1 with a returned reference number",
    retentionDays: 180,
    migration: "migrations/0002_phase5_contact_requests.sql",
  },
  advertising: {
    publisherIdConfiguredInRepository: false,
    adsTxtBehavior: "200 text/plain; comment-only while no account exists, exact Google DIRECT record after a valid pub- ID is configured",
    defaultMode: PHASE5_COMPLIANCE.adMode,
    legacyChildDirectedSignal: PHASE5_COMPLIANCE.tagForChildDirectedTreatment,
    currentAgeTreatmentSignal: PHASE5_COMPLIANCE.tagForAgeTreatment,
    liveAdActivationRequirements: ["ADSENSE_PUBLISHER_ID", "ADSENSE_SLOT_ID", "India request or ADSENSE_TCF_V23_READY=true"],
  },
  euUkTrafficReview: {
    analyticsDatasetPresentInRepository: false,
    runtimeAnalyticsCodeMatches: analyticsMatches,
    conclusion: "EU/UK traffic cannot be ruled out from this recovery. Ad calls are held outside India until a TCF v2.3-capable deployment is explicitly confirmed.",
  },
  csp: {
    allowedDomainFamilies: ["googlesyndication.com", "doubleclick.net", "googleadservices.com"],
    directives: ["script-src", "connect-src", "frame-src", "img-src"],
  },
  checks,
  primarySources: [
    "https://www.meity.gov.in/writereaddata/files/Digital%20Personal%20Data%20Protection%20Act%202023.pdf",
    "https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf",
    "https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf",
    "https://support.google.com/adsense/answer/9007336",
    "https://support.google.com/adsense/answer/9007197",
    "https://support.google.com/adsense/answer/7670312",
    "https://support.google.com/adsense/answer/9804260",
    "https://support.google.com/adsense/answer/12171612",
    "https://support.google.com/adsense/answer/16283098",
    "https://developers.cloudflare.com/workers/examples/security-headers/",
  ],
};

report.pass = Object.values(checks).every(Boolean) && analyticsMatches.length === 0;
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
