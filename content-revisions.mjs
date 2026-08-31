// Shared vocabulary for the content revision log.
//
// The log answers one question - "when did this page's rendered content last
// change" - for every URL the sitemaps submit. It is written by
// scripts/phase3-content-revisions.mjs and read by
// scripts/phase3-build-static-sitemaps.mjs. Both of those used to carry their
// own copy of the two dates below, which is how the sitemap floor ended up
// documented in one place and enforced in four.

// The date the corpus was published. Before the log exists this is the only
// honest answer for a question page, and it stays the bootstrap seed so that
// introducing the log republishes nothing.
export const CONTENT_PUBLISHED_AT = "2026-08-15T03:30:10Z";

// The legal pages carry a declared review date rather than a content hash: a
// privacy policy's meaningful "last changed" is when a human reviewed it, not
// when the template that renders it was touched.
export const POLICY_PAGE_UPDATED_AT = "2026-08-18T00:00:00+05:30";

export const CONTENT_REVISION_TABLE = "catalog_content_revisions";

// Not a taxonomy for its own sake: a scope list short of the full route surface
// leaves URLs with no revision row, and the builder cannot emit a lastmod for a
// URL it has no row for. The sitemap build fails closed on any such URL.
export const CONTENT_REVISION_SCOPES = Object.freeze([
  "board",
  "grade",
  "subject",
  "book",
  "chapter",
  "question",
  "stream",
  "cluster",
  "trust",
  "static",
]);

export function hasContentRevisionTable(database) {
  return Boolean(database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(CONTENT_REVISION_TABLE));
}

// One entry per URL, carrying the first build at which the current content
// fingerprint appeared. MAX(revision) rather than MAX(first_seen_at) because
// content can revert: a page restored to an earlier state is a new revision,
// and its lastmod is when it was restored, not when that text first existed.
export function contentRevisionEpochs(database) {
  const epochs = new Map();
  if (!hasContentRevisionTable(database)) return epochs;
  for (const row of database.prepare(`SELECT entity_key, first_seen_at FROM ${CONTENT_REVISION_TABLE} AS outer
    WHERE revision = (SELECT MAX(revision) FROM ${CONTENT_REVISION_TABLE} AS inner
      WHERE inner.entity_key = outer.entity_key)`).iterate()) {
    epochs.set(row.entity_key, Number(row.first_seen_at));
  }
  return epochs;
}
