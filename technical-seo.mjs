// Rules and thresholds for the Section 3 technical-SEO audit (my-plan.md §3).
//
// This module is pure: no filesystem, no database, no network. The scripts in
// scripts/technical-seo-*.mjs collect evidence and call these helpers, matching
// the house convention that domain logic lives in a repo-root module and the
// script is only the runner.
//
// A note on what "pass" means here. Every other gate in this repo exits non-zero
// when the site is wrong. This audit exits non-zero only when the AUDIT itself
// failed to run: §3 asked for a report, not a release gate. Site verdicts live
// in checklist[].status and problems live in findings[], so a corpus with 305K
// over-long titles still exits 0.

export const TECHNICAL_SEO_POLICY_VERSION = "section-3-technical-seo-v1";

// Google truncates the SERP title around 60 characters. The site's own
// generators aim at 160 (search-metadata.mjs DOCUMENT_TITLE_LIMIT) and ~154
// (question-seo.mjs), so nothing in the pipeline has ever targeted this budget.
export const SERP_TITLE_BUDGET = 60;
export const SERP_DESCRIPTION_BUDGET = 155;

export const CHECKLIST_ITEMS = Object.freeze([
  Object.freeze({ id: "duplicate-content", source: "my-plan.md §3", label: "Duplicate / near-duplicate content" }),
  Object.freeze({ id: "meta-uniqueness", source: "my-plan.md §3", label: "Meta titles/descriptions unique per page" }),
  Object.freeze({ id: "structured-data", source: "my-plan.md §3", label: "Structured data: Q&A schema, no reliance on FAQ rich results" }),
  Object.freeze({ id: "sitemap", source: "my-plan.md §3", label: "Sitemap.xml freshness and indexable-page agreement" }),
  Object.freeze({ id: "robots", source: "my-plan.md §3", label: "Robots.txt blocks nothing important, leaves nothing thin crawlable" }),
  Object.freeze({ id: "internal-linking", source: "my-plan.md §3", label: "Internal linking: orphans, broken links, redirect chains" }),
  Object.freeze({ id: "core-web-vitals", source: "my-plan.md §3", label: "Core Web Vitals / ISR: cache-hit rate, SWR, availability" }),
  Object.freeze({ id: "heading-hierarchy", source: "my-plan.md §3", label: "Heading hierarchy: one H1, logical H2/H3 nesting" }),
  Object.freeze({ id: "dpdp", source: "my-plan.md §3", label: "DPDP Act compliance: consent, privacy policy, disclosure" }),
  Object.freeze({ id: "adsense", source: "my-plan.md §3", label: "AdSense compliance: no ads on thin pages, ad density" }),
  Object.freeze({ id: "title-budget", source: "added 2026-08-30", label: "Page titles within the ~60-character SERP budget" }),
]);

export const STATUS = Object.freeze({
  pass: "pass",
  warn: "warn",
  fail: "fail",
  notMeasured: "not-measured",
});

export const SEVERITY = Object.freeze({
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  info: "info",
});

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------

