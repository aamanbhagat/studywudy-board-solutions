# math-audit

Finds and repairs broken maths in the catalogue content — the KaTeX, the LaTeX
and the tables that the question generator left in a state the reader cannot
render. It works on a local copy of the `studywudy-content` D1 database and
emits the SQL that carries the result back.

The catalogue is 606 books, 7,715 chapters, 7,817 exercises and 299,458
questions, stored as gzipped JSON split into 40,000-byte rows of
`catalog_book_chunks`.

## What was wrong

Four classes of damage, in descending order of how often the reader met them:

1. **ANSI and control bytes.** The generator's terminal output was captured
   verbatim, so `ESC[1m`, `\x0b`, `\x1c` and friends sit in the middle of
   sentences — usually where a `$` delimiter should have been, which is why so
   much chemistry appeared as `ce{H2SO4}` instead of H₂SO₄. 7,310 strings.

   The bytes are not interchangeable. Most of them — FS, RS, ENQ, DLE and the
   rest below `0x20` — only ever stood in for a lost `$` or `\`, so a matched
   pair of them can be read back as a span: `\x1f₹15\x1f` was written `$₹15$`.
   DEL (`0x7f`) is the exception. It stood in for a lost `\` in places like
   `\text{\x7fCO}`, but it also turns up simply glued to a numeral, and pairing
   those off sets two words of a sentence as an equation — `\x7f10 followed by
   \x7f10 gives \x7f10^2` is prose, not maths. So DEL is stripped and used to
   restore a backslash, and never to infer a delimiter.
2. **Ruled arrays used as tables.** `\begin{array}{c|ccc}…\hline…\end{array}`
   renders as one unbreakable box. On a phone the columns jam into each other,
   which is exactly what the reported truth table looked like. The site has a
   native `kind:"table"` block that wraps and scrolls; these had never been
   converted to it.
3. **Bare LaTeX.** Commands written without any delimiter around them, so the
   reader is shown the source: `\frac{1}{2}`, `\rightarrow`, `\ldots`.
4. **Delimiter faults.** Empty `$$` spans, a stray unmatched `$`, a grid written
   inside single dollars (inline maths cannot cross a newline, so it never
   pairs), a shortcode marker printed as the literal word "KaTeX", `\quad` left
   outside any span.

## How it decides

The site's own normaliser and tokeniser are lifted into
[`lib/site-render.mjs`](lib/site-render.mjs) and used as the oracle, so "does
this render" is answered the way the page answers it, not the way KaTeX alone
would. `katex/contrib/mhchem` is loaded, without which every `\ce{…}` is a false
failure.

Every repair is scored before it is kept. A candidate is accepted only if its
count of failures under `normalizeText → tokenize → relaxed → KaTeX` is no
higher than the original's, so a pass can never make a string worse than it
found it. Candidates fall down a ladder — full, conservative, minimal,
rejected — and the tier is recorded. In the applied run all 39,641 repairs
landed on the top rung and nothing was rejected.

Table conversion is likewise refused unless every row has the same width and
the cells survive a round trip, which is why 1,299 arrays converted and the
decorative ones (Lewis structures, skeletal formulae) were left as maths.

## Running it

The database is not in the repository. Put a dump of `studywudy-content` at
`data/d1/` relative to the repository root and take a copy for the tools to
write to — `fix.mjs` edits its `--db` in place, and every audit here compares
the two:

```sh
cd data/d1
cp studywudy-content.sqlite3 studywudy-content.fixed.sqlite3
```

```sh
cd tools/math-audit
npm install                                    # katex + mhchem

node audit.mjs                                 # what is broken, and where
node fix.mjs --db ../../data/d1/studywudy-content.fixed.sqlite3 --apply
node verify.mjs                                # counts, integrity, table totals
node --max-old-space-size=6144 site-audit.mjs  # renders every span, both sides
node review.mjs                                # review/index.html, before vs after
```

`fix.mjs` refuses to `--apply` to a path without `fixed` in its name, because
it is very easy to overwrite the pristine copy and there is no undo. Pass
`--force` if you mean it.

`site-audit.mjs` and `brace-check.mjs` each hold the whole catalogue in memory.
Run them one at a time with a raised heap; chained together they get killed.

## Publishing to D1

```sh
node make-d1-sql.mjs          # -> d1-content-fix.01.sql … .18.sql
cd ..
for n in 01 02 03 … 18; do
  npx wrangler d1 execute studywudy-content --remote --yes \
    --file=tools/math-audit/d1-content-fix.$n.sql
done
```

Each changed book is one `DELETE` plus its `INSERT`s, and the parts are split
on book boundaries. If the run stops halfway, every book is either wholly old
or wholly new — never half of each — so the fix is to carry on, not to repair.

Verify afterwards that the live totals match the local repaired file:

```sh
npx wrangler d1 execute studywudy-content --remote --yes --command="
  SELECT COUNT(*) chunks, COUNT(DISTINCT book_id) books,
         SUM(LENGTH(content_chunk)) blob_bytes FROM catalog_book_chunks;"
