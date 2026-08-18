# Phase 2 performance audit

Phase 2 passes the performance acceptance check without deployment. The protocol-matched run contains all 16 Phase 0 route/form-factor reports. Every route scores 99–100 for performance and 100 for accessibility, best practices, and SEO; all LCP, CLS, and TBT values are in the good range.

The two one-point score movements (100 → 99) remain within normal Lighthouse run variance and have good CWV. Board and class routes improve by 12–26 performance points, while the maximum CLS falls to 0.028.

| Route / form factor | Phase 0 | Phase 2 | Δ | LCP ms | CLS | TBT ms | TTFB ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| board-desktop | 80 | 100 | +20 | 492 | 0.005 | 0 | 4 |
| board-mobile | 76 | 99 | +23 | 2262 | 0.015 | 8 | 3 |
| chapter-desktop | 98 | 100 | +2 | 511 | 0.001 | 0 | 50 |
| chapter-mobile | 97 | 99 | +2 | 2112 | 0.001 | 5 | 82 |
| class-desktop | 88 | 100 | +12 | 464 | 0.001 | 0 | 9 |
| class-mobile | 73 | 99 | +26 | 1973 | 0.001 | 13 | 10 |
| homepage-desktop | 90 | 100 | +10 | 453 | 0.001 | 0 | 3 |
| homepage-mobile | 99 | 99 | +0 | 1962 | 0.001 | 8 | 3 |
| question-mcq-desktop | 100 | 100 | +0 | 437 | 0.001 | 0 | 18 |
| question-mcq-mobile | 100 | 99 | -1 | 1967 | 0.001 | 5 | 11 |
| question-numerical-desktop | 100 | 100 | +0 | 514 | 0.001 | 0 | 11 |
| question-numerical-mobile | 98 | 100 | +2 | 1812 | 0.001 | 7 | 12 |
| question-written-desktop | 100 | 100 | +0 | 455 | 0.028 | 0 | 7 |
| question-written-mobile | 100 | 99 | -1 | 1812 | 0.002 | 6 | 9 |
| subject-desktop | 100 | 100 | +0 | 428 | 0.001 | 0 | 29 |
| subject-mobile | 99 | 99 | +0 | 2113 | 0.001 | 3 | 32 |

## Runtime and asset checks

- IBM Plex Sans is self-hosted with Latin, Greek, and Devanagari subsets; only the above-the-fold Latin variable font is preloaded.
- KaTeX markup is present in the server response, no client KaTeX renderer ships, and all KaTeX fonts use font-display: swap.
- 602 textbook covers are delivered as dimensioned, lazy WebP images (73.6% fewer bytes than the recovered JPEG set). Board marks have WebP and AVIF derivatives.
- Public HTML uses one-hour edge caching with stale-while-revalidate; hashed/static assets are immutable for one year; conditional HTML requests cannot reuse stale transformed markup.
- Custom scripts are deferred. Search remains a server GET form with no dedicated client bundle, while class, chapter, and question chunks remain route-scoped.
- Rocket Loader markers are absent on all eight canonical routes.

## Method

- Lighthouse 13.4.1, the exact eight Phase 0 routes, mobile and desktop.
- Phase 0 reports use the existing Cloudflare production baseline.
- Phase 2 reports use a local HTTP/2 TLS proxy in front of Wrangler so transport matches Cloudflare. Nothing was deployed.
- A direct HTTP/1.1 diagnostic pass was excluded because its six-connection model overstated CSS latency relative to the HTTP/2 baseline.
