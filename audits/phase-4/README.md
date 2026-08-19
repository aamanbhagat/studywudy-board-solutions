# Phase 4 — content integrity and staged publishing

Status: implemented and validated against the complete recovered corpus on 18 August 2026. This report describes the local production-equivalent Worker; it has not been deployed to the public Cloudflare service in this task.

## Recovered pipeline finding

The content-similarity gate described before this phase was **not wired into the recovered repository**:

- `git log -S similarity` and `git log -G 'pairwise|similarity.*threshold|content.*similarity'` found no publishing-gate implementation in commits through `6ceb77530`.
- A repository-wide and parent-workspace search found no content-gate threshold or staged-publish implementation.
- The only pre-existing similarity implementation is catalog-artwork matching in `scripts/build_catalog_artwork.py`; it does not inspect answer content or affect publishing.
- Question metadata called the static `isCatalogQuestionIndexable()` blacklist, which excluded nine question keys. Phase 3 question sitemaps used the same nine-key exclusion. There was no depth check, similarity check, rewrite queue, or fail-closed state.

Therefore, before Phase 4, 299,449 of 299,458 stored questions (99.9970%) were indexable even though none had cleared a content gate. The prior gate's location, threshold, and failure behavior were absent—not merely disabled by a flag.

## Gate now live in the publish pipeline

`pnpm deploy:production` now runs `build:phase4-gate` before the Worker deploy:

1. `scripts/phase4-content-gate.mjs` decompresses every `catalog_book_chunks` payload and evaluates every stored question.
2. It writes the complete audit and generates `phase4-publish-manifest.mjs`.
3. `worker.js` imports that manifest and uses it as the authoritative set for both page robots treatment and question sitemaps.
4. The Worker verifies that the manifest's corpus count and catalog timestamp match D1. A missing, incomplete, version-mismatched, or stale manifest fails closed.
5. The optional D1 migration `migrations/0001_phase4_content_publish_gate.sql` persists per-question evidence and the `queued_for_rewrite` disposition for editorial querying. The production decision does not default open if those queue tables are temporarily absent; this was tested explicitly.

Policy `phase4-v1`:

- Depth floor: **150 genuine unique words**.
- Depth metric: Unicode lexical words in the rendered solution body only. Navigation, breadcrumbs, footer, related questions, prompt words, and answer-choice words are excluded. This prevents question/answer restatement from satisfying the floor.
- Similarity threshold: **0.85**.
- Similarity metric: exact Jaccard similarity over normalized five-word answer-body shingles. The inverted index prunes only pairs that cannot reach 0.85 by length or overlap; this is not MinHash/LSH sampling.
- Similarity scope: all 7,933 depth-passing pages across the corpus.
- Threshold breach: both pages are marked failed and queued for rewrite. The current corpus had 27,449 viable candidate comparisons and zero pairs at or above 0.85.
- Remediation: option **(b)** for every thin or unobserved format. The standalone URL remains usable, but receives `noindex, follow`, is omitted from question sitemaps, and remains queued until a later build clears both gates.

## Full-corpus result

| Measure | Count | Fraction |
|---|---:|---:|
| Stored question pages | 299,458 | 100% |
| Previously indexable | 299,449 | 99.9970% |
| Depth-passing | 7,933 | 2.6491% |
| Similarity-passing after depth | 7,933 | 2.6491% |
| Gate-passed / indexable now | 7,933 | 2.6491% |
| Queued for rewrite | 291,525 | 97.3509% |

The generated manifest contains 7,933 passed paths. The runtime question sitemap contains exactly the same 7,933 paths: zero missing and zero unexpected. The D1 gate table has exactly 299,458 evidence rows and exactly 7,933 `gate_passed = 1` rows.

## All 17 formats

Format classification is based on average unique words in the rendered answer body. `Genuine avg` additionally removes words found in the prompt and choices and is the per-page gate metric. An absent format cannot honestly be called content-rich, so it is held thin-by-default until real rows are evaluated.

