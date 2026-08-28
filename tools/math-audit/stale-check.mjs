// Is the site showing the repaired content, or a cached copy of the old one?
//
// Picks questions whose old text carried a marker the repair removed, then asks
// the live site for each page and looks for the marker. A marker still on the
// page means the reader is being served the pre-repair render.
//
//   node --max-old-space-size=6144 stale-check.mjs [--n 20]

import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
const N = Number(opt('n', 20));
const ORIGIN = opt('origin', 'https://studywudy-board-solutions.amanbhagat17089.workers.dev');

const MARKER = /\[\/?(?:latex|katex)\]/i;

const orig = new DatabaseSync('../../data/d1/studywudy-content.sqlite3', { readOnly: true });
const fixed = new DatabaseSync('../../data/d1/studywudy-content.fixed.sqlite3', { readOnly: true });

const load = (db, id) => {
  const rows = db
    .prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index')
    .all(id);
  return JSON.parse(gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'));
};

// One candidate per book, so the sample spreads across the catalogue instead of
// landing entirely in whichever book happens to be worst.
const books = orig.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id').all();
const candidates = [];
for (const { book_id } of books) {
  const a = load(orig, book_id);
  const b = load(fixed, book_id);
  const bIds = new Map();
  for (const ch of b.chapters || [])
    for (const ex of ch.exercises || []) for (const q of ex.questions || []) bIds.set(q.id, q);
  // --pick last reaches for the deepest question in the book: a page nobody is
  // likely to have opened, so a cache would not hold a copy of it.
  const LAST = opt('pick', 'first') === 'last';
  let picked = null;
  for (const ch of a.chapters || []) {
    for (const ex of ch.exercises || []) {
      for (const q of ex.questions || []) {
        const oldText = JSON.stringify(q);
        const newQ = bIds.get(q.id);
        if (!newQ) continue;
        if (MARKER.test(oldText) && !MARKER.test(JSON.stringify(newQ))) {
          picked = { id: q.id, book: book_id, chapter: ch.slug || ch.id };
          if (!LAST) break;
        }
      }
      if (picked && !LAST) break;
    }
    if (picked && !LAST) break;
  }
  if (picked) candidates.push(picked);
}
console.log(`books with a removable marker: ${candidates.length}`);

const url = (c) => {
  const [board, cls, subject, textbook] = c.book.split('::');
  const row = fixed
    .prepare('SELECT chapter_slug FROM catalog_questions WHERE question_id=?')
    .get(c.id);
  if (!row) return null;
  return `${ORIGIN}/${board}/${cls}/${subject}/${textbook}/${row.chapter_slug}/questions/${c.id}`;
};

// Spread the sample evenly over the candidate list rather than taking the head.
const step = Math.max(1, Math.floor(candidates.length / N));
const sample = candidates.filter((_, i) => i % step === 0).slice(0, N);

let stale = 0;
let fresh = 0;
let failed = 0;
for (const c of sample) {
  const u = url(c);
  if (!u) {
    failed++;
    continue;
  }
  let html;
  try {
    const res = await fetch(u, { headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) {
      console.log(`  HTTP ${res.status}  ${c.id}`);
      failed++;
      continue;
    }
    html = await res.text();
  } catch (err) {
    console.log(`  ${String(err.message).slice(0, 60)}  ${c.id}`);
    failed++;
    continue;
  }
  // Only the rendered article, not the JSON-LD, which is built separately.
  const i = html.indexOf('<div class="question-prompt"');
  const j = html.indexOf('question-pagination', i);
  const body = html.slice(i, j > i ? j : html.length);
  const isStale = MARKER.test(body);
  if (isStale) stale++;
  else fresh++;
  console.log(`  ${isStale ? 'STALE' : 'fresh'}  ${c.id}`);
}
console.log(`\nstale ${stale}   fresh ${fresh}   failed ${failed}   of ${sample.length} sampled`);
