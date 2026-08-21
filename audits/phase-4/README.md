# Phase 4 — question-type-aware publishing gate

Status: implemented and evaluated against the complete recovered corpus on 21 August 2026. This task changed local release source and assets; it did not deploy to Cloudflare.

## Policy

Policy `phase4-v7-language-quality` keeps the question-type completeness and question-specific page-experience requirements, and adds a fail-closed native-language text gate. There is no minimum word count for indexability. Word totals remain in the audit as diagnostics only.

The answer checks now follow the stored question type:

- Single- and multiple-choice questions require valid correct choices, governing-principle reasoning and distractor reasoning.
- One-word and fill-in-the-blank questions require a direct answer and short explanatory context.
- Short-answer and give-reason questions require the relevant points, terminology and causal reasoning where requested.
- Numericals require a formula, substitution, units, arithmetic and a final answer.
- Derivations require assumptions or givens, ordered steps, equations and a conclusion.
- Diagram questions require the diagram, labels, useful alternative text and explanation.
- Long answers require coverage, structure, accuracy safeguards and an exam-appropriate final answer or conclusion.
- True/false, matching, comparison and passage records have separate structural checks.

A standalone question is indexable only when it also has distinct intent, verified textbook/chapter/exercise mapping, readable equations, non-prompt answer context, a valid self-canonical catalog URL, no equivalent indexed page for the same textbook/chapter intent, and validated native-script text for a localized edition.

## Full-corpus result

| Measure | Count | Fraction |
|---|---:|---:|
| Stored question pages evaluated | 299,458 | 100% |
| Type-complete answers | 161,075 | 53.789% |
| Gate-passed / indexable | 142,961 | 47.740% |
| Review required / noindex | 156,497 | 52.260% |

The difference between type-complete and indexable pages comes from the mapping, equation, useful-context, canonical, static-exclusion, duplicate-intent and multilingual-text checks. The generated manifest contains a compact row-ID decision set for all 299,458 catalog rows. Production question sitemap assets contain exactly 142,961 unique gate-passed URLs.

The multilingual audit found 131 Hindi-edition books and no Tamil-language books in this snapshot. Two Class 10 Hindi science editions have verified native book and chapter titles, and all 1,192 of their question prompts pass the release validator after safe NFC normalization and a small set of recorded source corrections. The other 129 Hindi editions (38,867 question pages) are quarantined from catalog discovery, runtime indexing and sitemaps until their stripped Devanagari text is repaired from a verified source.

## Question-page experience result

- 299,439 records have a direct answer and complete page-context model. The 19 without a direct answer already fail the publishing gate.
- All 299,458 records have exact board/textbook/chapter/exercise context and a recorded source revision.
- 299,404 records have at least one neighboring question in the same exercise.
- No recovered source record names a textbook edition, explicit common-mistake field, alternative method or previous-year attribution. The runtime therefore discloses the missing edition metadata and omits those optional sections instead of inventing claims or repeated filler.
- Every indexable page is required to load the `question-specific-trust-v2` experience; runtime failure changes the page to `noindex, follow`.

## Persisted source formats

| Stored format | Rows | Type-complete | Indexable |
|---|---:|---:|---:|
| `one_sentence` | 12,518 | 2,327 | 1,832 |
| `brief` | 179,029 | 129,975 | 113,653 |
| `detailed` | 26,951 | 11,309 | 10,768 |
| `define` | 2,058 | 2,017 | 2,011 |
| `give_reason` | 3,158 | 2,812 | 2,772 |
| `mcq_single` | 52,418 | 9,243 | 8,544 |
| `mcq_multi` | 166 | 82 | 81 |
| `numerical` | 23,160 | 3,310 | 3,300 |

The other supported formats have no persisted rows in this recovered snapshot. Some `one_sentence` records are recognized as fill-in-the-blank questions from their prompt and evaluated with that more specific rule.

## Runtime behavior

