// Why did the array->table converter decline? Groups the remaining ruled arrays
// by the first gate they fail, with a sample of each.
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import katex from 'katex';
import 'katex/contrib/mhchem';

console.warn = () => {};
const ARRAY_RE = /\\begin\{array\}\s*(\{[^{}]*\})?([\s\S]*?)\\end\{array\}/;

function splitTopLevel(src, delimiter) {
  const parts = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') {
      if (delimiter === '\\\\' && src[i + 1] === '\\') {
        if (depth === 0) {
          parts.push(buf);
          buf = '';
          i++;
          const spacing = /^\s*\[[^\]]*\]/.exec(src.slice(i + 1));
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

function reason(text) {
  const display = /\$\$([\s\S]+?)\$\$/g;
  let m;
  let seen = false;
  while ((m = display.exec(text)) !== null) {
    const inner = m[1];
    const am = ARRAY_RE.exec(inner);
    if (!am) continue;
    seen = true;
    const spec = am[1] || '';
    const body = am[2];
    const before = inner.slice(0, am.index);
    if (/pmatrix|bmatrix|vmatrix|\\left|\\right/.test(before)) return 'matrix delimiters';
    if (/\\begin\{array\}/.test(body)) return 'nested array';
    if (/\\phantom|\\!|\\;|\\,\\,|\\ddot|\\overset|\\underset/.test(body)) return 'diagram spacing';
    if (!(/\\hline/.test(body) || /\|/.test(spec))) return 'no rules';
    const rows = splitTopLevel(body.replace(/\\hline/g, ''), '\\\\')
      .map((r) => r.trim())
      .filter(Boolean);
    if (rows.length < 2) return 'fewer than 2 rows';
    const widths = rows.map((r) => splitTopLevel(r, '&').length);
    if (new Set(widths).size !== 1) return `ragged columns (${[...new Set(widths)].join('/')})`;
    if (widths[0] < 2) return 'single column';
    const cells = rows.map((r) => splitTopLevel(r, '&').map((c) => c.trim()));
    for (const row of cells)
      for (const c of row) {
        if (!c) continue;
        if (/^\\text(?:rm|bf|it)?\{[^{}]*\}$/.test(c)) continue;
        if (/^[\p{L}\p{N}\s.,;:%°()+-]+$/u.test(c) && !/\\/.test(c)) continue;
        try {
          katex.renderToString(c, { throwOnError: true, strict: false });
        } catch {
          return `unparseable cell: ${JSON.stringify(c).slice(0, 60)}`;
        }
      }
    if (rows.length < 2) return 'no body rows';
    const pre = before.trim();
    const post = inner.slice(am.index + am[0].length).trim();
    for (const [label, frag] of [
      ['pre', pre],
      ['post', post],
    ]) {
      if (!frag) continue;
      try {
        katex.renderToString(frag, { throwOnError: true, strict: false });
      } catch {
        return `${label} fragment not standalone`;
      }
    }
    return 'converted?';
  }
  return seen ? 'converted?' : 'array not inside $$...$$';
}

const db = new DatabaseSync('../../data/d1/studywudy-content.fixed.sqlite3', { readOnly: true });
const buckets = new Map();
for (const { book_id } of db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks').all()) {
  const rows = db
    .prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index')
    .all(book_id);
  const p = JSON.parse(
    gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'),
  );
  for (const ch of p.chapters || [])
    for (const ex of ch.exercises || [])
      for (const q of ex.questions || [])
        (function walk(o) {
          if (o == null) return;
          if (typeof o === 'string') {
            if (!/\\begin\{array\}/.test(o)) return;
            if (!/\\hline/.test(o) && !/\\begin\{array\}\s*\{[^{}]*\|/.test(o)) return;
            const r = reason(o);
            const key = r.startsWith('unparseable cell') ? 'unparseable cell' : r;
            if (!buckets.has(key)) buckets.set(key, { n: 0, sample: null, detail: r });
            const b = buckets.get(key);
            b.n++;
            if (!b.sample) b.sample = { q: q.id, text: o.slice(0, 260), detail: r };
            return;
          }
          if (Array.isArray(o)) return o.forEach(walk);
          if (typeof o === 'object') for (const k in o) walk(o[k]);
        })(q);
}

for (const [k, b] of [...buckets].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`\n${String(b.n).padStart(5)}  ${k}`);
  console.log(`       ${b.sample.q}`);
  if (b.sample.detail !== k) console.log(`       ${b.sample.detail}`);
  console.log(`       ${JSON.stringify(b.sample.text)}`);
}
