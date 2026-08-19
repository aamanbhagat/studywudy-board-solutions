# StudyWudy Phase 0 baseline

Captured against the live production Worker on 2026-08-18 from Asia/Kolkata. No application or production changes were made.

## Executive baseline

- Live sitemap: **present**, as a 61-child sitemap index.
- Live sitemap inventory: **312,176 unique URLs**, including **299,449 question URLs**.
- Prior Lighthouse/performance baseline: **none found**. This is the first baseline available for later phases.
- Lowest Lighthouse result: **73 Performance** on the mobile class index.
- Definite budget failures: mobile board LCP **5.47 s**; CLS over **0.1** on homepage desktop, board desktop, class mobile, and class desktop.
- INP is **not available** from these Lighthouse lab navigations. TBT is recorded separately and is not relabelled as INP.

## Method

- Target: `https://studywudy-board-solutions.amanbhagat17089.workers.dev`
- Lighthouse: 13.4.1, run once per URL/form factor with cleared browser storage.
- Browser engine: Brave 151.1.93.136 / Headless Chromium 151.
- Mobile: Lighthouse default mobile preset, simulated throttling, 412 × 823 emulation, 4× CPU slowdown.
- Desktop: Lighthouse desktop preset with simulated throttling.
- Categories: Performance, SEO, Accessibility, Best Practices.
- Times below are milliseconds; scores are out of 100.
- LCP, CLS, and TBT are the Lighthouse performance audit values. TTFB is Lighthouse's `server-response-time` audit value.
- A single lab run is intentionally the canonical Phase 0 snapshot. Later comparisons should rerun the same script and should not treat small timing deltas as conclusive without repeated sampling.

Raw reports are in `audits/phase-0/lighthouse-json/`. The exact runner is `scripts/phase0-run-lighthouse.mjs`.

## Pages sampled

| Key | Template/format | Path |
| --- | --- | --- |
| Homepage | Homepage | `/` |
| Board | Board index | `/maharashtra-board` |
| Class | Class index | `/maharashtra-board/class-12` |
| Subject | Subject index | `/maharashtra-board/class-12/physics` |
| Chapter | Chapter index | `/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics` |
| MCQ | Leaf question, `mcq_single` | `/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-001` |
| Numerical | Leaf question, `numerical` | `/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-027` |
| Written | Leaf question, `detailed` | `/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-008` |

All eight URLs returned HTTP 200 before the audit.

## Lighthouse results

| Page | Form factor | Perf | SEO | A11y | Best Practices | LCP (ms) | INP (ms) | CLS | TBT (ms) | TTFB (ms) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Homepage | Mobile | 99 | 100 | 98 | 96 | 1,380 | N/A | 0.000 | 65 | 139 |
| Homepage | Desktop | 90 | 100 | 100 | 96 | 464 | N/A | **0.202** | 0 | 135 |
| Board | Mobile | 76 | 100 | 99 | 96 | **5,468** | N/A | 0.041 | 65 | 190 |
| Board | Desktop | 80 | 100 | 100 | 96 | 534 | N/A | **0.438** | 0 | 138 |
| Class | Mobile | 73 | 100 | 95 | 96 | 1,086 | N/A | **0.997** | 10 | 2,240 |
| Class | Desktop | 88 | 100 | 97 | 96 | 476 | N/A | **0.245** | 0 | 148 |
| Subject | Mobile | 99 | 100 | 100 | 96 | 1,356 | N/A | 0.000 | 10 | 1,138 |
| Subject | Desktop | 100 | 100 | 100 | 96 | 429 | N/A | 0.000 | 0 | 971 |
| Chapter | Mobile | 97 | 100 | 100 | 96 | 1,564 | N/A | 0.000 | 23 | 1,872 |
| Chapter | Desktop | 98 | 100 | 100 | 96 | 651 | N/A | 0.000 | 0 | 1,078 |
| MCQ | Mobile | 100 | 100 | 100 | 96 | 1,487 | N/A | 0.000 | 23 | 175 |
| MCQ | Desktop | 100 | 100 | 100 | 96 | 472 | N/A | 0.000 | 0 | 171 |
| Numerical | Mobile | 98 | 100 | 100 | 96 | 2,275 | N/A | 0.000 | 0 | 158 |
| Numerical | Desktop | 100 | 100 | 100 | 96 | 442 | N/A | 0.000 | 0 | 192 |
| Written | Mobile | 100 | 100 | 100 | 96 | 1,777 | N/A | 0.000 | 18 | 265 |
| Written | Desktop | 100 | 100 | 100 | 96 | 494 | N/A | 0.000 | 0 | 150 |

