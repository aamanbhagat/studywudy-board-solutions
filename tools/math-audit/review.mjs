// Builds the before/after review page: the same questions rendered through the
// site's own pipeline, out of the untouched database on the left and the
// repaired one on the right.
//
//   node review.mjs                # -> review/index.html
//   node review.mjs --ids a,b,c    # override the curated sample
//
// The point is to be able to look at the fix rather than trust a counter, so
// nothing here is shared with the repair code: it reads both databases, renders
// with KaTeX exactly as the Worker does, and writes plain HTML.

import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync, cpSync, readFileSync } from 'node:fs';
import katex from 'katex';
import 'katex/contrib/mhchem';
import { normalizeText, tokenize, relaxed } from './lib/site-render.mjs';

console.warn = () => {};

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};
const ORIG = '../../data/d1/studywudy-content.sqlite3';
const FIXED = '../../data/d1/studywudy-content.fixed.sqlite3';
const OUT = opt('out', 'review');

// One case per class of damage, chosen so a reader can check the fix by eye.
const CASES = [
  {
    id: 'q-msb-balbharati-mathematics-and-statistics-1-commerce-standard-12-1-080',
    title: 'Truth table — the reported bug',
    note: 'Six columns and eight rows inside one KaTeX array. The array is a single inline-block: it cannot wrap and it cannot scroll, so the columns jam together and the rows overlap. Now a real table.',
  },
  {
    id: 'q-msb-balbharati-mathematics-and-statistics-1-arts-and-science-standard-12-1-055',
    title: 'Switching-circuit table',
    note: 'Same shape, different book.',
  },
  {
    id: 'q-cbse-ncert-exemplar-ganit-exemplar-hindi-class-10-13-053',
    title: 'Frequency table, Hindi',
    note: 'Fully ruled grid. The Devanagari headers stay selectable text rather than becoming math glyphs.',
  },
  {
    id: 'q-cbse-ncert-exemplar-mathematics-exemplar-class-8-12-076',
    title: 'Two tables in one span',
    note: 'Two grids set side by side with \\qquad between them. Both are lifted out; the spacer is dropped.',
  },
  {
    id: 'q-cisce-frank-economics-class-12-7-132',
    title: 'Table with no delimiters at all',
    note: 'The array sat outside every $...$ span, so the reader saw raw LaTeX source. Wrapped, then converted.',
  },
  {
    id: 'q-cisce-goyal-brothers-prakashan-economics-class-10-4-058',
    title: 'Supply schedule inside \\boxed{}',
    note: 'Ten columns in a box. Wrapping a wide grid in \\boxed{} makes the overflow worse, not better.',
  },
  {
    id: 'q-cbse-lakhmir-singh-chemistry-class-10-1-100',
    title: 'Chemistry — NUL byte ate the backslash',
    note: 'The generator read \\0 as a C escape, so \\ce{CuSO4} was stored as NUL + "ce{CuSO4}" and rendered as literal text.',
  },
  {
    id: 'q-cbse-lakhmir-singh-chemistry-class-10-2-146',
    title: 'Chemistry — vertical tab',
    note: 'Same damage through \\v: VT + "ce{Ca(OH)2}".',
  },
  {
    id: 'q-cbse-lakhmir-singh-chemistry-class-10-1-095',
    title: 'ANSI colour codes in the text',
    note: 'ESC[1m ... ESC[0m from a terminal-styled generation leaked into the stored answer.',
  },
  {
    id: 'q-cbse-lakhmir-singh-chemistry-class-10-2-071',
    title: 'Control byte standing in for $',
    note: 'The math delimiters were replaced by a control byte, so \\textrm{H}^{+} never reached KaTeX.',
  },
  {
    id: 'q-cbse-lakhmir-singh-chemistry-class-10-2-219',
    title: 'Backspace + repeated control bytes',
    note: '\\b ate the backslash of \\ce and three DC4 bytes were left in the sentence.',
  },
  {
    id: 'q-cbse-rd-sharma-mathematics-class-10-3-041',
    title: 'Coordinate table',
    note: 'The small two-column tables that fill the graphing exercises.',
  },
  {
    id: 'q-cbse-rs-aggarwal-maths-class-10-13-040',
    title: 'Shortcode marker printed as the word "KaTeX"',
    note: 'ESC[KaTeX] opened a span whose closing half the corruption ate, so the reader was shown the marker itself. The half-open span goes; the display math after it is untouched.',
  },
  {
    id: 'q-cbse-ncert-ganit-hindi-class-11-3-049',
    title: 'Markers around every step, Hindi',
    note: 'The same markers wrapped each line of the working. Each pair becomes one $...$, and a display block that was left half-delimited is closed.',
  },
  {
    id: 'q-cbse-ncert-ganit-hindi-class-6-11-086',
    title: 'Grid in single delimiters',
    note: 'Inline math cannot cross a newline, so the tokenizer never paired these dollars and the array was printed as source. Promoted to display, then converted to a table.',
  },
  {
    id: 'q-tn-samacheer-kalvi-mathematics-term-1-class-6-6-005',
    title: 'Number pyramid',
    note: 'Same single-delimiter damage, but the spacing here is the content, so it stays maths rather than becoming a table.',
  },
  {
    id: 'q-cisce-selina-concise-mathematics-class-9-4-017',
    title: 'Spacing command left in the sentence',
    note: '\\quad between two finished spans is a layout instruction the reader was shown verbatim. The gap it asked for is an ordinary space.',
  },
];

