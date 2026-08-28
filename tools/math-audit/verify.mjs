// Structural verification: the fixed database must be identical to the original
// in every way except the content we deliberately changed.
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

const CTRL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g');

function survey(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  const out = {
    integrity: Object.values(db.prepare('PRAGMA integrity_check').get())[0],
    tables: db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r) => r.name),
    rowCounts: {},
    books: 0,
    chapters: 0,
    exercises: 0,
    questions: 0,
    questionIds: 0,
    tableBlocks: 0,
    arrayBlocks: 0,
    controlChars: 0,
  };
  for (const t of out.tables) {
    out.rowCounts[t] = db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get().c;
  }
  const ids = new Set();
  for (const { book_id } of db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks').all()) {
    const rows = db
      .prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index')
      .all(book_id);
    const raw = gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString(
      'utf8',
    );
    const j = JSON.parse(raw);
    out.books++;
    for (const ch of j.chapters || []) {
      out.chapters++;
      for (const ex of ch.exercises || []) {
        out.exercises++;
        for (const q of ex.questions || []) {
          out.questions++;
          ids.add(q.id);
        }
      }
    }
    out.tableBlocks += (raw.match(/"kind":"table"/g) || []).length;
    out.arrayBlocks += (raw.match(/\\\\begin\{array\}/g) || []).length;
    // Control bytes are \u-escaped in the JSON source, so count them on the
    // decoded strings rather than the raw text.
    (function walk(o) {
      if (o == null) return;
      if (typeof o === 'string') return void (out.controlChars += (o.match(CTRL) || []).length);
      if (typeof o === 'object') for (const k in o) walk(o[k]);
    })(j);
  }
  out.questionIds = ids.size;
  return out;
}

const before = survey('../../data/d1/studywudy-content.sqlite3');
const after = survey('../../data/d1/studywudy-content.fixed.sqlite3');

const rows = [
  ['integrity_check', before.integrity, after.integrity],
  ['tables', before.tables.join(','), after.tables.join(',')],
  ['books', before.books, after.books],
  ['chapters', before.chapters, after.chapters],
  ['exercises', before.exercises, after.exercises],
  ['questions', before.questions, after.questions],
  ['unique question ids', before.questionIds, after.questionIds],
  ['native table blocks', before.tableBlocks, after.tableBlocks],
  ['\\begin{array} uses', before.arrayBlocks, after.arrayBlocks],
  ['control characters', before.controlChars, after.controlChars],
];
for (const t of Object.keys(before.rowCounts)) {
  rows.push([`rows: ${t}`, before.rowCounts[t], after.rowCounts[t]]);
}

const w = Math.max(...rows.map((r) => String(r[0]).length));
console.log(`${'metric'.padEnd(w)}  ${'before'.padStart(12)}  ${'after'.padStart(12)}   `);
for (const [k, b, a] of rows) {
  const same = String(b) === String(a);
  console.log(
    `${String(k).padEnd(w)}  ${String(b).slice(0, 12).padStart(12)}  ${String(a).slice(0, 12).padStart(12)}  ${same ? '=' : '~'}`,
  );
}
