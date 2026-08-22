#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { QUESTION_SHOWCASE_SOURCE_GATE } from "../question-showcase-manifest.mjs";
import { questionShowcaseDiversity, validateQuestionShowcase } from "../question-showcase.mjs";
import { PRODUCTION_ORIGIN } from "./featured-study-route-smoke.mjs";

function attribute(tag, name) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "iu"))?.[1] || "";
}

export function extractQuestionShowcaseCards(html) {
  const tags = String(html || "").match(/<a\b[^>]*\bdata-showcase-quality-screened=["']true["'][^>]*>/giu) || [];
  return Object.freeze(tags.map((tag) => Object.freeze({
    href: attribute(tag, "href"),
    rowId: Number(attribute(tag, "data-question-row-id")),
    questionId: attribute(tag, "data-question-id"),
    type: attribute(tag, "data-question-type"),
    boardSlug: attribute(tag, "data-question-board"),
    gradeSlug: attribute(tag, "data-question-class"),
    subjectSlug: attribute(tag, "data-question-subject"),
    bookId: attribute(tag, "data-question-book"),
    language: attribute(tag, "data-question-language"),
    hasDiagram: attribute(tag, "data-has-diagram") === "true",
    internalMappingConsistent: attribute(tag, "data-internal-mapping-consistent") === "true",
    authoritativeTextbookMappingVerified: attribute(tag, "data-authoritative-textbook-mapping-verified") === "true",
    knownAuthoritativeMappingMismatch: attribute(tag, "data-known-authoritative-mapping-mismatch") === "true",
    nativeScriptValidationPassed: attribute(tag, "data-native-script-validation-passed") === "true",
    searchExcerptClean: attribute(tag, "data-search-excerpt-clean") === "true",
    automatedGatePassed: attribute(tag, "data-automated-gate-passed") === "true",
    finalPublishingGatePassed: attribute(tag, "data-final-publishing-gate-passed") === "true",
    unresolvedContent: attribute(tag, "data-unresolved-content") === "true",
    brokenMedia: attribute(tag, "data-broken-media") === "true",
    duplicateOptions: attribute(tag, "data-duplicate-options") === "true",
    runtimePayloadSafe: attribute(tag, "data-runtime-payload-safe") === "true",
    contentQualityPassed: attribute(tag, "data-content-quality-passed") === "true",
  })));
}

export function inspectQuestionShowcaseHtml(html) {
  const source = String(html || "");
  const cards = extractQuestionShowcaseCards(source);
  const validation = validateQuestionShowcase(cards);
  const failures = [...validation.failures];
  if (!/Quality-screened sample questions/iu.test(source)) failures.push("quality-screened showcase heading is missing");
  if (/automated checks? (?:are )?(?:incomplete|missing)|review required/iu.test(source)) failures.push("incomplete-answer copy is featured");
  if (/Authoritative textbook mapping mismatch|अ लटलकर दवतय भवषयतकल|डसपटक/iu.test(source)) {
    failures.push("a reported mapping or native-script quality defect is featured");
  }
  if (cards.some(({ questionId }) => [
    "q-msb-balbharati-book-keeping-and-accountancy-standard-12-1-001",
    "q-cisce-c-b-gupta-business-studies-class-12-1-001",
  ].includes(questionId))) failures.push("a reported incomplete fixture is still featured");
  return Object.freeze({
    cards,
    diversity: questionShowcaseDiversity(cards),
    failures: Object.freeze(failures),
  });
}

export async function smokeQuestionShowcase({
  deploymentUrl = PRODUCTION_ORIGIN,
  fetchImpl = fetch,
  timeoutMs = 30_000,
  interRequestDelayMs = 1_000,
  batchPauseMs = 20_000,
} = {}) {
  const origin = new URL(deploymentUrl).origin;
  const response = await fetchImpl(new URL("/search", `${origin}/`), {
    method: "GET",
    redirect: "manual",
    headers: {
      accept: "text/html",
      "cache-control": "no-cache",
      "user-agent": "StudyWudy quality-screened-question-showcase deployment gate/1.0",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status !== 200) throw new Error(`/search returned ${response.status}`);
  if (!(response.headers.get("content-type") || "").includes("text/html")) throw new Error("/search did not return HTML");
  if (response.headers.get("x-studywudy-question-showcase") !== QUESTION_SHOWCASE_SOURCE_GATE.policyVersion) {
    throw new Error("/search is missing the quality-screened-showcase release marker");
  }
  const inspection = inspectQuestionShowcaseHtml(await response.text());
  if (inspection.failures.length) throw new Error(`/search: ${inspection.failures.join("; ")}`);
  const destinations = [];
  for (const [cardIndex, card] of inspection.cards.entries()) {
    if (!card.href.startsWith("/")) throw new Error(`${card.questionId}: featured href is not an internal crawlable path`);
    if (cardIndex > 0 && cardIndex % 8 === 0 && batchPauseMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, batchPauseMs));
    }
    if (interRequestDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, interRequestDelayMs));
    let destination;
    let lastError;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        destination = await fetchImpl(new URL(card.href, `${origin}/`), {
          method: "GET",
          redirect: "manual",
          headers: {
            accept: "text/html",
            "user-agent": "StudyWudy quality-screened-question-showcase deployment gate/1.0",
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        lastError = null;
      } catch (error) {
        lastError = error;
      }
      if (lastError && attempt === 4) {
        throw new Error(`${card.href} failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
      }
      if (lastError) {
        await new Promise((resolve) => setTimeout(resolve, 2_000 * (2 ** attempt)));
        continue;
      }
      if (destination.status !== 503 || attempt === 4) break;
      await destination.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 2_000 * (2 ** attempt)));
    }
    if (destination.status !== 200) throw new Error(`${card.href} returned ${destination.status}`);
    const publishGate = destination.headers.get("x-studywudy-publish-gate");
    const expectedGate = `${QUESTION_SHOWCASE_SOURCE_GATE.answerGatePolicyVersion}; complete`;
    if (publishGate !== expectedGate) throw new Error(`${card.href} returned publishing gate ${publishGate || "(missing)"}`);
    const robotsHeader = destination.headers.get("x-robots-tag") || "";
    if (/\bnoindex\b/iu.test(robotsHeader)) throw new Error(`${card.href} is noindex despite being featured`);
    const destinationHtml = await destination.text();
    if (/<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["'][^"']*\bnoindex\b/iu.test(destinationHtml)) {
      throw new Error(`${card.href} has a noindex robots meta tag despite being featured`);
    }
    if (/automated checks? (?:are )?(?:incomplete|missing)|review required/iu.test(destinationHtml)) {
      throw new Error(`${card.href} exposes incomplete-answer copy`);
    }
    destinations.push(Object.freeze({ href: card.href, status: destination.status, publishGate }));
  }
  return Object.freeze({ ...inspection, destinations: Object.freeze(destinations) });
}

async function main() {
  const deploymentUrl = process.env.STUDYWUDY_DEPLOYMENT_URL || process.argv[2] || PRODUCTION_ORIGIN;
  const inspection = await smokeQuestionShowcase({ deploymentUrl });
  console.log(`PASS /search (${inspection.cards.length} quality-screened questions and ${inspection.destinations.length} complete answer pages; ${JSON.stringify(inspection.diversity)})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
