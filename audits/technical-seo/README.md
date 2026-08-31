# Technical-SEO audit (Section 3)

A read-only audit of the eleven technical-SEO checklist items in `my-plan.md` §3
— the ten original items plus the page-title budget item added on 2026-08-30.

This audit **reports only**. It opens the corpus `{ readOnly: true }`, writes
nothing outside `audits/technical-seo/`, and changes no page, no database row,
no sitemap and no deployment. Nothing was fixed *by the audit*; everything found
is recorded below and in the JSON.

Four of the findings were fixed afterwards, in their own commits, and the audit
was re-run against each. **"Current result" below is the 2026-08-31 re-run;
"Findings by item" is the original 2026-08-30 record, kept as written so the
fix commits still have something to refer back to.** Where a fix moved a number,
the item says so inline.

## What `pass` means here

`pass: true` means **the audit ran to completion** — not that the site is clean.
Every other gate in this repo exits non-zero when the *site* is wrong; this one
exits non-zero only when the *audit* failed. Site verdicts live in
`checklist[].status`, problems in `findings[]`. The corpus still produces
`fail` items and still exits 0. That is deliberate: §3 asked for a report, not a
release gate, so it is not wired into `check:release`.

One consequence worth knowing before reading the table: **an item's `status` is
not a summary of its own findings.** Each item computes its status from its own
metrics, so `title-budget` reports `warn` while carrying a `critical` finding —
44,561 titles are still over 60 characters even though zero question pages now
collide. Read `findings[]`, not `status`.

## Current result

Offline run, full corpus, re-run **2026-08-31** after the four fixes.
Policy `section-3-technical-seo-v1`.

| Checklist item | Status | Findings | Change since 2026-08-30 |
|---|---|---:|---|
| Page titles within the ~60-character SERP budget *(new)* | warn | 2 | **fixed** — question pages colliding in the visible window 96,985 → **0** |
| Meta titles/descriptions unique per page | fail | 2 | — |
| Duplicate / near-duplicate content | fail | 5 | — |
| Structured data: Q&A schema, no reliance on FAQ rich results | fail | 1 | — |
| Heading hierarchy: one H1, logical H2/H3 nesting | fail | 1 | — |
| Sitemap.xml freshness and indexable-page agreement | fail | 2 | **fixed** — URLs submitted that the Worker serves `noindex` 1,712 → **0** |
| Robots.txt blocks nothing important, nothing thin crawlable | fail | 2 | — |
| Internal linking: orphans, broken links, redirect chains | fail | 2 | — |
| Core Web Vitals / ISR: cache-hit rate, SWR, availability | **pass** | 1 | **fixed** — CLS breaches 5 → **0**, worst CLS 0.997 → **0.043** |
| DPDP Act compliance: consent, privacy policy, disclosure | warn | 2 | — |
| AdSense compliance: no ads on thin pages, ad density | fail | 2 | — |

By severity: **2 critical, 8 high, 8 medium, 3 low, 1 info** (was 2 / 10 / 11 /
3 / 1). Core Web Vitals is the first item to reach `pass`.

The fourth fix, sitemap `lastmod`, deliberately does **not** move its metric:
101,926 of 101,948 URLs still share `2026-08-15T03:30:10Z`, because the corpus
genuinely has not changed since publication. What changed is the mechanism — see
the sitemap item below.

Scope of the re-run: 299,458 question rows, 7,715 chapter rows and 606 books
from the corpus; 215 prerendered and snapshot HTML documents; 101,948 sitemap
URLs (was 104,725, the difference being the URLs the publish gate rejects); 16
Lighthouse runs captured 2026-08-31 against the deployed Worker.

## The new item: titles against the 60-character SERP budget

**Reported, not fixed.** No title was changed in this stage.

**305,254 of 306,438 page titles (99.61%) exceed 60 characters.** The median
page title is 125 characters and the longest is 160.

