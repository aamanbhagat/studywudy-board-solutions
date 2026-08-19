const PHASE5_POLICY_UPDATED_AT = "2026-08-18T00:00:00+05:30";
const PHASE5_CONTACT_NAME = "Aman Bhagat";
const PHASE5_CONTACT_RETENTION_SECONDS = 180 * 24 * 60 * 60;

const PHASE5_REQUIRED_PATHS = new Set([
  "/privacy",
  "/terms",
  "/contact",
  "/about",
  "/about/methodology",
]);

const GOOGLE_AD_CSP_SOURCES = [
  "https://googlesyndication.com",
  "https://*.googlesyndication.com",
  "https://doubleclick.net",
  "https://*.doubleclick.net",
  "https://googleadservices.com",
  "https://*.googleadservices.com",
];

const PHASE5_STYLES = `<style id="phase5-compliance-styles">
  .phase5-legal-footer{border-top:1px solid #c9c1b3;background:#f5f0e6;color:#101316}
  .phase5-legal-footer .shell{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:.75rem 2rem;align-items:start;padding-top:1.25rem;padding-bottom:1.35rem}
  .phase5-legal-footer p{margin:.15rem 0;line-height:1.5}
  .phase5-legal-footer nav{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.55rem 1rem}
  .phase5-legal-footer a{font-weight:750}
  .phase5-legal-footer small{grid-column:1/-1;color:#4b4d4f}
  .phase5-native-links{min-width:0}
  .phase5-ad-shell{box-sizing:border-box;position:absolute;left:0;right:0;bottom:16px;display:grid;grid-template-rows:18px 100px;gap:4px;width:100%;min-height:122px;margin:0 auto;overflow:hidden;contain:layout paint;content-visibility:auto;contain-intrinsic-size:auto 122px;text-align:center}
  .phase5-ad-label{color:#65676b;font-size:11px;line-height:18px;letter-spacing:.08em;text-transform:uppercase}
  .phase5-ad-slot{box-sizing:border-box;display:block;width:320px;height:100px;max-width:100%;margin:0 auto;overflow:hidden;background:#f0eee9}
  .phase5-ad-preview{display:grid;place-items:center;height:100%;color:#686a6e;font:600 12px/1.3 ui-sans-serif,system-ui,sans-serif;border:1px dashed #bbb5aa}
  @media(min-width:760px){.phase5-ad-shell{grid-template-rows:18px 90px;min-height:112px;contain-intrinsic-size:auto 112px}.phase5-ad-slot{width:728px;height:90px}}
</style>`;

const PHASE5_AD_RESERVATION_STYLES = `<style id="phase5-ad-reservation-styles">main{position:relative}main::after{content:"";display:block;width:100%;height:154px}@media(min-width:760px){main::after{height:144px}}</style>`;

