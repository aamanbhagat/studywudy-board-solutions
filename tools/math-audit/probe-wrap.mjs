// Isolates what wrapBareCommands alone does, so a 2.7k-string change class can
// be eyeballed before it is trusted.
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { wrapBareCommands } from './lib/repair.mjs';

const db = new DatabaseSync(process.argv[2] || '../../data/d1/studywudy-content.sqlite3', {
  readOnly: true,
});

const byCmd = new Map();
const samples = [];
let n = 0;

for (const b of db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks').all()) {
  const rows = db
    .prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index')
    .all(b.book_id);
  const p = JSON.parse(
    gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'),
  );
  for (const ch of p.chapters || [])
    for (const ex of ch.exercises || [])
      for (const q of ex.questions || [])
        (function walk(o) {
          if (o == null) return;
          if (typeof o === 'string') {
            const w = wrapBareCommands(o);
            if (w === o) return;
            n++;
            for (const m of o.matchAll(/\\([A-Za-z]+)/g)) {
              if (!w.includes(`$\\${m[1]}`)) continue;
              byCmd.set(m[1], (byCmd.get(m[1]) || 0) + 1);
            }
            if (samples.length < 22 && Math.min(o.length, 200) > 25)
              samples.push({ q: q.id, before: o.slice(0, 190), after: w.slice(0, 210) });
            return;
          }
          if (Array.isArray(o)) return o.forEach(walk);
          if (typeof o === 'object') for (const k in o) walk(o[k]);
        })(q);
}

console.log(`strings changed by wrapBareCommands alone: ${n}\n`);
console.log('most-wrapped commands:');
for (const [c, v] of [...byCmd].sort((a, b) => b[1] - a[1]).slice(0, 22))
  console.log(String(v).padStart(6), '\\' + c);
console.log('\nsamples:');
for (const s of samples) {
  console.log(`\n- ${s.q}`);
  console.log('  BEFORE:', JSON.stringify(s.before));
  console.log('  AFTER :', JSON.stringify(s.after));
}
