export const PUBLIC_BRAND_HYGIENE_RELEASE = "public-copy-metadata-v1";

export const TEMPORARY_DEPLOYMENT_ORIGIN =
  "https://studywudy-board-solutions.amanbhagat17089.workers.dev";

export const PUBLIC_BRAND_REPLACEMENT =
  "StudyWudy’s answer renderer supports nine structural formats covering 17 specific question types.";

const LEGACY_HOMEPAGE_COPY =
  "StudyWudy’s renderer mirrors all nine structural patterns in Boardly, covering 17 specific question types.";

const LEGACY_HOST_PATTERN = /https?:\/\/[a-z0-9.-]*workers\.dev(?=[:/\s"'<]|$)/giu;
const LEGACY_BOARDLY_DOMAIN_PATTERN = /https?:\/\/(?:www\.)?boardly\.in(?=[:/\s"'<]|$)/giu;

export const FORBIDDEN_PUBLIC_BRAND_PATTERNS = Object.freeze([
  Object.freeze({ label: "Boardly", pattern: /\bBoardly\b/iu }),
  Object.freeze({ label: "boardly.in", pattern: /boardly\.in/iu }),
  Object.freeze({ label: "Study Wudy", pattern: /Study[\t ]+Wudy/iu }),
  Object.freeze({ label: "StudyWudy-board-solutions", pattern: /StudyWudy-board-solutions/iu }),
  Object.freeze({ label: "amanbhagat17089", pattern: /amanbhagat17089/iu }),
  Object.freeze({ label: "workers.dev", pattern: /workers\.dev/iu }),
]);

function decodeHtmlEntities(value) {
  const named = Object.freeze({
    amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"',
  });
  return String(value).replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/giu, (entity, decimal, hexadecimal, name) => {
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
    return named[name.toLowerCase()] || entity;
  });
}

function escapePattern(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function normalizedOrigin(value) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Public origin must use HTTP or HTTPS");
  if (/^(?:localhost|127\.0\.0\.1)$/u.test(parsed.hostname)) return TEMPORARY_DEPLOYMENT_ORIGIN;
  return parsed.origin;
}

export function publicDocumentUrl(requestUrl) {
  const canonical = new URL(requestUrl);
  canonical.search = "";
  canonical.hash = "";
  if (/^(?:localhost|127\.0\.0\.1)$/u.test(canonical.hostname)) {
    const deployment = new URL(TEMPORARY_DEPLOYMENT_ORIGIN);
    canonical.protocol = deployment.protocol;
    canonical.host = deployment.host;
    canonical.port = "";
  }
  return canonical.toString();
}

export function repairPublicBrandCopy(value) {
  return String(value ?? "")
    .replaceAll(LEGACY_HOMEPAGE_COPY, PUBLIC_BRAND_REPLACEMENT)
    .replace(/Boardly pattern/giu, "Answer format")
    .replace(/Boardly catalog/giu, "StudyWudy catalog")
    .replace(/Study\s+Wudy/giu, "StudyWudy")
    .replace(/StudyWudy-board-solutions/giu, "StudyWudy")
    .replace(/boardly\.in/giu, "StudyWudy")
    .replace(/amanbhagat17089/giu, "StudyWudy")
    .replace(/[a-z0-9.-]*workers\.dev/giu, "StudyWudy")
    .replace(/\bBoardly\b/giu, "StudyWudy");
}

export function rewritePublicMetadataValue(value, requestUrl) {
  const origin = normalizedOrigin(requestUrl);
  const placeholder = "__STUDYWUDY_PUBLIC_ORIGIN__";
  return repairPublicBrandCopy(
    String(value ?? "")
      .replace(/\/boardly-media(?=\/|$)/giu, "/studywudy-media")
      .replace(LEGACY_BOARDLY_DOMAIN_PATTERN, placeholder)
      .replace(LEGACY_HOST_PATTERN, placeholder),
  ).replaceAll(placeholder, origin);
}

export function rewritePublicAssetPath(value) {
  return String(value ?? "").replace(/\/boardly-media(?=\/|$)/giu, "/studywudy-media");
}

export function rewritePublicInfrastructureOrigin(value, requestUrl) {
  const origin = normalizedOrigin(requestUrl);
  return String(value ?? "")
    .replace(LEGACY_BOARDLY_DOMAIN_PATTERN, origin)
    .replace(LEGACY_HOST_PATTERN, origin);
}

function tagName(token) {
  return token.match(/^<\/?\s*([a-z][\w:-]*)/iu)?.[1]?.toLowerCase() || "";
}

function publicTextNodes(html) {
  const excluded = new Set(["script", "style", "template", "noscript"]);
  const stack = [];
  const nodes = [];
  const tokens = String(html ?? "").match(/<!--[\s\S]*?-->|<![^>]*>|<\/?[^>]+>|[^<]+/gu) || [];
  for (const token of tokens) {
    if (!token.startsWith("<")) {
      if (!stack.some((entry) => entry.excluded)) nodes.push(decodeHtmlEntities(token));
      continue;
    }
    if (/^<!--|^<!/u.test(token)) continue;
    const name = tagName(token);
    if (!name) continue;
    if (/^<\//u.test(token)) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].name !== name) continue;
        stack.length = index;
        break;
      }
      continue;
    }
    if (/\/\s*>$/u.test(token) || /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/u.test(name)) continue;
    stack.push({ name, excluded: excluded.has(name) || Boolean(stack.at(-1)?.excluded) });
  }
  return nodes.join("\n");
}

function publicCopyAttributes(html) {
  const values = [];
  const tags = String(html ?? "").match(/<[a-z][^>]*>/giu) || [];
  for (const tag of tags) {
    for (const match of tag.matchAll(/\b(?:alt|aria-label|placeholder|title)\s*=\s*(?:"([^"]*)"|'([^']*)')/giu)) {
      values.push(decodeHtmlEntities(match[1] ?? match[2] ?? ""));
    }
  }
  return values.join("\n");
}

function legacyPublicAssetPaths(html) {
  const values = [];
  const tags = String(html ?? "").match(/<[a-z][^>]*>/giu) || [];
  for (const tag of tags) {
    for (const match of tag.matchAll(/\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/giu)) {
      const value = decodeHtmlEntities(match[1] ?? match[2] ?? "");
      if (/\/boardly-media(?:\/|$)/iu.test(value)) values.push(value);
    }
  }
  return values;
}

function metadataSurface(html) {
  const source = String(html ?? "");
  const fragments = [];
  fragments.push(...(source.match(/<meta\b[^>]*>/giu) || []));
  fragments.push(...(source.match(/<link\b[^>]*\brel\s*=\s*(?:"canonical"|'canonical'|canonical)[^>]*>/giu) || []));
  fragments.push(...(source.match(/<title\b[^>]*>[\s\S]*?<\/title>/giu) || []));
  for (const match of source.matchAll(/<script\b[^>]*\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json')[^>]*>([\s\S]*?)<\/script>/giu)) {
    fragments.push(match[1]);
  }
  return decodeHtmlEntities(fragments.join("\n"));
}

function forbiddenMatches(surface, value) {
  return FORBIDDEN_PUBLIC_BRAND_PATTERNS
    .filter(({ pattern }) => pattern.test(value))
    .map(({ label }) => `${surface} contains ${label}`);
}

function withoutExpectedTemporaryOrigin(metadata, pageUrl) {
  const origin = normalizedOrigin(pageUrl);
  if (!new URL(origin).hostname.endsWith(".workers.dev")) return metadata;
  return String(metadata).replace(new RegExp(escapePattern(origin), "giu"), "");
}

export function inspectPublicBrandHtml(html, { pageUrl = TEMPORARY_DEPLOYMENT_ORIGIN } = {}) {
  const copy = `${publicTextNodes(html)}\n${publicCopyAttributes(html)}`;
  const metadata = withoutExpectedTemporaryOrigin(metadataSurface(html), pageUrl);
  const failures = [
    ...forbiddenMatches("public copy", copy),
    ...forbiddenMatches("metadata/JSON-LD", metadata),
  ];
  if (legacyPublicAssetPaths(html).length) failures.push("public asset URL contains Boardly");
  return Object.freeze({
    copy,
    metadata,
    failures: Object.freeze([...new Set(failures)]),
  });
}