```

Publishing to D1 is only half of it. `data/d1/studywudy-content.sqlite3` is what
two dozen build scripts read, so it has to become the repaired file too, or the
prebuilt pages and question payloads go on serving the old text while D1 serves
the new — the reader sees whichever the route happens to use. Keep the untouched
copy under `studywudy-content.pristine.sqlite3`; it is the baseline
`diff-repair.mjs` reads, and there is no other copy of it.

```sh
cd data/d1
mv studywudy-content.sqlite3 studywudy-content.pristine.sqlite3
cp studywudy-content.fixed.sqlite3 studywudy-content.sqlite3
```

Then rebuild the artefacts that are cut from it — `build:study-cluster-runtime`,
`build:study-cluster-static`, `build:question-showcase`,
`build:nightly-quality-sample`, `build:question-payload-assets`,
`build:corpus-quality`, `build:corpus-quality-static` — and
`release:manifest` last, since it hashes the rest.

## Keeping a pass honest

`fix.mjs` scores each repair, but a score cannot see a sentence turned into an
equation — both sides render, so both sides pass. `diff-repair.mjs` is the gate
for that. It runs the current `lib/repair.mjs` and a copy of the previous one
over all 9.5 million strings and prints every string the two disagree on:

```sh
node --max-old-space-size=8192 diff-repair.mjs --limit 400
```

Read the moved strings, all of them. In the second pass 156 strings moved and
the score buckets called every one of them neutral; four were regressions —
`sin^(-1)$\left(\cos\frac\pi9\right)$` split into a symbol and a centred line,
a markdown code fence swallowed into display maths, `\x7f10 followed by \x7f10`
set as maths, and a torn `\text{` group whose closing `$` was read as nested.
The bucket is a filter, not a verdict.

`state-scan.mjs` measures what is left from the reader's seat — source text the
tokenizer never made into maths, expressions split by a stray span, grids still
in one box — and takes `--db`, so the same command describes the pristine copy
and the repaired one.

## The applied run

Two passes. The first cleared the control bytes and the tables; the second went
after what the reader could still see. `state-scan.mjs`, pristine vs published,
as hits / questions:

| | before | after |
|---|---|---|
| KaTeX error | 10 / 8 | **0** |
| mojibake or replacement char | 1 / 1 | **0** |
| LaTeX shown as text | 2,865 / 2,353 | 2 / 2 |
| spacing command in prose | 204 / 179 | **0** |
| empty math span | 20 / 15 | **0** |
| HTML shown as text | 198 / 42 | 2 / 2 |
| unmatched `$` shown as text | 358 / 259 | 115 / 67 |
| ruled array: looks tabular | 1,990 / 1,102 | 710 / 220 |
| ruled array: decorative | 13 / 13 | **0** |
| expression split by an adjacent span | 210 / 84 | 202 / 76 |
| glyph KaTeX cannot size | 211 / 59 | 271 / 169 |
| unclosed bold markers | 70 / 45 | 70 / 45 |
| space before punctuation | 18,806 / 14,287 | 17,760 / 13,337 |
| run of spaces in prose | 11,668 / 8,756 | 11,122 / 8,260 |
| **questions carrying at least one** | **25,381** | **21,184** |

312 of 606 books changed; 43,765 strings and 1,299 tables repaired across
29,470 questions, every one on the top rung of the ladder and none rejected.
Control bytes 7,310 → 0. The question, chapter and exercise counts are
unchanged, and the published blob is byte-identical to the local repaired file
(2,558 chunks, 606 books, 90,013,789 bytes).

### What is left, and why

Three of those rows go up or stay put, and none of the three is a defect:

- **`glyph KaTeX cannot size` 211 → 271.** The rise is entirely `₹`, 4 → 207.
  The source wrote `\x1f₹15\x1f`, so restoring the delimiters puts the rupee
  inside a span where it belongs; before the repair the span was broken and the
  tokenizer never counted it. KaTeX has no metrics for `₹`, but the page does
  not render these through KaTeX alone — `semantic-math.mjs` sets them — so the
  warning never reaches the reader. `½ ★ ■ □ • ● ″ ¼ ¾` all fell to zero.
- **`unclosed bold markers` 70 / 45, unmoved.** Counted over the whole string.
  Per text token the number is 70,608, because bold usually wraps an equation —
  `**$\ce{Ca(OCl)2}$**` — and the tokenizer hands that back as two runs holding
  one `**` each. Neither is unclosed; the scanner used to be.
- **`space before punctuation` and `run of spaces in prose`.** Indian English
  sets a space before a colon and pads columns with runs of spaces. Left alone.

Of the rest: ~190 of the 202 split expressions are consecutive display
equations, which is how they were written; ~105 of the 115 unmatched `$` are
currency, code spans and symbol lists. `ruled array: looks tabular` is 710
grids that are genuinely maths-shaped — matrices and determinants — and the
renderer sizes their brackets to the whole grid rather than one row.

The individually unrecoverable sources are small and identified: three strings
in `…ganit-exemplar-hindi-class-8-5-151` where `∠` and `°` came through as ENQ
mojibake, one `\sqrt{\frac{"m"}{"k"}]` with a bracket for a brace, and one
chemistry answer with four `\text{` openers and two closers.

## Layout

| | |
|---|---|
| `lib/repair.mjs` | every repair pass, and the scorer that vets them |
| `lib/site-render.mjs` | the site's normaliser and tokeniser, used as the oracle |
| `lib/array-table.mjs` | `\begin{array}` → native table block |
| `fix.mjs` | applies the passes to a copy of the database |
| `make-d1-sql.mjs` | the delta SQL, split on book boundaries |
| `diff-repair.mjs` | which strings an edit to `lib/repair.mjs` moves, and which way |
| `state-scan.mjs` | what is still wrong from the reader's seat, by class |
| `audit.mjs`, `site-audit.mjs`, `verify.mjs`, `brace-check.mjs`, `prose-scan.mjs` | measurement, before and after |
| `split-scan.mjs`, `caret-scan.mjs`, `pattern-scan.mjs`, `prompt-text-scan.mjs` | one class each, in detail |
| `trace.mjs`, `find-cases.mjs`, `render-probe.mjs`, `stale-check.mjs` | step one string through the passes, or find one to step |
| `review.mjs` | a side-by-side HTML page of the interesting cases |
| `test-repair*.mjs`, `test-convert.mjs` | spot-checks against the real corruption shapes |
| everything else | one-off probes kept as a record of how a class was tracked down |