// Identical to the copies at scripts/phase3-build-question-seo.mjs:78,
// scripts/search-metadata-gate.mjs:100 and scripts/phase3-audit.mjs:104. Those
// three predate this module; this is the single definition new code should use.
export function normalizeSimilarity(value) {
  return String(value ?? "").normalize("NFKC").toLocaleLowerCase("en-IN").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Titles are measured in code points, not UTF-16 units, because the corpus is
// bilingual: Devanagari and Tamil titles would otherwise measure short.
export function titleLength(value) {
  return [...String(value ?? "")].length;
}

// What a search engine actually shows. Collisions computed on this string are
// the ones that matter; collisions on the full title are already gated to zero.
export function serpClip(value, budget = SERP_TITLE_BUDGET) {
  return [...String(value ?? "")].slice(0, budget).join("");
}

// ---------------------------------------------------------------------------
// Distribution helpers (nothing equivalent exists anywhere in the repo)
// ---------------------------------------------------------------------------

export function percentile(sortedLengths, quantile) {
  if (!sortedLengths.length) return null;
  return sortedLengths[Math.floor((sortedLengths.length - 1) * quantile)];
}

export function lengthHistogram(lengths, bucketSize = 10) {
  const buckets = new Map();
  for (const length of lengths) {
    const floor = Math.floor(length / bucketSize) * bucketSize;
    buckets.set(floor, (buckets.get(floor) || 0) + 1);
  }
  return Object.fromEntries([...buckets.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([floor, count]) => [`${floor}-${floor + bucketSize - 1}`, count]));
}

export function describeLengths(lengths, budget = SERP_TITLE_BUDGET) {
  const sorted = [...lengths].sort((left, right) => left - right);
  const over = sorted.filter((length) => length > budget).length;
  return {
    pages: sorted.length,
    overBudget: over,
    overBudgetShare: sorted.length ? Number((over / sorted.length).toFixed(4)) : 0,
    minimum: sorted.length ? sorted[0] : null,
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    p95: percentile(sorted, 0.95),
    maximum: sorted.length ? sorted.at(-1) : null,
    histogram: lengthHistogram(sorted),
  };
}

// Groups of pages whose titles are distinct in full but identical once clipped
// to the SERP budget. This is the metric §2's bug-1 fix does not cover: it
// gated "zero duplicate full titles", which is true and still leaves a third of
// the corpus sharing a visible title.
export function serpCollisionGroups(entries, budget = SERP_TITLE_BUDGET) {
  const groups = new Map();
  for (const entry of entries) {
    const key = normalizeSimilarity(serpClip(entry.title, budget));
    const group = groups.get(key) || [];
    group.push(entry);
    groups.set(key, group);
  }
  const colliding = [...groups.entries()].filter(([, group]) => group.length > 1);
  colliding.sort((left, right) => right[1].length - left[1].length);
  return {
    distinctVisibleTitles: groups.size,
    collisionGroups: colliding.length,
    collidingPages: colliding.reduce((total, [, group]) => total + group.length, 0),
    largestGroups: colliding.slice(0, 10).map(([, group]) => ({
      pages: group.length,
      visibleTitle: serpClip(group[0].title, budget),
      examplePaths: group.slice(0, 3).map((entry) => entry.path),
    })),
  };
}

// ---------------------------------------------------------------------------
// HTML inspection
// ---------------------------------------------------------------------------

const HTML_TOKENS = /<!--[\s\S]*?-->|<![^>]*>|<\/?[^>]+>|[^<]+/gu;
const EXCLUDED_ELEMENTS = new Set(["script", "style", "template", "noscript"]);
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

function tagName(token) {
  return token.match(/^<\/?\s*([A-Za-z][^\s/>]*)/u)?.[1]?.toLowerCase() || "";
}

function attributeValue(token, name) {
  const match = token.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "iu"));
  if (match) return match[2] ?? match[3] ?? match[4] ?? "";
  return new RegExp(`\\s${name}(?=[\\s/>])`, "iu").test(token) ? "" : null;
}

function decodeEntities(value) {
  return value
    .replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z][A-Za-z0-9]*));/gu, (match, decimal, hex, named) => {
      if (decimal) return String.fromCodePoint(Number(decimal));
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      // Every named entity left undecoded inflates titleLength by its literal
      // width - `&rsquo;` measures 7 code points instead of 1 - so the SERP
      // budget check would silently over-report. The set below is the
      // typography that actually occurs in board-textbook copy; anything else
      // falls through unchanged rather than being guessed at.
      const table = {
        amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", shy: "",
        mdash: "—", ndash: "–", hellip: "…", bull: "•", middot: "·",
        lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
        laquo: "«", raquo: "»", prime: "′", Prime: "″",
        times: "×", divide: "÷", minus: "−", plusmn: "±", deg: "°",
        frac12: "½", frac14: "¼", frac34: "¾", sup2: "²", sup3: "³",
        copy: "©", reg: "®", trade: "™", ensp: " ", emsp: " ", thinsp: " ",
      };
      return table[named] ?? match;
    });
}

export function documentTitleFromHtml(html) {
  const match = String(html ?? "").match(/<title[^>]*>([\s\S]*?)<\/title>/iu);
  if (!match) return null;
  return decodeEntities(match[1].replace(/<[^>]+>/gu, "")).replace(/\s+/gu, " ").trim();
}

export function metaDescriptionFromHtml(html) {
  const match = String(html ?? "").match(/<meta[^>]+name=["']description["'][^>]*>/iu);
  if (!match) return null;
  const content = attributeValue(match[0], "content");
  return content == null ? null : decodeEntities(content).replace(/\s+/gu, " ").trim();
}

// Production streams Worker-rendered HTML through HTMLRewriter without a
// content-length and truncates it non-deterministically (backlog item 3), so a
// body that merely arrived with status 200 is not evidence of anything. Every
// live fetch in this audit is filtered through here before it is parsed.
export function isCompleteHtmlDocument(body) {
  const text = String(body ?? "").trimEnd();
  if (!text) return false;
  if (!/<html[\s>]/iu.test(text)) return false;
  return text.endsWith("</html>");
}

// Walks the same token stream as accessibility-text.mjs:59-113 and honours the
// same aria-hidden/hidden propagation, but records the heading outline instead
// of flattening to assistive text.
export function extractHeadingOutline(html) {
  const stack = [];
  const outline = [];
  let capturing = null;

  for (const token of String(html ?? "").match(HTML_TOKENS) || []) {
    if (!token.startsWith("<")) {
      if (capturing) capturing.parts.push(decodeEntities(token));
      continue;
    }
    if (/^<!--|^<!/u.test(token)) continue;
    const name = tagName(token);
    if (!name) continue;

    if (token.startsWith("</")) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].name !== name) continue;
        stack.length = index;
        break;
      }
      if (capturing && capturing.name === name) {
        outline.push({
          level: capturing.level,
          tag: capturing.name,
          id: capturing.id,
          text: capturing.parts.join("").replace(/\s+/gu, " ").trim(),
          hidden: capturing.hidden,
        });
        capturing = null;
      }
      continue;
    }

    const parent = stack.at(-1);
    const hidden = Boolean(parent?.hidden)
      || attributeValue(token, "aria-hidden")?.toLowerCase() === "true"
      || attributeValue(token, "hidden") !== null
      || EXCLUDED_ELEMENTS.has(name);

    if (/^h[1-6]$/u.test(name) && !capturing) {
      capturing = { name, level: Number(name[1]), id: attributeValue(token, "id") || null, hidden, parts: [] };
    }
    if (VOID_ELEMENTS.has(name) || /\/\s*>$/u.test(token)) continue;
    stack.push({ name, hidden });
  }
  return outline;
}

