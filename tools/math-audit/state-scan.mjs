// What is still wrong from the reader's seat, after the repair pass.
//
// KaTeX errors are zero, so counting them says nothing. This counts what the
// page actually shows: source text the tokenizer never turned into maths,
// expressions split in half by a stray display span, glyphs KaTeX has no
// metrics for, grids that are still one unbreakable box, and leaked spacing.
//
//   node --max-old-space-size=6144 state-scan.mjs [--db path] [--dump CLASS]

import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import katex from 'katex';
import 'katex/contrib/mhchem';
import { normalizeText, tokenize, relaxed } from './lib/site-render.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
const DB = opt('db', '../../data/d1/studywudy-content.fixed.sqlite3');
const DUMP = opt('dump', null);
const LIMIT = Number(opt('limit', 12));

// KaTeX reports a missing glyph on console.warn even with strict off.
let warned = [];
console.warn = (m) => warned.push(String(m));

const classes = new Map();
/** Record one defect. `key` groups, `id` is the question, `sample` is evidence. */
function hit(key, id, sample) {
  let c = classes.get(key);
  if (!c) classes.set(key, (c = { hits: 0, questions: new Set(), samples: [] }));
  c.hits++;
  c.questions.add(id);
  if (c.samples.length < 400) c.samples.push({ id, sample });
}

// Commands that are unambiguously maths. A backslash-word in prose only counts
// as leaked source if it is one of these; `C:\Users`, `Nutrient\Fodder` and
// `km\hr` are not LaTeX and must not inflate the number.
const REAL_CMD = new RegExp(
  '\\\\(?:frac|dfrac|tfrac|sqrt|times|div|pm|mp|leq|geq|neq|approx|equiv|propto|infty|sum|int|prod|lim|log|ln|sin|cos|tan|cot|sec|csc|theta|alpha|beta|gamma|delta|lambda|mu|pi|sigma|omega|phi|rho|tau|epsilon|varphi|Delta|Omega|Sigma|Gamma|Rightarrow|Leftarrow|rightarrow|leftarrow|to|mapsto|cdot|cdots|ldots|dots|text|textrm|textbf|mathrm|mathbf|overline|underline|vec|hat|bar|dot|ddot|begin|end|left|right|boxed|ce|angle|triangle|circ|degree|perp|parallel|cup|cap|subset|in|notin|forall|exists|partial|nabla|binom|choose|matrix|array|hline|quad|qquad|newline|displaystyle|limits|substack|operatorname|multicolumn|textsubscript|textsuperscript)(?![A-Za-z])',
  'g',
);
// Spacing commands are only wrong when they leak into prose, where they print.
const SPACING = /\\(?:quad|qquad|,|;|!|:|hspace|vspace|phantom|hfill)(?![A-Za-z])/g;
const RULED_ARRAY = /\\begin\{array\}(?:\s*\{[^{}]*\|[^{}]*\})|\\begin\{array\}[\s\S]*?\\hline/;
// A grid drawn as a picture, not tabulated data: bonds, lone pairs, stacked
// single columns. Converting these to an HTML table would destroy them.
const DECORATIVE = /\\(?:ddot|dot|overset|underset|underbrace|overbrace|bond|chemfig|raise|kern|!)|\|\s*\\\\|\\\\\s*\|/;
const MOJIBAKE = /[ÂÃ]\s?[\u0080-\u00bf]|â€[\u0099\u009c\u009d\u0093\u0094]|\ufffd/;

