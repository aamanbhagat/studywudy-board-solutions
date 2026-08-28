// Emits the SQL that carries the content fixes to the live D1, one book at a
// time: every book whose gzipped payload differs is deleted and re-inserted
// with its new chunks.
//
//   node make-d1-sql.mjs                 # -> d1-content-fix.sql
//
// Per-book grouping is deliberate. If the import stops halfway, every book is
// either wholly old or wholly new — never half of each — so re-running finishes
// the job rather than repairing it.

import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
const ORIG = opt('orig', '../../data/d1/studywudy-content.sqlite3');
const FIXED = opt('fixed', '../../data/d1/studywudy-content.fixed.sqlite3');
const OUT = opt('out', 'd1-content-fix.sql');

const chunksOf = (db, id) =>
  db
    .prepare('SELECT chunk_index, content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index')
    .all(id)
    .map((r) => Buffer.from(r.content_chunk));

const orig = new DatabaseSync(ORIG, { readOnly: true });
const fixed = new DatabaseSync(FIXED, { readOnly: true });

const books = fixed.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id').all();
const sql = [];
let changed = 0;
let bytes = 0;

for (const { book_id } of books) {
  const a = Buffer.concat(chunksOf(orig, book_id));
  const next = chunksOf(fixed, book_id);
  if (a.equals(Buffer.concat(next))) continue;
  changed++;
  const id = book_id.replace(/'/g, "''");
  sql.push(`DELETE FROM catalog_book_chunks WHERE book_id='${id}';`);
  next.forEach((buf, i) => {
    bytes += buf.length;
    sql.push(
      `INSERT INTO catalog_book_chunks (book_id, chunk_index, content_chunk) VALUES ('${id}',${i},X'${buf.toString('hex')}');`,
    );
  });
}

// Split on book boundaries. A part that fails leaves the books before it done
// and the books after it untouched, so the fix is to re-run that part and the
// ones after — never to work out which half of a book landed.
const CAP = Number(opt('cap', 8e6));
const parts = [];
let cur = [];
let curLen = 0;
for (const group of sql.reduce((acc, line) => {
  if (line.startsWith('DELETE')) acc.push([line]);
  else acc[acc.length - 1].push(line);
  return acc;
}, [])) {
  const len = group.reduce((n, l) => n + l.length + 1, 0);
  if (curLen && curLen + len > CAP) {
    parts.push(cur);
    cur = [];
    curLen = 0;
  }
  cur.push(...group);
  curLen += len;
}
if (cur.length) parts.push(cur);

const base = OUT.replace(/\.sql$/, '');
parts.forEach((p, i) => {
  writeFileSync(`${base}.${String(i + 1).padStart(2, '0')}.sql`, p.join('\n') + '\n');
});
console.log(`books changed   ${changed} of ${books.length}`);
console.log(`statements      ${sql.length}`);
console.log(`blob bytes      ${bytes.toLocaleString()}`);
console.log(`parts           ${parts.length} files, ${base}.NN.sql`);
