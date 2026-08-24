# Sitewide question-page remediation

The full-corpus audit writes its resumable inventory and problem export into
this directory. Generated databases and reports are intentionally ignored by
Git because they contain hundreds of thousands of rows and can be regenerated
from the canonical content database.

## Current baseline

- Total question pages: 299,458
- Passing before remediation: 94,928
- Baseline problem pages: 204,530
- Automatically remediable queue: 156,646
- Source-review-required pages: 46,507
- Exact duplicate-intent pages already SEO-consolidated: 1,377
- Thin-content risk: 180,773
- Technical-SEO risk: 1,419

Source-review-required pages fail closed. The automated workflow must not
invent missing textbook evidence or silently rewrite multilingual source text.

## Commands

Run a fresh full-corpus audit and rebuild the resumable inventory:

```sh
pnpm run audit:sitewide
```

Show a single status snapshot or a live two-second dashboard:

```sh
pnpm run status:sitewide:once
pnpm run status:sitewide
```

Export every currently failing page and its issue codes:

```sh
pnpm run export:sitewide-problems
```

The AI pass reads credentials only from the current terminal environment. Do
not save API keys in repository files, shell history, `.dev.vars`, or command
arguments.

```sh
export AZURE_FOUNDRY_RESPONSES_ENDPOINT='https://YOUR-RESOURCE/.../responses'
read -s AZURE_FOUNDRY_API_KEY
export AZURE_FOUNDRY_API_KEY
pnpm run remediate:sitewide -- --batch-size 12 --concurrency 16
```

The workflow is resumable and uses three independent stages for each batch:
Luna drafts, Terra validates, and Sol adjudicates. Parallel workers process
independent batches; no stage is skipped or weakened. It writes supplemental
study content only; prompts, options, answers, values, units, and identifiers
are immutable. Increase concurrency only after a bounded benchmark confirms
that the Azure deployment remains below its rate limits; the runner caps the
setting at 32 workers.

Apply only Sol-approved supplements, then re-audit. A page is counted as fixed
only after it passes that re-audit:

```sh
pnpm run apply:sitewide-remediation
pnpm run audit:sitewide
pnpm run status:sitewide:once
```

The live dashboard reports measured throughput and calculates an ETA after the
first completed batch. It distinguishes AI approval, applied content awaiting
audit, verified fixes, unresolved pages, and source-review blockers.
