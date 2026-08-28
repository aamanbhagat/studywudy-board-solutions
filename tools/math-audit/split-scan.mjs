// The two classes left over from the repair pass, without the KaTeX render that
// makes state-scan slow: spans welded to their neighbour, and dollars the
// tokenizer never paired. Sub-classifies each so the harmful cases can be told
// apart from the ones that are a legitimate currency sign or a fenced snippet.
//
//   node --max-old-space-size=6144 split-scan.mjs [--db path] [--limit 10]

import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { normalizeText, tokenize } from './lib/site-render.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
const DB = opt('db', '../../data/d1/studywudy-content.fixed.sqlite3');
const LIMIT = Number(opt('limit', 10));

const buckets = new Map();
function hit(key, id, sample) {
  let b = buckets.get(key);
  if (!b) buckets.set(key, (b = { hits: 0, questions: new Set(), samples: [] }));
  b.hits++;
  b.questions.add(id);
  if (b.samples.length < LIMIT) b.samples.push({ id, sample });
}

// A dollar the reader is shown. Currency is the honest one: a digit or a space
// then a digit after it, or one of the words a price sits next to.
const CURRENCY = /\$\s?\d|\$\s?[.,]|(?:Rs|US|HK|SGD|CAD|AUD|NZ|₹|£|€)\s*\$|\$\s*(?:each|per|only|note|coin|bill)\b/i;
const IN_CODE = /`[^`]*\$|\$[^`]*`/;

function classifySplit(prev, cur) {
  if (prev.display && cur.display) return 'split: display welded to display';
  if (!prev.display && cur.display) return 'split: inline welded to a display block';
  if (prev.display && !cur.display) return 'split: display welded to inline';
  return 'split: inline welded to inline';
}

function classifyDollar(txt) {
  if (CURRENCY.test(txt)) return 'dollar: currency, leave alone';
  if (IN_CODE.test(txt)) return 'dollar: inside a code span, leave alone';
  if (/\$\s*$/.test(txt) || /^\s*\$/.test(txt)) return 'dollar: stranded at a run edge';
  return 'dollar: loose in prose';
}

function* leaves(value, key = '') {
  if (typeof value === 'string') { if (key !== 'code') yield value; return; }
  if (Array.isArray(value)) { for (const v of value) yield* leaves(v, key); return; }
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* leaves(v, k);
}

const db = new DatabaseSync(DB, { readOnly: true });
const books = db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id').all().map((r) => r.book_id);

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
          if (!text.includes('$')) continue;
          const toks = [...tokenize(normalizeText(text))];
          for (let i = 0; i < toks.length; i++) {
            const t = toks[i];
            if (t.kind === 'math') {
              const prev = toks[i - 1];
              if (prev && prev.kind === 'math' && (t.display || prev.display))
                hit(classifySplit(prev, t), question.id, `${prev.raw.slice(-40)} ⟦|⟧ ${t.raw.slice(0, 60)}`);
            } else if (/(?<!\\)\$/.test(t.raw)) {
              hit(classifyDollar(t.raw), question.id, JSON.stringify(t.raw.slice(0, 130)));
            }
          }
        }
}
db.close();

for (const [k, b] of [...buckets].sort((a, b) => b[1].hits - a[1].hits))
  console.log(`${k.padEnd(44)} ${String(b.hits).padStart(5)} hits  ${String(b.questions.size).padStart(4)} questions`);
for (const [k, b] of [...buckets].sort((a, b) => b[1].hits - a[1].hits)) {
  console.log(`\n${'='.repeat(78)}\n${k} — ${b.hits}`);
  for (const s of b.samples) console.log(`  ${s.id}\n    ${s.sample}`);
}
