# StudyWudy production release process

The `production` branch is the clean, source-only release branch. Every file
Wrangler reads for a deployment is covered by `production-manifest.json`.
Large Cloudflare exports, local D1/R2 recovery data, browser reports, and
downloaded snapshots remain outside Git because they are operational backups,
not executable source.

## Reproduce a release

Use Node.js 24.19.0 and pnpm 11.19.0:

```bash
pnpm install --frozen-lockfile
pnpm check:release
```

`check:release` verifies the SHA-256 manifest, validates every catalog question
against the canonical route builder when the recovered D1 snapshot is present,
checks the question-type-aware answer gate and its exact sitemap membership,
runs the static compliance gate, and asks the pinned Wrangler 4.123.0 toolchain
to build the production Worker with `--dry-run`. The answer gate has no minimum
word count: naturally concise complete answers pass, while missing type-specific
elements fail closed. The same gate requires the `question-specific-trust-v2`
page experience: an exact direct-answer summary, mapped textbook/exercise
context, source revision, automated publishing date, human-review status,
academic-error link and same-exercise navigation.
Edition, common-mistake, alternative-method and previous-year claims render
only when the recovered source supplies them. The multilingual gate also
normalizes NFC, repairs safe confusables, validates native Hindi/Tamil script
and combining marks, and keeps unresolved localized editions out of catalog
discovery, indexing and sitemaps. These checks do not contact or change
production.

Human trust labels fail closed. Automated source, completeness, arithmetic and
diagram checks are never called expert review. A named “Reviewed by” label
requires a registered real reviewer, qualification, reviewed-on date, textbook
edition and academic year. `/reviewers` publishes the current registry and
review boundaries; `/corrections` publishes only dated academic answer changes.
`pnpm run audit:trust` verifies these rules and is part of `check:release`.

Structured data is release-gated by page eligibility. `Organization` and
`WebSite` are homepage-only root entities; hierarchy templates use their
canonical `BreadcrumbList`; substantial editorial study guides use `Article`;
study directories remain `CollectionPage`; and the interactive Electrostatics
test uses `Quiz` with the MCQ questions and answers visible on that page. Static
textbook answers never emit `QAPage`, and no current page emits `MathSolver`.
Original-image metadata is emitted only for assets with a reviewed diagram
record and visible credit. `pnpm run audit:structured-data` verifies these
boundaries and is part of `check:release`.

Validate one incoming JSON payload before import with:

```bash
node scripts/multilingual-content-gate.mjs \
  --input /path/to/book.json \
  --book-id cbse::class-10::science::example-hindi-book \
  --expected-language hi
```

The command exits non-zero for unresolved mixed scripts, missing Devanagari
marks, OCR/encoding damage, broken Tamil signs, transliteration in a principal
title, or malformed formula symbols and spacing.

The search-metadata gate derives subject, textbook, chapter and question titles
from canonical catalogue fields and real question intent. Chapter descriptions
include the actual question-type mix, source textbook and recorded page range;
the gate rejects repeated descriptions across all publishable subjects,
textbooks and chapters. Long question prompts remain the single visible H1 even
when the document title uses a shorter search phrase.

Before promoting a preview, run the exhaustive internal-link crawl against that
preview origin (and provide the D1 snapshot when it is outside the default
backup location):

```bash
STUDYWUDY_LINK_GATE_ORIGIN=https://preview.example.com \
STUDYWUDY_LINK_GATE_DATABASE=/path/to/studywudy-content.sqlite3 \
pnpm check:release:links:runtime
```

The crawl follows every discovered internal `<a href>`, rejects 404s and legacy
question IDs, checks linked question routes against D1, verifies visible chapter
“View solution” anchors, and fails when an indexable page sends most of its
links to dead or redirected destinations. It has no page cap unless
`STUDYWUDY_LINK_GATE_MAX_PAGES` is explicitly set; reaching that cap is itself a
failure so a partial crawl cannot pass a release.

When an intentional deploy input changes, first run all relevant corpus and
runtime audits, then regenerate and review the manifest:

```bash
pnpm release:manifest
pnpm check:release
```

## CI and deployment

`.github/workflows/ci.yml` verifies every pull request and every push to the
`production` branch. `.github/workflows/deploy-production.yml` deploys only
from a manual run or a `production-*` tag. The production GitHub environment
must define these secrets:

- `CLOUDFLARE_API_TOKEN`: scoped to deploy this Worker and update its required
  bindings/triggers.
- `CLOUDFLARE_ACCOUNT_ID`: the owning Cloudflare account ID.

Each CI deployment sets the Worker version message to `git:<full commit SHA>`.
That message is the authoritative connection from a live Cloudflare version to
the exact source commit.

## Rollback

1. Find the previously healthy `production-*` tag or the `git:<sha>` message in
   `wrangler versions list`.
2. Prefer Cloudflare's immediate version rollback for an incident.
3. Check out the corresponding Git commit, run `pnpm check:release`, and deploy
   it again if a durable source-based rollback is required.

The D1 database, R2 bucket, Queue, and Durable Object are external production
state. Migrations are versioned in `migrations/`, but data rollback is a
separate operation and must never be inferred from a Worker code rollback.
