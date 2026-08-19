CREATE TABLE IF NOT EXISTS question_enrichments (
  book_id TEXT NOT NULL,
  chapter_slug TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  verifier_model TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('standalone', 'consolidate')),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  verification_json TEXT CHECK (verification_json IS NULL OR json_valid(verification_json)),
  rendered_text TEXT NOT NULL,
  genuine_unique_words INTEGER NOT NULL CHECK (genuine_unique_words >= 0),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  factual_pass INTEGER NOT NULL CHECK (factual_pass IN (0, 1)),
  quality_pass INTEGER NOT NULL CHECK (quality_pass IN (0, 1)),
  generated_at INTEGER NOT NULL,
  reviewed_at INTEGER NOT NULL,
  PRIMARY KEY (book_id, chapter_slug, question_id)
) STRICT;

CREATE INDEX IF NOT EXISTS question_enrichments_publish_idx
  ON question_enrichments (quality_pass, book_id, chapter_slug, question_id);

CREATE INDEX IF NOT EXISTS question_enrichments_model_idx
  ON question_enrichments (model, decision, quality_pass);
