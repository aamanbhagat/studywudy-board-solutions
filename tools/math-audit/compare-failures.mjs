// Lists every failing (question, message) pair in two databases and diffs them,
// so we can prove no NEW breakage was introduced.
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import katex from 'katex';
import 'katex/contrib/mhchem';

console.warn = () => {};

// Markdown claims code spans before math, so `$` inside backticks is a literal
// dollar (a PHP variable, a shell prompt) and is never typeset.
const withoutCodeSpans = (s) => s.replace(/`+[^`]*`+/g, (m) => ' '.repeat(m.length));

function extractMath(text) {
  const found = [];
  const src = withoutCodeSpans(text);
  const display = /\$\$([\s\S]+?)\$\$/g;
  let m;
  while ((m = display.exec(src)) !== null) found.push({ tex: m[1], display: true });
  const masked = src.replace(display, (s) => ' '.repeat(s.length));
  const inline = /(?<!\\)\$([^$\n]+?)(?<!\\)\$/g;
  while ((m = inline.exec(masked)) !== null) found.push({ tex: m[1], display: false });
  return found;
}

function collect(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  const fails = new Map(); // qid -> Set(message)
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
          (function walk(o, key) {
            if (o == null) return;
            if (typeof o === 'string') {
              // `kind: "code"` blocks render verbatim in a <pre>; KaTeX never
              // sees them, so a `$` in there is not a math error.
              if (key === 'code' || !o.includes('$')) return;
              for (const { tex, display } of extractMath(o)) {
                try {
                  katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: false });
                } catch (e) {
                  const key = String(e.message).replace(/^KaTeX parse error:\s*/, '').split(' at position ')[0].trim();
                  if (!fails.has(q.id)) fails.set(q.id, new Set());
                  fails.get(q.id).add(key);
                }
              }
              return;
            }
            if (Array.isArray(o)) return o.forEach((v) => walk(v, key));
            if (typeof o === 'object') for (const k in o) walk(o[k], k);
          })(q);
  }
  return fails;
}

const before = collect('../../data/d1/studywudy-content.sqlite3');
const after = collect('../../data/d1/studywudy-content.fixed.sqlite3');

const fixed = [...before.keys()].filter((q) => !after.has(q));
const introduced = [...after.keys()].filter((q) => !before.has(q));

console.log(`questions failing BEFORE: ${before.size}`);
console.log(`questions failing AFTER : ${after.size}`);
console.log(`\nFIXED (${fixed.length}):`);
fixed.forEach((q) => console.log('  -', q, [...before.get(q)].join(' | ').slice(0, 70)));
console.log(`\nNEWLY BROKEN (${introduced.length}):`);
introduced.forEach((q) => console.log('  !', q, [...after.get(q)].join(' | ').slice(0, 70)));
console.log('\nSTILL FAILING (unchanged questions):');
for (const q of after.keys()) {
  if (!before.has(q)) continue;
  console.log('  =', q, [...after.get(q)].join(' | ').slice(0, 70));
}
