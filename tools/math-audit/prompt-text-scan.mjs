// catalog_questions.prompt_text is a second, flattened copy of each question's
// prompt. The repair rewrote catalog_book_chunks only, so this column still
// holds whatever the generator wrote. It feeds chapter listings, search results
// and the JSON-LD `name`/`text` fields, so damage here is reader-visible even
// though the page body renders from the chunks.
//
//   node prompt-text-scan.mjs [--db path] [--dump CLASS] [--limit N]

import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
const DB = opt('db', '../../data/d1/studywudy-content.fixed.sqlite3');
const DUMP = opt('dump', null);
const LIMIT = Number(opt('limit', 10));

const CTRL = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;
const SHORTCODE = /\[\/?(?:latex|katex)\]/i;
const REAL_CMD = new RegExp(
  '\\\\(?:frac|dfrac|tfrac|sqrt|times|div|pm|leq|geq|neq|approx|equiv|infty|sum|int|prod|lim|log|ln|sin|cos|tan|theta|alpha|beta|gamma|delta|lambda|mu|pi|sigma|omega|phi|Delta|Omega|Rightarrow|rightarrow|to|cdot|ldots|dots|text|mathrm|overline|vec|hat|begin|end|left|right|boxed|ce|angle|triangle|circ|perp|parallel|quad|qquad)(?![A-Za-z])',
  'g',
);
const ENTITY = /&(?:amp|lt|gt|nbsp|quot|#\d+);/i;
const MOJIBAKE = /[ÂÃ]\s?[-¿]|â€[™“”]|�/;
const LITERAL_NL = /\\n(?![A-Za-z])/;

const classes = new Map();
const hit = (k, id, sample) => {
  let c = classes.get(k);
  if (!c) classes.set(k, (c = { n: 0, samples: [] }));
  c.n++;
  if (c.samples.length < 200) c.samples.push({ id, sample });
};

const db = new DatabaseSync(DB, { readOnly: true });
const rows = db.prepare('SELECT question_id, prompt_text FROM catalog_questions').all();
let empty = 0;
for (const { question_id, prompt_text } of rows) {
  const t = prompt_text;
  if (t == null || !String(t).trim()) { empty++; continue; }
  const s = String(t);
  const cut = (x) => JSON.stringify(x.slice(0, 130));
  if (CTRL.test(s)) hit('control / ANSI bytes', question_id, cut(s.replace(CTRL, '␣')));
  if (SHORTCODE.test(s)) hit('shortcode marker as text', question_id, cut(s));
  if (REAL_CMD.test(s)) hit('bare LaTeX command', question_id, cut(s));
  if ((s.match(/(?<!\\)\$/g) || []).length % 2) hit('odd number of $', question_id, cut(s));
  if (ENTITY.test(s)) hit('unrendered HTML entity', question_id, cut(s));
  if (MOJIBAKE.test(s)) hit('mojibake / replacement char', question_id, cut(s));
  if (LITERAL_NL.test(s)) hit('literal \\n in prose', question_id, cut(s));
}
db.close();

if (DUMP) {
  const c = classes.get(DUMP);
  if (!c) {
    console.log(`no such class: ${DUMP}`);
    console.log('classes: ' + [...classes.keys()].join(' | '));
  } else {
    console.log(`${DUMP}: ${c.n} rows\n`);
    for (const s of c.samples.slice(0, LIMIT)) console.log(`${s.id}\n  ${s.sample}\n`);
  }
} else {
  console.log(`\n${DB}  —  catalog_questions.prompt_text`);
  console.log(`rows ${rows.length.toLocaleString()}   blank ${empty.toLocaleString()}\n`);
  console.log('class'.padEnd(34) + 'rows'.padStart(9));
  for (const [k, c] of [...classes].sort((a, b) => b[1].n - a[1].n))
    console.log(k.padEnd(34) + String(c.n).padStart(9));
  if (!classes.size) console.log('(nothing found)');
}
