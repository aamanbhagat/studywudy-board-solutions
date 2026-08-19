CREATE TABLE IF NOT EXISTS phase6_crawl_runs (
  run_id TEXT PRIMARY KEY,
  sitemap_url TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'complete', 'failed')),
  sitemap_count INTEGER NOT NULL DEFAULT 0,
  sitemaps_processed INTEGER NOT NULL DEFAULT 0,
  url_count INTEGER NOT NULL DEFAULT 0,
  urls_checked INTEGER NOT NULL DEFAULT 0,
  issue_count INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE IF NOT EXISTS phase6_crawl_issues (
  run_id TEXT NOT NULL,
  url TEXT NOT NULL,
  source_url TEXT NOT NULL,
  issue_type TEXT NOT NULL CHECK (issue_type IN ('http', 'redirect', 'network', 'invalid-url', 'invalid-sitemap')),
  http_status INTEGER,
  detail TEXT,
  checked_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, url),
  FOREIGN KEY (run_id) REFERENCES phase6_crawl_runs(run_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS phase6_crawl_targets (
  run_id TEXT NOT NULL,
  url TEXT NOT NULL,
  first_source_url TEXT NOT NULL,
  discovered_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, url),
  FOREIGN KEY (run_id) REFERENCES phase6_crawl_runs(run_id) ON DELETE CASCADE
) WITHOUT ROWID, STRICT;

CREATE TABLE IF NOT EXISTS phase6_web_vitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recorded_at INTEGER NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('CLS', 'INP', 'LCP')),
  value REAL NOT NULL,
  delta REAL NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('good', 'needs-improvement', 'poor')),
  template TEXT NOT NULL,
  pathname TEXT NOT NULL,
  navigation_type TEXT NOT NULL,
  client_version TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_phase6_crawl_runs_started_at
  ON phase6_crawl_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase6_crawl_issues_run_id
  ON phase6_crawl_issues(run_id, issue_type, http_status);

CREATE INDEX IF NOT EXISTS idx_phase6_web_vitals_metric_time
  ON phase6_web_vitals(metric, template, recorded_at DESC);