Bold metric values exceed the project's LCP or CLS budget.

## Budget readout

| Budget | Result |
| --- | --- |
| LCP ≤ 2.5 s | 15/16 runs pass. Board mobile fails at 5.47 s. |
| INP ≤ 200 ms | Not established. Lighthouse navigation audits do not generate a valid INP measurement, and no field INP was available in the reports. |
| CLS ≤ 0.1 | 12/16 runs pass. Homepage desktop (0.202), board desktop (0.438), class mobile (0.997), and class desktop (0.245) fail. |
| TBT ≤ 200 ms | 16/16 runs pass; maximum 65 ms. TBT remains a lab responsiveness proxy, not INP. |
| WCAG AA | Lighthouse Accessibility ranges from 95 to 100. A score is not itself a complete WCAG conformance claim; four runs scored below 100. |

SEO scored 100 in every run. Best Practices scored 96 in every run.

## Playwright viewport check

The same eight URLs were loaded at 390 px, 768 px, and 1440 px, for 24 checks total.

- HTTP status: 24/24 returned 200.
- Horizontal document overflow: 0/24 checks.
- Browser console: errors occurred on every page. They are failed HTTP 404 loads, including the primary preloaded font and multiple KaTeX font variants on question pages. This is baseline evidence only; Phase 0 does not fix it.
- Next.js DevTools MCP: unavailable. The production `/_next/mcp` route returned HTTP 404, and no Chrome/Next DevTools MCP endpoints were configured in this Codex session. Lighthouse and Playwright results are complete, but an MCP-panel trace is not claimed.

## Live sitemap inventory

The live `/sitemap.xml` exists and points to 61 child sitemaps. The crawl found 312,176 URLs, all unique.

| Template type | Live sitemap URLs |
| --- | ---: |
| Question | 299,449 |
| Chapter | 11,610 |
| Subject | 428 |
| Class | 35 |
| Board | 4 |

The five requested template types account for 311,526 URLs. The remaining 650 are 606 book indexes, 19 stream indexes, 23 program indexes, the homepage, and `/boards`.

This confirms the claimed overall scale: the sitemap exposes 312,176 pages. The narrower claim of “300,000+ Q&A pages” is not exact at capture time: the live sitemap contains 299,449 question URLs, nine fewer than the 299,458 question rows in the recovered D1 database.

Additional inventory differences require later investigation rather than a Phase 0 fix:

- Recovered D1 has 7,715 chapter rows, while the live sitemap exposes 11,610 chapter-shaped paths: 3,895 more sitemap paths than current chapter rows.
- Recovered D1 has 259 direct subject records. The sitemap has those plus 169 stream-specific subject aliases, for 428 subject paths.
- Books match at 606 in both D1 and the sitemap.

The machine-readable crawl result is `audits/phase-0/sitemap-inventory.json`. Rerun with `node scripts/phase0-sitemap-inventory.mjs`.

## Prior baseline and history finding

**No prior Lighthouse or performance baseline existed in the supplied recovery before this audit.**

The supplied workspace contained no `.git` directory, so there was no repository commit history to inspect. A pre-audit filesystem search of source, configuration, Markdown, text, JSON, and YAML files found no Lighthouse report, PageSpeed report, or performance-baseline artifact. A text hit for “lighthouse” inside the recovered Worker content refers to textbook questions about physical lighthouses, not performance tooling.

Therefore later phases are measuring from zero historical performance data, with this Phase 0 capture as the first real comparison point.
