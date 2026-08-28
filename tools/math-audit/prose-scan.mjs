// Corruption that survives *outside* math, where KaTeX never looks: leaked
// shortcode markers, bare command tails, stray delimiters. Groups by signature
// so a whole family shows up as one line rather than 400.
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

const DB = process.argv[2] || '../../data/d1/studywudy-content.fixed.sqlite3';

// Everything the renderer treats as prose, with math spans blanked out.
const stripMath = (s) =>
  s
    .replace(/`+[^`]*`+/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/(?<!\\)\$[^$\n]*?(?<!\\)\$/g, ' ');

const SIGNATURES = [
  ['shortcode marker', /\[\/?(?:latex|katex|math|chem|tex)\]/gi],
  ['bare command tail', /(?<![\\A-Za-z])(?:rac|ext|extrm|qrt|imes|ightarrow|heta|lpha|egin|oxed|igl|igr)\{/g],
  ['bare LaTeX command', /\\[A-Za-z]{2,}/g],
  ['odd number of $', /^(?:[^$\n]*\$[^$\n]*)$/gm],
  ['ANSI or control byte', new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g')],
  ['literal backslash-n', /(?<!\\)\\n(?![A-Za-z\\])/g],
  ['unrendered entity', /&(?:amp|lt|gt|nbsp|#\d+);/g],
];

const buckets = new Map(SIGNATURES.map(([n]) => [n, { hits: 0, questions: new Set(), samples: [] }]));
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
            if (key === 'code') return;
            const prose = stripMath(o);
            for (const [name, re] of SIGNATURES) {
              re.lastIndex = 0;
              const found = prose.match(re);
              if (!found) continue;
              const b = buckets.get(name);
              b.hits += found.length;
              b.questions.add(q.id);
              if (b.samples.length < 6) b.samples.push({ q: q.id, text: o.slice(0, 170) });
            }
            return;
          }
          if (Array.isArray(o)) return o.forEach((v) => walk(v, key));
          if (typeof o === 'object') for (const k in o) walk(o[k], k);
        })(q);
}

console.log(`prose scan: ${DB}\n`);
for (const [name, b] of buckets) {
  console.log(`${name.padEnd(24)} hits=${String(b.hits).padStart(7)}  questions=${b.questions.size}`);
  for (const s of b.samples) console.log(`   ${s.q}\n     ${JSON.stringify(s.text)}`);
}