| Format | Persisted rows | Rendered unique avg | Genuine avg | Pages clearing 150 | Classification | Implemented remediation |
|---|---:|---:|---:|---:|---|---|
| `one_word` | 0 | — | — | 0 | Unobserved; held thin | Staged URL, `noindex` until pass |
| `one_sentence` | 12,518 | 2.4 | 1.7 | 0 | Thin | Staged URL, `noindex` until pass |
| `brief` | 179,029 | 29.2 | 23.3 | 2,500 | Thin | Staged URL; passing individual pages may index |
| `detailed` | 26,951 | 86.9 | 78.8 | 5,159 | Thin on average | Staged URL; passing individual pages may index |
| `define` | 2,058 | 32.8 | 29.9 | 4 | Thin | Staged URL; passing individual pages may index |
| `give_reason` | 3,158 | 75.3 | 65.6 | 262 | Thin | Staged URL; passing individual pages may index |
| `name_list` | 0 | — | — | 0 | Unobserved; held thin | Staged URL, `noindex` until pass |
| `mcq_single` | 52,418 | 21.9 | 13.9 | 0 | Thin | Staged URL, `noindex` until explanation is expanded |
| `mcq_multi` | 166 | 40.0 | 29.2 | 0 | Thin | Staged URL, `noindex` until explanation is expanded |
| `assertion_reason` | 0 | — | — | 0 | Unobserved; held thin | Staged URL, `noindex` until pass |
| `true_false` | 0 | — | — | 0 | Unobserved; held thin | Staged URL, `noindex` until pass |
| `fill_blank` | 0 | — | — | 0 | Unobserved; held thin | Staged URL, `noindex` until pass |
| `match_column` | 0 | — | — | 0 | Unobserved; held thin | Staged URL, `noindex` until pass |
| `distinguish` | 0 | — | — | 0 | Unobserved; held thin | Staged URL, `noindex` until pass |
| `passage` | 0 | — | — | 0 | Unobserved; held thin | Staged URL, `noindex` until pass |
| `numerical` | 23,160 | 43.4 | 33.1 | 8 | Thin | Staged URL; passing individual pages may index |
| `diagram` | 0 | — | — | 0 | Unobserved; held thin | Staged URL, `noindex` until pass |

The original suspicion is only partly confirmable: MCQ is conclusively thin. True/False and Fill-in-the-blank have no persisted production rows, so the corpus cannot confirm their average; they are safely held out instead of being assumed good.

## Trust and review signals

- `/about/methodology` is an indexable, canonical methodology page with `AboutPage` and `BreadcrumbList` structured data.
- Every HTML template receives a sitewide methodology footer link.
- Every solution page receives a publishing-review panel. Passed pages show “Verified publishing checks”; queued pages state that editorial expansion is queued. Both link to the exact methodology and show the latest review date.
- Every chapter page shows its latest publishing-review date and methodology link.
- The wording explicitly limits “verified” to textbook-route integrity, rendered depth, pairwise originality, and staged publishing. It does not invent a teacher or human-review claim.

## Validation evidence

`audits/phase-4/runtime-audit.json` passed all checks:

- Gate coverage: 299,458 / 299,458.
- D1 gate-passed count = generated-manifest count = sitemap question count = 7,933.
- Passed sample: one `index, follow` directive and `X-StudyWudy-Publish-Gate: phase4-v1; passed`.
- Queued sample: one `noindex, follow` directive, `X-Robots-Tag: noindex, follow`, no-store cache policy, and no sitemap entry.
- The methodology page has zero local structured-data errors or warnings and is linked from both passed and queued solution samples.
- The hierarchy sitemap includes the methodology page.
- Both gzipped child sitemaps stay below 50,000 URLs and 50 MB uncompressed.
- Manifest-only enforcement was separately tested against a D1 database with zero gate tables: passed, queued, and sitemap decisions remained correct and fail-closed.

## Operating commands

```sh
pnpm run audit:phase4
pnpm run dev:after
pnpm run audit:phase4:runtime
pnpm run check:production
```

To materialize the detailed queue in a local SQLite-backed D1 state:

```sh
node scripts/phase4-content-gate.mjs \
  --source-db cloudflare-backup-2026-08-17/d1/studywudy-content.sqlite3 \
  --apply-to <path-to-local-miniflare-d1.sqlite> \
  --manifest-output phase4-publish-manifest.mjs \
  --output audits/phase-4/content-gate-audit.json
```
