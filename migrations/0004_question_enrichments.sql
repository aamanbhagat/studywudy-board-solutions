-- Generated explanations are fully reproducible from the local enrichment
-- ledger. Keep only the compressed runtime payload and publish assertions in
-- D1; generation traces and verification JSON stay in the private ledger.
DROP TABLE IF EXISTS question_enrichments;

CREATE TABLE question_enrichments (
  book_id TEXT NOT NULL,
  chapter_slug TEXT NOT NULL,
  question_id TEXT NOT NULL,
  content_gzip BLOB NOT NULL,
  genuine_unique_words INTEGER NOT NULL CHECK (genuine_unique_words >= 0),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  factual_pass INTEGER NOT NULL CHECK (factual_pass = 1),
  quality_pass INTEGER NOT NULL CHECK (quality_pass = 1),
  reviewed_at INTEGER NOT NULL,
  PRIMARY KEY (book_id, chapter_slug, question_id)
) STRICT;

CREATE INDEX question_enrichments_reviewed_idx
  ON question_enrichments (reviewed_at, book_id, chapter_slug);
