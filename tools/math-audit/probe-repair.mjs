// Runs the repair pipeline over the *original* strings of a named question and
// prints before/after, so a change can be judged on real data before a rebuild.
//   node probe-repair.mjs q-id-1 q-id-2 ...
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { repairStringDetailed, countMathFailures } from './lib/repair.mjs';

const ids = new Set(process.argv.slice(2));
const db = new DatabaseSync('../../data/d1/studywudy-content.sqlite3', { readOnly: true });
const show = (s) => JSON.stringify(s).slice(0, 400);

for (const { book_id } of db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks').all()) {
  const rows = db
    .prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index')
    .all(book_id);
  const p = JSON.parse(
    gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'),
  );
  for (const ch of p.chapters || [])
    for (const ex of ch.exercises || [])
      for (const q of ex.questions || []) {
        if (!ids.has(q.id)) continue;
        console.log(`\n=== ${q.id}`);
        (function walk(o, path) {
          if (o == null) return;
          if (typeof o === 'string') {
            const { text, tier } = repairStringDetailed(o);
            if (text === o) return;
            console.log(`\n  ${path}  [${tier}]  fail ${countMathFailures(o)} -> ${countMathFailures(text)}`);
            console.log(`  BEFORE ${show(o)}`);
            console.log(`  AFTER  ${show(text)}`);
            return;
          }
          if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${path}[${i}]`));
          if (typeof o === 'object') for (const k in o) walk(o[k], `${path}.${k}`);
        })(q, 'q');
      }
}
