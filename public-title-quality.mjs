export const PUBLIC_TITLE_QUALITY_RELEASE = "serp-visible-identity-v2";
export const HOMEPAGE_DOCUMENT_TITLE = "Textbook Solutions for CBSE, Maharashtra, ICSE and Tamil Nadu | StudyWudy";
// Question titles are built identifier-first so the part that tells two pages
// apart survives Google's ~60-character clip, and they carry no " | StudyWudy"
// suffix — there is no room for it beside a 33-character identifier, and Google
// appends the site name to the SERP line itself.
export const ACCOUNTANCY_SAMPLE_TITLE = "NCERT Company Cl12 Accountancy Ch1 Q1: A company is an…";
export const ACCOUNTANCY_SAMPLE_PATH = "/cbse/class-12/accountancy/ncert-accountancy-company-accounts-and-analysis-of-financial-statements-class-12/accounting-for-share-capital/questions/q-cbse-ncert-accountancy-company-accounts-and-analysis-of-financial-statements-class-12-1-001";

function decodeHtmlText(value) {
  return String(value ?? "")
    .replace(/&amp;/giu, "&")
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&quot;/giu, '"')
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/\s+/gu, " ")
    .trim();
}

export function titleFromHtml(html) {
  const match = String(html ?? "").match(/<title[^>]*>([\s\S]*?)<\/title>/iu);
  return match ? decodeHtmlText(match[1]) : "";
}

export function metadataTitleFromHtml(html, attributeValue) {
  for (const tag of String(html ?? "").match(/<meta\b[^>]*>/giu) || []) {
    const identity = tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/iu)?.[1];
    if (identity !== attributeValue) continue;
    return decodeHtmlText(tag.match(/\bcontent\s*=\s*["']([^"']*)["']/iu)?.[1] || "");
  }
  return "";
}

export function inspectPublicTitle({ html, pathname, privateRowId = null }) {
  const title = titleFromHtml(html);
  const failures = [];
  if (!title) failures.push("HTML title is missing");
  if (pathname === "/") {
    if (title !== HOMEPAGE_DOCUMENT_TITLE) failures.push("homepage title is not descriptive");
    if (metadataTitleFromHtml(html, "og:title") !== HOMEPAGE_DOCUMENT_TITLE) failures.push("homepage Open Graph title is not descriptive");
    if (metadataTitleFromHtml(html, "twitter:title") !== HOMEPAGE_DOCUMENT_TITLE) failures.push("homepage Twitter title is not descriptive");
  }
  if (pathname === ACCOUNTANCY_SAMPLE_PATH && title !== ACCOUNTANCY_SAMPLE_TITLE) failures.push("Accountancy sample title is not question-specific");
  if (/^whether\b|^the following\b/iu.test(title)) failures.push("title starts with a generic instruction fragment");
  if (/\bcatalogue reference\b/iu.test(title)) failures.push("title exposes a catalogue reference");
  if (privateRowId != null && new RegExp(`(?:^|[·#\\s])${String(privateRowId)}(?:$|[|·\\s])`, "u").test(title)) {
    failures.push("title exposes a private database row ID");
  }
  return Object.freeze({ title, failures: Object.freeze(failures) });
}