| Template | Pages | Over 60 | min | p50 | p90 | max |
|---|---:|---:|---:|---:|---:|---:|
| Question | 299,458 | 298,315 | 47 | 126 | 156 | 158 |
| Chapter | 6,203 | 6,203 | 68 | 108 | 138 | 160 |
| Textbook | 477 | 476 | 58 | 80 | 102 | 134 |
| Subject | 235 | 212 | 60 | 72 | 78 | 104 |
| Launch hot path | 32 | 27 | 37 | 107 | 142 | 157 |
| Static / prerendered | 33 | 21 | 32 | 64 | 73 | 95 |
| **All** | **306,438** | **305,254** | **32** | **125** | **156** | **160** |

Distribution across the whole corpus, in 10-character buckets:

| 30–39 | 40–49 | 50–59 | 60–69 | 70–79 | 80–89 | 90–99 |
|---:|---:|---:|---:|---:|---:|---:|
| 7 | 52 | 883 | 5,781 | 15,099 | 23,677 | 28,978 |

| 100–109 | 110–119 | 120–129 | 130–139 | 140–149 | 150–159 | 160–169 |
|---:|---:|---:|---:|---:|---:|---:|
| 31,530 | 30,293 | 28,281 | 26,489 | 27,933 | **87,430** | 5 |

The 87,430-page spike in the 150–159 bucket is the generators sitting against
their own ceilings, not a tail: `question-seo.mjs:334` clamps at
`Math.max(18, 154 - …)` and `:345` at `Math.max(8, 146 - … - 1)`, while
`search-metadata.mjs:52` sets `DOCUMENT_TITLE_LIMIT = 160`. Nothing in the
pipeline has ever targeted 60.

### The finding that matters more than the raw count

All 299,458 question titles are unique in full — the existing gate is right
about that, and this audit reproduces it. But clipped to the 60 characters a
SERP actually shows, only 230,319 distinct question prefixes remain:
**96,985 question pages (32.4%) collide into 27,846 duplicate groups**. Across
all templates it is 98,481 pages in 27,985 groups.

Largest groups: 239 pages all reading `Differentiate the following w Answer –
Class 12 Mathematics `, then 192, 151, 120, 114, 99.

The 80,966 rows Section 2 disambiguated get their disambiguator appended in the
tail Google cuts off, so the disambiguation is invisible exactly where it
counts. Section 2 bug #1 is fixed by its stated criterion — zero duplicate full
titles — while a third of the corpus still ships duplicate titles *as rendered*.
That is the thin/duplicate programmatic pattern §0 names as the risk.

Both numbers are exposed separately in the JSON: `serpVisibleTitleCollisions`
covers every template, `questionSerpVisibleTitleCollisions` is question-only so
it stays directly comparable to the pre-measured figure and a regression cannot
hide inside the larger total.

> **Fixed in `70cf3c09`.** `questionSerpVisibleTitleCollisions` is now **0 groups
> / 0 pages** (was 27,846 / 96,985); all-template is 30 groups / 66 pages (was
> 27,985 / 98,481), the remainder being launch-hot-path search fixtures rather
> than corpus pages. Full-title uniqueness is unchanged at 299,458 distinct.
>
> The fix was not "shorten the titles" — measured, clipping all 306,438 existing
> titles to 60 characters leaves the collision count *exactly* unchanged. What
> matters is which text occupies the first 60 characters, so the title is now
> ID-first: `{book code} Cl{grade} {subject} Ch{n} Q{label}: {prompt…}`, with the
> book code computed as the shortest word-prefix that disambiguates within
> (class, subject) rather than a fixed-width truncation — every fixed-width
> variant measured left 1,400–2,500 collisions concentrated in long-named books
> that truncate to the same prefix. Ordering was chosen by measurement too:
> at a 55-character clip, ID-first still collides 0 times while topic-first
> collapses to 70,229 pages, and Google clips by pixel width, not characters.
> ` | StudyWudy` was dropped from question titles to reclaim ~12 characters; hubs
> keep it. `questionSocialTitle` stays prompt-first and long for `og:title`, and
> the H1 is unchanged, so the human-readable phrasing still leads everywhere it
> is not competing with a 60-character budget.
>
> Still open on this item, and why it reports `warn` rather than `pass`: 44,561
> titles remain over 60 characters (was 305,254 of 306,438). The item's status is
> derived from that count alone, which is also why it shows `warn` while carrying
> a `critical` finding for the 66 residual collisions.

