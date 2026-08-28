// Prints original vs fixed strings for one question id, for debugging a regression.
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

const QIDS = new Set(process.argv.slice(2));
const load = (path) => new DatabaseSync(path, { readOnly: true });
const a = load('../../data/d1/studywudy-content.sqlite3');
const b = load('../../data/d1/studywudy-content.fixed.sqlite3');

function find(db) {
  const hits = new Map();
  for (const { book_id } of db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks').all()) {
    const rows = db
      .prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index')
      .all(book_id);
    const p = JSON.parse(
      gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'),
    );
    for (const ch of p.chapters || [])
      for (const ex of ch.exercises || [])
        for (const q of ex.questions || []) if (QIDS.has(q.id)) hits.set(q.id, q);
    if (hits.size === QIDS.size) break;
  }
  return hits;
}

const strs = (q) => {
  const out = [];
  (function walk(o) {
    if (o == null) return;
    if (typeof o === 'string') return void out.push(o);
    if (Array.isArray(o)) return o.forEach(walk);
    if (typeof o === 'object') for (const k in o) walk(o[k]);
  })(q);
  return out;
};

const ha = find(a);
const hb = find(b);
for (const qid of QIDS) {
  console.log(`\n===== ${qid} =====`);
  const A = strs(ha.get(qid));
  const B = strs(hb.get(qid));
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if (A[i] === B[i]) continue;
    console.log('BEFORE:', JSON.stringify(A[i]));
    console.log('AFTER :', JSON.stringify(B[i]));
  }
}
