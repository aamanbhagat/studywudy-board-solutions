// Dumps real strings containing control characters, classified by the shape of
// the corruption, so the repair rules are driven by evidence rather than guesses.

import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';

const DB = process.argv[2] || '../../data/d1/studywudy-content.sqlite3';
const db = new DatabaseSync(DB, { readOnly: true });

const CTRL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g');
const ANSI = new RegExp('\\u001b\\[[0-9;]*m', 'g');

// Common LaTeX command names that may have lost their leading backslash.
const CMDS =
  'ce|frac|dfrac|sqrt|text|textrm|textbf|vec|angle|perp|parallel|triangle|times|div|pi|theta|alpha|beta|gamma|delta|lambda|mu|omega|circ|cdot|left|right|begin|end|Delta|Rightarrow|rightarrow|leq|geq|neq|approx|infty|sum|int|log|sin|cos|tan|overline|hat|bar|mathrm|quad|lor|land|neg';
const CMD_RE = new RegExp(`[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001A\\u001C-\\u001F](${CMDS})\\b`);

const groups = {
  ansi: [],
  command: [],
  beforeDollar: [],
  digitish: [],
  other: [],
};

const books = db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks').all();
const tally = { ansi: 0, command: 0, beforeDollar: 0, digitish: 0, other: 0 };

for (const b of books) {
  const rows = db
    .prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index')
    .all(b.book_id);
  const payload = JSON.parse(
    gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'),
  );
  for (const ch of payload.chapters || []) {
    for (const ex of ch.exercises || []) {
      for (const q of ex.questions || []) {
        (function walk(o) {
          if (o == null) return;
          if (typeof o === 'string') {
            CTRL.lastIndex = 0;
            if (!CTRL.test(o)) return;
            CTRL.lastIndex = 0;
            let m;
            while ((m = CTRL.exec(o)) !== null) {
              const i = m.index;
              const after = o.slice(i + 1);
              const before = o.slice(0, i);
              let kind;
              if (m[0] === '' && /^\[[0-9;]*m/.test(after)) kind = 'ansi';
              else if (CMD_RE.test(o.slice(i, i + 12))) kind = 'command';
              else if (after.startsWith('$') || before.endsWith('$')) kind = 'beforeDollar';
              else if (/^[ऀ-ॿ\w/.,)%]/.test(after) && /[\s(=,]$/.test(before))
                kind = 'digitish';
              else kind = 'other';
              tally[kind]++;
              if (groups[kind].length < 14) {
                groups[kind].push(
                  `${b.book_id}|${q.id}  ${JSON.stringify(o.slice(Math.max(0, i - 55), i + 55))}`,
                );
              }
            }
            return;
          }
          if (Array.isArray(o)) return o.forEach(walk);
          if (typeof o === 'object') for (const k in o) walk(o[k]);
        })(q);
      }
    }
  }
}

console.log('occurrences by class:', JSON.stringify(tally));
for (const [k, list] of Object.entries(groups)) {
  console.log(`\n########## ${k} (${tally[k]}) ##########`);
  list.forEach((l) => console.log('  ' + l.replace(ANSI, '<ANSI>')));
}
