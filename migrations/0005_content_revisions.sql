-- Kept byte-identical to the DDL in scripts/phase3-content-revisions.mjs, which
-- creates the same table in ../data/d1/studywudy-content.sqlite3. This file only
-- reaches D1; migrations are applied with --persist-to comparison/after-persistence
-- and never touch the corpus DB the sitemap builder reads.
--
-- Not STRICT, unlike 0001-0004: CREATE TABLE IF NOT EXISTS no-ops against the
-- table the generator already created, and SQLite cannot add STRICT afterwards,
-- so a STRICT declaration here would describe a table that does not exist.

CREATE TABLE IF NOT EXISTS catalog_content_revisions (
  scope TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  revision INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  PRIMARY KEY (scope, entity_key, revision)
);

CREATE INDEX IF NOT EXISTS catalog_content_revisions_entity
  ON catalog_content_revisions (entity_key, revision DESC);
