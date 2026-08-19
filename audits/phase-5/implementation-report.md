# StudyWudy Phase 5 implementation report

Generated 18 August 2026. This is an implementation and verification record,
not a substitute for advice from qualified Indian, UK or EEA counsel.

## Outcome

- `/privacy`, `/terms` and `/contact` are first-party Worker pages with unique
  canonical metadata, BreadcrumbList structured data and no ad placement.
- `/about` permanently redirects to the Phase 4 `/about/methodology` page, so
  About Us and the verification methodology remain one maintained resource.
- Every audited template exposes About, Privacy, Terms and Contact links. The
  runtime mounts the footer after Next.js hydration on recovered application
  pages and keeps server-rendered footers on the first-party legal pages.
- The adult-only contact form persists requests in
  `phase5_contact_requests`, returns a reference, stores no IP address in that
  table, and sets a 180-day expiry. Aman Bhagat is the named business and DPDP
  grievance contact.
- `/ads.txt` returns `200 text/plain`. With no configured account it truthfully
  declares that there are no authorized sellers. A valid
  `ADSENSE_PUBLISHER_ID` switches it to the exact Google DIRECT record.
- Live advertising is fail-closed until both a valid publisher ID and slot ID
  exist. All enabled requests set non-personalized mode, the requested legacy
  child-directed-treatment signal, and Google's current age-treatment signal.
  There is no personalized-ad toggle.
- Requests outside India are held unless `ADSENSE_TCF_V23_READY=true`. This is
  intentional because the recovery contains no analytics dataset from which
  EEA/UK traffic can be ruled out.
- The CSP augments `script-src`, `connect-src`, `frame-src` and `img-src` with
  the requested Google ad domain families.
- The mobile slot is fixed at 320×100 and desktop at 728×90. Space is reserved
  in first-paint CSS before the client mounts the slot.

## CLS evidence

Chrome traces compared the same homepage and persistence state with advertising
unconfigured versus the inert Phase 5 layout preview. Both runs measured exact
CLS `0.00033272782449387606` (shown as `0.00` by DevTools), so the measured
delta and ad-attributed CLS were both zero. PerformanceObserver attributed the
small existing total to a header-actions hydration width change; the ad shell
and slot were not listed as shift sources. See `cls-audit.json`.

## Automated evidence

- `static-audit.json`: all source/configuration compliance checks pass.
- `runtime-audit.json`: all required pages and schemas pass; every template has
  the footer/policy/CSP wiring; contact POST returns 303 and persists a 180-day
  row; preview `ads.txt` is exact; queued/noindex content receives no ad slot;
  required pages are included in the hierarchy sitemap.
- Production `wrangler deploy --dry-run` validates the Worker bundle and all
  bindings without changing Cloudflare.

## Production prerequisites

1. Apply `migrations/0002_phase5_contact_requests.sql` to remote D1 before
   deploying this Worker.
2. Establish a routine for Aman Bhagat to read and resolve new D1 contact rows.
3. Leave ad variables unset until AdSense issues the real publisher and slot
   values. Then configure `ADSENSE_PUBLISHER_ID` and `ADSENSE_SLOT_ID`.
4. Do not set `ADSENSE_TCF_V23_READY=true` until a Google-certified CMP with
   IAB TCF v2.3 is deployed and verified for relevant regions.
5. Re-run the runtime audit and CLS comparison with the real AdSense response
   in a staging deployment before promoting advertising.

## Primary references

- [Digital Personal Data Protection Act, 2023](https://www.meity.gov.in/writereaddata/files/Digital%20Personal%20Data%20Protection%20Act%202023.pdf)
- [DPDP commencement notification, 13 November 2025](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf)
- [Digital Personal Data Protection Rules, 2025](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf)
- [Google: non-personalized ads](https://support.google.com/adsense/answer/9007336)
- [Google: child/teen ad-treatment tags](https://support.google.com/adsense/answer/9007197)
- [Google: personalized advertising settings in ad tags](https://support.google.com/adsense/answer/7670312)
- [Google: IAB TCF requirements](https://support.google.com/adsense/answer/9804260)
- [Google: ads.txt guide](https://support.google.com/adsense/answer/12171612)
- [Google: AdSense Content Security Policy](https://support.google.com/adsense/answer/16283098)
- [Cloudflare: security headers in Workers](https://developers.cloudflare.com/workers/examples/security-headers/)
