const EXCLUDED_ELEMENTS = new Set(["script", "style", "template", "noscript"]);
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr",
]);

export const FORBIDDEN_CRAWLER_TEXT = Object.freeze([
  "undefined",
  "NaN",
  "[object Object]",
  "8π₀",
  "4₀A",
  "k₀A",
  "{R}_{o}ne",
  "{R}_{l}ine",
  "Rₒne",
  "Rₗine",
  "\\left\\right",
  "\\right\\left",
  "\\frac",
  "$$",
]);

export function forbiddenCrawlerTextFound(value) {
  const text = String(value ?? "");
  return Object.freeze(FORBIDDEN_CRAWLER_TEXT.filter((forbidden) => text.includes(forbidden)));
}

export function assertValidCrawlerText(value, label = "rendered page") {
  const failures = forbiddenCrawlerTextFound(value);
  if (failures.length) {
    throw new Error(`${label}: invalid rendered text: ${failures.join(", ")}`);
  }
  return true;
}

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

function isSnippetExcluded(token) {
  return /\bdata-nosnippet(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/iu.test(token);
}

function tokenizeHtml(value) {
  const html = String(value ?? "");
  const tokens = [];
  let index = 0;
  while (index < html.length) {
    if (html[index] !== "<") {
      const next = html.indexOf("<", index);
      const end = next < 0 ? html.length : next;
      tokens.push(html.slice(index, end));
      index = end;
      continue;
    }
    if (html.startsWith("<!--", index)) {
      const end = html.indexOf("-->", index + 4);
      tokens.push(html.slice(index, end < 0 ? html.length : end + 3));
      index = end < 0 ? html.length : end + 3;
      continue;
    }
    let quote = null;
    let end = index + 1;
    for (; end < html.length; end += 1) {
      const character = html[end];
      if (quote) {
        if (character === quote) quote = null;
      } else if (character === '"' || character === "'") quote = character;
      else if (character === ">") break;
    }
    tokens.push(html.slice(index, end < html.length ? end + 1 : html.length));
    index = end < html.length ? end + 1 : html.length;
  }
  return tokens;
}

export function extractCrawlerVisibleText(renderedHtml) {
  const stack = [];
  const text = [];
  const tokens = tokenizeHtml(renderedHtml);

  for (const token of tokens) {
    if (!token.startsWith("<")) {
      if (!stack.some((entry) => entry.excluded)) text.push(decodeHtmlEntities(token));
      continue;
    }
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
    if (name === "br" && !stack.some((entry) => entry.excluded)) text.push(" ");
    if (VOID_ELEMENTS.has(name) || /\/\s*>$/u.test(token)) continue;
    const parentExcluded = stack.at(-1)?.excluded || false;
    stack.push({
      name,
      excluded: parentExcluded || EXCLUDED_ELEMENTS.has(name) || isSnippetExcluded(token),
    });
  }

  return text.join(" ").replace(/\s+/gu, " ").trim();
}