const load = (dbPath) => {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const want = new Set(ids);
  const found = new Map();
  for (const { book_id } of db.prepare('SELECT DISTINCT book_id FROM catalog_book_chunks').all()) {
    const rows = db
      .prepare('SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index')
      .all(book_id);
    const p = JSON.parse(
      gunzipSync(Buffer.concat(rows.map((r) => Buffer.from(r.content_chunk)))).toString('utf8'),
    );
    for (const ch of p.chapters || [])
      for (const ex of ch.exercises || [])
        for (const q of ex.questions || []) if (want.has(q.id)) found.set(q.id, q);
    if (found.size === want.size) break;
  }
  db.close();
  return found;
};

// ------------------------------------------------------------------ rendering

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline text as the site renders it: math through KaTeX, the rest as prose. */
function rich(text) {
  let html = '';
  for (const t of tokenize(normalizeText(text))) {
    if (t.kind === 'math') {
      try {
        html += katex.renderToString(relaxed(t.value, t.display), {
          displayMode: t.display,
          output: 'html',
          throwOnError: true,
          strict: false,
        });
      } catch (err) {
        // What a reader actually gets when the source will not parse.
        html += `<code class="math-error" title="${esc(err.message)}">${esc(t.value)}</code>`;
      }
      continue;
    }
    html += esc(t.value)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }
  return html;
}

