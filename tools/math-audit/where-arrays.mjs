// Where do the still-unconverted ruled arrays live? The converter only rewrites
// paragraph blocks inside a `blocks` array; anything in a bare string field
// needs a different treatment.
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

const db = new DatabaseSync(process.argv[2] || '../../data/d1/studywudy-content.fixed.sqlite3', {
  readOnly: true,
});
const paths = new Map();
const bump = (p) => paths.set(p, (paths.get(p) || 0) + 1);

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
            if (!/\\begin\{array\}/.test(o)) return;
            if (!/\\hline/.test(o) && !/\\begin\{array\}\s*\{[^{}]*\|/.test(o)) return;
            bump(path);
            return;
          }
          if (Array.isArray(o)) return o.forEach((v) => walk(v, `${path}[]`));
          if (typeof o === 'object') for (const k in o) walk(o[k], `${path}.${k}`);
        })(q, 'q');
}

for (const [p, n] of [...paths].sort((a, b) => b[1] - a[1])) {
  console.log(String(n).padStart(6), p);
}
