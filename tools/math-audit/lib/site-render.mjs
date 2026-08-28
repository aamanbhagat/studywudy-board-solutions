// The site's own math pipeline, lifted verbatim out of the deployed Worker
// bundle so the audit measures what a reader actually sees rather than what a
// hand-written tokenizer guesses. Do not tidy this: it must stay byte-identical
// to the shipped code, minified names and all.
//
//   f  normalize raw text  (shortcodes, literal \n, control bytes -> $)
//   g  tokenize into text / math runs
//   h  normalize one math body before KaTeX
//   relaxed  h + the forgiving cleanup the renderer applies last
//
// Extracted from studywudy-board-solutions/worker.js @ offset 3779575.

const __name = (fn) => fn;
const __name2 = (fn) => fn;
let b = String.raw`\underline{\hspace{1.35em}}`;
        function c(a2, b2) {
          let c2 = 0;
          for (let d2 = b2 - 1; d2 >= 0 && a2[d2] === "\\"; d2 -= 1) c2 += 1;
          return c2 % 2 == 1;
        }
        __name(c, "c");
        __name2(c, "c");
        function d(a2, b2) {
          let d2 = [];
          for (let e2 = 0; e2 < b2; e2 += 1) {
            if (a2[e2] === "{" && !c(a2, e2)) {
              let b3 = a2.slice(Math.max(0, e2 - 40), e2);
              d2.push(!!d2.at(-1) || /\\[A-Za-z]+\s*$/.test(b3));
            }
            a2[e2] !== "}" || c(a2, e2) || d2.pop();
          }
          return d2.some(Boolean);
        }
        __name(d, "d");
        __name2(d, "d");
        function e(a2) {
          let b2 = a2.trim();
          return (!/^_?[A-Za-z][A-Za-z0-9_]*\s+[A-Za-z]{3,}/.test(b2) || !!/[\\=<>+*/^]/.test(b2)) && !!b2 && (/\\[A-Za-z]+|[_^=<>]|[+*/]/.test(b2) || /^[A-Za-z]\s*\(/.test(b2));
        }
        __name(e, "e");
        __name2(e, "e");
        function f(a2) {
          let b2 = a2.replace(/\[\/?(?:latex|katex)\]/gi, "$").replace(/(?:\u001B\[(?:KaTeX|latex)\]){2,}/gi, (a3) => a3.slice(0, a3.length / (a3.match(/\u001B/g)?.length ?? 1))).replace(/\\n(?!u(?:\b|_)|e(?:q|g)?\b|ot(?:in)?\b|abla\b|ewline\b)/g, `
`);
          for (let a3 of ["\x1B[KaTeX]", "\x1B[latex]", "\0", ""]) b2 = (function(a4, b3) {
            let c2 = a4.split(b3).length - 1;
            return c2 < 2 || c2 % 2 != 0 ? a4.replaceAll(b3, "") : a4.split(b3).map((a5, b4) => b4 ? `$${a5}` : a5).join("");
          })(b2, a3);
          return b2.replace(/\u001C/g, "$").replace(/\u001D/g, "$").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001B\u001E\u001F]/g, "");
        }
        __name(f, "f");
        __name2(f, "f");
        function g(a2) {
          a2 = f(a2);
          let b2 = [], g2 = 0, h2 = 0, i2 = /* @__PURE__ */ __name2((c2) => {
            if (c2 > g2) {
              let d2 = a2.slice(g2, c2);
              b2.push({ kind: "text", value: d2, raw: d2 });
            }
          }, "i2");
          for (; h2 < a2.length; ) {
            let f2 = "", j2 = "", k2 = false;
            if (!a2.startsWith("$$", h2) || c(a2, h2) || d(a2, h2) ? a2[h2] !== "$" || c(a2, h2) || d(a2, h2) ? a2.startsWith("\\[", h2) ? (f2 = "\\[", j2 = "\\]", k2 = true) : a2.startsWith("\\(", h2) && (f2 = "\\(", j2 = "\\)") : f2 = j2 = "$" : (f2 = j2 = "$$", k2 = true), !f2) {
              h2 += 1;
              continue;
            }
            let l2 = h2 + f2.length, m2 = j2.startsWith("$") ? (function(a3, b3, d2) {
              let e2 = 0;
              for (let f3 = b3; f3 < a3.length; f3 += 1) {
                if (a3[f3] !== "{" || c(a3, f3) || (e2 += 1), a3[f3] !== "}" || c(a3, f3) || (e2 = Math.max(0, e2 - 1)), !a3.startsWith(d2, f3) || c(a3, f3) || e2 > 0) continue;
                let g3 = a3.slice(b3, f3).trimEnd();
                if (/\\(?:vec|hat|bar|overline|underline|sqrt|(?:d?|t)frac)\s*$/.test(g3)) {
                  let b4 = a3.indexOf(d2, f3 + d2.length);
                  if (b4 > f3) {
                    f3 = b4 + d2.length - 1;
                    continue;
                  }
                }
                return f3;
              }
              return -1;
            })(a2, l2, j2) : a2.indexOf(j2, l2);
            if (m2 < 0) {
              let c2 = a2.slice(l2);
              if (f2 === "$$" && !e(c2)) {
                i2(h2), h2 = l2, g2 = l2;
                continue;
              }
              if (!e(c2)) {
                h2 += f2.length;
                continue;
              }
              i2(h2), b2.push({ kind: "math", value: c2, raw: a2.slice(h2), display: k2 }), g2 = a2.length, h2 = a2.length;
              break;
            }
            i2(h2);
            let n2 = m2 + j2.length;
            b2.push({ kind: "math", value: a2.slice(l2, m2), raw: a2.slice(h2, n2), display: k2 }), h2 = n2, g2 = n2;
          }
          return i2(a2.length), b2.length ? b2 : [{ kind: "text", value: a2, raw: a2 }];
        }
        __name(g, "g");
        __name2(g, "g");
        function h(a2) {
          return (function(a3) {
            let b2 = a3, c2 = /\\(text|mathrm|mathbf|mathit)\{([^{}]*·[^{}]*)\}/g;
            for (let a4 = 0; a4 < 4 && c2.test(b2); a4 += 1) c2.lastIndex = 0, b2 = b2.replace(c2, (a5, b3, c3) => c3.split("\xB7").map((a6) => `\\${b3}{${a6}}`).join("\\cdot "));
            return b2;
          })((function(a3) {
            let b2 = a3, c2 = 0;
            for (; c2 < b2.length; ) {
              let a4 = /\\text\{/.exec(b2.slice(c2));
              if (!a4?.index && a4?.index !== 0) break;
              let d2 = c2 + a4.index, e2 = b2.indexOf("{", d2), f2 = l(b2, e2);
              if (!f2) break;
              if (!/\$[^$]+\$/.test(f2.body)) {
                c2 = f2.end;
                continue;
              }
              let g2 = f2.body.split(/(\$[^$]+\$)/g).filter(Boolean).map((a5) => a5.startsWith("$") && a5.endsWith("$") ? a5.slice(1, -1) : `\\text{${a5}}`).join("");
              b2 = `${b2.slice(0, d2)}${g2}${b2.slice(f2.end)}`, c2 = d2 + g2.length;
            }
            return b2;
          })(a2.replace(/\u0008(?=(?:ar|egin|eta)\b)/g, "\\b").replace(/\u000b(?=ec\b)/g, "\\v").replace(/\u000c(?=rac\b)/g, "\\f").replace(/\t(?=(?:imes|ext|heta|an)\b)/g, "\\t").replace(/\r(?=(?:ight|ho)\b)/g, "\\r").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""))).replace(/\\textsubscript\{([^{}]*)\}/g, "{}_{\\text{$1}}").replace(/\\textsuperscript\{([^{}]*)\}/g, "{}^{\\text{$1}}").replace(/\\multicolumn\{[^{}]*\}\{[^{}]*\}\{([^{}]*)\}/g, "\\text{$1}").replace(/\\hfill\b/g, "\\qquad").replaceAll("\xA0", " ").replace(/[–−]/g, "-").replace(/∆/g, "\\Delta ").replace(/\\cdotp\b/g, "\\cdot").replace(/\\n(?=\s|$)/g, " ").replace(/\^\(([^)\n]+)\)/g, "^{$1}").replace(/_\(([^)\n]+)\)/g, "_{$1}").trim();
        }
        __name(h, "h");
        __name2(h, "h");
        let i = { 0: "\u2080", 1: "\u2081", 2: "\u2082", 3: "\u2083", 4: "\u2084", 5: "\u2085", 6: "\u2086", 7: "\u2087", 8: "\u2088", 9: "\u2089", "+": "\u208A", "-": "\u208B" }, j = { 0: "\u2070", 1: "\xB9", 2: "\xB2", 3: "\xB3", 4: "\u2074", 5: "\u2075", 6: "\u2076", 7: "\u2077", 8: "\u2078", 9: "\u2079", "+": "\u207A", "-": "\u207B" };
        function k(a2, b2, c2) {
          let d2 = [...a2].map((a3) => b2[a3] ?? a3).join("");
          return [...a2].every((a3) => b2[a3]) ? d2 : `${c2}${a2}`;
        }
        __name(k, "k");
        __name2(k, "k");
        function l(a2, b2) {
          if (a2[b2] !== "{") return null;
          let c2 = 0;
          for (let d2 = b2; d2 < a2.length; d2 += 1) if (a2[d2] === "{" && (c2 += 1), a2[d2] === "}" && !(c2 -= 1)) return { body: a2.slice(b2 + 1, d2), end: d2 + 1 };
          return null;
        }
        __name(l, "l");
        __name2(l, "l");

