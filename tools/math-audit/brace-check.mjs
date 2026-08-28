// A delimiter that ends up *inside* a brace group is the failure mode KaTeX
// never reports: `$\boxed{}$x=\dfrac{1}{10}$$` parses perfectly and renders an
// empty box next to loose source. So count, per database, every `$` sitting at
// brace depth > 0, and every group left unbalanced. Both must not grow.
//
//   node brace-check.mjs                      # before vs after
//   node brace-check.mjs --db path.sqlite3    # single database
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
const ORIG = '../../data/d1/studywudy-content.sqlite3';
const FIXED = '../../data/d1/studywudy-content.fixed.sqlite3';

// Only braces that belong to LaTeX count. These books write set-builder notation
// as ordinary prose — `A = {x | 2^x - 1 is odd}` — and the maths inside it is
// correctly delimited, so counting those braces would drown the real signal.
const LATEX_GROUP = /(?:\\[A-Za-z]+|[_^]|\})\s*$/;

/** `$` inside a genuine LaTeX group, and the net brace imbalance, for one string. */
function measure(s) {
  const stack = [];
  let inside = 0;
  let opened = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') i++;
    else if (s[i] === '{') {
      stack.push(LATEX_GROUP.test(s.slice(0, i)));
      opened++;
    } else if (s[i] === '}') stack.pop();
    else if (s[i] === '$' && stack.some(Boolean)) inside++;
  }
  return { inside, unbalanced: stack.length, opened };
}

function scan(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const out = { inside: 0, insideQ: new Set(), unbalanced: 0, unbalancedQ: new Set(), worst: [] };
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
              // Imbalance is measured on every string, not just the ones that
              // hold a delimiter: these books are full of prose set-builder
              // notation the source itself never closed, and gating on `$` would
              // report each one as new the moment a repair wrapped some maths
              // elsewhere in the same sentence.
              const m = measure(o);
              if (m.inside && o.includes('$')) {
                out.inside += m.inside;
                out.insideQ.add(q.id);
                if (out.worst.length < 12) out.worst.push(`${q.id}  ${JSON.stringify(o.slice(0, 150))}`);
              }
              if (m.unbalanced) {
                out.unbalanced += m.unbalanced;
                out.unbalancedQ.add(q.id);
              }
              return;
            }
            if (Array.isArray(o)) return o.forEach((v) => walk(v, key));
            if (typeof o === 'object') for (const k in o) walk(o[k], k);
          })(q);
  }
  db.close();
  return out;
}

const report = (label, r) => {
  console.log(`${label}`);
  console.log(`  $ inside a brace group   ${r.inside} in ${r.insideQ.size} questions`);
  console.log(`  unbalanced braces        ${r.unbalanced} in ${r.unbalancedQ.size} questions`);
};

const single = opt('db', null);
if (single) {
  const r = scan(single);
  report(single, r);
  for (const w of r.worst) console.log(`   ${w}`);
} else {
  const before = scan(ORIG);
  const after = scan(FIXED);
  report('before', before);
  report('after', after);
  const newly = [...after.insideQ].filter((id) => !before.insideQ.has(id));
  console.log(`\nnewly holding a delimiter inside a group (${newly.length}):`);
  for (const id of newly.slice(0, 25)) console.log(`  - ${id}`);
  const newlyOpen = [...after.unbalancedQ].filter((id) => !before.unbalancedQ.has(id));
  console.log(`\nnewly unbalanced (${newlyOpen.length}):`);
  for (const id of newlyOpen.slice(0, 25)) console.log(`  - ${id}`);
}
