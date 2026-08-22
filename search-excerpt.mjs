import { formulaRepresentations } from "./semantic-math.mjs";

const MAXIMUM_SOURCE_CHARACTERS = 16_384;
const DEFAULT_EXCERPT_CHARACTERS = 240;
export const SEARCH_EXCERPT_RELEASE = "parser-math-v3-quality-gated";
const BLOCK_HTML_ELEMENTS = new Set([
  "address", "article", "aside", "blockquote", "div", "dl", "fieldset", "figcaption",
  "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header",
  "hr", "li", "main", "nav", "ol", "p", "pre", "section", "table", "tbody",
  "td", "tfoot", "th", "thead", "tr", "ul",
]);
const HIDDEN_HTML_ELEMENTS = new Set(["script", "style", "template", "noscript"]);
const TEX_COMMAND_GROUP_COUNTS = Object.freeze({
  boxed: 1,
  ce: 1,
  dfrac: 2,
  frac: 2,
  hat: 1,
  mathbf: 1,
  mathit: 1,
  mathrm: 1,
  operatorname: 1,
  overline: 1,
  sqrt: 1,
  text: 1,
  tfrac: 2,
  underline: 1,
  vec: 1,
});

function node(type, value = "") {
  return Object.freeze({ type, value });
}

function boundedSource(value) {
  return [...String(value ?? "")].slice(0, MAXIMUM_SOURCE_CHARACTERS).join("");
}

function decodeHtmlEntities(value) {
  const named = Object.freeze({
    amp: "&", apos: "'", bull: "•", gt: ">", hellip: "…", laquo: "«",
    ldquo: "“", lsquo: "‘", lt: "<", mdash: "—", nbsp: " ", ndash: "–",
    quot: '"', raquo: "»", rdquo: "”", rsquo: "’",
  });
  return String(value).replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/giu, (entity, decimal, hexadecimal, name) => {
    const codePoint = decimal
      ? Number.parseInt(decimal, 10)
      : hexadecimal ? Number.parseInt(hexadecimal, 16) : null;
    if (codePoint != null && Number.isFinite(codePoint) && codePoint <= 0x10ffff) {
      return String.fromCodePoint(codePoint);
    }
    return named[name?.toLowerCase()] || entity;
  });
}

function readBalanced(source, start, opener, closer) {
  if (source[start] !== opener) return null;
  let depth = 0;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === opener) depth += 1;
    if (character !== closer) continue;
    depth -= 1;
    if (depth === 0) return Object.freeze({ content: source.slice(start + 1, index), end: index + 1 });
  }
  return null;
}

function readHtmlTag(source, start) {
  if (source[start] !== "<") return null;
  if (source.startsWith("<!--", start)) {
    const commentEnd = source.indexOf("-->", start + 4);
    return Object.freeze({ type: "comment", end: commentEnd < 0 ? source.length : commentEnd + 3 });
  }
  let quote = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character !== ">") continue;
    const raw = source.slice(start, index + 1);
    const match = raw.match(/^<\s*(\/?)\s*([a-z][\w:-]*)\b/iu);
    if (!match) return null;
    return Object.freeze({
      type: "tag",
      closing: Boolean(match[1]),
      name: match[2].toLowerCase(),
      end: index + 1,
    });
  }
  return null;
}

function readMarkdownLink(source, start, image = false) {
  const labelStart = start + (image ? 1 : 0);
  const label = readBalanced(source, labelStart, "[", "]");
  if (!label || source[label.end] !== "(") return null;
  const destination = readBalanced(source, label.end, "(", ")");
  if (!destination) return null;
  return Object.freeze({ label: label.content, end: destination.end });
}

function readTexGroupEnd(source, start) {
  while (/\s/u.test(source[start] || "")) start += 1;
  const balanced = readBalanced(source, start, "{", "}");
  return balanced?.end || start;
}

function readBareTexCommand(source, start) {
  if (source[start] !== "\\" || !/[A-Za-z]/u.test(source[start + 1] || "")) return null;
  let end = start + 1;
  while (/[A-Za-z]/u.test(source[end] || "")) end += 1;
  const command = source.slice(start + 1, end);
  if (command === "sqrt" && source[end] === "[") {
    end = readBalanced(source, end, "[", "]")?.end || end;
  }
  for (let group = 0; group < (TEX_COMMAND_GROUP_COUNTS[command] || 0); group += 1) {
    const groupEnd = readTexGroupEnd(source, end);
    if (groupEnd === end) break;
    end = groupEnd;
  }
  while (true) {
    const beforeScript = end;
    while (/\s/u.test(source[end] || "")) end += 1;
    if (!/[\^_]/u.test(source[end] || "")) {
      end = beforeScript;
      break;
    }
    end += 1;
    const groupEnd = readTexGroupEnd(source, end);
    end = groupEnd === end ? Math.min(source.length, end + 1) : groupEnd;
  }
  return Object.freeze({ source: source.slice(start, end), end });
}

