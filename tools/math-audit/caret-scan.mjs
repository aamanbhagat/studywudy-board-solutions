// Why does `x^(2)` still reach the reader?
//
// `repairAsciiScripts` already converts the AsciiMath leftovers whose base is a
// plain run of alphanumerics. This runs the real repair over every field that
// carries the notation and classifies whatever survives by the character in
// front of the script, which is what decides the shape of the base:
//
//   greek/symbol base   λ^(2)   π^(*)      -> ASCII_SCRIPT never starts matching
//   bracketed base      (x-1)^(2)          -> base is a parenthesised group
//   no base             ^(n)C_(3)          -> leading superscript, combinatorics
//   emphasis            *a*_(n)            -> markdown markers split the token
//   blank               ______(deliver)    -> NOT maths: a fill-in-the-blank
//
//   node --max-old-space-size=6144 caret-scan.mjs [--db path] [--limit 6]

import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { repairString } from './lib/repair.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
const DB = opt('db', '../../data/d1/studywudy-content.fixed.sqlite3');
const LIMIT = Number(opt('limit', 6));

// A script whose argument is parenthesised. The argument may itself be empty.
const SCRIPT = /(?<!\\)([\^_])\(([^()]{0,24})\)/gu;

const buckets = new Map();
function hit(key, id, sample) {
  let b = buckets.get(key);
  if (!b) buckets.set(key, (b = { hits: 0, questions: new Set(), samples: [] }));
  b.hits++;
  b.questions.add(id);
  if (b.samples.length < LIMIT) b.samples.push({ id, sample });
}

/** Classify by what sits immediately before the `^` or `_`. */
function classify(text, at, mark) {
  const before = text.slice(0, at);
  if (mark === '_' && /_$/.test(before)) return 'blank (fill-in-the-blank, leave alone)';
  if (/[)\]}]$/.test(before)) return 'bracketed base';
  if (/[A-Za-z0-9]$/.test(before)) return 'alphanumeric base (repair declined)';
  if (/\*$/.test(before)) return 'emphasis base';
  if (/\$$/.test(before)) return 'math-adjacent base';
  if (/[\p{L}\p{M}]$/u.test(before)) return 'greek / non-ascii base';
  if (/^\s*$|[\s(,;:=+\-*/<>]$/.test(before)) return 'no base (leading script)';
  return 'other';
}

function* leaves(value, path = '') {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value)) for (const v of value) yield* leaves(v, `${path}[]`);
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) yield* leaves(v, path ? `${path}.${k}` : k);
}

const db = new DatabaseSync(DB, { readOnly: true });
const books = db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id').all().map((r) => r.book_id);

let before = 0;
let after = 0;
for (const book of books) {
  let pack;
  try {
    const rows = db.prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index').all(book);
    pack = JSON.parse(gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'));
  } catch { continue; }
  for (const chapter of pack.chapters || [])
    for (const exercise of chapter.exercises || [])
      for (const question of exercise.questions || [])
        for (const [, text] of leaves(question)) {
          if (!text.includes('^(') && !text.includes('_(')) continue;
          SCRIPT.lastIndex = 0;
          before += (text.match(SCRIPT) || []).length;
          let fixed;
          try { fixed = repairString(text); } catch { fixed = text; }
          SCRIPT.lastIndex = 0;
          let m;
          while ((m = SCRIPT.exec(fixed)) !== null) {
            after++;
            hit(classify(fixed, m.index, m[1]), question.id,
              fixed.slice(Math.max(0, m.index - 70), m.index + 90).replace(/\n/g, '⏎'));
          }
        }
}
db.close();

console.log(`parenthesised scripts before repair  ${before}`);
console.log(`                       after repair  ${after}   (${(100 * (before - after) / before).toFixed(1)}% already handled)\n`);
console.log('surviving, by shape of the base');
for (const [key, b] of [...buckets].sort((a, b) => b[1].hits - a[1].hits))
  console.log(`  ${key.padEnd(42)} ${String(b.hits).padStart(6)} hits  ${String(b.questions.size).padStart(5)} questions`);

for (const [key, b] of [...buckets].sort((a, b) => b[1].hits - a[1].hits)) {
  console.log(`\n${'='.repeat(78)}\n${key}  —  ${b.hits} hits`);
  for (const s of b.samples) console.log(`  ${s.id}\n    …${s.sample}…`);
}
