# StudyWudy Phase 1 — Critical bugs and regression QA

Audit date: 2026-08-18 (Asia/Kolkata)
Test target: production-equivalent Cloudflare Worker at `http://127.0.0.1:8789` using the restored D1/R2 state
Result: **Phase 1 acceptance checks pass.**

## Executive result

- Question metadata now uses one truncation operation and a fixed combined budget. Thirteen long-edge-case pages across thirteen subjects produced document titles of 52–58 characters, with identical `og:title` and `twitter:title` values and no colliding ellipses.
- Null textbook page numbers are hidden. The 500-question crawl found 500 omitted null rows and zero empty placeholders.
- Scientific notation was not broken in the renderer. A chemistry numerical proved true KaTeX superscript structure in the prompt/full solution and related previews. The adjacent real defect was missing KaTeX font assets; those assets are restored.
- Live solution tabs exist for **0 of 17 declared formats**, including Numerical and Written-answer. The homepage labels were illustrative marketing UI, not product tabs; they are now explicitly non-interactive and absent from the tab order.
- Question breadcrumbs now deliberately match the full hierarchy: Home → Board → Class → Subject → Textbook → Chapter → Question. The visible trail and `BreadcrumbList` both contain seven levels.
- The recovered build had no dark-mode implementation despite the locked design. A light-default, persisted, keyboard-operable toggle is now available on every audited template.
- The full browser matrix has zero console errors, hydration/page errors, failed requests, local 4xx/5xx responses, axe violations, unnamed interactive controls, missing image `alt` attributes, or horizontal overflow.
- The link audit found zero broken or invalid related links in the sampled set.

## 1. Title truncation

The prior template independently shortened the question, chapter, and textbook suffix before a final outer shortening pass. The replacement format is:

`Q{label}: {single truncated question prompt} — Ch{number} | StudyWudy`

The social title is capped at 46 characters; the root metadata helper adds ` | StudyWudy`, so the document title is at most 58 characters. Only the prompt is eligible for truncation. The stable question prefix and chapter-number suffix are never independently shortened.

The automated spot check covered Biology, Chemistry, Commerce, Economics, English, Geography, Hindi, History, Marathi, Mathematics, Physics, Political Science, and Science. It deliberately selected the longest combined textbook/chapter names per subject: the longest textbook was 97 characters and the longest chapter name was 92 characters. All 13 pages passed; title lengths were 52–58 characters.

Evidence: `audits/phase-1/title-qa.json` and `scripts/phase1-title-qa.mjs`.

## 2. Study-context Page field

The current catalog has no populated `catalog_chapters.book_pages` values (7,715/7,715 are null/empty), and sampled question payloads likewise contained no usable `bookPage`. The UI now conditionally renders the row only when a real value exists. It never emits `Page —`.

The crawl verified 500 question pages: 500 null rows hidden, zero empty placeholders, zero populated rows. This fixes the user-visible defect without inventing textbook pagination. Backfilling authoritative page numbers remains a content-parity input for Phase 4; it must come from source data rather than template inference.

## 3. Scientific notation

Finding: **false positive for the renderer; real missing-font defect nearby.**

The audited chemistry numerical contains values including `10⁻³¹`, `10⁻²⁵`, and `10⁻³⁴`. The shared rich-content renderer produced KaTeX `.msupsub` structures and accessible labels in both locations:

- prompt/full worked solution: 13 scientific-notation math nodes;
- related-question previews: 14 scientific-notation math nodes.

KaTeX’s Main and Math Italic fonts returned 200. The restored asset set removes the font 404s that could previously make otherwise-correct notation look wrong.

Evidence: `audits/phase-1/content-rendering-qa.json` and `scripts/phase1-content-qa.mjs`.

## 4. Solution-tab scope and Phase 4 hand-off

The application declares 17 question types across nine structural groups. Only eight types currently have persisted pages:

| Persisted type | Pages |
|---|---:|
| brief | 179,029 |
| mcq_single | 52,418 |
| detailed | 26,951 |
| numerical | 23,160 |
| one_sentence | 12,518 |
| give_reason | 3,158 |
| define | 2,058 |
| mcq_multi | 166 |

There is no live tablist for any declared or persisted type. Numerical and written-answer pages also use a single static, type-tailored solution body. The homepage's “Step-by-step / Quick answer / Concept” labels are an illustration of answer concepts, not functional controls; their markup is now a non-focusable `group` instead of false tabs.

MCQ options are read-only answer content (four options on the test page, zero option buttons), not a quiz interaction. Keyboard testing of “MCQ buttons” is therefore not applicable; the page no longer implies controls that do not exist.

Phase 4 must not classify any format as rich merely because the homepage depicts tabs. The nine declared types with zero persisted rows are **unverified**, not “thin by design.” The eight live formats require content-depth assessment independent of tabs.

