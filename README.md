# Recovered StudyWudy Board Solutions deployment

This directory is a local recovery of the Cloudflare Worker
`studywudy-board-solutions`, captured on 2026-08-17 without changing the
production deployment.

## Run locally

The project is already installed and its recovered D1 and R2 data are loaded
into `.wrangler/state/v3`.

```bash
pnpm dev
```

Open <http://localhost:8787/>. To validate the Worker configuration without
deploying anything:

```bash
pnpm check
```

## Production navigation release

The approved guided finder and board/class navigation were promoted to the
real `studywudy-board-solutions` Worker on 2026-08-17. Production uses
`wrangler.production.jsonc`, the restored D1/R2 bindings, and the enhanced
assets in `comparison/after-assets/`. Deployment version:

`b0cc9288-7dd4-48b6-bf2f-5f5596ea6c79`

The finder now mounts immediately. Critical first-paint CSS hides the replaced
legacy selectors before scripts run, preventing the old interface from
flashing while Next.js hydrates.

Fill-in-the-blank solutions are normalized by the shared question renderer.
When imported records contain a completed sentence, explicit blank values, or
a safely separable answer list, the solution repeats the sentence with every
inserted answer emphasized. Tables, activities, code, equations, and other
multi-part exercises retain their specialized solution layouts.

## Before/after navigation comparison

The recovered homepage remains unchanged as the **Before** version. A separate
**After** configuration adds the mobile-first guided finder without modifying
or deploying the recovered Worker:

```bash
# terminal 1 — unchanged recovery
pnpm dev:before

# terminal 2 — navigation prototype
pnpm dev:after
```

- Before: <http://localhost:8787/>
- After: <http://localhost:8789/>

The After finder follows board → class → stream (where applicable) → subject.
Its choices come from the restored local D1 database, and selected steps remain
in the URL so a path can be refreshed or shared. The approved After files live
in `comparison/` and are now also the production release source.
The After server uses a copy-on-write local persistence clone so both Wrangler
processes can run simultaneously without competing for SQLite locks.

If `node` and `pnpm` are not on `PATH` in a Codex terminal, prepend the bundled
runtime used for this recovery:

```bash
export PATH="/Users/aman/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH"
```

## Recovered data and runtime

- `worker.js`: exact active Worker bundle, 6,678,219 bytes.
- `wrangler.recovered.jsonc`: reconstructed bindings and active asset-routing
  behavior.
- `public-snapshot/`: public Next.js CSS, JavaScript, metadata files, and route
  snapshots obtainable from the active site.
- `cloudflare-backup-2026-08-17/d1/studywudy-content.sql`: complete portable D1
  SQL export.
- `cloudflare-backup-2026-08-17/d1/studywudy-content.sqlite3`: standard SQLite
  copy, integrity checked.
- `cloudflare-backup-2026-08-17/r2/manifest.ndjson`: complete R2 inventory with
  keys, sizes, ETags, checksums, HTTP metadata, and local filenames.
- `cloudflare-backup-2026-08-17/r2/objects/`: byte-for-byte R2 object archive.
- `cloudflare-backup-2026-08-17/metadata/`: Cloudflare D1, Worker version, and
  deployment metadata.
- `cloudflare-backup-2026-08-17/worker/active-deployment/`: downloaded active
  Worker response, public assets, and representative HTML route snapshots.

The D1 database contains 4 boards, 606 books, 7,715 chapters, 299,458 questions,
2,559 book-content chunks, and the remaining supporting tables. The R2 archive
contains 176,461 objects totaling 3,131,923,018 bytes. Every archived object
passed its Cloudflare MD5 checksum.

## Restore commands

Recreate local D1 state from the portable SQL export:

```bash
pnpm restore:d1
```

Recreate local R2 state from the downloaded object archive:

```bash
pnpm restore:r2
```

Both commands target local Wrangler state. They do not write to Cloudflare.
Never add `--remote` unless a production write is explicitly intended.

## Cloudflare bindings recovered

