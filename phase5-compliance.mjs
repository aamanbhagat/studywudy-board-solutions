import { PHASE4_GATE_MANIFEST } from "./phase4-publish-manifest.mjs";
import {
  MANUAL_REVIEWER_PROFILES,
  QUESTION_CORRECTIONS,
  TRUST_POLICY_UPDATED_AT,
  TRUST_TRANSPARENCY_PATHS,
  TRUST_TRANSPARENCY_SUMMARY,
} from "./trust-transparency.mjs";

const PHASE5_POLICY_UPDATED_AT = "2026-08-18T00:00:00+05:30";
const METHODOLOGY_UPDATED_AT = "2026-08-22T08:00:00+05:30";
const PHASE5_CONTACT_NAME = "Aman Bhagat";
const PHASE5_CONTACT_RETENTION_SECONDS = 180 * 24 * 60 * 60;

const PHASE5_REQUIRED_PATHS = new Set([
  "/privacy",
  "/terms",
  "/contact",
  "/about",
  "/about/methodology",
  ...TRUST_TRANSPARENCY_PATHS,
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
  .trust-counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:28px 0}.trust-counts div{padding:18px;border:1px solid #a9a296;border-radius:12px;background:#fff}.trust-counts strong{display:block;color:#0757d8;font-size:2rem;line-height:1}.trust-counts span{display:block;margin-top:8px;color:#50585c}.trust-boundary{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;margin:28px 0;border:2px solid #101316;border-radius:14px;overflow:hidden;background:#fff}.trust-boundary section{padding:22px}.trust-boundary section+section{border-left:6px solid #d99917;background:#fff7df}.trust-boundary h2{margin:0 0 10px}.trust-ledger{display:grid;gap:12px;margin:24px 0}.trust-ledger article{padding:18px 20px;border-left:5px solid #17603a;border-radius:0 12px 12px 0;background:#fff}.trust-ledger article.is-pending{border-left-color:#d99917;background:#fff8e7}.trust-ledger h2,.trust-ledger h3{margin:0 0 8px}.trust-ledger p{margin:.35rem 0}.trust-profile-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:24px 0}.trust-profile-links a{display:block;padding:18px 20px;border:1px solid #aaa397;border-radius:12px;background:#fff;color:#101316;text-decoration:none}.trust-profile-links strong,.trust-profile-links span{display:block}.trust-profile-links span{margin-top:5px;color:#555d59}.trust-profile-links a:focus-visible,.phase5-legal-footer a:focus-visible{outline:3px solid #0757d8;outline-offset:3px}
  @media(max-width:700px){.phase5-policy-grid,.trust-counts,.trust-boundary,.trust-profile-links{grid-template-columns:1fr}.trust-boundary section+section{border-top:6px solid #d99917;border-left:0}h1{letter-spacing:-.035em}.phase5-contact-form{padding:18px}}
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
  return `<footer id="phase5-compliance-footer" class="phase5-legal-footer"><div class="shell"><div><strong>StudyWudy</strong><p>Independent textbook help with a documented publishing methodology.</p></div><nav aria-label="Site policies"><a href="/about/methodology">Methodology</a><a href="/reviewers">Reviewer registry</a><a href="/corrections">Corrections</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/contact">Contact</a></nav><small>Advertising policy: contextual/non-personalized only, with child-directed treatment on every enabled ad request.</small></div></footer>`;
}

function nativeFooterLinks() {
  return `<div class="phase5-native-links"><h2>About</h2><a href="/about/methodology">About &amp; Methodology <span aria-hidden="true">→</span></a><a href="/reviewers">Reviewer registry <span aria-hidden="true">→</span></a><a href="/corrections">Corrections history <span aria-hidden="true">→</span></a><a href="/privacy">Privacy Policy <span aria-hidden="true">→</span></a><a href="/terms">Terms of Service <span aria-hidden="true">→</span></a><a href="/contact">Contact Us <span aria-hidden="true">→</span></a></div>`;
}

function legalPage({ request, path, title, description, eyebrow, heading, lede, body, schemaType = "WebPage", modifiedAt = PHASE5_POLICY_UPDATED_AT, breadcrumbParent = null }) {
  const origin = canonicalOrigin(request.url);
  const canonical = `${origin}${path}`;
  const breadcrumbItems = [
    { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
    ...(breadcrumbParent ? [{
      "@type": "ListItem",
      position: 2,
      name: breadcrumbParent.name,
      item: `${origin}${breadcrumbParent.path}`,
    }] : []),
    {
      "@type": "ListItem",
      position: breadcrumbParent ? 3 : 2,
      name: heading,
      item: canonical,
    },
  ];
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": schemaType,
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: title,
        description,
        dateModified: modifiedAt,
        isPartOf: { "@id": `${origin}/#website` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbItems,
      },
    ],
  }).replaceAll("<", "\\u003c");
  const breadcrumb = `<a href="/">StudyWudy</a>${breadcrumbParent ? ` / <a href="${escapeHtml(breadcrumbParent.path)}">${escapeHtml(breadcrumbParent.name)}</a>` : ""} / ${escapeHtml(heading)}`;
  const html = `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${escapeHtml(canonical)}"><script type="application/ld+json">${schema}</script>${LEGAL_PAGE_STYLES}${PHASE5_STYLES}</head><body><header><nav aria-label="Breadcrumb">${breadcrumb}</nav></header><main><p class="phase5-eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(heading)}</h1><p class="phase5-lede">${escapeHtml(lede)}</p>${body}</main>${legalFooter()}</body></html>`;
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

function methodologyPage(request) {
  const indexed = Number(PHASE4_GATE_MANIFEST.indexableCount || 0).toLocaleString("en-IN");
  const corpus = Number(PHASE4_GATE_MANIFEST.corpusCount || 0).toLocaleString("en-IN");
  return legalPage({
    request,
    path: "/about/methodology",
    title: "How StudyWudy Reviews Textbook Solutions",
    description: "StudyWudy's question-type-aware answer completeness, textbook mapping, equation, originality, canonical and indexing methodology.",
    eyebrow: "Trust & publishing policy",
    heading: "What “verified” means on StudyWudy",
    lede: "A concise answer can be complete, and a long answer can still be unhelpful. StudyWudy does not use a minimum word count to decide whether an atomic question page may be indexed.",
    schemaType: "AboutPage",
    modifiedAt: METHODOLOGY_UPDATED_AT,
    body: `<p class="phase5-muted">Methodology last updated: 22 August 2026</p>
      <section class="phase5-note"><strong>${indexed} of ${corpus} question pages currently satisfy the question-type-aware publishing gate.</strong><p>Pages that do not satisfy it remain available to students through their chapter context, but are excluded from question sitemaps and receive <code>noindex, follow</code> until the missing answer elements are corrected.</p></section>
      <h2>No universal word-count rule</h2>
      <p>Word counts are retained only as editorial diagnostics. A page is not indexed merely because it contains 150 words, and a naturally concise solution is not suppressed merely because it contains fewer. This follows Google Search Central’s people-first guidance, which explicitly says Google has no preferred word count and instead asks whether readers leave with a satisfying, complete answer.</p>
      <div class="phase5-policy-grid">
        <section><h2>MCQ: single or multiple</h2><p>Checks the correct choice or choices, the governing principle, reasoning and a useful explanation of the tempting distractor or distractors.</p></section>
        <section><h2>One word or fill in the blank</h2><p>Checks the direct answer and brief context that explains what the answer means in this question.</p></section>
        <section><h2>Short answer or give reason</h2><p>Checks the required points, subject terminology and causal reasoning where the prompt asks “why” or “give reason”.</p></section>
        <section><h2>Numerical</h2><p>Checks the formula, substitution, units, arithmetic and final answer, as well as readable equations.</p></section>
        <section><h2>Derivation</h2><p>Checks assumptions or givens, ordered steps, equations and a conclusion.</p></section>
        <section><h2>Diagram</h2><p>Checks the diagram asset, labels, descriptive alternative text and a supporting explanation.</p></section>
        <section><h2>Long answer</h2><p>Checks coverage, structure, unresolved-content and equation safeguards, and an exam-appropriate conclusion or final answer.</p></section>
        <section><h2>Other structured formats</h2><p>True/false, matching, comparison and passage questions use their own structural checks rather than inheriting a prose-length target.</p></section>
      </div>
      <h2>Atomic-page index decision</h2>
      <p>A standalone question page is eligible only when it has all of the following:</p>
      <ul><li>distinct search intent;</li><li>a complete, semantically coherent answer for its question type;</li><li>internally consistent board, class, subject, textbook, chapter and exercise mapping;</li><li>no recorded conflict with an authoritative textbook source;</li><li>correctly delimited, readable equations with matching source, spoken, plain-text and semantic MathML forms;</li><li>useful answer context not copied from the prompt;</li><li>validated native-script text for a localized edition;</li><li>a valid self-canonical URL built from the catalog route; and</li><li>no substantially equivalent indexed page for the same textbook and chapter intent.</li></ul>
      <p>Exact duplicate-intent candidates are consolidated to one indexable atomic page. Similarity screening is a duplicate safeguard, not a reward for adding filler.</p>
      <h2>Semantic mathematics</h2>
      <p>Every detected formula is strictly parsed from one canonical source representation. The publishing gate extracts its semantic identifiers and operators, then requires the clean crawler-visible form, spoken text and semantic MathML to preserve them independently. It rejects semantic-token loss, empty fraction arguments, empty equation sides, scripts or integral limits without a valid base operator, unmatched delimiters, raw TeX in crawler-visible text, separated numerals, reversed fractions, missing exponents, detached units and confusion between Latin <em>I</em> and numeral <em>1</em>.</p>
      <p>Each equation is rendered as one labelled semantic MathML tree derived from the canonical source. No raw TeX text node or duplicate visual glyph tree is placed in crawler-visible HTML, and copy handling derives clean plain text from that same representation.</p>
      <p>A formula failure places the page under <strong>Equation review pending</strong>. It receives <code>noindex</code> and is excluded from question sitemaps, Question Bank results and quality-screened samples until the formula passes again.</p>
      <h2>Prompt-output requirements</h2>
      <p>The publishing gate also treats instructional verbs as required output. “Draw” requires rendered diagram media; “show working” requires multiple calculation steps; “compare” requires both sides across multiple dimensions; “give reason” requires a causal explanation; and “derive” requires ordered equation steps and a conclusion. A displayed worked-step count is derived only from non-empty rendered steps.</p>
      <h2>Question-specific page experience</h2>
      <p>An indexable question page must also load its own direct-answer summary, exact board-to-exercise context, source revision, automated publishing-gate date, human-review status and working academic-error link. The main solution keeps the structure present in that question’s source data: worked steps, reasoning, formulae, substitutions, units, arithmetic, diagrams and a separated final answer where applicable.</p>
      <p>Similar-question links are selected from the same mapped exercise. Alternative methods, common mistakes and previous-year sections are shown only when the current question or its mapped chapter contains supporting source fields. They are omitted when that evidence is absent; a repeated filler paragraph is never substituted.</p>
      <p>Where a source record names a textbook edition, the page displays it as the verification edition. Where it does not, the page says that edition metadata is unavailable and makes no edition-specific verification claim.</p>
      <h2>Review labels and corrections</h2>
      <p><strong>Internal mapping consistent</strong> means the catalog route and imported payload agree. <strong>Authoritative textbook mapping verified</strong> appears only after a separate textbook comparison is recorded. <strong>Automated arithmetic checks passed</strong> means a machine check found a calculation pattern and found no mismatch in its stated result. <strong>Diagram checked against source</strong> appears only when the source record contains an explicit visual-verification flag. None of these labels means expert review.</p>
      <p>Unless a real person, qualification, review date, textbook edition and academic year are recorded together, the page says <strong>Editorial review pending</strong>. See the <a href="/reviewers">reviewer registry</a> and <a href="/corrections">corrections history</a>.</p>
      <h2>Hindi and Tamil text quality</h2>
      <p>Localized imports are normalized to Unicode NFC and checked for mixed-script confusables, missing Devanagari vowel marks, OCR or encoding damage, broken Tamil combining sequences, accidental transliteration and malformed scientific symbols. A damaged title is never repaired by guessing: only a source-verified correction can make that edition publishable.</p>
      <p>Each verified language edition keeps its own URL, page language and self-canonical link. Reciprocal <code>hreflang</code> is added only for verified equivalents. Unresolved Hindi or Tamil editions are removed from discovery and held under <code>noindex</code> until review is complete.</p>
      <h2>Accuracy, quality and scaled content</h2>
      <p>Google’s current guidance focuses on accuracy, quality, relevance and added value, and warns that generating many pages without value can violate its scaled-content policy. StudyWudy therefore gates each answer by usefulness for its format rather than by who or what produced it.</p>
      <p><a href="https://developers.google.com/search/docs/fundamentals/creating-helpful-content" rel="noreferrer">Google: creating helpful, reliable, people-first content</a><br><a href="https://developers.google.com/search/docs/fundamentals/using-gen-ai-content" rel="noreferrer">Google: generative AI content guidance</a></p>
      <h2>What this does not promise</h2>
      <p>Technical eligibility and sitemap inclusion do not guarantee indexing or ranking. Search engines make their own assessment of usefulness, originality, authority and relevance. Students should compare solutions with the current textbook and teacher guidance.</p>
      <p><a href="/boards">Browse textbooks and chapters →</a></p>`,
  });
}

function reviewersPage(request) {
  const namedProfiles = MANUAL_REVIEWER_PROFILES.map((profile) => `<a href="/reviewers/${escapeHtml(profile.slug)}"><strong>${escapeHtml(profile.name)}</strong><span>${escapeHtml(profile.qualification)}</span></a>`).join("");
  return legalPage({
    request,
    path: "/reviewers",
    title: "Reviewer Registry and Review Status | StudyWudy",
    description: "See which StudyWudy checks are automated, which pages have a verified named academic reviewer, and what evidence a reviewer label requires.",
    eyebrow: "Human review registry",
    heading: "Reviewer registry",
    lede: "A publishing gate is not a person. This registry lists named academic reviewers only when their identity, qualification and page-level review evidence have been recorded.",
    schemaType: "CollectionPage",
    modifiedAt: TRUST_POLICY_UPDATED_AT,
    body: `<div class="trust-counts"><div><strong>${TRUST_TRANSPARENCY_SUMMARY.namedAcademicReviewerCount}</strong><span>verified named academic reviewer profiles</span></div><div><strong>${TRUST_TRANSPARENCY_SUMMARY.manuallyReviewedQuestionCount}</strong><span>question records with valid manual-review evidence</span></div><div><strong>${TRUST_TRANSPARENCY_SUMMARY.recordedCorrectionCount}</strong><span>dated academic answer corrections</span></div></div>
      <section class="phase5-note"><strong>Current status: editorial review pending.</strong><p>The recovered question corpus does not contain a verified academic reviewer name, qualification, review date, textbook edition and academic year together. Question pages therefore do not show a “Reviewed by” claim.</p></section>
      <h2>What a named reviewer profile requires</h2><ul><li>the reviewer’s real name;</li><li>a real, relevant qualification;</li><li>a description of the review scope;</li><li>a page-level reviewed-on date;</li><li>the textbook edition and academic year checked; and</li><li>a durable link from the reviewed answer to this profile.</li></ul>
      <div class="trust-profile-links">${namedProfiles}<a href="/reviewers/studywudy-editorial-process"><strong>StudyWudy editorial process</strong><span>What automated and human checks mean</span></a><a href="/reviewers/aman-bhagat"><strong>Aman Bhagat</strong><span>Publisher and corrections contact—not listed as an academic reviewer</span></a></div>
      <h2>Why there is no default team credit</h2><p>A generic “editorial team” label does not prove who checked an answer or what they were qualified to check. StudyWudy keeps the pending label until the complete evidence record exists.</p>`,
  });
}

function publisherProfilePage(request) {
  return legalPage({
    request,
    path: "/reviewers/aman-bhagat",
    title: "Aman Bhagat – StudyWudy Publisher and Corrections Contact",
    description: "Aman Bhagat's documented StudyWudy role, its limits, and why it is not used as an academic reviewer credit without qualification and page-level review evidence.",
    eyebrow: "Publisher profile",
    heading: "Aman Bhagat",
    lede: "Aman Bhagat is identified as StudyWudy’s publisher and contact for privacy, grievance and content-correction requests. That operational role is not presented as academic review.",
    modifiedAt: TRUST_POLICY_UPDATED_AT,
    breadcrumbParent: { name: "Reviewer registry", path: "/reviewers" },
    body: `<div class="trust-boundary"><section><h2>Recorded role</h2><p>Publisher and named contact for StudyWudy’s managed correction channel.</p><p><a href="/contact">Send a correction request →</a></p></section><section><h2>Academic-review boundary</h2><p>No academic qualification or page-level reviewer assignment is recorded in the recovered solution data. Question pages therefore do not say “Reviewed by Aman Bhagat”.</p></section></div>
      <h2>What this profile verifies</h2><p>It gives students, parents and teachers a named route for reporting academic errors and explains who manages that route. It does not claim subject expertise, textbook-edition verification or manual review of every answer.</p>
      <h2>When the label would change</h2><p>If Aman Bhagat or another real reviewer completes an academic review, the question record must also store the relevant qualification, exact reviewed-on date, textbook edition and academic year before a “Reviewed by” label can appear.</p>`,
  });
}

function editorialProcessPage(request) {
  return legalPage({
    request,
    path: "/reviewers/studywudy-editorial-process",
    title: "StudyWudy Editorial Process – Automated vs Human Review",
    description: "Understand the boundary between StudyWudy source checks, automated validation, diagram verification and named human academic review.",
    eyebrow: "Process profile",
    heading: "StudyWudy editorial process",
    lede: "This is a process profile, not a person or an academic qualification. It explains exactly what each trust label on a solution page proves.",
    modifiedAt: TRUST_POLICY_UPDATED_AT,
    breadcrumbParent: { name: "Reviewer registry", path: "/reviewers" },
    body: `<div class="trust-boundary"><section><h2>Recorded automated evidence</h2><p><strong>Internal mapping consistent</strong> checks the catalog and imported payload. It is not an authoritative textbook-verification claim.</p><p><strong>Authoritative textbook mapping verified</strong> requires a separately recorded source comparison.</p><p><strong>Automated arithmetic checks passed</strong> checks detected arithmetic expressions and their stated results.</p><p><strong>Diagram checked against source</strong> requires an explicit diagram-verification record.</p></section><section><h2>Human academic review</h2><p><strong>Editorial review pending</strong> is the default when no valid named review exists.</p><p><strong>Reviewed by</strong> appears only with a real profile, qualification, date, edition and academic year.</p></section></div>
      <h2>Fail-closed wording</h2><p>Missing evidence removes the stronger label. A diagram’s presence does not prove it was checked. A successful calculation test does not prove every scientific premise. A publishing date is not a manual review date.</p>
      <h2>Corrections</h2><p>A submitted report is a request, not a correction record. The public <a href="/corrections">corrections history</a> changes only when an answer change has a verified date and summary.</p>`,
  });
}

function correctionsPage(request) {
  const entries = QUESTION_CORRECTIONS.length
    ? QUESTION_CORRECTIONS.map((entry) => `<article id="${escapeHtml(entry.questionId)}"><h2>${escapeHtml(entry.questionId)}</h2><p><strong>Corrected on ${escapeHtml(entry.correctedOn)}</strong></p><p>${escapeHtml(entry.summary)}</p><p><a href="${escapeHtml(entry.pathname)}">Open the corrected answer →</a></p></article>`).join("")
    : `<article class="is-pending"><h2>No dated academic answer corrections recorded</h2><p>The recovered answer dataset does not contain a verified correction date and change summary. This empty state is intentional; import clean-ups and automated checks are not being relabelled as academic answer corrections.</p></article>`;
  return legalPage({
    request,
    path: "/corrections",
    title: "Academic Answer Corrections History | StudyWudy",
    description: "A dated public ledger of verified StudyWudy academic answer changes, kept separate from pending reports and import clean-ups.",
    eyebrow: "Public change ledger",
    heading: "Corrections history",
    lede: "When an academic answer changes, its correction date and a concise change note appear here and on the question page. Pending reports are not published as corrections.",
    schemaType: "CollectionPage",
    modifiedAt: TRUST_POLICY_UPDATED_AT,
    body: `<section class="trust-ledger">${entries}</section>
      <h2>What enters this ledger</h2><ul><li>the canonical question ID;</li><li>the date the answer changed;</li><li>a specific summary of what was corrected; and</li><li>a link back to the affected answer.</li></ul>
      <h2>Report a possible error</h2><p>Use the “Report an academic error” link on a question page so its canonical URL is included automatically, or <a href="/contact?request_type=content_correction">open the correction form</a>.</p>`,
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
  const requestedType = url.searchParams.get("request_type") === "content_correction" ? "content_correction" : "";
  const requestedPage = String(url.searchParams.get("page_url") || "").trim();
  const correctionPage = requestedPage.startsWith("/") && requestedPage.length <= 900 && !/[\r\n]/u.test(requestedPage)
    ? requestedPage
    : "";
  const correctionMessage = correctionPage
    ? `Possible academic error on: ${correctionPage}\n\nWhat appears incorrect or unclear:\n`
    : "";
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
        <label>Request type<select name="request_type" required><option value="">Choose one</option><option value="privacy">Privacy or data request</option><option value="grievance">DPDP grievance</option><option value="content_correction"${requestedType ? " selected" : ""}>Academic solution error</option><option value="copyright">Copyright or legal notice</option><option value="technical">Technical problem</option><option value="other">Other</option></select></label>
        <label>Message<textarea name="message" minlength="20" maxlength="3000" required placeholder="Include the page URL and enough detail to investigate. Avoid student personal data.">${escapeHtml(correctionMessage)}</textarea></label>
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
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/about/methodology") return methodologyPage(request);
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/reviewers") return reviewersPage(request);
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/reviewers/aman-bhagat") return publisherProfilePage(request);
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/reviewers/studywudy-editorial-process") return editorialProcessPage(request);
  if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/corrections") return correctionsPage(request);
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