- Gate-passed pages receive `index, follow`, an explicitly automated type-completeness badge and normal public caching.
- Review-required pages stay usable for students but receive `noindex, follow`, no-store caching and an “Automated answer checks incomplete” badge.
- Question pages add an exact direct-answer summary, expected response shape, textbook/exercise mapping, source revision, automated gate date, human-review status, academic-error link, solution-coverage cues and same-exercise questions from the current source payload.
- Missing textbook edition, academic year and source-page data are disclosed as not recorded. A “Reviewed by” label is impossible unless the reviewer registry contains a real name, qualification, review date, edition and academic year.
- The current recovered registry contains zero named academic reviewers and zero dated academic answer corrections, so pages say “Editorial review pending” and the public corrections ledger shows an honest empty state.
- Formula/principle, common-mistake, alternative-method and previous-year panels are conditional on question-specific source data.
- Question sitemaps contain only gate-passed row IDs. The sitemap response reports the same policy version and count.
- Hindi and Tamil imports are normalized to NFC, checked for mixed-script confusables, missing or broken combining marks, OCR residue, transliteration and malformed scientific symbols. Only source-verified corrections can make a damaged localized edition publishable.
- Verified language equivalents retain separate self-canonical URLs and receive reciprocal `hreflang`; unverified pairs receive no alternate annotation.
- `/about/methodology` explains the type-specific rules and explicitly says that concise complete answers can pass.
- Exact duplicate intent within one textbook chapter is consolidated to the first complete atomic page. Similarity is a duplicate safeguard, not an invitation to add filler.

## Evidence and release gates

- `audits/phase-4/content-gate-audit.json` contains aggregate results and missing-check counts for the full corpus.
- `tests/answer-completeness.test.mjs` proves concise MCQs can pass and exercises each requested answer family.
- `tests/question-indexability-release.test.mjs` verifies that the compact decision set contains no length threshold and exactly matches the generated sitemap URL count.
- `audits/phase-4/multilingual-text-quality.json` records every reviewed correction and proves that quarantined routes are absent from sitemaps.
- `tests/multilingual-text-quality.test.mjs` exercises NFC, confusables, Devanagari, Tamil, OCR, transliteration and scientific-symbol failures.
- `migrations/0004_question_type_completeness.sql` can persist per-question evidence in D1 for editorial queries; the release Worker uses the generated decision set and does not require that optional table at request time.
- `audits/phase-4/search-metadata-quality.json` checks the data-driven search templates across 235 subjects, 477 publishable textbooks and 6,203 publishable chapters. It requires the four reviewed Maharashtra Physics examples, zero repeated meta descriptions, and a compact title ceiling. The separate full-question SEO audit proves uniqueness across all 299,458 question records.
- `tests/search-metadata.test.mjs` proves that the shortened question title never replaces the exact visible question H1 and that chapter snippets use real question types, source identity and textbook pages.
- `audits/phase-4/selective-structured-data-gate.json` records the schema profile for each current resource family. Site-level `Organization` and `WebSite` entities are roots only on the homepage; hierarchy pages retain `BreadcrumbList`; substantial revision, answer-writing and concept guides use `Article`; catalogue-like study hubs use `CollectionPage`; and the interactive chapter test uses `Quiz` with its visible MCQ/answer pairs.
- The structured-data gate explicitly rejects `QAPage` and `MathSolver` on all current templates. MCQs are not labelled as flashcards, and only the reviewed original dicot-seed solution diagram receives `ImageObject` creator, credit, copyright and intrinsic-size metadata.
- `audits/phase-4/trust-transparency-gate.json` verifies the reviewer/correction registries, production question evidence ledger, public reviewer/process/profile pages, corrections history and fail-closed wording.

Rebuild and verify with:

```sh
pnpm run audit:phase4
pnpm run audit:multilingual
pnpm run audit:search-metadata
pnpm run audit:structured-data
pnpm run audit:trust
pnpm run build:sitemaps
pnpm run test:content-gates
pnpm run check:release
```
