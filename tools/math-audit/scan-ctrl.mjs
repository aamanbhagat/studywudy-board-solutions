// Scans for raw control characters in question content. These are the fingerprint
// of C escape-sequence corruption at import time: `\vec` became VT + "ec",
// `\angle` became BEL + "ngle", `\frac` became FF + "rac", and so on.

import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

const DB = process.argv[2] || '../../data/d1/studywudy-content.sqlite3';
const db = new DatabaseSync(DB, { readOnly: true });

// Everything except tab / newline / carriage return, which are legitimate here.
const CTRL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g');

const counts = new Map();
const followers = new Map(); // codepoint -> Map(word -> count)
const samples = new Map();
const affected = new Set();
const books = db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks').all();

for (const b of books) {
  const rows = db
    .prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index')
    .all(b.book_id);
  const payload = JSON.parse(
    gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'),
  );
  for (const ch of payload.chapters || []) {
    for (const ex of ch.exercises || []) {
      for (const q of ex.questions || []) {
        let hit = false;
        (function walk(o) {
          if (o == null) return;
          if (typeof o === 'string') {
            CTRL.lastIndex = 0;
            let m;
            while ((m = CTRL.exec(o)) !== null) {
              hit = true;
              const key = 'U+' + m[0].charCodeAt(0).toString(16).padStart(4, '0').toUpperCase();
              counts.set(key, (counts.get(key) || 0) + 1);
              // What letters follow tells us which command was eaten.
              const word = (/^[A-Za-z]*/.exec(o.slice(m.index + 1)) || [''])[0].slice(0, 8);
              if (!followers.has(key)) followers.set(key, new Map());
              const f = followers.get(key);
              f.set(word, (f.get(word) || 0) + 1);
              if (!samples.has(key)) {
                samples.set(key, o.slice(Math.max(0, m.index - 30), m.index + 30));
              }
            }
            return;
          }
          if (Array.isArray(o)) return o.forEach(walk);
          if (typeof o === 'object') for (const k in o) walk(o[k]);
        })(q);
        if (hit) affected.add(`${b.book_id}|${ch.slug}|${q.id}`);
      }
    }
  }
}

console.log('questions containing control characters:', affected.size);
console.log('');
for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) {
  const top = [...followers.get(k)]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w, n]) => `${JSON.stringify(w)}x${n}`)
    .join(' ');
  console.log(`${String(v).padStart(6)}  ${k}  followed by: ${top}`);
  console.log(`         ctx: ${JSON.stringify(samples.get(k)).slice(0, 100)}`);
}
