// Dumps the exact failing math spans (with surrounding string) for given qids.
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import katex from 'katex';
import 'katex/contrib/mhchem';

console.warn = () => {};
const QIDS = new Set(process.argv.slice(2));
const db = new DatabaseSync('../../data/d1/studywudy-content.fixed.sqlite3', { readOnly: true });

function spans(text) {
  const found = [];
  const display = /\$\$([\s\S]+?)\$\$/g;
  let m;
  while ((m = display.exec(text)) !== null) found.push({ tex: m[1], display: true });
  const masked = text.replace(display, (s) => ' '.repeat(s.length));
  const inline = /(?<!\\)\$([^$\n]+?)(?<!\\)\$/g;
  while ((m = inline.exec(masked)) !== null) found.push({ tex: m[1], display: false });
  return found;
}

for (const { book_id } of db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks').all()) {
  const rows = db
    .prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index')
    .all(book_id);
  const p = JSON.parse(
    gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'),
  );
  for (const ch of p.chapters || [])
    for (const ex of ch.exercises || [])
      for (const q of ex.questions || []) {
        if (!QIDS.has(q.id)) continue;
        console.log(`\n===== ${q.id} =====`);
        (function walk(o) {
          if (o == null) return;
          if (typeof o === 'string') {
            if (!o.includes('$')) return;
            for (const { tex, display } of spans(o)) {
              try {
                katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: false });
              } catch (e) {
                console.log('  ERR :', String(e.message).slice(0, 90));
                console.log('  TEX :', JSON.stringify(tex).slice(0, 300));
                console.log('  CTX :', JSON.stringify(o).slice(0, 400));
              }
            }
            return;
          }
          if (Array.isArray(o)) return o.forEach(walk);
          if (typeof o === 'object') for (const k in o) walk(o[k]);
        })(q);
      }
}
