// Applies the content fixes to catalog_book_chunks.
//
//   node fix.mjs                 # dry run: counts + samples, writes nothing
//   node fix.mjs --apply         # rewrites the chunk blobs in place
//
// Two independent transformations:
//   1. `\begin{array}` blocks that are really data tables become native
//      `kind: "table"` blocks (the reported truth-table/spacing bug).
//   2. String-level repair of control-byte corruption, ANSI escapes, glyphs
//      KaTeX cannot render, and the remaining KaTeX parse errors.

import { DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { convertStringToBlocks } from './lib/array-table.mjs';
import { repairStringDetailed, countMathFailures } from './lib/repair.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
const DB = opt('db', '../../data/d1/studywudy-content.sqlite3');
const APPLY = args.includes('--apply');
// `--apply` rewrites in place, and the default `--db` is the pristine copy every
// audit here compares against: run one without the other and the baseline is
// gone. Writing is confined to a database whose name says it is the output.
if (APPLY && !/\.fixed\./.test(DB)) {
  console.error(`refusing to --apply to ${DB}: pass --db <...fixed...> (or --force)`);
  if (!args.includes('--force')) process.exit(1);
}
const OUT = opt('out', 'fix-report.json');
const CHUNK = 40000; // matches the existing on-disk chunking

const db = new DatabaseSync(DB);
const CTRL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]');

const stats = {
  booksScanned: 0,
  booksChanged: 0,
  tablesConverted: 0,
  questionsWithTable: 0,
  stringsRepaired: 0,
  questionsRepaired: 0,
  controlCharsBefore: 0,
  controlCharsAfter: 0,
  bytesBefore: 0,
  bytesAfter: 0,
  tablesRejected: 0,
  stringsPromoted: 0,
  codeBlocksRetagged: 0,
};
// Which rung of the repair ladder each rewritten string landed on. `rejected`
// means every candidate made the math worse, so the original was kept.
const tiers = { full: 0, conservative: 0, minimal: 0, rejected: 0 };
const samples = { tables: [], repairs: [], rejected: [] };