## Findings by item

**Duplicate / near-duplicate content.** 267,096 of 299,458 questions (89.2%)
fail the publish gate's 150-genuine-unique-word depth floor. 22,733
duplicate-intent groups span more than one chapter — 22,233 more than one
textbook, 1,492 more than one board — and so are never compared by the gate,
whose key is chapter-scoped. Re-running the gate's own metric (Jaccard ≥ 0.85
over normalized 5-word answer shingles) across those groups finds 2,265
cross-chapter pairs at or above the threshold. The persisted verdicts were
written under policy `phase4-v3-grounded-staged-publish` while the gate is now
`phase4-v15-source-bounded-enrichment`, so they are stale. 8,307 questions share
a byte-identical answer body — but that is a thin-content signal, not mass
plagiarism: 2,044 of the 3,132 groups have answers of 20 characters or fewer
("False b: False", "True a: True", "1", "0"), and only 92 pages sit in a group
whose shared answer exceeds 200 characters.

Scope note worth keeping: 260,591 questions across 477 books were scanned here;
the 38,867 questions in the 129 books `multilingual-text-quality.mjs`
quarantines are excluded because they never render — but the publish gate
counted them, so it issued depth and similarity verdicts for pages that do not
exist. 260,591 + 38,867 = 299,458 = the gate's `corpus_count`.

**Structured data.** FAQPage JSON-LD is emitted on 6 documents, including all
four board landings, served from checked-in
`comparison/after-assets/pages/<board>/index.html`. §3 explicitly says not to
rely on FAQ rich results. `selective-structured-data-gate.mjs` only forbids
`QAPage` and `MathSolver`, so nothing catches this today.

**Sitemap.** 104,703 of 104,725 URLs carry the identical hardcoded `lastmod`
`2026-08-15T03:30:10Z` (`phase3-build-static-sitemaps.mjs:24`), 15 days stale
and never moved by a content change. The sitemap index's own per-file lastmods
do move, which is why the existing runtime audits — they only assert
`lastmodCount === urlCount` — never noticed. The sitemaps list 97,537 question
URLs while the publish gate passed 32,362: **65,175 pages are submitted for
indexing that the site's own quality gate rejected**. 26 hierarchy and legal
routes exist but are in no sitemap. 4 submitted stream URLs pair a stream with a
subject `comparison/stream-taxonomy.js` does not list under it.

> **Fixed, and one claim above was wrong.** The "65,175 pages" subtraction is not
> valid: it compares two scalars without intersecting the sets. The sitemap
> already filtered on the publishing manifest and never read
> `content_publish_gate` at all, and the two populations are not nested — 18,785
> gate-passed URLs were *absent* from the sitemap while 83,959 sitemap URLs had
> no gate row of any kind. Filtering on `gate_passed = 1` would have cut the
> sitemap by 86%, not by 32,362. The genuine defect was **1,712 URLs** the Worker
> serves `noindex, follow`: 216 failing `corpusQuestionIndexEligible` and 1,500
> failing `renderedEquationPass`, the latter caused by manifest/validator drift —
> `after-worker.js` imports `semantic-math.mjs` rather than bundling it, so the
> deployed Worker evaluated today's validator against a bitset compiled
> 2026-08-23. Regenerating the manifest (`4b3ff360`) closed the drift and
> filtering the builder (`66598dfe`) closed the rest:
> `sitemapSubmittedButNotIndexable` and `sitemapMinusPublishGate` are both **0**,
> and `urlCount` is 101,948. `content_publish_gate` itself is a dead artefact —
> 32,362 rows, all `gate_passed=1`, three policy generations stale, written by no
> live script and read by no request path — and is now reported as such.
>
> The frozen `lastmod` is **not** a hardcode at `:24`; that line is a floor, and
> every `updated_at` column in the corpus is NULL, so no generator change could
> make the date move. `d67d75fc` replaced it with a real content-revision log
> (`catalog_content_revisions`, 267,775 rows keyed on what the page actually
> renders) so that when §4 rewrites content, each page emits its own `lastmod`.
> The metric stays open by design until content actually changes: fabricating
> modification times is the thing Google discounts. 22 URLs already differ.

