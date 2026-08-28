// Corruption that KaTeX happily renders as nonsense: a lost backslash turns
// \times into the variables t,i,m,e,s, which parses fine and reads as garbage.
// Parse-error counts miss this entire class, so look for the signatures.
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { mathSegments } from './lib/repair.mjs';

const DB = process.argv[2] || '../../data/d1/studywudy-content.fixed.sqlite3';

// Tails left behind when a C escape ate the backslash (\times -> TAB + "imes").
const TAILS =
  'ext|extrm|extbf|extit|imes|heta|ilde|riangle|rac|ightarrow|ightleftharpoons|ight|ho|au|an|ec|elta|lpha|eta|amma|ambda|u|o';
const LOST_SLASH = new RegExp(`(?<![\\\\A-Za-z])(?:${TAILS})\\{`, 'g');

const CHECKS = [
  ['lost backslash before {', (tex) => LOST_SLASH.test(tex)],
  ['literal backslash-n', (tex) => /(?<!\\)\\n(?![A-Za-z\\])/.test(tex)],
  ['ANSI remnant', (tex) => /\[[0-9;]{1,4}m(?![a-z])/.test(tex)],
  ['unconverted ruled array', (tex) => /\\begin\{array\}/.test(tex) && /\\hline|\{[^{}]*\|/.test(tex)],
  ['nested \\text stutter', (tex) => /(\\text\{\s*){2,}/.test(tex)],
];

const counts = new Map(CHECKS.map(([n]) => [n, { spans: 0, questions: new Set(), sample: null }]));
const db = new DatabaseSync(DB, { readOnly: true });

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
        (function walk(o, key) {
          if (o == null) return;
          if (typeof o === 'string') {
            if (key === 'code' || !o.includes('$')) return;
            for (const { tex } of mathSegments(o)) {
              for (const [name, test] of CHECKS) {
                LOST_SLASH.lastIndex = 0;
                if (!test(tex)) continue;
                const c = counts.get(name);
                c.spans++;
                c.questions.add(q.id);
                if (!c.sample) c.sample = { question: q.id, tex: tex.slice(0, 160) };
              }
            }
            return;
          }
          if (Array.isArray(o)) return o.forEach((v) => walk(v, key));
          if (typeof o === 'object') for (const k in o) walk(o[k], k);
        })(q);
}

console.log(`residual scan: ${DB}\n`);
for (const [name, c] of counts) {
  console.log(`${name.padEnd(26)} spans=${String(c.spans).padStart(6)}  questions=${c.questions.size}`);
  if (c.sample) console.log(`   e.g. ${c.sample.question}\n        ${JSON.stringify(c.sample.tex)}`);
}