const LEGAL_PAGE_STYLES = `<style id="phase5-legal-page-styles">
  :root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#101316;background:#f5f0e6}
  *{box-sizing:border-box}body{margin:0}a{color:#0e4da9}header,main,.phase5-legal-footer .shell{width:min(920px,calc(100% - 32px));margin:auto}
  header{padding:28px 0 8px}header nav{font-size:14px}main{padding:34px 0 72px}
  h1{font-size:clamp(2.2rem,7vw,4.7rem);line-height:.98;letter-spacing:-.05em;max-width:820px;margin:22px 0}
  h2{margin-top:42px;font-size:1.55rem}h3{margin-top:28px}p,li,label,input,select,textarea,button{font-size:1.02rem;line-height:1.68}
  .phase5-lede{font-size:1.23rem;max-width:780px}.phase5-eyebrow{font-weight:800;color:#0e4da9;text-transform:uppercase;letter-spacing:.08em;font-size:.78rem}
  .phase5-note{padding:18px 20px;border:2px solid #101316;border-radius:14px;background:#fff}.phase5-muted{color:#505358}
  .phase5-policy-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:28px 0}.phase5-policy-grid section{padding:18px 20px;border:1px solid #bbb4a8;border-radius:12px;background:#fff}.phase5-policy-grid h2{margin:0 0 8px;font-size:1.2rem}
  .phase5-contact-form{display:grid;gap:16px;max-width:720px;padding:22px;border:2px solid #101316;border-radius:14px;background:#fff}.phase5-contact-form label{display:grid;gap:6px;font-weight:700}.phase5-contact-form input,.phase5-contact-form select,.phase5-contact-form textarea{width:100%;padding:.72rem .8rem;border:1px solid #777;border-radius:8px;background:#fff;color:#101316}.phase5-contact-form textarea{min-height:180px;resize:vertical}.phase5-contact-form .phase5-check{display:grid;grid-template-columns:auto 1fr;align-items:start;gap:10px;font-weight:500}.phase5-contact-form .phase5-check input{width:auto;margin-top:.38rem}.phase5-contact-form button{width:max-content;padding:.65rem 1rem;border:2px solid #101316;border-radius:9px;background:#1463d7;color:#fff;font-weight:800;cursor:pointer}.phase5-honeypot{position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important}.phase5-success{padding:18px 20px;border:2px solid #17633c;border-radius:12px;background:#e4f7ec}.phase5-error{padding:18px 20px;border:2px solid #973434;border-radius:12px;background:#fff0f0}
  @media(max-width:700px){.phase5-policy-grid{grid-template-columns:1fr}h1{letter-spacing:-.035em}.phase5-contact-form{padding:18px}}
</style>`;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function canonicalOrigin(requestUrl) {
  const url = new URL(requestUrl);
  return /^(?:localhost|127\.0\.0\.1)$/.test(url.hostname)
    ? "https://studywudy-board-solutions.amanbhagat17089.workers.dev"
    : url.origin;
}

function legalFooter() {
  return `<footer id="phase5-compliance-footer" class="phase5-legal-footer"><div class="shell"><div><strong>StudyWudy</strong><p>Independent textbook help with a documented publishing methodology.</p></div><nav aria-label="Site policies"><a href="/about/methodology">About Us &amp; Methodology</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a><a href="/contact">Contact Us</a></nav><small>Advertising policy: contextual/non-personalized only, with child-directed treatment on every enabled ad request.</small></div></footer>`;
}

function nativeFooterLinks() {
  return `<div class="phase5-native-links"><h2>About</h2><a href="/about/methodology">About &amp; Methodology <span aria-hidden="true">→</span></a><a href="/privacy">Privacy Policy <span aria-hidden="true">→</span></a><a href="/terms">Terms of Service <span aria-hidden="true">→</span></a><a href="/contact">Contact Us <span aria-hidden="true">→</span></a></div>`;
}