- D1 `DB` -> `studywudy-content`
- R2 `MEDIA` and `NEXT_INC_CACHE_R2_BUCKET` -> `studywudy-media`
- Durable Object `NEXT_CACHE_DO_QUEUE` -> `DOQueueHandler`
- Service binding `WORKER_SELF_REFERENCE` -> `studywudy-board-solutions`
- Static assets binding `ASSETS`
- `NEXT_INC_CACHE_R2_PREFIX=incremental-cache-v15`
- compatibility date `2026-08-02`
- flags `nodejs_compat` and `global_fetch_strictly_public`

No Worker secrets are configured.

## Deployment version detail

The production deployment routes 100% of traffic to version 105,
`76917421-fee0-44e6-af80-ccee1322fe78`, created on 2026-08-15. A newer upload,
version 111 (`3d384fe8-f4ba-4ef6-a7fa-e6896a6b6b5c`), exists but is not
deployed. The JavaScript in both versions matches this recovered bundle; their
static-asset routing metadata differs. This recovery intentionally matches the
active version and did not promote or deploy either version.

## Known recovery limits

Cloudflare stores the compiled Worker, not the original unbundled Next.js
project. The original `src/`, React components, source map, build configuration,
and development history cannot be recreated exactly from the deployment.

The active production static-assets catalog itself returns 404 for several
fonts, icons, board artwork, and one solution image. Those missing production
assets cannot be downloaded from the active public endpoint; the failure list
is preserved in
`cloudflare-backup-2026-08-17/worker/active-deployment/public-assets-manifest.json`.
This explains image/font issues that may remain after the CSS fix.

Durable Object contents are transient Next.js incremental-cache queue state and
Cloudflare does not provide a bulk export for them. They are recreated locally
when Wrangler starts. No business records were found there.

## Phase 5: AdSense and consent operations

Phase 5 adds `/privacy`, `/terms`, `/contact`, the existing
`/about/methodology` page as About Us, and `/ads.txt`. Every HTML template gets
the four required footer links. The contact form is adult-only, returns an
`SW-…` reference, and queues the request in D1 for the named grievance contact.
Queued contact data expires after 180 days unless its status is `legal_hold`;
the Worker cron removes expired rows daily.

Advertising is fail-closed. No publisher identifier is committed, so the
default deployment emits an honest comment-only `ads.txt` and does not create
an ad slot or load Google code. With real account values, ad requests remain
sitewide non-personalized and child-directed. Requests outside India remain
held until `ADSENSE_TCF_V23_READY=true` confirms that a certified IAB TCF v2.3
consent path is deployed.

Before the first Phase 5 production deployment, apply the contact migration:

```bash
pnpm exec wrangler d1 execute studywudy-content --remote \
  --file migrations/0002_phase5_contact_requests.sql \
  --config wrangler.production.jsonc
```

After AdSense issues real values, configure these Worker variables in the
Cloudflare dashboard; never substitute preview or invented identifiers:

```text
ADSENSE_PUBLISHER_ID=pub-0000000000000000
ADSENSE_SLOT_ID=0000000000
ADSENSE_TCF_V23_READY=true  # only after a certified CMP is verified
```

The sample zeroes above show the required format only and are deliberately not
valid production credentials. Process new grievances by querying
`phase5_contact_requests` for `status = 'new'`, recording the resolution, and
setting `status` to `closed` (or `legal_hold` where justified).

Run `pnpm audit:phase5:static` before packaging and
`pnpm audit:phase5:runtime` against a local preview. The detailed implementation
and evidence are in `audits/phase-5/implementation-report.md`.

## Integrity hashes (SHA-256)

```text
worker.js
4a5811c08ba4b0859c62c044b53a754c75af63bd21a2e3023df5e5f991ee2933

studywudy-content.sql
3257b120aa176f47ff4d1610c6748c80d77a996f78b8c63e12ce178cf20aab9c

studywudy-content.sqlite3
e231867c480ea034c6f8df86ad56823a91281c60ae4af1518718367931891269

r2/manifest.ndjson
e480d146c3bff78ee806dcd147601590d1d0da9083cd28742f27cc4adee3ad7d
```

Keep the original recovery files and Cloudflare backups intact so the
pre-navigation production bundle can still be audited or restored if needed.
