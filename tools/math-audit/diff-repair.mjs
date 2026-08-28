// Differential between two builds of the repair library, over the source corpus.
//
//   node --max-old-space-size=6144 diff-repair.mjs [--db path] [--limit 25]
//
// Answers the only question that matters before a re-run: which strings does the
// edit move, and does each move look like a repair or a regression? Classifies
// by the direction of two objective measures — how many `$` are left unpaired,
// and how many spans KaTeX cannot parse — so a regression cannot hide in the
// noise of thousands of identical outputs.

import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { repairString as nowFn, countMathFailures } from './lib/repair.mjs';
import { repairString as wasFn } from '/tmp/repair-old/lib/repair.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
// The unrepaired copy on purpose: this measures what the passes do to damaged
// text, and the canonical file mirrors production, which is already repaired.
const DB = opt('db', '../../data/d1/studywudy-content.pristine.sqlite3');
const LIMIT = Number(opt('limit', 25));

const oddDollars = (x) => ((x.match(/(?<!\\)\$/g) || []).length % 2);

const buckets = new Map();
const bump = (key, id, was, now) => {
  let b = buckets.get(key);
  if (!b) buckets.set(key, (b = { n: 0, samples: [] }));
  b.n++;
  if (b.samples.length < LIMIT) b.samples.push({ id, was, now });
};

function* leaves(value) {
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value)) for (const v of value) yield* leaves(v);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) yield* leaves(v);
}

const db = new DatabaseSync(DB, { readOnly: true });
const books = db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id').all().map((r) => r.book_id);

let seen = 0;
let moved = 0;
for (const book of books) {
  let pack;
  try {
    const rows = db.prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index').all(book);
    pack = JSON.parse(gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'));
  } catch { continue; }
  for (const chapter of pack.chapters || [])
    for (const exercise of chapter.exercises || [])
      for (const question of exercise.questions || [])
        for (const text of leaves(question)) {
          seen++;
          let was;
          let now;
          try { was = wasFn(text); now = nowFn(text); } catch { continue; }
          if (was === now) continue;
          moved++;
          const dOdd = oddDollars(now) - oddDollars(was);
          const dFail = countMathFailures(now) - countMathFailures(was);
          const key =
            dOdd < 0 || dFail < 0 ? 'better (fewer stray $ / failures)'
            : dOdd > 0 || dFail > 0 ? 'WORSE (more stray $ / failures)'
            : now.replace(/\s+/g, '') === was.replace(/\s+/g, '') ? 'whitespace only'
            : 'neutral (same score, different text)';
          bump(key, question.id, was, now);
        }
  process.stderr.write(`\r${seen} strings, ${moved} moved`);
}
process.stderr.write('\n');
db.close();

console.log(`strings ${seen.toLocaleString()}   moved by the edit ${moved.toLocaleString()}\n`);
for (const [k, b] of [...buckets].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k.padEnd(38)} ${String(b.n).padStart(7)}`);
for (const [k, b] of [...buckets].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`\n${'='.repeat(78)}\n${k} — ${b.n}`);
  for (const s of b.samples)
    console.log(`  ${s.id}\n    was ${JSON.stringify(s.was.slice(0, 190))}\n    now ${JSON.stringify(s.now.slice(0, 190))}`);
}