const db = new DatabaseSync(DB, { readOnly: true });
let strings = 0;
let mathTokens = 0;
const glyphGaps = new Map();
const questionsSeen = new Set();
const badQuestions = new Set();

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
        questionsSeen.add(q.id);
        const before = classes.size;
        let flagged = false;
        const mark = (k, s) => {
          flagged = true;
          hit(k, q.id, s);
        };

        // Native table blocks: shape faults the renderer cannot paper over.
        (function tables(o) {
          if (o == null || typeof o !== 'object') return;
          if (Array.isArray(o)) return o.forEach(tables);
          if (o.kind === 'table') {
            const w = (o.headers || []).length;
            const widths = new Set((o.rows || []).map((r) => r.length));
            if (widths.size > 1 || (w && widths.size === 1 && ![...widths][0] !== !w && [...widths][0] !== w))
              mark('table: ragged rows', JSON.stringify(o).slice(0, 160));
            if (w <= 1 && (o.rows || []).every((r) => r.length <= 1))
              mark('table: single column', JSON.stringify(o).slice(0, 160));
            if ((o.headers || []).every((h) => !String(h).trim()) && w)
              mark('table: empty header row', JSON.stringify(o).slice(0, 160));
          }
          for (const k in o) tables(o[k]);
        })(q);

        (function walk(o, key) {
          if (o == null) return;
          if (typeof o === 'string') {
            if (key === 'code') return;
            strings++;
            const norm = normalizeText(o);
            const toks = [...tokenize(norm)];

            for (let i = 0; i < toks.length; i++) {
              const t = toks[i];
              if (t.kind === 'math') {
                mathTokens++;
                if (!t.value.trim()) mark('empty math span', JSON.stringify(o.slice(0, 140)));
                if (RULED_ARRAY.test(t.value))
                  mark(
                    DECORATIVE.test(t.value) ? 'ruled array: decorative' : 'ruled array: looks tabular',
                    t.value.slice(0, 160),
                  );
                warned = [];
                try {
                  katex.renderToString(relaxed(t.value, t.display), {
                    displayMode: t.display,
                    throwOnError: true,
                    strict: false,
                  });
                } catch (err) {
                  mark('KaTeX error', `${String(err.message).slice(0, 70)} :: ${t.value.slice(0, 90)}`);
                }
                for (const w of warned) {
                  const g = w.match(/No character metrics for '(.+?)'/);
                  if (g) {
                    glyphGaps.set(g[1], (glyphGaps.get(g[1]) || 0) + 1);
                    mark('glyph KaTeX cannot size', `${g[1]} :: ${t.value.slice(0, 90)}`);
                  }
                }
                // A display span welded to the span before it breaks one
                // expression across a block boundary: `$\overline{X}$$$+1$$`.
                const prev = toks[i - 1];
                if (prev && prev.kind === 'math' && (t.display || prev.display))
                  mark('expression split by an adjacent span', o.slice(0, 150));
              } else {
                const txt = t.raw;
                // The tokenizer gave up on these: the reader sees them raw.
                if (/(?<!\\)\$/.test(txt))
                  mark('unmatched $ shown as text', JSON.stringify(txt.slice(0, 140)));
                const cmds = txt.match(REAL_CMD);
                if (cmds) mark('LaTeX shown as text', `[${[...new Set(cmds)].join(' ')}] ${txt.slice(0, 120)}`);
                if (SPACING.test(txt)) mark('spacing command in prose', JSON.stringify(txt.slice(0, 120)));
                if (/<\/?(?:br|sub|sup|strong|em|b|i|table|td|tr)\b|&(?:amp|lt|gt|nbsp|#\d+);/i.test(txt))
                  mark('HTML shown as text', JSON.stringify(txt.slice(0, 120)));
                if (/[^\s]  +[^\s]/.test(txt)) mark('run of spaces in prose', JSON.stringify(txt.slice(0, 120)));
                if (/\s+[,.;:!?](?:\s|$)/.test(txt)) mark('space before punctuation', JSON.stringify(txt.slice(0, 120)));
              }
            }
            // Bold is counted over the whole string, not per text token. Bold
            // very often wraps an equation — `**$\ce{Ca(OCl)2}$**` — and the
            // tokenizer hands that back as two text runs holding one `**` each.
            // Per token they both look unclosed; the string is fine.
            if ((o.match(/\*\*/g) || []).length % 2)
              mark('unclosed bold markers', JSON.stringify(o.slice(0, 120)));
            if (MOJIBAKE.test(o)) mark('mojibake or replacement char', JSON.stringify(o.slice(0, 140)));
            return;
          }
          if (Array.isArray(o)) return o.forEach((v) => walk(v, key));
          if (typeof o === 'object') for (const k in o) walk(o[k], k);
        })(q, '');

        if (flagged) badQuestions.add(q.id);
        void before;
      }
  process.stderr.write(`\r${questionsSeen.size} questions`);
}
process.stderr.write('\n');
db.close();

if (DUMP) {
  // A comma-separated list, so one pass can answer for several classes: the
  // KaTeX render is what makes the scan slow, and it is the same render.
  for (const name of DUMP.split(',')) {
    const c = classes.get(name.trim());
    if (!c) {
      console.log(`no such class: ${name.trim()}`);
      console.log('classes: ' + [...classes.keys()].join(' | '));
      continue;
    }
    console.log(`\n${'='.repeat(78)}\n${name.trim()}: ${c.hits} hits in ${c.questions.size} questions\n`);
    for (const s of c.samples.slice(0, LIMIT)) console.log(`${s.id}\n  ${s.sample}\n`);
  }
} else {
  console.log(`\n${DB}`);
  console.log(`questions ${questionsSeen.size.toLocaleString()}   strings ${strings.toLocaleString()}   math tokens ${mathTokens.toLocaleString()}\n`);
  const rows = [...classes].sort((a, b) => b[1].questions.size - a[1].questions.size);
  console.log('class'.padEnd(38) + 'hits'.padStart(9) + 'questions'.padStart(11));
  for (const [k, c] of rows)
    console.log(k.padEnd(38) + String(c.hits).padStart(9) + String(c.questions.size).padStart(11));
  console.log('\n' + 'questions with at least one'.padEnd(38) + ''.padStart(9) + String(badQuestions.size).padStart(11));
  if (glyphGaps.size) {
    console.log('\nglyphs KaTeX has no metrics for:');
    for (const [g, n] of [...glyphGaps].sort((a, b) => b[1] - a[1]).slice(0, 25))
      console.log(`  ${JSON.stringify(g)}  ${n}`);
  }
}
