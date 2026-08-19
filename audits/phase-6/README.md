# Phase 6 monitoring and verification

Re-verified 2026-08-19 (Asia/Kolkata) from the deployed Worker, remote D1,
and current Wrangler production configuration.

## Production-domain decision and Search Console

- The production deployment verified in this repository is
  `https://studywudy-board-solutions.amanbhagat17089.workers.dev`. `boardly.in`
  is a separate deployment and is not evidence of StudyWudy's production
  Search Console ownership.
- No authenticated Search Console integration or exported property record is
  available in this workspace, so property verification and sitemap submission
  are **not** claimed here. Choose a durable StudyWudy custom domain before
  building history, or explicitly accept the current `workers.dev` hostname.
- The live sitemap index is valid at `/sitemap.xml`; its two gzip children use
  stored content timestamps and contain 12,731 hierarchy URLs plus 7,933
  gate-passed question URLs. Search Console submission still requires a human
  with property access.

## Field data

- The self-hosted `web-vitals` 6.1.1 client measures LCP, INP and CLS. It is injected into every HTML template and sends same-origin beacons to `/api/monitoring/web-vitals`.
- The endpoint rejects cross-origin requests, unsupported metrics and oversized payloads. It stores no IP address, user agent, cookie, account identifier or web-vitals page-load identifier.
- Cloudflare Analytics Engine was enabled and `studywudy_web_vitals` was created, but the Worker API continued to reject the binding with account error `10089`. The allowed fallback is therefore D1 table `phase6_web_vitals`, with raw percentile-capable samples and a 90-day retention cleanup.
- The RUM endpoint is live on the Worker. The independent 2026-08-19 pull found
  74 LCP samples (average 2,306.758 ms), 53 INP samples (average 43.321 ms),
  and 63 CLS samples (average 0.028).

Example p75 report over the last seven days:

```sql
WITH ranked AS (
  SELECT metric, template, value,
    ROW_NUMBER() OVER (PARTITION BY metric, template ORDER BY value) AS row_number,
    COUNT(*) OVER (PARTITION BY metric, template) AS sample_count
  FROM phase6_web_vitals
  WHERE recorded_at >= unixepoch() - 7 * 86400
)
SELECT metric, template, sample_count, value AS p75
FROM ranked
WHERE row_number = CAST((3 * sample_count + 3) / 4 AS INTEGER)
ORDER BY metric, template;
```

## Build gates

`pnpm run check:production` and `pnpm run deploy:production` both run `pnpm run check:phase6` before a Wrangler build/deploy.

- RUM smoke gate: confirms both client scripts are present, valid metrics receive 204, cross-origin input receives 403, and unsupported input receives 400.
- Structured-data gate: homepage, board index, subject index, gate-passed question and methodology templates; 0 errors and 0 warnings on the live Worker deployment.
- Lighthouse CI gate: mobile simulation on `/boards` and a representative gate-passed question. Required scores are performance >= 0.90 and accessibility/best-practices/SEO >= 0.95; budgets are LCP <= 3500 ms, CLS <= 0.1 and TBT <= 200 ms.

Latest passing results:

| Template | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Board index | 0.95 | 1.00 | 1.00 | 1.00 | 2863 ms | 0.000977 | 5 ms |
| Question | 0.95 | 1.00 | 1.00 | 1.00 | 2939 ms | 0.000977 | 11 ms |

The 3500 ms lab ceiling is a regression threshold for the recovered Worker and local D1 under simulated throttling. Field p75 reporting should still be evaluated against the 2500 ms Core Web Vitals threshold.

## Weekly crawl

- Cloudflare Cron: `41 2 * * SUN` (Sunday 02:41 UTC); dashboard-confirmed next run `2026-08-23 02:41 UTC`.
- Queue: `studywudy-weekly-crawl`, with a bound producer and consumer; batch size 40, maximum concurrency 1, three retries and dead-letter queue `studywudy-weekly-crawl-dlq`.
- The crawl starts from
  `https://studywudy-board-solutions.amanbhagat17089.workers.dev/sitemap.xml`,
  deduplicates targets in D1, checks HTTP failures/redirects, parses up to 500
  same-origin page links per HTML page, and follows newly discovered internal
  pages. This detects broken internal links that are absent from the sitemap as
  well as 404s among sitemap URLs.
- Run state is stored in `phase6_crawl_runs`; discovered URLs in `phase6_crawl_targets`; issues in `phase6_crawl_issues`.

```sql
SELECT run_id, status, sitemap_count, sitemaps_processed,
       url_count, urls_checked, issue_count,
       datetime(started_at, 'unixepoch') AS started_utc,
       datetime(completed_at, 'unixepoch') AS completed_utc
FROM phase6_crawl_runs
ORDER BY started_at DESC
LIMIT 8;

SELECT issue_type, http_status, COUNT(*) AS issue_count
FROM phase6_crawl_issues
WHERE run_id = (SELECT run_id FROM phase6_crawl_runs ORDER BY started_at DESC LIMIT 1)
GROUP BY issue_type, http_status
ORDER BY issue_count DESC;
```

## Acceptance status

| Criterion | Status |
| --- | --- |
| GSC verified against correct domain | Needs human decision: choose/assign the durable StudyWudy domain, then verify it with authenticated Search Console access |
| Sitemap index submitted | Needs human action after the correct property is selected; the Worker index itself is valid |
| Field-data pipeline live and reporting | Pass on the deployed Worker |
| Lighthouse build gate active | Pass |
| Ongoing structured-data gate active | Pass |
| Weekly broken-link/404 crawl scheduled | Pass; successful-run state must be verified separately in remote D1 |
