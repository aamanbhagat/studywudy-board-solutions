// Count and sample an arbitrary pattern across every stored field, so a repair
// can be sized before it is written.
//
//   node --max-old-space-size=6144 pattern-scan.mjs --re '\^\(' [--db path] [--limit 20]
//
// Reports hits per field, distinct questions, and the books they live in.

import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
const DB = opt('db', '../../data/d1/studywudy-content.fixed.sqlite3');
const LIMIT = Number(opt('limit', 20));
const SOURCE = opt('re', null);
if (!SOURCE) throw new Error('pass --re <pattern>');
const RE = new RegExp(SOURCE, 'gu');

const db = new DatabaseSync(DB, { readOnly: true });
const books = db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id').all().map((r) => r.book_id);

const fields = new Map();
const questions = new Set();
const bookHits = new Map();
const samples = [];
let total = 0;

/** Walk a question, visiting every string leaf with its dotted path. */
function walk(value, path, visit) {
  if (typeof value === 'string') return visit(path, value);
  if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${path}[]`, visit));
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k, visit);
}

for (const book of books) {
  let pack;
  try {
    const rows = db.prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index').all(book);
    pack = JSON.parse(gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'));
  } catch { continue; }
  for (const chapter of pack.chapters || [])
    for (const exercise of chapter.exercises || [])
      for (const question of exercise.questions || [])
        walk(question, '', (path, text) => {
          RE.lastIndex = 0;
          const matches = text.match(RE);
          if (!matches) return;
          total += matches.length;
          fields.set(path, (fields.get(path) || 0) + matches.length);
          questions.add(question.id);
          bookHits.set(book, (bookHits.get(book) || 0) + matches.length);
          if (samples.length < LIMIT) {
            const at = text.search(RE);
            samples.push({ id: question.id, book, path, text: text.slice(Math.max(0, at - 90), at + 110) });
          }
        });
}
db.close();

console.log(`pattern  /${SOURCE}/`);
console.log(`hits     ${total}   questions ${questions.size}   books ${bookHits.size}\n`);
console.log('by field');
for (const [path, n] of [...fields].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}  ${path}`);
console.log('\nby book');
for (const [book, n] of [...bookHits].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(n).padStart(6)}  ${book}`);
console.log('\nsamples');
for (const s of samples) console.log(`\n  ${s.id}\n  ${s.path}\n  …${s.text.replace(/\n/g, '⏎')}…`);
