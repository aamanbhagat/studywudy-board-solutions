// `\textrm` arrived as TAB+"extrm": the generator interpreted C escape sequences,
// so \t, \r and \n ate the backslash of any command starting with those letters.
// This measures how often a tab/CR is followed by letters that complete a real
// LaTeX command, which is the signature of that corruption.

import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

const db = new DatabaseSync(process.argv[2] || '../../data/d1/studywudy-content.sqlite3', {
  readOnly: true,
});

// Commands whose names begin with t / r / n, minus the eaten first letter.
const TAILS = {
  '\t': ['ext', 'extrm', 'extbf', 'imes', 'heta', 'riangle', 'an', 'o', 'frac', 'ilde', 'au', 'extit'],
  '\r': ['ightarrow', 'ight', 'ho', 'm', 'ightleftharpoons'],
  '\n': ['eq', 'ot', 'u', 'abla', 'eg'],
};

const counts = new Map();
const samples = new Map();
const qs = new Set();

for (const b of db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks').all()) {
  const rows = db
    .prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index')
    .all(b.book_id);
  const p = JSON.parse(
    gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'),
  );
  for (const ch of p.chapters || [])
    for (const ex of ch.exercises || [])
      for (const q of ex.questions || []) {
        (function walk(o) {
          if (o == null) return;
          if (typeof o === 'string') {
            for (const [c, tails] of Object.entries(TAILS)) {
              let i = -1;
              while ((i = o.indexOf(c, i + 1)) !== -1) {
                const after = o.slice(i + 1);
                // Longest matching tail wins (extrm before ext).
                const hit = tails
                  .filter((t) => after.startsWith(t))
                  .sort((a, z) => z.length - a.length)[0];
                if (!hit) continue;
                // Require a LaTeX-ish continuation, not an ordinary English word.
                if (!/^[{\\^_$( ]/.test(after.slice(hit.length))) continue;
                const key = `${JSON.stringify(c)} + "${hit}"`;
                counts.set(key, (counts.get(key) || 0) + 1);
                qs.add(q.id);
                if (!samples.has(key))
                  samples.set(key, o.slice(Math.max(0, i - 40), i + 45));
              }
            }
            return;
          }
          if (Array.isArray(o)) return o.forEach(walk);
          if (typeof o === 'object') for (const k in o) walk(o[k]);
        })(q);
      }
}

let total = 0;
for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) {
  total += v;
  console.log(String(v).padStart(6), k, ' ctx:', JSON.stringify(samples.get(k)).slice(0, 88));
}
console.log(`\ntotal ${total} occurrences across ${qs.size} questions`);
