import { extractCrawlerVisibleText } from "./crawler-visible-text.mjs";

const EXCLUDED_ELEMENTS = new Set(["script", "style", "template", "noscript"]);
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr",
]);
const TEXT_BOUNDARY_ELEMENTS = new Set([
  "address", "article", "aside", "blockquote", "body", "br", "button", "dd", "details",
  "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2",
  "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "option", "p",
  "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);

export const ACCESSIBILITY_TEXT_RELEASE = "decorative-labels-v3";

export const FORBIDDEN_ACCESSIBILITY_TEXT_PATTERNS = Object.freeze([
  Object.freeze({ label: "duplicated logo monogram", pattern: /\bS\s*StudyWudy\b/iu }),
  Object.freeze({ label: "charge decoration", pattern: /\+\s*−/u }),
  Object.freeze({ label: "duplicated Maharashtra badge", pattern: /\bMaharashtra\s*Maharashtra\b/iu }),
  Object.freeze({ label: "duplicated Tamil Nadu badge", pattern: /\bTamil\s+Nadu\s*Tamil\s+Nadu\b/iu }),
  Object.freeze({ label: "decorative CBSE region badge", pattern: /\bIndia\s*CBSE\b/iu }),
  Object.freeze({ label: "decorative CISCE region badge", pattern: /\bIndia\s*(?:ICSE|CISCE)\b/iu }),
]);

const FORBIDDEN_RAW_DOM_DUPLICATE_PATTERNS = FORBIDDEN_ACCESSIBILITY_TEXT_PATTERNS
  .filter(({ label }) => label !== "charge decoration");

function decodeHtmlEntities(value) {
  const named = Object.freeze({
    amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
  });
  return String(value).replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/giu, (entity, decimal, hexadecimal, name) => {
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
    return named[name.toLowerCase()] || entity;
  });
}

function tagName(token) {
  return token.match(/^<\/?\s*([a-z][\w:-]*)/iu)?.[1]?.toLowerCase() || "";
}

function attributeValue(token, attribute) {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = token.match(new RegExp(`\\s${escaped}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?`, "iu"));
  if (!match) return null;
  return decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? "");
}

function classesFor(token) {
  return new Set((attributeValue(token, "class") || "").split(/\s+/u).filter(Boolean));
}

function addBoundary(output) {
  if (output.length > 0 && !/\s$/u.test(output.at(-1))) output.push(" ");
}

export function extractAssistiveText(renderedHtml) {
  const stack = [];
  const output = [];
  const tokens = String(renderedHtml ?? "").match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[^>]+>|[^<]+/gu) || [];

  for (const token of tokens) {
    if (!token.startsWith("<")) {
      const parent = stack.at(-1);
      if (!parent?.hidden && !parent?.suppressed) output.push(decodeHtmlEntities(token));
      continue;
    }
    if (/^<!--|^<!/u.test(token)) continue;
    const name = tagName(token);
    if (!name) continue;

    if (/^<\//u.test(token)) {
      let closed = null;
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].name !== name) continue;
        closed = stack[index];
        stack.length = index;
        break;
      }
      if (closed?.boundary) addBoundary(output);
      continue;
    }

    const parent = stack.at(-1) || Object.freeze({ hidden: false, suppressed: false });
    const hidden = parent.hidden
      || attributeValue(token, "aria-hidden")?.toLowerCase() === "true"
      || attributeValue(token, "hidden") !== null
      || EXCLUDED_ELEMENTS.has(name);
    const label = attributeValue(token, "aria-label")?.trim() || "";
    const boundary = TEXT_BOUNDARY_ELEMENTS.has(name);
    if (boundary) addBoundary(output);

    let suppressed = parent.suppressed;
    if (!hidden && !suppressed && label) {
      output.push(label);
      suppressed = true;
    } else if (!hidden && !suppressed && name === "img") {
      const alt = attributeValue(token, "alt")?.trim() || "";
      if (alt) output.push(alt);
    }

    if (name === "br") addBoundary(output);
    if (VOID_ELEMENTS.has(name) || /\/\s*>$/u.test(token)) {
      if (boundary) addBoundary(output);
      continue;
    }
    stack.push(Object.freeze({ name, hidden, suppressed, boundary }));
  }

  return output.join("").replace(/\s+/gu, " ").trim();
}

function markupContractFailures(renderedHtml) {
  const failures = [];
  const stack = [];
  const tokens = String(renderedHtml ?? "").match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[^>]+>/gu) || [];
  for (const token of tokens) {
    if (/^<!--|^<!/u.test(token)) continue;
    const name = tagName(token);
    if (!name) continue;
    if (/^<\//u.test(token)) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].name !== name) continue;
        stack.length = index;
        break;
      }
      continue;
    }

    const classes = classesFor(token);
    const hidden = attributeValue(token, "aria-hidden")?.toLowerCase() === "true";
    const snippetHidden = attributeValue(token, "data-nosnippet") !== null;
    if (name === "a" && classes.has("brand") && attributeValue(token, "aria-label") !== "StudyWudy") {
      failures.push("brand link is missing aria-label=StudyWudy");
    }
    if (classes.has("brand-mark") && !hidden) failures.push("brand monogram is exposed");
    if (classes.has("brand-mark") && !snippetHidden) failures.push("brand monogram is snippet-visible");
    if (classes.has("board-card-meta") && !hidden) failures.push("board badge row is exposed");
    if (classes.has("board-card-meta") && !snippetHidden) failures.push("board badge row is snippet-visible");
    if (classes.has("study-field-art") && !hidden) failures.push("charge decoration is exposed");
    if (classes.has("study-field-art") && !snippetHidden) failures.push("charge decoration is snippet-visible");
    if (stack.at(-1)?.classes.has("study-field-art") && !hidden) {
      failures.push("charge-decoration child is not directly hidden");
    }

    if (!VOID_ELEMENTS.has(name) && !/\/\s*>$/u.test(token)) stack.push({ name, classes });
  }
  return failures;
}

export function inspectAccessibilityHtml(renderedHtml) {
  const text = extractAssistiveText(renderedHtml);
  const crawlerText = extractCrawlerVisibleText(renderedHtml);
  const domText = extractCrawlerVisibleText(String(renderedHtml ?? "").replace(/\sdata-nosnippet(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/giu, ""));
  const failures = markupContractFailures(renderedHtml);
  for (const { label, pattern } of FORBIDDEN_ACCESSIBILITY_TEXT_PATTERNS) {
    if (pattern.test(text)) failures.push(`assistive text contains ${label}`);
    if (pattern.test(crawlerText)) failures.push(`crawler text contains ${label}`);
  }
  for (const { label, pattern } of FORBIDDEN_RAW_DOM_DUPLICATE_PATTERNS) {
    if (pattern.test(domText)) failures.push(`DOM text contains ${label}`);
  }
  return Object.freeze({
    text,
    crawlerText,
    domText,
    failures: Object.freeze([...new Set(failures)]),
  });
}
