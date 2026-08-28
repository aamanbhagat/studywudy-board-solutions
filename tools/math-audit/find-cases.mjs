// Locate the questions behind the reported screenshots and print their stored
// source, so the repair is designed against the real text rather than a guess.

import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

const DB = process.argv[2] || '../../data/d1/studywudy-content.fixed.sqlite3';

const NEEDLES = [
  ['img1 matrices Q73', 'The total cost of 3 T.V. sets'],
  ['img2 trig Q39', 'sin(B'],
  ['img3 matrices Q63', 'find a matrix X such that XA'],
  ['img4 switching table', 'denotes a closed switch'],
  ['img5 augmented rows', 'Eliminate y from the third row'],
];

const db = new DatabaseSync(DB, { readOnly: true });
const books = db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id').all().map((r) => r.book_id);

const found = new Map();
for (const book of books) {
  if (found.size === NEEDLES.length) break;
  let pack;
  try {
    const rows = db.prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index').all(book);
    pack = JSON.parse(gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'));
  } catch { continue; }
  for (const ch of pack.chapters || [])
    for (const ex of ch.exercises || [])
      for (const q of ex.questions || []) {
        const s = JSON.stringify(q);
        for (const [label, needle] of NEEDLES) {
          if (found.has(label)) continue;
          if (s.includes(needle)) found.set(label, { book, chapter: ch.slug || ch.id, q });
        }
      }
}
db.close();

for (const [label] of NEEDLES) {
  const f = found.get(label);
  console.log(`\n${'='.repeat(78)}\n${label}`);
  if (!f) { console.log('  NOT FOUND'); continue; }
  console.log(`  book    ${f.book}`);
  console.log(`  chapter ${f.chapter}`);
  console.log(`  id      ${f.q.id}`);
  console.log(JSON.stringify(f.q, null, 1));
}