**Robots.** Nothing disallows `/search`, so every faceted query-string
combination is crawlable on a ~300K-page site. The checked-in
`comparison/after-assets/robots.txt` disallows only `/api/` while the Worker
synthesizes five directives at `after-worker.js:3625` — the two disagree, and no
existing check compares them.

**Internal linking.** 15 link targets in the prerendered documents resolve to no
route the corpus can produce. Each was checked by hand: 14 are `q-physics-*`
demo results baked into the prerendered `/search` document that match zero
`catalog_questions` rows, and `/cisce/class-11` is linked from the homepage
though `catalog_grades` holds no cisce class-11 row.
`release-link-integrity-gate.mjs` catches neither, because it crawls a preview
origin where the base Next.js worker answers any path-shaped URL. Separately,
230 of 259 subject routes and 448 of 477 textbook routes receive no link from
any prerendered document.

**Core Web Vitals — re-measured, and the breach does not reproduce.** The
original entry here read "4 of 16 Lighthouse runs breach the 0.1 CLS threshold,
worst 0.997 on class-mobile, and `homepage-desktop` breaches at 0.202". Those
numbers were real but they were the **BEFORE column of a before/after pair**:
`technical-seo-surface.mjs` hardcoded `audits/phase-0/lighthouse-json`, a
2026-08-18 capture, and reported it as present state 12 days and 35 commits
later.

Root cause of the 2026-08-18 shifts, named from the raw `layout-shifts` audit
rather than guessed — the per-event scores sum to each run's reported CLS with
exact float equality, so nothing else contributed. The shifting node is
`main#main-content > section.shell`, and the cause is
`comparison/after-assets/quick-find.js` mounting after hydration with no space
reserved: `:99-117` inject a full-height `<section class="qf-section">` and then
delete the server-rendered `.course-finder` underneath in the same task, while
`mountQuickFindAfterHydration` (`:445-454`) polls rAF for up to 300 frames, so
the insertion lands after first paint by construction. Solving Lighthouse's
score formula against the recorded bounding rects gives 736.6 px of displacement
per event on homepage-desktop and 540.0 px on class-mobile, twice each. The
audit's previous note blaming "the catalog artwork" is contradicted by its own
artifacts: `unsized-images`, `image-aspect-ratio` and `image-size-responsive` all
score 1 with 0 items on every hub run, every `<img>` carries explicit `width` and
`height`, and no shift row carries a font-swap cause.

Both breaches were already closed by later commits — `quick-find-critical.mjs`
added an explicit first-paint reservation for the class template, and
`after-worker.js:3130-3149` strips quick-find from `/` entirely, so the homepage
breach was against deleted code. A fresh capture on **2026-08-31** against the
deployed Worker measures **0 threshold breaches across 16 runs, worst CLS 0.043**
(subject-desktop); class-mobile reads 0.008 and homepage-desktop 0.000. No CLS
patch was applied, because there is nothing left to patch.

**The defect that was real is the gate hole, and it is now closed.** The audit's
claim that `lighthouserc.cjs` only asserts the aggregate score was wrong — it
asserts `cumulative-layout-shift <= 0.1` directly. The hole was *URL coverage*:
`isFinderPage` (`after-worker.js:3003`) is true only for `/{board}` and
`/{board}/class-N`, and not one gated URL was either, so the single script that
produces these shifts was never loaded under the assertion. `/maharashtra-board`
and `/maharashtra-board/class-12` are now gated at both form factors, and the
config takes `PHASE6_GATE_FORM_FACTOR` because one form factor proves nothing
about a layout shift — homepage-mobile read 0.000 while homepage-desktop read
0.202 on identical code. `pnpm run audit:lighthouse:both` runs it; against
production both form factors pass, worst CLS 0.014 on the finder templates.

Three guards now make this class of mistake self-reporting rather than silent:
the capture directory is resolved newest-first instead of hardcoded; a finder run
that issued no `/quick-find.*` request is flagged, because it did not measure the
Worker at all (`audits/phase-2` is exactly this — 26 requests on class-mobile,
zero quick-find, and a resulting "after" of 0.001 that nothing in production ever
produced); and each served quick-find asset's `resourceSize` is compared against
the checked-in file's byte length, which is what actually establishes that a
capture of *production* describes *this worktree*. All four finder runs in the
2026-08-31 capture pass all three.