// axe `heading-order` + `page-has-heading-one` semantics, plus the empty-heading
// rule. Applied per template, not per page, per the checklist.
export function inspectHeadingOutline(outline) {
  const visible = outline.filter((heading) => !heading.hidden);
  const failures = [];
  const h1Count = visible.filter((heading) => heading.level === 1).length;
  if (h1Count === 0) failures.push("no H1");
  if (h1Count > 1) failures.push(`${h1Count} H1 elements; exactly one is required`);
  if (visible.length && visible[0].level !== 1) failures.push(`first heading is an H${visible[0].level}, not an H1`);
  for (let index = 1; index < visible.length; index += 1) {
    const jump = visible[index].level - visible[index - 1].level;
    if (jump > 1) {
      failures.push(`H${visible[index - 1].level} -> H${visible[index].level} skips a level ("${visible[index].text.slice(0, 60)}")`);
    }
  }
  for (const heading of visible) {
    if (!heading.text) failures.push(`empty H${heading.level}${heading.id ? ` #${heading.id}` : ""}`);
  }
  return {
    h1Count,
    headingCount: visible.length,
    levelCounts: Object.fromEntries([1, 2, 3, 4, 5, 6]
      .map((level) => [`h${level}`, visible.filter((heading) => heading.level === level).length])
      .filter(([, count]) => count > 0)),
    failures,
  };
}

// ---------------------------------------------------------------------------
// Structured data
// ---------------------------------------------------------------------------

// §3: "Do NOT rely on FAQ rich results - Google deprecated FAQ rich results in
// May 2026." selective-structured-data-gate.mjs only forbids QAPage and
// MathSolver, so FAQPage passes every existing gate.
export const FORBIDDEN_STRUCTURED_DATA_TYPES = Object.freeze(["FAQPage", "QAPage", "MathSolver", "HowTo"]);

export function structuredDataBlocks(html) {
  const blocks = [];
  for (const match of String(html ?? "").matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try {
      blocks.push(JSON.parse(match[1].trim()));
    } catch {
      blocks.push({ "@type": "__unparseable__", raw: match[1].slice(0, 200) });
    }
  }
  return blocks;
}

export function structuredDataTypes(blocks) {
  const types = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    for (const type of [node["@type"]].flat().filter(Boolean)) types.add(String(type));
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") walk(value);
    }
  };
  walk(blocks);
  return [...types].sort();
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export function finding({ id, checklistItem, severity, summary, evidence, state = "open" }) {
  return { id, checklistItem, severity, summary, evidence, state };
}

export function checklistEntry({ id, status, metrics = {}, findings = [], provenance, notes = [] }) {
  const definition = CHECKLIST_ITEMS.find((entry) => entry.id === id);
  if (!definition) throw new Error(`Unknown checklist item: ${id}`);
  return { id, label: definition.label, source: definition.source, status, metrics, findings, notes, provenance };
}

// Any number computed from the local sqlite corpus is unverified: the local
// corpus and the deployed D1 are different vintages (backlog item 2).
export function corpusProvenance(corpus) {
  return {
    dataSource: "corpus",
    corpus,
    origin: null,
    productionVerification: "unverified-against-production",
    unverifiedReason: "Local D1 snapshot and the deployed D1 are different vintages; /search?type=numerical returns 36 rows locally and 50 in production.",
  };
}

export function staticAssetProvenance(detail) {
  return {
    dataSource: "static-assets",
    detail,
    origin: null,
    productionVerification: "unverified-against-production",
    unverifiedReason: "Read from checked-in comparison/after-assets; the deployed Worker was built from an unpushed tree that matches neither origin/production nor local HEAD.",
  };
}

export function codeProvenance(detail) {
  return {
    dataSource: "code",
    detail,
    origin: null,
    productionVerification: "unverified-against-production",
    unverifiedReason: "Read from the working tree, which is 5 commits ahead of what production serves.",
  };
}

export function liveOriginProvenance(origin, detail) {
  return {
    dataSource: "live-origin",
    detail,
    origin,
    productionVerification: "verified-against-production",
    unverifiedReason: null,
  };
}