const countCtrl = (s) => (s.match(new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g')) || []).length;

/** Repair every string in a value, in place, reporting whether anything moved. */
function repairTree(node, ctx) {
  let touched = false;
  const walk = (o) => {
    if (o == null || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'string') {
        stats.controlCharsBefore += countCtrl(v);
        // `code` blocks are verbatim source; never rewrite them. The exception
        // is a code block holding control bytes, which no source file ever
        // does — that is prose the generator mis-tagged, with ESC[KaTeX] where
        // the `$` delimiters belonged.
        if (k === 'code' && !CTRL.test(v)) {
          stats.controlCharsAfter += countCtrl(v);
          continue;
        }
        const { text: r, tier } = repairStringDetailed(v);
        if (tier !== 'none') tiers[tier]++;
        if (tier === 'rejected' && samples.rejected.length < 40) {
          samples.rejected.push({ ...ctx, text: v.slice(0, 220) });
        }
        stats.controlCharsAfter += countCtrl(r);
        if (r !== v && k === 'code' && o.kind === 'code') {
          delete o.code;
          delete o.language;
          o.kind = 'paragraph';
          o.text = r;
          touched = true;
          stats.stringsRepaired++;
          stats.codeBlocksRetagged++;
          continue;
        }
        if (r !== v) {
          touched = true;
          stats.stringsRepaired++;
          if (samples.repairs.length < 60 && CTRL.test(v)) {
            samples.repairs.push({ ...ctx, before: v.slice(0, 220), after: r.slice(0, 220) });
          }
          o[k] = r;
        }
      } else walk(v);
    }
  };
  walk(node);
  return touched;
}

/** Total unparseable math spans across every string in a list of blocks. */
function blockFailures(blocks) {
  let n = 0;
  (function walk(o) {
    if (o == null) return;
    if (typeof o === 'string') return void (n += countMathFailures(o));
    if (typeof o === 'object') for (const k in o) walk(o[k]);
  })(blocks);
  return n;
}

// These fields are a union of `string` and `{kind:'blocks', blocks:[...]}` —
// both forms already appear tens of thousands of times — so a plain string
// holding a table can be promoted to the block form the renderer prefers.
const PROMOTABLE = new Set(['prompt', 'answer', 'explanation', 'finalAnswer']);

/** Replace paragraph blocks holding data-table arrays with real table blocks. */
function convertTables(node, ctx) {
  let touched = false;
  const walk = (o) => {
    if (o == null || typeof o !== 'object') return;
    for (const k of PROMOTABLE) {
      if (typeof o[k] !== 'string') continue;
      const conv = convertStringToBlocks(o[k]);
      if (!conv || blockFailures(conv) > countMathFailures(o[k])) {
        if (conv) stats.tablesRejected++;
        continue;
      }
      stats.tablesConverted += conv.filter((x) => x.kind === 'table').length;
      stats.stringsPromoted++;
      if (samples.tables.length < 25) {
        samples.tables.push({ ...ctx, field: k, before: o[k].slice(0, 300), after: conv });
      }
      o[k] = { kind: 'blocks', blocks: conv };
      touched = true;
    }
    if (Array.isArray(o.blocks)) {
      const next = [];
      let localChange = false;
      for (const b of o.blocks) {
        if (b && b.kind === 'paragraph' && typeof b.text === 'string') {
          const conv = convertStringToBlocks(b.text);
          // Same non-regression rule as the string repairs: lifting a table out
          // may never leave more unparseable math behind than it found.
          if (conv && blockFailures(conv) > countMathFailures(b.text)) {
            stats.tablesRejected++;
          } else if (conv) {
            const made = conv.filter((x) => x.kind === 'table').length;
            stats.tablesConverted += made;
            if (samples.tables.length < 25) {
              samples.tables.push({
                ...ctx,
                before: b.text.slice(0, 300),
                after: conv.map((x) =>
                  x.kind === 'table' ? { kind: 'table', headers: x.headers, rows: x.rows } : x,
                ),
              });
            }
            next.push(...conv);
            localChange = true;
            continue;
          }
        }
        next.push(b);
      }
      if (localChange) {
        o.blocks = next;
        touched = true;
      }
    }
    for (const k of Object.keys(o)) if (typeof o[k] === 'object') walk(o[k]);
  };
  walk(node);
  return touched;
}

const books = db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks').all();
const del = db.prepare('DELETE FROM catalog_book_chunks WHERE book_id=?');
const ins = db.prepare(
  'INSERT INTO catalog_book_chunks (book_id, chunk_index, content_chunk) VALUES (?,?,?)',
);

for (const b of books) {
  const rows = db
    .prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index')
    .all(b.book_id);
  const original = Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)));
  const payload = JSON.parse(gunzipSync(original).toString('utf8'));
  stats.booksScanned++;
  stats.bytesBefore += original.length;

  let bookChanged = false;
  for (const ch of payload.chapters || []) {
    for (const ex of ch.exercises || []) {
      for (const q of ex.questions || []) {
        const ctx = { book: b.book_id, chapter: ch.slug, question: q.id };
        // Repair first: table conversion keys off `$...$` spans, and a grid
        // whose delimiters the corruption ate is invisible to it until the
        // repair puts them back.
        const r = repairTree(q, ctx);
        const t = convertTables(q, ctx);
        if (t) stats.questionsWithTable++;
        if (r) stats.questionsRepaired++;
        if (t || r) bookChanged = true;
      }
    }
  }

  if (!bookChanged) {
    stats.bytesAfter += original.length;
    continue;
  }
  stats.booksChanged++;
  const rebuilt = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'), { level: 9 });
  stats.bytesAfter += rebuilt.length;

  // Sanity: the rebuilt blob must round-trip before it is allowed near the DB.
  JSON.parse(gunzipSync(rebuilt).toString('utf8'));

  if (APPLY) {
    db.exec('BEGIN');
    try {
      del.run(b.book_id);
      for (let i = 0, n = 0; i < rebuilt.length; i += CHUNK, n++) {
        ins.run(b.book_id, n, rebuilt.subarray(i, i + CHUNK));
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  if (stats.booksScanned % 100 === 0) {
    process.stderr.write(`\r${stats.booksScanned}/${books.length} books`);
  }
}
process.stderr.write(`\r${stats.booksScanned}/${books.length} books\n`);

writeFileSync(
  OUT,
  JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', stats, tiers, samples }, null, 2),
);
console.log(JSON.stringify({ ...stats, tiers }, null, 2));
console.log(`\nmode: ${APPLY ? 'APPLIED' : 'DRY RUN (nothing written)'}`);
console.log(`report -> ${OUT}`);