Still true and unchanged: ISR, stale-while-revalidate and edge cache-hit rate are
measured by no artefact in this repo, and the Lighthouse sample is a fixed 8
templates × 2 form factors.

**Heading hierarchy.** 1 of 215 documents has no H1. Measured on server HTML
only — `quick-find.js` injects `<h2 id="qf-heading">` after hydration, so a
browser-side audit of `/`, board and class routes sees one more H2 than this
does, which is where the single historical `heading-order` failure lived. Note
that `phase1-browser-qa.mjs:124` restricts axe to `wcag*` tags, and both
`heading-order` and `page-has-heading-one` are tagged `best-practice`, so
neither has ever run there.

**DPDP.** `warn`, not `fail`: the legal pages exist, the site is declared
child-directed sitewide, cites DPDP §9, declares no targeted advertising and
requests non-personalized ads only. But no consent banner, cookie notice or TCF
integration exists anywhere in the codebase, and nothing compares the privacy
policy's stated collection against what the deployment actually collects.

**AdSense.** Zero ads are served today (`/ads.txt` is a placeholder;
`X-StudyWudy-Ads-Txt: awaiting-publisher-id`), so neither finding is a live
policy violation — both are about the day a publisher id is configured. The
standalone question route returns without `enhanceResponse`
(`after-worker.js:3785` and `:3750`), which is the sole carrier of `adDecision`,
so roughly 300,000 pages and `/search` never reach the ad gate at all. No script
measures ad density, and `adDecision` has no unit test.

## Open backlog — logged, not fixed

Recorded under `openBacklog` in the JSON, each `state: "logged-not-fixed"`.

1. **Search input has no visible focus indicator on any viewport.** (high —
   WCAG 2.4.7, 2.4.11.) `audits/phase-1/keyboard-qa.json`: 3 of 12 runs fail,
   template `search`, at 390×844, 768×1024 and 1440×1000 — outline `none`, 0 px
   width, no shadow. Commit `84e96c26` records the deployed Worker failing the
   same 3, so this predates the Section 2 work and is not a regression from it.

2. **The local corpus and the deployed D1 are different vintages.** (medium.)
   `/search?type=numerical` returns 36 rows from the local build and
   `data-search-result-count="50"` live. **Every number in this report derived
   from the corpus is therefore unverified against production**, and every
   checklist entry with `provenance.dataSource === "corpus"` carries
   `productionVerification: "unverified-against-production"` for that reason.
   The same stamp is applied to `static-assets` and `code` sources, since the
   deployed Worker is a hand-deployed tree matching neither `origin/production`
   nor local HEAD. Related: `catalog_questions.prompt_text` disagrees with the
   reconciled chunk text on 19,897 of 299,458 rows; that migration is
   deliberately unrun, and the audit reconciles at read time exactly as the
   Worker does.

3. **P0 — production exceeds Worker resource limits and truncates HTML.**
   (critical.) Measured 2026-08-30 against the production Worker: HTTP 503
   `error code: 1102` on `/` and `/boards`, and non-deterministic truncation on
   HTMLRewriter-streamed routes (`/cbse` returned 20,014 / 22,479 / 25,691 bytes
   on three attempts, none ending `</html>`). Routes served with a
   `content-length` are complete and deterministic; `/boards` carries no
   `cf-cache-status` at all, so it always reaches the Worker. This is on the
   currently-deployed code and is unrelated to Section 2. It is the pre-deploy
   baseline for the Part A step-4 comparison.

This is why the audit discards any live response whose body does not end in
`</html>`, records it as `incomplete-response`, and never parses it. Without
that rule the truncation incident manufactures phantom "missing H1" and "broken
link" findings.

## Commands

```sh
pnpm run audit:technical-seo                       # all 11 items, fully offline
node scripts/technical-seo-audit.mjs --only metadata   # one group while iterating
```

