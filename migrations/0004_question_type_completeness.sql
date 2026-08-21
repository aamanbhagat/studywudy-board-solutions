CREATE TABLE IF NOT EXISTS answer_completeness_gate (
  book_id TEXT NOT NULL,
  chapter_slug TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_type TEXT NOT NULL,
  answer_kind TEXT NOT NULL,
  checks_json TEXT NOT NULL CHECK (json_valid(checks_json)),
  completeness_pass INTEGER NOT NULL CHECK (completeness_pass IN (0, 1)),
  distinct_intent_pass INTEGER NOT NULL CHECK (distinct_intent_pass IN (0, 1)),
  textbook_mapping_pass INTEGER NOT NULL CHECK (textbook_mapping_pass IN (0, 1)),
  equations_pass INTEGER NOT NULL CHECK (equations_pass IN (0, 1)),
  useful_context_pass INTEGER NOT NULL CHECK (useful_context_pass IN (0, 1)),
  canonical_pass INTEGER NOT NULL CHECK (canonical_pass IN (0, 1)),
  equivalent_page_pass INTEGER NOT NULL CHECK (equivalent_page_pass IN (0, 1)),
  max_similarity REAL NOT NULL DEFAULT 0 CHECK (max_similarity >= 0 AND max_similarity <= 1),
  nearest_question_key TEXT,
  gate_passed INTEGER NOT NULL CHECK (gate_passed IN (0, 1)),
  disposition TEXT NOT NULL CHECK (disposition IN ('published', 'review_required')),
  content_hash TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL,
  policy_version TEXT NOT NULL,
  PRIMARY KEY (book_id, chapter_slug, question_id)
) STRICT;

CREATE INDEX IF NOT EXISTS answer_completeness_gate_passed_idx
  ON answer_completeness_gate (gate_passed, book_id, chapter_slug, question_id);

CREATE INDEX IF NOT EXISTS answer_completeness_gate_format_idx
  ON answer_completeness_gate (question_type, completeness_pass, gate_passed);

CREATE TABLE IF NOT EXISTS answer_completeness_gate_state (
  gate_name TEXT PRIMARY KEY,
  policy_version TEXT NOT NULL,
  fail_open INTEGER NOT NULL CHECK (fail_open = 0),
  gate_ready INTEGER NOT NULL CHECK (gate_ready IN (0, 1)),
  evaluated_at INTEGER NOT NULL,
  corpus_count INTEGER NOT NULL,
  completeness_passed_count INTEGER NOT NULL,
  gate_passed_count INTEGER NOT NULL
) STRICT;
