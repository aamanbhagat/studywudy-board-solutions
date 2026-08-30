// Which characters does the corpus actually put in front of the maths renderer?
//
//   node --max-old-space-size=6144 glyph-census.mjs [--db path] [--min 1]
//
// A maths webfont is only worth its weight if it carries the glyphs the books
// use, and only those. STIX Two Math is 6,760 glyphs; the Mathematical
// Alphanumeric block alone (U+1D400-1D7FF) is most of the download. This walks
// every string in every chunk and tallies the code points, so the subset ranges
// are cut from evidence rather than from a guess about what a maths corpus
// "probably" contains.

import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
const DB = opt('db', '../../data/d1/studywudy-content.sqlite3');
const MIN = Number(opt('min', 1));

const db = new DatabaseSync(DB, { readOnly: true });
const books = db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks ORDER BY book_id').all();

const counts = new Map();
let books_read = 0;
let chars = 0;

// The pack is a tree of objects, arrays and strings; nothing cares which field a
// character came from, only that it reaches the page.
const walk = (value) => {
  if (typeof value === 'string') {
    chars += value.length;
    for (const ch of value) {
      const cp = ch.codePointAt(0);
      if (cp < 0x80) continue;
      counts.set(cp, (counts.get(cp) || 0) + 1);
    }
    return;
  }
  if (Array.isArray(value)) { for (const item of value) walk(item); return; }
  if (value && typeof value === 'object') { for (const item of Object.values(value)) walk(item); }
};

for (const { book_id } of books) {
  let pack;
  try {
    const rows = db.prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index').all(book_id);
    pack = JSON.parse(gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'));
  } catch { continue; }
  books_read++;
  walk(pack);
}

// Contiguous runs read better than 900 separate lines, and runs are what a
// `unicodes=` subset argument wants anyway.
const kept = [...counts.entries()].filter(([, n]) => n >= MIN).map(([cp]) => cp).sort((a, b) => a - b);
const runs = [];
for (const cp of kept) {
  const last = runs[runs.length - 1];
  if (last && cp === last[1] + 1) last[1] = cp;
  else runs.push([cp, cp]);
}
const hex = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

const BLOCKS = [
  ['Latin-1 + Latin Ext', 0x0080, 0x024f],
  ['Modifiers/Combining', 0x0250, 0x036f],
  ['Greek', 0x0370, 0x03ff],
  ['Cyrillic', 0x0400, 0x04ff],
  ['Devanagari', 0x0900, 0x097f],
  ['General Punctuation', 0x2000, 0x206f],
  ['Super/Subscripts', 0x2070, 0x209f],
  ['Currency', 0x20a0, 0x20cf],
  ['Combining for Symbols', 0x20d0, 0x20ff],
  ['Letterlike', 0x2100, 0x214f],
  ['Number Forms', 0x2150, 0x218f],
  ['Arrows', 0x2190, 0x21ff],
  ['Mathematical Operators', 0x2200, 0x22ff],
  ['Misc Technical', 0x2300, 0x23ff],
  ['Enclosed Alphanumerics', 0x2460, 0x24ff],
  ['Box Drawing/Blocks', 0x2500, 0x259f],
  ['Geometric Shapes', 0x25a0, 0x25ff],
  ['Misc Symbols', 0x2600, 0x26ff],
  ['Dingbats', 0x2700, 0x27bf],
  ['Misc Math Symbols-A', 0x27c0, 0x27ef],
  ['Supplemental Arrows-A', 0x27f0, 0x27ff],
  ['Supplemental Arrows-B', 0x2900, 0x297f],
  ['Misc Math Symbols-B', 0x2980, 0x29ff],
  ['Supplemental Math Ops', 0x2a00, 0x2aff],
  ['Misc Symbols and Arrows', 0x2b00, 0x2bff],
  ['CJK/Halfwidth', 0x3000, 0xffef],
  ['Math Alphanumeric', 0x1d400, 0x1d7ff],
  ['Emoji/SMP other', 0x10000, 0x10ffff],
];

console.log(`books: ${books_read}  characters walked: ${chars.toLocaleString()}  distinct non-ASCII: ${counts.size}`);
console.log(`\nby block (count >= ${MIN}):`);
for (const [name, lo, hi] of BLOCKS) {
  const inBlock = [...counts.entries()].filter(([cp]) => cp >= lo && cp <= hi && cp >= 0x80);
  if (!inBlock.length) continue;
  const total = inBlock.reduce((sum, [, n]) => sum + n, 0);
  console.log(`  ${name.padEnd(24)} ${String(inBlock.length).padStart(5)} distinct  ${String(total).padStart(12)} uses  ${hex(lo)}-${hex(hi)}`);
}

const smp = [...counts.entries()].filter(([cp]) => cp >= 0x1d400 && cp <= 0x1d7ff).sort((a, b) => b[1] - a[1]);
console.log(`\nMathematical Alphanumeric (U+1D400-1D7FF): ${smp.length} distinct`);
for (const [cp, n] of smp.slice(0, 40)) console.log(`  ${hex(cp)} ${String.fromCodePoint(cp)}  ${n}`);

console.log(`\nsubset ranges (count >= ${MIN}, ${runs.length} runs):`);
console.log(runs.map(([lo, hi]) => (lo === hi ? hex(lo) : `${hex(lo)}-${hex(hi)}`)).join(','));