Evidence: `audits/phase-1/format-scope.json` and `audits/phase-1/keyboard-qa.json`.

## 5. Breadcrumb decision

Decision: use the complete URL/content hierarchy. A question page now exposes:

1. Home
2. Board
3. Class
4. Subject
5. Textbook
6. Chapter
7. Question

The representative page's visible trail and `BreadcrumbList.itemListElement` both passed at seven levels. This gives Phase 3 a complete schema foundation and avoids presenting a different information architecture to users and crawlers.

## 6. Console, hydration, WCAG, keyboard, and media QA

Playwright covered nine representative routes (homepage, board, class, subject, chapter, MCQ, Numerical, Written-answer, and search), three viewports (390×844, 768×1024, and 1440×1000), and light plus dark mode: 54 runs total.

| Check | Result |
|---|---:|
| HTTP status | 54/54 returned 200 |
| Console errors | 0 |
| Hydration/page errors | 0 |
| Failed requests | 0 |
| Local error responses | 0 |
| axe WCAG 2 A/AA, 2.1 AA, 2.2 AA violations | 0 |
| Unnamed visible interactive elements | 0 |
| Images audited | 186 rendered instances |
| Images missing an `alt` attribute | 0 |
| Horizontal-overflow runs | 0 |

The keyboard suite separately covered homepage navigation, search, the theme toggle, MCQ solution content, and Numerical pages at all three viewports (12 runs). Every reachable control had an accessible name and visible focus indicator; search submitted by Enter; and the theme toggle activated by Space and updated `aria-pressed` and its accessible label. Failures: 0.

Token contrast checks:

- white on locked indigo `#0757d8`: 6.24:1;
- dark ink `#101316` on locked gold `#ffd51f`: 13.13:1;
- dark-mode light indigo on raised dark surface: 7.34:1.

No verified-badge component is rendered in the recovered application, so the badge pairing was tested at token level rather than against a fabricated “verified” claim. Adding a badge requires provenance data. This is a component/content inventory gap, not an unresolved WCAG violation.

Evidence: `audits/phase-1/browser-qa.json`, `audits/phase-1/keyboard-qa.json`, `audits/phase-1/contrast-tokens.json`, `scripts/phase1-browser-qa.mjs`, and `scripts/phase1-keyboard-qa.mjs`.

## 7. Broken-link crawl

The crawl used the current 61-child sitemap (312,176 URLs) and deterministic, evenly distributed samples.

| Template | Population | Audited |
|---|---:|---:|
| Board | 4 | all 4 |
| Class | 35 | all 35 |
| Subject (including stream-qualified subject routes) | 428 | all 428 |
| Chapter | 11,610 | 500 |
| Question | 299,449 | 500 |

Board, class, and subject populations are below 500, so auditing every existing URL is the maximum possible sample. The 1,467 source pages all returned 200 and exposed 55,164 internal links. After deduplication, 20,309 internal targets were validated: 20,249 exact indexable-sitemap targets plus 60 non-sitemap targets. Every non-sitemap target and a deterministic 500-target transport sample were requested over HTTP (559 targets total), all successfully.

The 500 question pages exposed 5,000 related-question links. All 5,000 resolve to URLs in the indexable question sitemap; none points to unpublished, deleted, or noindexed content.

Result: zero source failures, zero broken links, zero invalid related links.

Evidence: `audits/phase-1/link-crawl.json` and `scripts/phase1-link-crawl.mjs`.

## Fixes included in this phase

- Single-budget question metadata title generation.
- Conditional Page row rendering.
- Full question breadcrumb hierarchy.
- Restored KaTeX, app-font, and board-source image assets that previously returned 404.
- Removed pre-hydration DOM mutations from quick finder/catalog artwork helpers.
- Aligned the class-page server-rendered course finder with its client component.
- Converted illustrative homepage answer labels from false tabs to a non-interactive group.
- Added the locked light-default/dark-toggle behavior and corrected light/dark AA contrast.
- Added reproducible Phase 1 title, browser, keyboard, content-rendering, and link-crawl scripts.

## Explicit out-of-phase findings

These pre-existing recovered-build issues were not redesigned in Phase 1:

- The main stylesheet currently declares Manrope, not the locked IBM Plex Sans/Devanagari family.
- The base paper token is a warm cream (`#fbf7ed`), which conflicts with the stated anti-pattern.
- The app has no rendered verified-badge component or verification provenance.
- `/_next/mcp` returns 404 in this recovered production Worker bundle, so the Next.js DevTools MCP panel cannot attach here. The complete Phase 1 browser evidence therefore comes from Playwright/Chromium. Restoring a source-level Next development runtime is the blocking dependency for MCP-panel verification.

These are flagged for their owning design/content/tooling phases and were not silently expanded into this critical-bug phase.
