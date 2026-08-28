// How far has catalog_questions.prompt_text drifted from the repaired chunks?
//
//   node --max-old-space-size=6144 prompt-text-drift.mjs [--db path]
//
// The repair rewrote catalog_book_chunks only. This column is a second, flat
// copy of the same prompt, and it is the one the <h1>, <title>, meta
// description, search excerpts and JSON-LD are cut from — so every row that
// still disagrees with its chunk is a page whose heading shows the damaged
// text while the body below it renders the repaired version.
//
// The column was written by an earlier phase that is not in this repository, so
// the derivation is inferred rather than reused: `contentToText` over the chunk
// prompt. The scan reports how much of the column that reproduces exactly,
// which is what says whether re-deriving it is a repair or a rewrite.

import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { contentToText } from './lib/site-render.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
const DB = opt('db', '../../data/d1/studywudy-content.sqlite3');
const LIMIT = Number(opt('limit', 12));
const SHAPE = opt('shape', null);

// No whitespace tidying: the column keeps the newlines and the double spaces
// the prompt was written with, so collapsing them here would read as drift.
const derive = (question) => contentToText(question?.prompt);
const shapeOf = (question) => (typeof question?.prompt === 'string' ? 'string' : question?.prompt?.kind || 'other');

const db = new DatabaseSync(DB, { readOnly: true });
const stored = new Map();
for (const row of db.prepare('SELECT question_id, prompt_text FROM catalog_questions').all()) {
  stored.set(row.question_id, row.prompt_text);
}

const books = db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id').all();
const tally = new Map();
let seen = 0;
let matched = 0;
let drifted = 0;
let missing = 0;
const samples = [];
const driftedBooks = new Set();

for (const { book_id } of books) {
  let pack;
  try {
    const rows = db.prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index').all(book_id);
    pack = JSON.parse(gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'));
  } catch { continue; }
  for (const chapter of pack.chapters || [])
    for (const exercise of chapter.exercises || [])
      for (const question of exercise.questions || []) {
        seen++;
        if (!stored.has(question.id)) { missing++; continue; }
        const shape = shapeOf(question);
        const was = String(stored.get(question.id) ?? '');
        const now = derive(question);
        const bucket = tally.get(shape) || { n: 0, same: 0 };
        bucket.n++;
        if (was === now) bucket.same++;
        tally.set(shape, bucket);
        if (was === now) { matched++; continue; }
        drifted++;
        driftedBooks.add(book_id);
        if (samples.length < LIMIT && (!SHAPE || SHAPE === shape)) samples.push({ id: question.id, shape, was, now });
      }
  process.stderr.write(`\r${seen} questions, ${drifted} drifted`);
}
process.stderr.write('\n');
db.close();

console.log(`${DB}\n`);
console.log(`questions in chunks      ${seen.toLocaleString()}`);
console.log(`column reproduced        ${matched.toLocaleString()}`);
console.log(`column drifted           ${drifted.toLocaleString()}`);
console.log(`no catalog_questions row ${missing.toLocaleString()}`);
console.log(`books affected           ${driftedBooks.size.toLocaleString()}\n`);
for (const [shape, b] of [...tally].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${shape.padEnd(12)} ${String(b.n).padStart(7)}  reproduced ${String(b.same).padStart(7)}  drifted ${String(b.n - b.same).padStart(6)}`);
}
for (const s of samples) console.log(`\n  ${s.id}  [${s.shape}]\n    column  ${JSON.stringify(s.was.slice(0, 160))}\n    derived ${JSON.stringify(s.now.slice(0, 160))}`);
