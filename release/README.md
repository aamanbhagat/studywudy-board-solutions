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

`check:release` verifies the SHA-256 manifest, runs the static compliance gate,
and asks the pinned Wrangler 4.123.0 toolchain to build the production Worker
with `--dry-run`. It does not contact or change production.

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