function plainMath(source) {
  try {
    return formulaRepresentations(source).plainText;
  } catch {
    return String(source).replace(/\\([A-Za-z]+)\b/gu, "$1").replace(/[${}]/gu, " ");
  }
}

function lineEnd(source, start) {
  const end = source.indexOf("\n", start);
  return end < 0 ? source.length : end;
}

function isMarkdownTableDivider(line) {
  const cells = line.trim().replace(/^\||\|$/gu, "").split("|");
  return cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/u.test(cell));
}

function appendText(nodes, value) {
  if (!value) return;
  const previous = nodes.at(-1);
  if (previous?.type === "text") {
    nodes[nodes.length - 1] = node("text", previous.value + value);
  } else {
    nodes.push(node("text", value));
  }
}

function parseRange(source, start = 0, end = source.length) {
  const nodes = [];
  const markdownDelimiters = [];
  let index = start;
  let atLineStart = true;

  while (index < end) {
    if (atLineStart) {
      const currentLineEnd = Math.min(end, lineEnd(source, index));
      const currentLine = source.slice(index, currentLineEnd);
      if (isMarkdownTableDivider(currentLine)) {
        index = currentLineEnd;
        atLineStart = false;
        continue;
      }
      const prefix = currentLine.match(/^\s*(?:#{1,6}|>|[-+*]|\d+[.)])\s+/u)?.[0];
      if (prefix) index += prefix.length;
      atLineStart = false;
      if (index >= end) break;
    }

    const character = source[index];
    if (character === "\r" || character === "\n") {
      nodes.push(node("boundary"));
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      index += 1;
      atLineStart = true;
      continue;
    }

    if (character === "<") {
      const tag = readHtmlTag(source, index);
      if (tag) {
        if (tag.type === "tag" && !tag.closing && HIDDEN_HTML_ELEMENTS.has(tag.name)) {
          const closing = new RegExp(`<\\/\\s*${tag.name}\\s*>`, "iu");
          const remainder = source.slice(tag.end, end);
          const match = closing.exec(remainder);
          index = match ? tag.end + match.index + match[0].length : end;
          continue;
        }
        if (tag.type === "tag" && (tag.name === "br" || BLOCK_HTML_ELEMENTS.has(tag.name))) {
          nodes.push(node("boundary"));
        }
        index = tag.end;
        continue;
      }
    }

    if (source.startsWith("![", index)) {
      const image = readMarkdownLink(source, index, true);
      if (image) {
        index = image.end;
        continue;
      }
    }
    if (character === "[") {
      const link = readMarkdownLink(source, index);
      if (link) {
        nodes.push(...parseRange(link.label));
        index = link.end;
        continue;
      }
    }

    const mathDelimiter = source.startsWith("$$", index) ? Object.freeze({ open: "$$", close: "$$" })
      : character === "$" ? Object.freeze({ open: "$", close: "$" })
        : source.startsWith("\\(", index) ? Object.freeze({ open: "\\(", close: "\\)" })
          : source.startsWith("\\[", index) ? Object.freeze({ open: "\\[", close: "\\]" }) : null;
    if (mathDelimiter) {
      const contentStart = index + mathDelimiter.open.length;
      let closeAt = source.indexOf(mathDelimiter.close, contentStart);
      if (closeAt < 0) closeAt = Math.min(end, lineEnd(source, contentStart));
      nodes.push(node("math", plainMath(source.slice(contentStart, closeAt))));
      index = closeAt + (source.startsWith(mathDelimiter.close, closeAt) ? mathDelimiter.close.length : 0);
      continue;
    }

    if (character === "\\") {
      const tex = readBareTexCommand(source, index);
      if (tex) {
        nodes.push(node("math", plainMath(tex.source)));
        index = tex.end;
        continue;
      }
      if (index + 1 < end) {
        appendText(nodes, source[index + 1]);
        index += 2;
        continue;
      }
    }

    if (source.startsWith("__", index)) {
      if (markdownDelimiters.at(-1) === "__") {
        markdownDelimiters.pop();
        index += 2;
        continue;
      }
      const emphasisCloser = source.indexOf("__", index + 2);
      if (emphasisCloser >= 0 && emphasisCloser < end && !/^\s/u.test(source.slice(index + 2))) {
        markdownDelimiters.push("__");
        index += 2;
        continue;
      }
      const blank = source.slice(index).match(/^_{2,}/u)?.[0] || "__";
      appendText(nodes, "blank");
      index += blank.length;
      continue;
    }

    const markdownMarker = ["**", "~~", "*", "_", "```", "`"]
      .find((marker) => source.startsWith(marker, index));
    if (markdownMarker) {
      if (markdownDelimiters.at(-1) === markdownMarker) {
        markdownDelimiters.pop();
        index += markdownMarker.length;
        continue;
      }
      const closer = source.indexOf(markdownMarker, index + markdownMarker.length);
      if (closer >= 0 && closer < end && !/^\s/u.test(source.slice(index + markdownMarker.length))) {
        markdownDelimiters.push(markdownMarker);
        index += markdownMarker.length;
        continue;
      }
    }

    if (character === "|") {
      nodes.push(node("separator", ";"));
      index += 1;
      continue;
    }

    appendText(nodes, character);
    index += 1;
  }
  return nodes;
}

export function parseSupportedSearchMarkup(value) {
  return Object.freeze(parseRange(boundedSource(value)));
}

function normalizeNodes(nodes) {
  const text = [];
  for (const current of nodes) {
    if (current.type === "boundary") text.push(" ");
    else if (current.type === "separator") text.push("; ");
    else if (current.type === "math") text.push(` ${current.value} `);
    else text.push(decodeHtmlEntities(current.value));
  }
  const superscript = Object.freeze({ "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", "−": "⁻", "+": "⁺" });
  const subscript = Object.freeze({ "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉" });
  return text.join("")
    .normalize("NFC")
    .replaceAll("\u00ad", "")
    .replace(/([\p{L}\p{N})])\s*\^\(\s*([+−-]?\d+)\s*\)/gu, (_, base, exponent) => `${base}${[...exponent].map((character) => superscript[character] || character).join("")}`)
    .replace(/([A-Za-z])_?\(\s*(\d+)\s*\)/gu, (_, base, index) => `${base}${[...index].map((character) => subscript[character] || character).join("")}`)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, " ")
    .replace(/(?:\s*;\s*){2,}/gu, "; ")
    .replace(/([.!?])\s*;\s*/gu, "$1 ")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/([([{])\s+/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

export function createPlainSearchText(source) {
  return normalizeNodes(parseSupportedSearchMarkup(source));
}

export function evaluateSearchExcerptSource(source) {
  const value = boundedSource(source).normalize("NFC");
  const plainValue = createPlainSearchText(value);
  const failures = [];
  if (/\u00ad/u.test(value)) failures.push("soft-hyphen OCR corruption");
  if (/\b(?:negligble|AandB|Bhas)\b|\bvertical place\b/iu.test(`${value} ${plainValue}`)) failures.push("known joined-word or OCR typo");
  return Object.freeze({ pass: failures.length === 0, failures: Object.freeze(failures) });
}

export function truncateSearchExcerpt(value, maximum = DEFAULT_EXCERPT_CHARACTERS) {
  const limit = Math.max(24, Number.isFinite(maximum) ? Math.floor(maximum) : DEFAULT_EXCERPT_CHARACTERS);
  const characters = [...String(value || "")];
  if (characters.length <= limit) return characters.join("");
  const available = characters.slice(0, limit - 1).join("");
  const sentenceMatches = [...available.matchAll(/[.!?](?=\s|$)/gu)];
  const sentenceEnd = sentenceMatches.at(-1)?.index;
  if (sentenceEnd != null && sentenceEnd + 1 >= Math.floor(limit * 0.55)) {
    return available.slice(0, sentenceEnd + 1).trim();
  }
  const wordBoundary = available.match(/\s+\S*$/u);
  const clipped = wordBoundary ? available.slice(0, wordBoundary.index).trimEnd() : available.trimEnd();
  return `${clipped || available.trimEnd()}…`;
}

export function createSearchExcerpt(source, maximum = DEFAULT_EXCERPT_CHARACTERS) {
  return truncateSearchExcerpt(createPlainSearchText(source), maximum);
}

export const SEARCH_EXCERPT_MAXIMUM = DEFAULT_EXCERPT_CHARACTERS;
