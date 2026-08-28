// Converts LaTeX `\begin{array}` blocks that are really *data tables* into the
// content model's native `kind: "table"` blocks.
//
// Deliberately conservative: anything that looks like a matrix, a chemical
// structure diagram, or that fails to parse cleanly is left untouched. It is
// much better to skip a table than to mangle legitimate math.

import katex from 'katex';
import 'katex/contrib/mhchem';

const ARRAY_RE = /\\begin\{array\}\s*(\{[^{}]*\})?([\s\S]*?)\\end\{array\}/;

/** Split on a delimiter, ignoring occurrences nested inside {...} or escaped. */
function splitTopLevel(src, delimiter) {
  const parts = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') {
      // Keep escape pairs intact (\&, \\, \{ ...).
      if (delimiter === '\\\\' && src[i + 1] === '\\') {
        if (depth === 0) {
          parts.push(buf);
          buf = '';
          i++;
          // Consume an optional row-spacing argument such as \\[-2pt].
          const rest = src.slice(i + 1);
          const spacing = /^\s*\[[^\]]*\]/.exec(rest);
          if (spacing) i += spacing[0].length;
          continue;
        }
        buf += src[i] + src[i + 1];
        i++;
        continue;
      }
      buf += src[i] + (src[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth === 0 && delimiter === '&' && ch === '&') {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  parts.push(buf);
  return parts;
}

/** True when the array body looks like tabular data rather than layout math. */
export function looksLikeDataTable(spec, body, before) {
  if (/pmatrix|bmatrix|vmatrix|\\left|\\right/.test(before)) return false;
  if (/\\begin\{array\}/.test(body)) return false; // nested - too risky
  // Chemical structure diagrams lean on phantom spacing and stacked bond
  // glyphs. Plain kerning (\!, \,, \;) is just number formatting inside cells
  // and says nothing about whether the array is a table.
  if (/\\phantom|\\ddot|\\overset|\\underset/.test(body)) return false;
  const hasRule = /\\hline/.test(body) || /\|/.test(spec || '');
  if (!hasRule) return false;
  const rows = splitTopLevel(body.replace(/\\hline/g, ''), '\\\\')
    .map((r) => r.trim())
    .filter(Boolean);
  if (rows.length < 2) return false;
  // Every row must agree on column count, otherwise it is not a clean grid.
  const widths = rows.map((r) => splitTopLevel(r, '&').length);
  if (new Set(widths).size !== 1) return false;
  if (widths[0] < 2) return false;
  return true;
}

/** Render one LaTeX cell into the content model's cell string. */
function cellToContent(rawCell) {
  // A lone trailing backslash is leftover row-break debris, not content.
  const cell = rawCell.trim().replace(/(?<!\\)\\$/, '').trim();
  if (!cell) return '';
  // A cell that is purely \text{...} becomes plain text so it stays selectable
  // and keeps its original script (these books are bilingual).
  const textOnly = /^\\text(?:rm|bf|it)?\{([^{}]*)\}$/.exec(cell);
  if (textOnly) return textOnly[1];
  // Bare numbers / words need no math treatment.
  if (/^[\p{L}\p{N}\s.,;:%°()+-]+$/u.test(cell) && !/\\/.test(cell)) return cell;
  return `$${cell}$`;
}

// What is left of a fragment once every spacing command is gone. Two tables set
// side by side are separated by `\qquad`, which is meaningless once each grid
// becomes its own block — emitting it would leave an empty math paragraph.
const isSpacingOnly = (s) =>
  !s.replace(/\\(?:qquad|quad|hspace\{[^{}]*\}|[,;:!> ])/g, '').trim();

/** Net brace depth, ignoring escaped braces. */
function braceDepth(s) {
  let d = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '{') d++;
    else if (s[i] === '}') d--;
  }
  return d;
}

