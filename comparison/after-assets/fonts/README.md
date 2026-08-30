# stix-two-math-subset-v1.woff2

A browser can only draw a tall bracket, a radical that covers its radicand or a
display-size `∑` by pulling larger or segmented versions of the glyph out of the
font's OpenType `MATH` table. Nothing else in the font stack can synthesise
them: without a `MATH` table the engine falls back to one base-size glyph,
centred on the row it is next to.

The stack used to be `Cambria Math, STIX Two Math, STIXGeneral, serif`. Cambria
Math ships only with Windows and Office, STIX Two Math only with recent macOS,
and STIXGeneral has no `MATH` table at all — so Android, most Linux and older
iOS fell through to plain `serif` and lost every stretchy construct on the site.
This file is the fallback for those readers. Desktop readers still match
`local("Cambria Math")` or `local("STIX Two Math")` first and never download it.

STIX Two Math was chosen because it is Times-based, so it matches both the
`serif` those devices were already falling back to and the copy macOS readers
have installed — the letterforms do not change, only the parts that were
broken. It is licensed under the SIL Open Font License 1.1 (see `OFL.txt`); the
copyright and licence records are preserved in the subset's `name` table.

## Cutting a new version

Source is the STIX Two Math 2.13 b171 that macOS ships at
`/System/Library/Fonts/Supplemental/STIXTwoMath.otf`.

    pip install fonttools brotli

    pyftsubset STIXTwoMath.otf \
      --output-file=stix-two-math-subset-v1.woff2 --flavor=woff2 \
      --layout-features='*' \
      --unicodes="U+0020-007E,U+00A0-00FF,U+0100-024F,U+0250-02FF,U+0300-036F,\
    U+0370-03FF,U+2000-206F,U+2070-209F,U+20D0-20FF,U+2100-214F,U+2150-218F,\
    U+2190-21FF,U+2200-22FF,U+2300-23FF,U+25A0-25FF,U+27C0-27EF,U+27F0-27FF,\
    U+2900-297F,U+2980-29FF,U+2A00-2AFF,\
    U+1D400,U+1D434-1D437,U+1D44B,U+1D44E,U+1D450-1D451,U+1D454,U+1D459-1D45B,\
    U+1D45F,U+1D461,U+1D465-1D466,U+1D484,U+1D487,U+1D52F,U+1D6FC-1D6FE,\
    U+1D703,U+1D706,U+1D70B,U+1D7FF"

`pyftsubset` drops the copyright and licence `name` records, so copy name IDs
0, 5, 7, 8, 9, 11, 13 and 14 back across from the source before saving.

The ranges are blocks rather than the exact code points the books use, so a new
book cannot introduce tofu inside a formula. The Mathematical Alphanumeric
entries are listed individually instead: `tools/math-audit/glyph-census.mjs`
walked 606 books and 334M characters and found only 25 of them, 110 uses in
total, against ~190 KB for carrying the whole block.

Verify a new cut still stretches before shipping it — the `MATH` table survives
subsetting but the variant chains only survive for glyphs that were kept:

    python -c "from fontTools.ttLib import TTFont; \
      m=TTFont('stix-two-math-subset-v1.woff2')['MATH'].table.MathVariants; \
      print(m.VertGlyphCount, m.HorizGlyphCount)"

That must print `89 47`, the same counts as the full font. Then render the nine
delimiter pairs, `msqrt`, `munderover` over `∑`/`∏`/`∫`, and `mover`/`munder`
with `⏞`/`⏟` against the unsubsetted font and compare.

Bump the `-vN` suffix on any recut: `_headers` serves this path `immutable` for
a year, and the filename is what busts the cache. The name is referenced from
`SEMANTIC_MATH_STYLES` in `semantic-math.mjs`.
