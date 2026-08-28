// Carry the repair into catalog_questions.prompt_text.
//
//   node --max-old-space-size=6144 sync-prompt-text.mjs [--db path] [--apply]
//                                                       [--sql prefix] [--per 2000]
//
// `fix.mjs` rewrote catalog_book_chunks and nothing else, but the prompt is
// stored twice: once in the chunks the page body renders from, and once as a
// flat copy in this column. The column is what the <h1>, the <title>, the meta
// description, the search excerpt and the JSON-LD `name`/`text` are cut from,
// so a question whose chunk was repaired still shows the damaged text at the
// top of its own page — `$F_{2}$` set as maths in the body, `F_(2)` in the
// heading above it.
//
// The derivation is not guessed. `contentToText` over the pristine chunks
// reproduces all 299,458 rows of the column byte for byte, which is what makes
// re-deriving it from the repaired chunks a repair rather than a rewrite: the
// only rows that move are the ones the repair moved.

import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { contentToText } from './lib/site-render.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
const has = (n) => args.includes(`--${n}`);

const DB = opt('db', '../../data/d1/studywudy-content.fixed.sqlite3');
const APPLY = has('apply');
const SQL_PREFIX = opt('sql', null);
const PER_FILE = Number(opt('per', 2000));

// Same guard as fix.mjs: writing to the pristine copy is unrecoverable, and the
// canonical file is the one two dozen build scripts read.
if (APPLY && !/fixed|content\.sqlite3$/u.test(DB) && !has('force')) {
  console.error(`refusing to --apply to ${DB} (no "fixed" in the name); pass --force if you mean it`);
  process.exit(1);
}
if (APPLY && /pristine/u.test(DB)) {
  console.error('refusing to --apply to the pristine copy; it is the only baseline there is');
  process.exit(1);
}

const db = new DatabaseSync(DB, { readOnly: !APPLY });
const stored = new Map();
for (const row of db.prepare('SELECT question_id, prompt_text FROM catalog_questions').all()) {
  stored.set(row.question_id, row.prompt_text);
}

const books = db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id').all();
const changes = [];
let seen = 0;
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
        if (!stored.has(question.id)) continue;
        const now = contentToText(question.prompt);
        // NOT NULL on the column, and a prompt that flattens to nothing would
        // leave the page with a blank heading — leave those rows alone.
        if (!now.trim()) continue;
        if (stored.get(question.id) === now) continue;
        changes.push({ id: question.id, was: stored.get(question.id), now });
      }
  process.stderr.write(`\r${seen} questions, ${changes.length} to move`);
}
process.stderr.write('\n');

console.log(`${DB}`);
console.log(`questions        ${seen.toLocaleString()}`);
console.log(`rows to move     ${changes.length.toLocaleString()}`);

if (APPLY) {
  db.exec('BEGIN');
  const update = db.prepare('UPDATE catalog_questions SET prompt_text=? WHERE question_id=?');
  for (const change of changes) update.run(change.now, change.id);
  db.exec('COMMIT');
  console.log(`applied          ${changes.length.toLocaleString()}`);
}
db.close();

if (SQL_PREFIX) {
  // One UPDATE per row, split into files small enough for `wrangler d1 execute`
  // to swallow. Every statement is idempotent and keyed on question_id, so a
  // run that stops halfway is carried on rather than repaired.
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const parts = [];
  for (let index = 0; index < changes.length; index += PER_FILE) parts.push(changes.slice(index, index + PER_FILE));
  parts.forEach((part, index) => {
    const name = `${SQL_PREFIX}.${String(index + 1).padStart(2, '0')}.sql`;
    const body = part.map((change) => `UPDATE catalog_questions SET prompt_text=${quote(change.now)} WHERE question_id=${quote(change.id)};`).join('\n');
    writeFileSync(name, `${body}\n`);
    console.log(`  ${name}  ${part.length} statements`);
  });
}