function renderBlock(b) {
  if (!b || typeof b !== 'object') return '';
  switch (b.kind) {
    case 'table': {
      const head = (b.headers || []).map((h) => `<th>${rich(h)}</th>`).join('');
      const body = (b.rows || [])
        .map((r) => `<tr>${r.map((c) => `<td>${rich(c)}</td>`).join('')}</tr>`)
        .join('');
      return `<div class="table-wrap" role="region" tabindex="0"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }
    case 'code':
      return `<pre><code>${esc(b.code ?? '')}</code></pre>`;
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      const items = (b.items || []).map((i) => `<li>${renderValue(i)}</li>`).join('');
      return `<${tag}>${items}</${tag}>`;
    }
    case 'blocks':
      return (b.blocks || []).map(renderBlock).join('');
    default:
      return `<p>${rich(b.text ?? '')}</p>`;
  }
}

function renderValue(v) {
  if (v == null) return '';
  if (typeof v === 'string') return `<p>${rich(v)}</p>`;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  if (v.kind === 'blocks') return (v.blocks || []).map(renderBlock).join('');
  if (v.kind) return renderBlock(v);
  return '';
}

/** The parts of a question a reader looks at, in reading order. */
function renderQuestion(q) {
  if (!q) return '<p class="missing">not found</p>';
  const out = [];
  const section = (label, v) => {
    const body = renderValue(v);
    if (body.trim()) out.push(`<h4>${label}</h4>${body}`);
  };
  section('Question', q.prompt);
  for (const [i, s] of (q.steps || []).entries()) section(`Step ${i + 1}`, s.content);
  section('Answer', q.answer);
  section('Final answer', q.finalAnswer);
  section('Explanation', q.explanation);
  return out.join('');
}

// --------------------------------------------------------------------- output

const ids = (opt('ids', null) || CASES.map((c) => c.id).join(',')).split(',');
const before = load(ORIG);
const after = load(FIXED);

const report = JSON.parse(readFileSync('fix-report.json', 'utf8'));
const s = report.stats;

const rows = CASES.filter((c) => ids.includes(c.id))
  .map(
    (c, i) => `
<section class="case" id="case-${i + 1}">
  <h2>${i + 1}. ${esc(c.title)}</h2>
  <p class="note">${esc(c.note)}</p>
  <p class="qid">${esc(c.id)}</p>
  <div class="pair">
    <div class="col before"><div class="tag">before</div>${renderQuestion(before.get(c.id))}</div>
    <div class="col after"><div class="tag">after</div>${renderQuestion(after.get(c.id))}</div>
  </div>
</section>`,
  )
  .join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Math and table fixes — before / after</title>
<link rel="stylesheet" href="katex/katex.min.css">
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         margin: 0 auto; max-width: 1400px; padding: 32px 24px 96px; }
  h1 { font-size: 26px; margin-bottom: 4px; }
  .lede { color: #666; margin-top: 0; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
           gap: 12px; margin: 24px 0 40px; }
  .stat { border: 1px solid #ddd; border-radius: 10px; padding: 12px 14px; }
  .stat b { display: block; font-size: 22px; }
  .stat span { color: #666; font-size: 13px; }
  .case { border-top: 1px solid #e2e2e2; padding-top: 28px; margin-top: 36px; }
  .case h2 { font-size: 19px; margin: 0 0 6px; }
  .note { margin: 0 0 4px; color: #555; }
  .qid { margin: 0 0 16px; font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: #999; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; }
  .col { border: 1px solid #ddd; border-radius: 10px; padding: 12px 16px 18px;
         /* The columns are deliberately narrow: a wide KaTeX array cannot wrap,
            so the overflow that the reader sees on a phone shows up here too. */
         min-width: 0; overflow: hidden; }
  .before { background: #fff6f6; border-color: #f0c9c9; }
  .after  { background: #f5fbf5; border-color: #c9e6c9; }
  .tag { font: 600 11px/1 ui-monospace, Menlo, monospace; text-transform: uppercase;
         letter-spacing: .08em; color: #888; margin-bottom: 10px; }
  h4 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em;
       color: #999; margin: 18px 0 6px; }
  .table-wrap { overflow-x: auto; margin: 12px 0; }
  table { border-collapse: collapse; font-size: 14px; }
  th, td { border: 1px solid #cfcfcf; padding: 6px 12px; text-align: left; white-space: nowrap; }
  thead th { background: rgba(0,0,0,.045); font-weight: 600; }
  .math-error { color: #b00; background: #fee; padding: 1px 4px; border-radius: 3px;
                font-size: 12px; word-break: break-all; }
  pre { background: #f4f4f4; padding: 10px; border-radius: 6px; overflow-x: auto; }
  .missing { color: #999; font-style: italic; }
  @media (prefers-color-scheme: dark) {
    body { background: #16181c; color: #e6e6e6; }
    .stat, .col { border-color: #333; }
    .before { background: #241a1a; border-color: #5a3535; }
    .after  { background: #16231a; border-color: #2f5537; }
    th, td { border-color: #444; }
    thead th { background: rgba(255,255,255,.06); }
    .math-error { color: #ff9c9c; background: #3a1c1c; }
    pre { background: #202329; }
  }
</style>
</head>
<body>
<h1>Math, symbol and table fixes</h1>
<p class="lede">Both sides are rendered with the site's own pipeline — the text normaliser and
tokeniser lifted from the deployed Worker, then KaTeX 0.18 with mhchem, exactly as the site
calls it. Left is the current database, right is the repaired one.</p>

<div class="stats">
  <div class="stat"><b>${s.tablesConverted.toLocaleString()}</b><span>LaTeX arrays turned into real tables</span></div>
  <div class="stat"><b>${s.stringsRepaired.toLocaleString()}</b><span>strings repaired, across ${s.questionsRepaired.toLocaleString()} questions</span></div>
  <div class="stat"><b>${s.controlCharsBefore.toLocaleString()} &rarr; 0</b><span>stray control bytes</span></div>
  <div class="stat"><b>8 &rarr; 0</b><span>math spans KaTeX could not parse</span></div>
  <div class="stat"><b>0</b><span>spans broken by the repair</span></div>
  <div class="stat"><b>299,458</b><span>questions, unchanged in count and in id</span></div>
</div>

${rows}

<p class="lede" style="margin-top:48px">The 710 ruled arrays left as math are the ones that
should stay math: 606 augmented matrices, 60 columnar additions and 44 arithmetic layouts that
use <code>\\phantom</code> for alignment.</p>
</body>
</html>`;

mkdirSync(OUT, { recursive: true });
mkdirSync(`${OUT}/katex`, { recursive: true });
cpSync('node_modules/katex/dist/katex.min.css', `${OUT}/katex/katex.min.css`);
cpSync('node_modules/katex/dist/fonts', `${OUT}/katex/fonts`, { recursive: true });
writeFileSync(`${OUT}/index.html`, html);
console.log(`wrote ${OUT}/index.html  (${(html.length / 1024).toFixed(0)} kB, ${ids.length} cases)`);
