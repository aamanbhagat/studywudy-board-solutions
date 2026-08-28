// The audit that matters: renders every string through the site's *own*
// pipeline (lifted from the deployed Worker in lib/site-render.mjs) and counts
// what KaTeX rejects. A hand-written tokenizer disagrees with the real one, and
// the real one is what decides whether a reader sees maths or red source text.
//
//   node site-audit.mjs                       # before vs after
//   node site-audit.mjs --db path.sqlite3     # single database
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import katex from 'katex';
import 'katex/contrib/mhchem';
import { normalizeText, tokenize, relaxed } from './lib/site-render.mjs';

console.warn = () => {};

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
const ORIG = '../../data/d1/studywudy-content.sqlite3';
const FIXED = '../../data/d1/studywudy-content.fixed.sqlite3';

// A ruled array renders as an <mtable>: no column rules, no \hline, no padding.
// That is the reported truth-table bug, and KaTeX never complains about it.
const RULED_ARRAY = /\\begin\{array\}(?:\s*\{[^{}]*\|[^{}]*\})|\\begin\{array\}[\s\S]*?\\hline/;

function scan(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const failures = new Map(); // question id -> first error
  let tokens = 0;
  let broken = 0;
  let ruled = 0;
  const ruledQuestions = new Set();

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
              // `code` blocks go into a <pre> untouched; KaTeX never sees them.
              if (key === 'code' || !o.includes('$')) return;
              for (const t of tokenize(normalizeText(o))) {
                if (t.kind !== 'math') continue;
                tokens++;
                if (RULED_ARRAY.test(t.value)) {
                  ruled++;
                  ruledQuestions.add(q.id);
                }
                try {
                  katex.renderToString(relaxed(t.value, t.display), {
                    displayMode: t.display,
                    throwOnError: true,
                    strict: false,
                  });
                } catch (err) {
                  broken++;
                  if (!failures.has(q.id)) failures.set(q.id, String(err.message).slice(0, 90));
                }
              }
              return;
            }
            if (Array.isArray(o)) return o.forEach((v) => walk(v, key));
            if (typeof o === 'object') for (const k in o) walk(o[k], k);
          })(q);
  }
  db.close();
  return { failures, tokens, broken, ruled, ruledQuestions };
}

const single = opt('db', null);
if (single) {
  const r = scan(single);
  console.log(`${single}\n  math tokens ${r.tokens}\n  broken ${r.broken} in ${r.failures.size} questions`);
  console.log(`  ruled arrays ${r.ruled} in ${r.ruledQuestions.size} questions`);
  for (const [id, e] of [...r.failures].slice(0, 40)) console.log(`   ${id}  ${e}`);
} else {
  const before = scan(ORIG);
  const after = scan(FIXED);
  const pad = (n) => String(n).padStart(8);
  console.log('rendered through the site pipeline\n');
  console.log(`metric                 ${'before'.padStart(8)}${'after'.padStart(10)}`);
  console.log(`math tokens           ${pad(before.tokens)}  ${pad(after.tokens)}`);
  console.log(`broken math tokens    ${pad(before.broken)}  ${pad(after.broken)}`);
  console.log(`questions affected    ${pad(before.failures.size)}  ${pad(after.failures.size)}`);
  console.log(`ruled arrays          ${pad(before.ruled)}  ${pad(after.ruled)}`);
  console.log(`  in questions        ${pad(before.ruledQuestions.size)}  ${pad(after.ruledQuestions.size)}`);

  const newly = [...after.failures].filter(([id]) => !before.failures.has(id));
  console.log(`\nNEWLY BROKEN (${newly.length}):`);
  for (const [id, e] of newly.slice(0, 40)) console.log(`  - ${id}  ${e}`);

  const still = [...after.failures].filter(([id]) => before.failures.has(id));
  console.log(`\nSTILL BROKEN (${still.length}):`);
  for (const [id, e] of still.slice(0, 40)) console.log(`  - ${id}  ${e}`);
}