`--only` takes `metadata`, `duplication`, `markup`, `crawl` or `surface`. Items
not run are listed in `scope.checklistItemsNotRun` rather than silently omitted.
Always pass `--output` alongside `--only`: the default output path ignores
`--only`, so a group run overwrites the 11-item report with a 2-item one that
reads like the site improved.

The `surface` group reads whichever Lighthouse capture directory exists, newest
first, and reports which one it used and how far behind HEAD it is. It does not
take its own measurements. To refresh them:

```sh
LIGHTHOUSE_ORIGIN=https://studywudy-board-solutions.amanbhagat17089.workers.dev \
  LIGHTHOUSE_OUTPUT_DIRECTORY=audits/phase-6/lighthouse-json \
  node scripts/phase0-run-lighthouse.mjs      # 8 templates x 2 form factors
```

That script **skips any output file that already exists**, so move the directory
aside first rather than expecting a re-run to overwrite it. Measure against an
origin that is actually running the Worker: a prerendered-only static server
serves the markup without the runtime and silently produces a CLS near zero on
exactly the templates whose CLS is in question.

The release gate is separate from the capture, and runs both form factors:

```sh
PHASE6_GATE_ORIGIN=https://studywudy-board-solutions.amanbhagat17089.workers.dev \
  pnpm run audit:lighthouse:both              # asserts CLS <= 0.1, LCP, TBT
```

It needs a Chrome binary; the scripts default `CHROME_PATH` to the same Brave
install `phase0-run-lighthouse.mjs` uses, so override it if yours differs.
Reports land in `audits/phase-6/lighthouse/{mobile,desktop}/`, which is
gitignored.

Add live-origin checks — production availability, body completeness, and a
20-URL generator-drift cross-check of offline title lengths against what the
origin serves:

```sh
STUDYWUDY_DEPLOYMENT_URL=https://studywudy-board-solutions.amanbhagat17089.workers.dev \
  node scripts/technical-seo-audit.mjs --live
```

Question and chapter routes are expected to report `generator-drift` until the
Section 2 commits deploy; that is the correct signal, and an independent
confirmation of Part A.

Unit tests for the pure helpers — bucketing, percentiles, SERP clipping, the
heading-outline extractor — run inside `pnpm run test:content-gates`, or alone:

```sh
node --test tests/technical-seo.test.mjs
```

## Layout

| Path | Role |
|---|---|
| `technical-seo.mjs` (repo root) | Pure rules, thresholds and `POLICY_VERSION` |
| `scripts/technical-seo-audit.mjs` | Orchestrator; merges modules, writes the JSON |
| `scripts/technical-seo-metadata.mjs` | Title budget and title/description uniqueness |
| `scripts/technical-seo-duplication.mjs` | Near-duplicate and thin-content clustering |
| `scripts/technical-seo-markup.mjs` | Structured data and heading hierarchy |
| `scripts/technical-seo-crawl.mjs` | Sitemap, robots, internal linking |
| `scripts/technical-seo-surface.mjs` | Core Web Vitals, DPDP, AdSense |
| `tests/technical-seo.test.mjs` | Unit tests for the pure helpers |
| `audits/technical-seo/technical-seo-audit.json` | Machine output (gitignored) |

## Reading the JSON

`generatedAt`, `pass`, `policy`, `sourceDatabase`, `corpus`, `scope`,
`statusCounts`, `findingCount`, `checklist`, `generatorDrift`, `openBacklog`,
`errors`. Every checklist entry carries a `provenance` block naming its
`dataSource` (`corpus`, `static-assets`, `in-process-render`, `code`,
`live-origin`), the corpus path with size and mtime so the vintage is never
implicit, and its `productionVerification` stamp.

Two consecutive offline runs produce byte-identical JSON apart from
`generatedAt`.

The corpus read is `../data/d1/studywudy-content.sqlite3` — not the `.pristine`
or `.fixed` siblings, and not `phase3-build-question-seo.mjs`'s default
`cloudflare-backup-2026-08-17/…`, which does not exist on this machine (so
`pnpm build:question-seo` cannot run here without `--source-db`). HTML is
rendered in-process through the Worker's own handlers against
`https://studywudy.example`; `wrangler dev` is not used and cannot start on this
machine.
