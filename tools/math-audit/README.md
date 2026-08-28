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

## The applied run

| | before | after |
|---|---|---|
| control / ANSI bytes | 7,310 | 0 |
| broken math tokens (site renderer) | 8 | 0 |
| ruled arrays | 2,003 | 710 |
| native table blocks | 10,271 | 11,570 |
| shortcode marker printed as text | 293 | 0 |
| literal `\n` in prose | 1,656 | 0 |
| unrendered HTML entity | 724 | 0 |
| bare LaTeX command | 8,657 | 189 |
| `$` inside a LaTeX group | 120 | 26 |

311 of 606 books changed; 39,641 strings and 1,299 tables repaired across
26,681 questions. Nothing newly broke: the site renderer reports 0 newly-broken
spans and 0 questions with a newly odd number of `$`, and the question, chapter
and exercise counts are unchanged.

The 189 remaining bare-command hits are mostly not LaTeX at all — Windows paths
(`C:\Users\…`), table-header diagonals (`Nutrient\Fodder`), and source typos
(`km\hr`) — plus a handful of genuinely unsalvageable `\multicolumn` and
multi-line `\text{}` fragments.

## Layout

| | |
|---|---|
| `lib/repair.mjs` | every repair pass, and the scorer that vets them |
| `lib/site-render.mjs` | the site's normaliser and tokeniser, used as the oracle |
| `lib/array-table.mjs` | `\begin{array}` → native table block |
| `fix.mjs` | applies the passes to a copy of the database |
| `make-d1-sql.mjs` | the delta SQL, split on book boundaries |
| `audit.mjs`, `site-audit.mjs`, `verify.mjs`, `brace-check.mjs`, `prose-scan.mjs` | measurement, before and after |
| `review.mjs` | a side-by-side HTML page of the interesting cases |
| `test-repair*.mjs`, `test-convert.mjs` | spot-checks against the real corruption shapes |
| everything else | one-off probes kept as a record of how a class was tracked down |
