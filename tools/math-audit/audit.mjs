// Read-only audit of every math expression stored in catalog_book_chunks.
// Extracts $...$ / $$...$$ segments, parses each with KaTeX, and buckets the
// failures so we know what actually needs fixing before touching any data.
//
//   node audit.mjs [--db ../../data/d1/studywudy-content.sqlite3] [--out report.json]

import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import katex from 'katex';
// The production Worker bundles mhchem, so \ce{...} is valid there. Load it
// here too or every chemistry equation reports a false failure.
import 'katex/contrib/mhchem';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
const DB = opt('db', '../../data/d1/studywudy-content.sqlite3');
const OUT = opt('out', 'report.json');

const db = new DatabaseSync(DB, { readOnly: true });

// KaTeX reports unsupported Unicode via console.warn rather than throwing, so
// capture those separately - they render as blanks/tofu instead of failing.
const charWarnings = new Map();
console.warn = (msg) => {
  const m = /No character metrics for '(.+?)' in style '(.+?)'/.exec(String(msg));
  const key = m ? `${m[1]}` : String(msg).slice(0, 120);
  charWarnings.set(key, (charWarnings.get(key) || 0) + 1);
};

// Split a markdown-ish string into math segments. Handles $$...$$ first so the
// inline pass never splits a display block down the middle.
function extractMath(text) {
  const found = [];
  const display = /\$\$([\s\S]+?)\$\$/g;
  let masked = text;
  let m;
  while ((m = display.exec(text)) !== null) {
    found.push({ tex: m[1], display: true });
  }
  masked = text.replace(display, (s) => ' '.repeat(s.length));
  const inline = /(?<!\\)\$([^$\n]+?)(?<!\\)\$/g;
  while ((m = inline.exec(masked)) !== null) {
    found.push({ tex: m[1], display: false });
  }
  return found;
}

const stats = {
  booksScanned: 0,
  stringsScanned: 0,
  mathExpressions: 0,
  parseFailures: 0,
  questionsWithFailures: 0,
  arrayTableQuestions: 0,
  unbalancedDelimiters: 0,
};
const errorBuckets = new Map(); // normalized message -> {count, samples[]}
const failingQuestions = new Map(); // book|chapter|qid -> [messages]
const arrayQuestions = [];
const unbalanced = [];

function bucket(msg, tex, ctx) {
  // Keep the actual reason but drop the position and the echoed source snippet,
  // so "Undefined control sequence: \foo" groups separately from "\bar".
  const key = msg
    .replace(/^KaTeX parse error:\s*/, '')
    .split(' at position ')[0]
    .replace(/\s*at end of input.*$/s, '')
    .trim();
  let e = errorBuckets.get(key);
  if (!e) {
    e = { count: 0, samples: [] };
    errorBuckets.set(key, e);
  }
  e.count++;
  if (e.samples.length < 4) e.samples.push({ tex: tex.slice(0, 200), ...ctx });
}

function countUnescaped(str, ch) {
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === ch && str[i - 1] !== '\\') n++;
  }
  return n;
}

function checkString(text, ctx, qKey) {
  if (typeof text !== 'string' || !text.includes('$')) return;
  stats.stringsScanned++;

  // A well-formed string has an even number of unescaped $ once $$ is folded.
  const folded = text.replace(/\$\$/g, '\x00');
  const dollars = countUnescaped(folded, '$');
  const doubles = (text.match(/\$\$/g) || []).length;
  if (dollars % 2 !== 0 || doubles % 2 !== 0) {
    stats.unbalancedDelimiters++;
    if (unbalanced.length < 40) unbalanced.push({ ...ctx, text: text.slice(0, 240) });
  }

  for (const { tex, display } of extractMath(text)) {
    stats.mathExpressions++;
    try {
      katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: false });
    } catch (err) {
      stats.parseFailures++;
      bucket(String(err.message || err), tex, ctx);
      if (!failingQuestions.has(qKey)) failingQuestions.set(qKey, []);
      const list = failingQuestions.get(qKey);
      if (list.length < 6) list.push(String(err.message || err).slice(0, 160));
    }
  }
}

const books = db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks').all();
for (const b of books) {
  const rows = db
    .prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index')
    .all(b.book_id);
  const payload = JSON.parse(
    gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'),
  );
  stats.booksScanned++;

  for (const ch of payload.chapters || []) {
    for (const ex of ch.exercises || []) {
      for (const q of ex.questions || []) {
        const qKey = `${b.book_id}|${ch.slug}|${q.id}`;
        const ctx = { book: b.book_id, chapter: ch.slug, question: q.id };
        const raw = JSON.stringify(q);
        if (raw.includes('\\begin{array}')) {
          stats.arrayTableQuestions++;
          if (arrayQuestions.length < 3000) arrayQuestions.push(qKey);
        }
        (function walk(o) {
          if (o == null) return;
          if (typeof o === 'string') return checkString(o, ctx, qKey);
          if (Array.isArray(o)) return o.forEach(walk);
          if (typeof o === 'object') for (const k in o) walk(o[k]);
        })(q);
      }
    }
  }
  if (stats.booksScanned % 100 === 0) {
    process.stderr.write(`\r${stats.booksScanned}/${books.length} books`);
  }
}
process.stderr.write(`\r${stats.booksScanned}/${books.length} books\n`);

stats.questionsWithFailures = failingQuestions.size;

const buckets = [...errorBuckets.entries()]
  .map(([message, v]) => ({ message, count: v.count, samples: v.samples }))
  .sort((a, b) => b.count - a.count);

const chars = [...charWarnings.entries()]
  .map(([ch, count]) => ({ ch, codepoint: 'U+' + ch.codePointAt(0).toString(16).toUpperCase(), count }))
  .sort((a, b) => b.count - a.count);
stats.unsupportedCharOccurrences = chars.reduce((n, c) => n + c.count, 0);
stats.distinctUnsupportedChars = chars.length;

writeFileSync(
  OUT,
  JSON.stringify(
    { stats, buckets, unsupportedChars: chars, unbalancedSamples: unbalanced, arrayQuestions },
    null,
    2,
  ),
);

console.log(JSON.stringify(stats, null, 2));
console.log('\n=== top KaTeX error classes ===');
for (const b of buckets.slice(0, 18)) {
  console.log(`${String(b.count).padStart(7)}  ${b.message.slice(0, 110)}`);
}
console.log('\n=== unsupported characters (render as blank/tofu) ===');
for (const c of chars.slice(0, 18)) {
  console.log(`${String(c.count).padStart(7)}  ${c.ch}  ${c.codepoint}`);
}
console.log(`\nfull report -> ${OUT}`);