function validCell(content) {
  const m = /^\$([\s\S]*)\$$/.exec(content);
  if (!m) return true; // plain text always fine
  try {
    katex.renderToString(m[1], { throwOnError: true, strict: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse an array body into { headers, rows }.
 * Returns null when the shape is not safely convertible.
 */
export function parseArrayTable(body) {
  const hadLeadingRule = /^\s*\\hline/.test(body);
  const rowsRaw = splitTopLevel(body, '\\\\');
  const rows = [];
  let headerBoundary = -1;

  for (const raw of rowsRaw) {
    const hasRule = /\\hline/.test(raw);
    const clean = raw.replace(/\\hline/g, '').trim();
    if (!clean) {
      // A rule on its own line still marks the end of the header.
      if (hasRule && rows.length > 0 && headerBoundary === -1) headerBoundary = rows.length;
      continue;
    }
    if (hasRule && rows.length > 0 && headerBoundary === -1) headerBoundary = rows.length;
    rows.push(splitTopLevel(clean, '&').map(cellToContent));
    if (hasRule && headerBoundary === -1 && rows.length === 1 && !hadLeadingRule) {
      headerBoundary = 1;
    }
  }

  if (rows.length < 2) return null;
  const width = rows[0].length;
  if (rows.some((r) => r.length !== width)) return null;
  if (rows.flat().some((c) => !validCell(c))) return null;

  // A rule directly under row one means row one is the header; that is also the
  // most faithful reading of these books' tables when rules only frame the grid.
  const headers = rows[0];
  const body_ = rows.slice(1);
  if (!body_.length) return null;
  return { headers, rows: body_ };
}

/**
 * Convert a string that may contain display math with data-table arrays into a
 * list of content blocks. Returns null when nothing should change.
 */
export function convertStringToBlocks(text) {
  if (typeof text !== 'string' || !text.includes('\\begin{array}')) return null;

  const out = [];
  let changed = false;
  let cursor = 0;
  // Display math first, but inline `$...$` carries tables too — often a whole
  // grid wrapped in \boxed{} on a single line.
  const span = /\$\$([\s\S]+?)\$\$|(?<!\\)\$((?:[^$]|\\\$)+?)(?<!\\)\$/g;
  let m;

  const pushProse = (s) => {
    const t = s.trim();
    if (t) out.push({ kind: 'paragraph', text: t });
  };

  while ((m = span.exec(text)) !== null) {
    const inner = m[1] ?? m[2];
    const am = ARRAY_RE.exec(inner);
    if (!am) continue;
    const spec = am[1] || '';
    const arrBody = am[2];
    const before = inner.slice(0, am.index);
    if (!looksLikeDataTable(spec, arrBody, before)) continue;

    const table = parseArrayTable(arrBody);
    if (!table) continue;

    // The array may be nested inside another group, e.g. $$\boxed{\begin{array}
    // ...\end{array}}$$. Lifting the table out would leave `\boxed{` and `}` as
    // separate, unparseable fragments, so either shed the wrapper whole or only
    // split when what remains on each side stands on its own.
    let pre = before.trim();
    let post = inner.slice(am.index + am[0].length).trim();
    // The wrapper may also close after something that trailed the grid, most
    // often a unit: \boxed{ <table> \ \text{km h}^{-1}}. Keep the trailer.
    if (pre === '\\boxed{' && post.endsWith('}') && braceDepth(post.slice(0, -1)) === 0) {
      pre = '';
      post = post.slice(0, -1).trim();
    }
    if (pre && !validCell(`$${pre}$`)) continue;
    if (post && !validCell(`$${post}$`)) continue;
    if (isSpacingOnly(pre)) pre = '';
    if (isSpacingOnly(post)) post = '';

    const d = m[1] !== undefined ? '$$' : '$';
    pushProse(text.slice(cursor, m.index));
    if (pre) out.push({ kind: 'paragraph', text: `${d}${pre}${d}` });
    out.push({ kind: 'table', headers: table.headers, rows: table.rows });
    if (post) {
      // A second grid often follows in the same span — two tables set side by
      // side with \qquad between them. Recurse so that one becomes a table too.
      const nested = post.includes('\\begin{array}')
        ? convertStringToBlocks(`${d}${post}${d}`)
        : null;
      if (nested) out.push(...nested);
      else out.push({ kind: 'paragraph', text: `${d}${post}${d}` });
    }

    cursor = m.index + m[0].length;
    changed = true;
  }

  if (!changed) return null;
  pushProse(text.slice(cursor));
  return out;
}