// The exact wrapper the renderer puts around h() before calling KaTeX.
export function relaxed(a2, keepTag) {
  let d2 = h(a2).replace(/(?<!\\)\$(?!\$)/g, '').replace(/(?<!\\)&/g, '\\&');
  if (!keepTag) d2 = d2.replace(/\\tag\{[^{}]*\}/g, '');
  if ((d2.match(/\\left\b/g)?.length ?? 0) !== (d2.match(/\\right\b/g)?.length ?? 0)) {
    d2 = d2.replace(/\\(?:left|right)\b/g, '');
  }
  const e2 = d2;
  let f2 = 0;
  let g2 = '';
  for (let i = 0; i < e2.length; i += 1) {
    const ch = e2[i];
    if (ch === '{' && !c(e2, i)) f2 += 1;
    if (ch === '}' && !c(e2, i)) {
      if (!f2) continue;
      f2 -= 1;
    }
    g2 += ch;
  }
  return `${g2}${'}'.repeat(f2)}`;
}

export { c as isEscaped, d as insideGroup, e as looksLikeMath, f as normalizeText, g as tokenize, h as normalizeMath };

// answer-completeness.mjs @ contentToText — the flattening that turns a block
// prompt into the single line `catalog_questions.prompt_text` holds. Copied
// rather than imported so the tools still run from a checkout that does not
// sit beside the site source.
export function contentToText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(contentToText).join(" ");
  if (typeof value !== "object") return String(value);
  if (value.kind === "rich") return (value.segments || []).map((segment) => segment.text || "").join(" ");
  if (value.kind === "paragraphs") return (value.paragraphs || []).join(" ");
  if (value.kind === "blocks") {
    return (value.blocks || []).map((block) => {
      if (block.kind === "paragraph") return block.text || "";
      if (block.kind === "list") return (block.items || []).join(" ");
      if (block.kind === "table") return [...(block.headers || []), ...(block.rows || []).flat()].join(" ");
      return block.code || "";
    }).join(" ");
  }
  return Object.values(value).map(contentToText).join(" ");
}
