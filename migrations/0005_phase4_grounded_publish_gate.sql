-- The v2 gate used different disposition names and cannot accept the v3
-- fail-closed outcomes. Gate rows are fully reproducible from the catalog and
-- enrichment ledger, so replace the derived table before importing v3 rows.
-- Only passed rows are persisted: absence is the compact, fail-closed noindex
-- representation for every consolidated or queued question.
DROP TABLE IF EXISTS content_publish_gate;
DROP TABLE IF EXISTS content_publish_gate_state;

CREATE TABLE content_publish_gate (
  book_id TEXT NOT NULL,
  chapter_slug TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_type TEXT NOT NULL,
  rendered_unique_words INTEGER NOT NULL CHECK (rendered_unique_words >= 0),
  genuine_unique_words INTEGER NOT NULL CHECK (genuine_unique_words >= 0),
  depth_pass INTEGER NOT NULL CHECK (depth_pass IN (0, 1)),
  max_similarity REAL NOT NULL DEFAULT 0 CHECK (max_similarity >= 0 AND max_similarity <= 1),
  similarity_pass INTEGER NOT NULL CHECK (similarity_pass IN (0, 1)),
  policy_exclusion INTEGER NOT NULL DEFAULT 0 CHECK (policy_exclusion IN (0, 1)),
  enrichment_required INTEGER NOT NULL DEFAULT 0 CHECK (enrichment_required IN (0, 1)),
  gate_passed INTEGER NOT NULL CHECK (gate_passed IN (0, 1)),
  disposition TEXT NOT NULL CHECK (disposition IN ('published', 'consolidated', 'queued')),
  remediation TEXT NOT NULL CHECK (remediation IN ('standalone_indexable', 'inline_parent_chapter', 'staged_noindex')),
  reviewed_at INTEGER NOT NULL,
  policy_version TEXT NOT NULL,
  PRIMARY KEY (book_id, chapter_slug, question_id)
) STRICT;

CREATE TABLE content_publish_gate_state (
  gate_name TEXT PRIMARY KEY,
  policy_version TEXT NOT NULL,
  depth_floor INTEGER NOT NULL,
  similarity_threshold REAL NOT NULL,
  similarity_metric TEXT NOT NULL,
  fail_open INTEGER NOT NULL CHECK (fail_open = 0),
  gate_ready INTEGER NOT NULL CHECK (gate_ready IN (0, 1)),
  evaluated_at INTEGER NOT NULL,
  corpus_count INTEGER NOT NULL,
  depth_passed_count INTEGER NOT NULL,
  similarity_passed_count INTEGER NOT NULL,
  gate_passed_count INTEGER NOT NULL
) STRICT;