function legalPage({ request, path, title, description, eyebrow, heading, lede, body, schemaType = "WebPage" }) {
  const origin = canonicalOrigin(request.url);
  const canonical = `${origin}${path}`;
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": schemaType,
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: title,
        description,
        dateModified: PHASE5_POLICY_UPDATED_AT,
        isPartOf: { "@id": `${origin}/#website` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
          { "@type": "ListItem", position: 2, name: heading, item: canonical },
        ],
      },
    ],
  }).replaceAll("<", "\\u003c");
  const html = `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${escapeHtml(canonical)}"><script type="application/ld+json">${schema}</script>${LEGAL_PAGE_STYLES}${PHASE5_STYLES}</head><body><header><nav aria-label="Breadcrumb"><a href="/">StudyWudy</a> / ${escapeHtml(heading)}</nav></header><main><p class="phase5-eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(heading)}</h1><p class="phase5-lede">${escapeHtml(lede)}</p>${body}</main>${legalFooter()}</body></html>`;
  return new Response(request.method === "HEAD" ? null : html, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function privacyPage(request) {
  return legalPage({
    request,
    path: "/privacy",
    title: "Privacy Policy | StudyWudy",
    description: "How StudyWudy handles student privacy, contact data, cookies, contextual advertising and child-directed ad safeguards.",
    eyebrow: "Student privacy",
    heading: "Privacy Policy",
    lede: "StudyWudy is built for K–12 learners. We therefore treat the service as child-directed sitewide and minimise data collection instead of asking students to navigate a personalised-ad consent toggle.",
    body: `<p class="phase5-muted">Effective and last updated: 18 August 2026</p>
      <section class="phase5-note"><strong>The short version.</strong> StudyWudy does not offer behavioural advertising. If advertising is enabled after a real AdSense publisher ID is configured, every request is forced to non-personalized/contextual mode and marked for child treatment. Students should not send personal information through the site; an adult parent, guardian, teacher or adult data principal must use the contact form.</section>
      <div class="phase5-policy-grid">
        <section><h2>Information used to deliver the site</h2><p>Our hosting and security provider may process ordinary request data such as IP address, date and time, requested URL, browser or device information, and security signals. We use this for delivery, abuse prevention, debugging and aggregate operational reliability—not to build student profiles.</p></section>
        <section><h2>Choices stored on your device</h2><p>The interface may use browser storage to remember a display choice such as light or dark theme. Search or finder choices may also appear in the page URL. Do not type names, phone numbers, school details or other personal information into search fields.</p></section>
        <section><h2>Adult contact requests</h2><p>The Contact Us form is for adults. It stores the adult’s name, email address, relationship to the request, request type and message so ${PHASE5_CONTACT_NAME}, StudyWudy’s grievance contact, can reply. The form does not store the requester’s IP address in the contact table. Requests normally expire after 180 days unless a longer legal hold is necessary.</p></section>
        <section><h2>No student accounts or profiles</h2><p>The current service does not require student registration, student profiles, precise location, date of birth, phone number, school name, payment data or social sign-in. We do not sell personal data.</p></section>
      </div>
      <h2>Cookies, Google AdSense and advertising</h2>
      <p>StudyWudy’s AdSense integration remains inactive until the site owner supplies a genuine publisher ID and ad-unit ID. When activated, it requests only <strong>non-personalized ads</strong>. Google says non-personalized ads use contextual information rather than a person’s past behaviour, but may still use cookies or other identifiers for frequency capping, aggregated reporting, security and invalid-traffic detection.</p>
      <p>Every enabled ad unit carries both Google’s current child <code>data-tag-for-age-treatment="1"</code> signal and the legacy <code>data-tag-for-child-directed-treatment="1"</code> signal requested for child-directed treatment. The page also sets <code>requestNonPersonalizedAds=1</code> before Google’s ad script can load. We do not provide a control that can switch advertising back to personalized mode.</p>
      <p>You can review advertising controls at <a href="https://adssettings.google.com/" rel="noreferrer">Google Ads Settings</a> and read <a href="https://policies.google.com/privacy" rel="noreferrer">Google’s Privacy Policy</a>. Those links do not change StudyWudy’s sitewide non-personalized default.</p>
      <h2>Children and India’s DPDP framework</h2>
      <p>India’s Digital Personal Data Protection Act, 2023 defines a child as a person under 18. Section 9 requires verifiable parental consent before processing a child’s personal data and prohibits tracking or behavioural monitoring of children and targeted advertising directed at children. StudyWudy adopts the no-tracking/no-targeted-advertising position now rather than relying on the phased commencement period.</p>
      <p>The notified schedule brings most substantive provisions, including sections 3–10, and the corresponding child-consent rules into force 18 months after the 13 November 2025 Gazette publication. Our safeguards are designed as the operating default before that date, not as a promise that an advertising tag alone satisfies every legal obligation.</p>
      <h2>EEA, UK and Switzerland</h2>
      <p>No ad tag is called for those regions unless the deployment has a Google-compatible, certified consent-management path that supports IAB TCF v2.3. Non-personalized advertising can still use storage for limited purposes, so “non-personalized” does not remove regional consent duties.</p>
      <h2>Retention, security and your requests</h2>
      <p>We keep operational logs only as long as reasonably needed for reliability, security and legal obligations. Adult contact submissions carry a 180-day expiry unless they must be retained for an unresolved grievance or legal requirement. Reasonable safeguards are used, but no internet system can promise absolute security.</p>
      <p>An adult may ask to access, correct or erase contact data, withdraw a request, or raise a grievance through <a href="/contact">Contact Us</a>. The named business and grievance contact is <strong>${PHASE5_CONTACT_NAME}</strong>. For a child’s request, a parent or lawful guardian should contact us without including unnecessary information about the child.</p>`,
  });
}

function termsPage(request) {
  return legalPage({
    request,
    path: "/terms",
    title: "Terms of Service | StudyWudy",
    description: "Terms governing use of StudyWudy textbook solutions, educational content and site services.",
    eyebrow: "Use of StudyWudy",
    heading: "Terms of Service",
    lede: "These terms set a simple boundary: StudyWudy is independent study support, not an official board, school, publisher, examination authority or substitute for a teacher.",
    body: `<p class="phase5-muted">Effective and last updated: 18 August 2026</p>
      <h2>Who may use the service</h2><p>Students may browse the learning material. A parent or guardian should supervise a child’s use where appropriate. Interactive contact features are reserved for adults; a child must ask a parent, guardian or teacher to contact us.</p>
      <h2>Educational use and accuracy</h2><p>Content is provided for learning, revision and comparison with a student’s own work. Check answers against the current prescribed textbook, teacher guidance and official board material. We work to improve accuracy, but do not guarantee that every answer, translation, diagram, equation, syllabus mapping or publication status is error-free or current.</p>
      <h2>Independent status</h2><p>StudyWudy is not affiliated with, endorsed by or operated by CBSE, CISCE, Maharashtra State Board, Tamil Nadu State Board, NCERT, Balbharati or any other board, school, government body or textbook publisher unless a page expressly says otherwise.</p>
      <h2>Permitted and prohibited use</h2><p>You may use the site for personal education, classroom reference and non-commercial linking. You may not disrupt the service, bypass access controls, submit malicious content, impersonate another person, overload endpoints, use automated extraction in a way that harms availability, or republish substantial parts of the corpus as a competing service.</p>
      <h2>Textbooks, trademarks and solution content</h2><p>Textbook names, board names and third-party marks belong to their respective owners. Source questions may remain subject to the rights of their publishers. StudyWudy’s independent explanations, site design and original editorial material may not be copied wholesale except where law permits.</p>
      <h2>Advertising and external links</h2><p>If advertising is activated, it is configured for child treatment and non-personalized/contextual selection. External sites have their own terms and privacy practices; a link is not an endorsement. Never click an advertisement because someone asks you to support StudyWudy.</p>
      <h2>Availability and liability</h2><p>The service may change, pause or remove content without notice. To the extent permitted by law, StudyWudy is provided “as is” and is not liable for indirect losses arising from reliance on a solution, an unavailable page or a third-party service. Nothing in these terms excludes rights that cannot lawfully be excluded.</p>
      <h2>Changes and contact</h2><p>Material changes will be reflected by the date above. Continued use after a change means the revised terms apply. Questions, correction notices and legal concerns can be sent through <a href="/contact">Contact Us</a> to <strong>${PHASE5_CONTACT_NAME}</strong>.</p>`,
  });
}

function contactFeedback(url) {
  const submitted = url.searchParams.get("submitted");
  if (submitted && /^SW-[A-F0-9]{12}$/.test(submitted)) {
    return `<div class="phase5-success" role="status"><strong>Request received.</strong><p>Your reference is <code>${submitted}</code>. Keep it for follow-up. The contact data is queued for ${PHASE5_CONTACT_NAME}.</p></div>`;
  }
  const error = url.searchParams.get("error");
  const messages = {
    invalid: "Please complete every required field with valid adult contact details.",
    adult: "This form is for an adult parent, guardian, teacher or adult data principal.",
    unavailable: "The contact queue is temporarily unavailable. Please try again later.",
    origin: "The submission could not be verified as coming from StudyWudy.",
  };
  return error && messages[error]
    ? `<div class="phase5-error" role="alert"><strong>We could not submit the request.</strong><p>${messages[error]}</p></div>`
    : "";
}

function contactPage(request) {
  const url = new URL(request.url);
  return legalPage({
    request,
    path: "/contact",
    title: "Contact Us | StudyWudy",
    description: "Contact StudyWudy about solution corrections, privacy requests, DPDP grievances and site support.",
    eyebrow: "Working contact channel",
    heading: "Contact Us",
    lede: `${PHASE5_CONTACT_NAME} is StudyWudy’s named grievance contact for privacy, data and content concerns. The form below writes to the site’s managed request queue and returns a reference number.`,
    schemaType: "ContactPage",
    body: `<section class="phase5-note"><strong>For adults only.</strong> A parent, lawful guardian, teacher or other adult should submit this form. Do not include a child’s full name, phone number, school, home address, ID document, password, health information or other unnecessary personal details.</section>
      ${contactFeedback(url)}
      <h2>Send a request</h2>
      <form class="phase5-contact-form" action="/contact" method="post" accept-charset="utf-8">
        <label>Your relationship to this request<select name="role" required><option value="">Choose one</option><option value="parent_guardian">Parent or lawful guardian</option><option value="teacher">Teacher or school adult</option><option value="adult_data_principal">Adult asking about their own data</option><option value="other_adult">Other adult</option></select></label>
        <label>Your name<input name="name" autocomplete="name" minlength="2" maxlength="80" required></label>
        <label>Your email address<input name="email" type="email" autocomplete="email" maxlength="160" required></label>
        <label>Request type<select name="request_type" required><option value="">Choose one</option><option value="privacy">Privacy or data request</option><option value="grievance">DPDP grievance</option><option value="content_correction">Solution correction</option><option value="copyright">Copyright or legal notice</option><option value="technical">Technical problem</option><option value="other">Other</option></select></label>
        <label>Message<textarea name="message" minlength="20" maxlength="3000" required placeholder="Include the page URL and enough detail to investigate. Avoid student personal data."></textarea></label>
        <label class="phase5-check"><input name="adult_attested" type="checkbox" value="yes" required><span>I confirm that I am 18 or older and I am submitting this request myself or as the responsible adult for a child.</span></label>
        <label class="phase5-honeypot" aria-hidden="true">Leave this field empty<input name="website" tabindex="-1" autocomplete="off"></label>
        <button type="submit">Submit request</button>
      </form>
      <h2>What happens next</h2><p>The request is stored with a 180-day expiry and status “new”. Use the reference number for follow-up. Privacy and grievance messages are reviewed by ${PHASE5_CONTACT_NAME}; complex legal or identity-verification requests may require additional adult verification before data is disclosed or changed.</p>`,
  });
}

function normalizePublisherId(value) {
  const match = String(value ?? "").trim().match(/^(?:ca-)?(pub-\d{16})$/);
  return match ? { publisherId: match[1], clientId: `ca-${match[1]}` } : null;
}

function normalizeSlotId(value) {
  const slot = String(value ?? "").trim();
  return /^\d{5,20}$/.test(slot) ? slot : null;
}

function requestCountry(request) {
  return String(request.cf?.country || request.headers.get("cf-ipcountry") || "").toUpperCase();
}

function adDecision(request, environment, response) {
  const publisher = normalizePublisherId(environment.ADSENSE_PUBLISHER_ID);
  const slotId = normalizeSlotId(environment.ADSENSE_SLOT_ID);
  const preview = environment.PHASE5_AD_PREVIEW === "true";
  const country = requestCountry(request);
  const tcfReady = environment.ADSENSE_TCF_V23_READY === "true";
  const legalPath = PHASE5_REQUIRED_PATHS.has(new URL(request.url).pathname);
  const noindex = String(response?.headers.get("x-robots-tag") || "").toLowerCase().includes("noindex");
  let reason = "enabled";
  if (legalPath) reason = "required-page";
  else if (noindex) reason = "noindex-content-gate";
  else if (!preview && !publisher) reason = "publisher-id-missing";
  else if (!preview && !slotId) reason = "slot-id-missing";
  else if (!preview && country !== "IN" && !tcfReady) reason = country ? "tcf-v2.3-region-holdback" : "unknown-region-holdback";
  return {
    enabled: reason === "enabled",
    preview,
    publisher: publisher ?? normalizePublisherId("pub-0000000000000000"),
    slotId: slotId ?? "0000000000",
    country: country || "unknown",
    tcfReady,
    reason,
    hasConfiguredPublisher: Boolean(publisher),
    cacheVariant: Boolean(publisher && !tcfReady),
  };
}

function adPolicyScript(decision) {
  const policy = JSON.stringify({
    mode: "non-personalized",
    requestNonPersonalizedAds: 1,
    privacyTreatment: "disablePersonalization",
    tagForChildDirectedTreatment: 1,
    tagForAgeTreatment: 1,
    region: decision.country,
    requestStatus: decision.enabled ? (decision.preview ? "preview" : "enabled") : "held",
    holdReason: decision.enabled ? null : decision.reason,
  }).replaceAll("<", "\\u003c");
  const reserve = decision.enabled ? 'document.documentElement.dataset.phase5AdEnabled="true";' : "";
  return `<script id="phase5-ad-policy" data-ad-mode="non-personalized" data-tag-for-child-directed-treatment="1" data-tag-for-age-treatment="1">window.__STUDYWUDY_AD_POLICY__=Object.freeze(${policy});(window.adsbygoogle=window.adsbygoogle||[]).requestNonPersonalizedAds=1;${reserve}</script>`;
}

function adSlot(decision) {
  const preview = decision.preview ? `<span class="phase5-ad-preview">Reserved 320×100 / 728×90 ad area</span>` : "";
  return `<aside class="phase5-ad-shell" aria-label="Advertisement" data-layout-space="reserved" data-ad-mode="non-personalized" data-child-directed="true"><span class="phase5-ad-label">Advertisement</span><ins class="adsbygoogle phase5-ad-slot" style="display:block" data-ad-client="${decision.publisher.clientId}" data-ad-slot="${decision.slotId}" data-ad-format="horizontal" data-full-width-responsive="false" data-tag-for-age-treatment="1" data-tag-for-child-directed-treatment="1">${preview}</ins></aside>`;
}

function clientRuntimeScript(decision) {
  const policy = JSON.stringify({
    mode: "non-personalized",
    requestNonPersonalizedAds: 1,
    privacyTreatment: "disablePersonalization",
    tagForChildDirectedTreatment: 1,
    tagForAgeTreatment: 1,
    region: decision.country,
    requestStatus: decision.enabled ? (decision.preview ? "preview" : "enabled") : "held",
    holdReason: decision.enabled ? null : decision.reason,
  }).replaceAll("<", "\\u003c");
  const footerLinksMarkup = JSON.stringify(nativeFooterLinks()).replaceAll("<", "\\u003c");
  const slotMarkup = JSON.stringify(decision.enabled ? adSlot(decision) : "").replaceAll("<", "\\u003c");
  const loaderUrl = decision.enabled && !decision.preview
    ? JSON.stringify(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${decision.publisher.clientId}`)
    : "null";
  const enableReservation = decision.enabled ? 'document.documentElement.dataset.phase5AdEnabled="true";' : "";
  return `<script id="phase5-client-runtime">(()=>{window.__STUDYWUDY_AD_POLICY__=Object.freeze(${policy});(window.adsbygoogle=window.adsbygoogle||[]).requestNonPersonalizedAds=1;${enableReservation}const footerLinks=${footerLinksMarkup},slot=${slotMarkup},loaderUrl=${loaderUrl};let observer;const mount=()=>{${enableReservation}const footerNav=document.querySelector(".site-footer .footer-nav");if(footerNav&&!footerNav.querySelector(".phase5-native-links"))footerNav.insertAdjacentHTML("beforeend",footerLinks);if(slot&&!document.querySelector(".phase5-ad-shell")){const main=document.querySelector("main");if(main)main.insertAdjacentHTML("beforeend",slot)}if(loaderUrl&&!document.getElementById("phase5-adsense-loader")&&document.querySelector(".phase5-ad-slot")){const script=document.createElement("script");script.id="phase5-adsense-loader";script.async=true;script.crossOrigin="anonymous";script.dataset.privacyTreatments="disablePersonalization";script.src=loaderUrl;document.head.append(script);(window.adsbygoogle=window.adsbygoogle||[]).push({})}};if(document.readyState==="complete")setTimeout(mount,0);else addEventListener("load",()=>setTimeout(mount,0),{once:true});setTimeout(mount,1200);observer=new MutationObserver(mount);observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>observer.disconnect(),5000)})();</script>`;
}

function addSourcesToCsp(csp) {
  const directives = new Map();
  const baseline = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'";
  for (const rawDirective of String(csp || baseline).split(";")) {
    const parts = rawDirective.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    directives.set(parts[0], parts.slice(1));
  }
  const add = (name, values) => {
    const current = directives.get(name) ?? (name === "frame-src" ? ["'self'"] : [...(directives.get("default-src") ?? ["'self'"])]);
    for (const value of values) if (!current.includes(value)) current.push(value);
    directives.set(name, current);
  };
  add("script-src", GOOGLE_AD_CSP_SOURCES);
  add("connect-src", GOOGLE_AD_CSP_SOURCES);
  add("frame-src", GOOGLE_AD_CSP_SOURCES);
  add("img-src", GOOGLE_AD_CSP_SOURCES);
  return [...directives].map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

function withPhase5Headers(response, decision = null) {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", addSourcesToCsp(headers.get("Content-Security-Policy")));
  headers.set("X-StudyWudy-Ad-Mode", `non-personalized; child-directed; ${decision?.reason ?? "not-applicable"}`);
  if (decision?.cacheVariant || decision?.preview) {
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function adsTxtResponse(request, environment) {
  const publisher = normalizePublisherId(environment.ADSENSE_PUBLISHER_ID);
  const body = publisher
    ? `google.com, ${publisher.publisherId}, DIRECT, f08c47fec0942fa0\n`
    : "# StudyWudy currently has no authorized advertising sellers.\n# Add ADSENSE_PUBLISHER_ID only after a real AdSense publisher ID is issued.\n";
  return new Response(request.method === "HEAD" ? null : body, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-StudyWudy-Ads-Txt": publisher ? "publisher-configured" : "awaiting-publisher-id",
    },
  });
}

function redirectToContact(request, parameter, value) {
  const location = new URL("/contact", request.url);
  location.searchParams.set(parameter, value);
  return Response.redirect(location.toString(), 303);
}

async function submitContact(request, environment) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== requestUrl.origin) return redirectToContact(request, "error", "origin");
  const contentType = request.headers.get("content-type") || "";
  const length = Number(request.headers.get("content-length") || 0);
  if (!contentType.startsWith("application/x-www-form-urlencoded") || length > 14_000) {
    return redirectToContact(request, "error", "invalid");
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return redirectToContact(request, "error", "invalid");
  }
  if (String(form.get("website") || "").trim()) return redirectToContact(request, "submitted", "SW-000000000000");
  const role = String(form.get("role") || "").trim();
  const name = String(form.get("name") || "").trim().replace(/\s+/g, " ");
  const email = String(form.get("email") || "").trim().toLowerCase();
  const requestType = String(form.get("request_type") || "").trim();
  const message = String(form.get("message") || "").trim();
  const adultAttested = form.get("adult_attested") === "yes";
  const roles = new Set(["parent_guardian", "teacher", "adult_data_principal", "other_adult"]);
  const requestTypes = new Set(["privacy", "grievance", "content_correction", "copyright", "technical", "other"]);
  if (!adultAttested) return redirectToContact(request, "error", "adult");
  if (!roles.has(role) || !requestTypes.has(requestType) || name.length < 2 || name.length > 80 || email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 20 || message.length > 3000) {
    return redirectToContact(request, "error", "invalid");
  }
  if (!environment.DB) return redirectToContact(request, "error", "unavailable");
  const id = crypto.randomUUID();
  const reference = `SW-${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  const now = Math.floor(Date.now() / 1000);
  try {
    await environment.DB.prepare(`INSERT INTO phase5_contact_requests
      (id, reference, submitted_by_role, adult_name, adult_email, request_type, message, adult_attested, status, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'new', ?, ?)`)
      .bind(id, reference, role, name, email, requestType, message, now, now + PHASE5_CONTACT_RETENTION_SECONDS)
      .run();
  } catch {
    return redirectToContact(request, "error", "unavailable");
  }
  return redirectToContact(request, "submitted", reference);
}

export async function handlePhase5Request(request, environment) {
  const url = new URL(request.url);
  if (!["GET", "HEAD", "POST"].includes(request.method)) return null;
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/ads.txt") return adsTxtResponse(request, environment);
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/about") {
    return Response.redirect(new URL("/about/methodology", request.url).toString(), 308);
  }
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/privacy") return privacyPage(request);
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/terms") return termsPage(request);
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/contact") return contactPage(request);
  if (request.method === "POST" && url.pathname === "/contact") return submitContact(request, environment);
  return null;
}

export function enhancePhase5Response(request, response, environment) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("text/html")) return response;
  const decision = adDecision(request, environment, response);
  response = withPhase5Headers(response, decision);
  if (request.method !== "GET" || response.status >= 400 || typeof globalThis.HTMLRewriter !== "function") return response;
  const eligibleForSlot = decision.enabled && !PHASE5_REQUIRED_PATHS.has(new URL(request.url).pathname);
  let hasStyles = false;
  let hasReservationStyles = false;
  let hasPolicyScript = false;
  let hasClientRuntime = false;
  let hasNativeFooterLinks = false;
  const rewriter = new globalThis.HTMLRewriter()
    .on("#phase5-compliance-styles", { element() { hasStyles = true; } })
    .on("#phase5-ad-reservation-styles", { element() { hasReservationStyles = true; } })
    .on("#phase5-ad-policy", { element() { hasPolicyScript = true; } })
    .on("#phase5-client-runtime", { element() { hasClientRuntime = true; } })
    .on(".phase5-native-links", { element() { hasNativeFooterLinks = true; } })
    .on(".site-footer .footer-nav", {
      element(element) {
        element.onEndTag((endTag) => {
          if (!hasNativeFooterLinks) endTag.before(nativeFooterLinks(), { html: true });
        });
      },
    })
    .on(".phase4-methodology-footer", {
      element(element) {
        element.remove();
      },
    })
    .on("head", {
      element(element) {
        element.onEndTag((endTag) => {
          if (!hasStyles) endTag.before(PHASE5_STYLES, { html: true });
          if (eligibleForSlot && !hasReservationStyles) endTag.before(PHASE5_AD_RESERVATION_STYLES, { html: true });
          if (!hasPolicyScript) endTag.before(adPolicyScript(decision), { html: true });
          if (!hasClientRuntime) endTag.before(clientRuntimeScript(decision), { html: true });
        });
      },
    })
    .on("html", {
      element(element) {
        if (eligibleForSlot) element.setAttribute("data-phase5-ad-enabled", "true");
      },
    });
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  return rewriter.transform(new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  }));
}

export async function cleanupPhase5ContactRequests(environment) {
  if (!environment.DB) return { deleted: 0 };
  const now = Math.floor(Date.now() / 1000);
  return environment.DB.prepare("DELETE FROM phase5_contact_requests WHERE expires_at <= ? AND status != 'legal_hold'").bind(now).run();
}

export const PHASE5_COMPLIANCE = Object.freeze({
  policyUpdatedAt: PHASE5_POLICY_UPDATED_AT,
  contactName: PHASE5_CONTACT_NAME,
  adMode: "non-personalized",
  requestNonPersonalizedAds: 1,
  tagForChildDirectedTreatment: 1,
  tagForAgeTreatment: 1,
  tcfVersion: "2.3",
});
