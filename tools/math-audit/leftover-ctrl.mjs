// Where are the control bytes the repair deliberately left behind?
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

const CTRL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g');
const db = new DatabaseSync(process.argv[2] || '../../data/d1/studywudy-content.fixed.sqlite3', {
  readOnly: true,
});

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
        (function walk(o, path) {
          if (o == null) return;
          if (typeof o === 'string') {
            const n = (o.match(CTRL) || []).length;
            if (n) console.log(`${n}  ${q.id}  ${path}\n   ${JSON.stringify(o).slice(0, 200)}`);
            return;
          }
          if (Array.isArray(o)) return o.forEach((v, i) => walk(v, `${path}[${i}]`));
          if (typeof o === 'object') for (const k in o) walk(o[k], `${path}.${k}`);
        })(q, 'q');
}
