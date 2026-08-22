export const RENDER_CONSISTENCY_RELEASE = "html-cache-invariant-v1";

// Shared caches may keep the transformed document for one hour, but browsers
// must revalidate on every navigation so a deployment cannot leave route-level
// renderer variants in a client's cache.
export const PUBLIC_HTML_CACHE_CONTROL = "public, max-age=0, must-revalidate, s-maxage=3600";

export function inspectPublicHtmlCacheControl(value) {
  const cacheControl = String(value ?? "").toLowerCase();
  const failures = [];
  if (!/(?:^|,)\s*public(?:\s*,|$)/u.test(cacheControl)) failures.push("public directive is missing");
  if (!/(?:^|,)\s*max-age=0(?:\s*,|$)/u.test(cacheControl)) failures.push("browser max-age is not zero");
  if (!/(?:^|,)\s*must-revalidate(?:\s*,|$)/u.test(cacheControl)) failures.push("must-revalidate is missing");
  if (!/(?:^|,)\s*s-maxage=(?:[1-9]\d*)(?:\s*,|$)/u.test(cacheControl)) failures.push("shared-cache lifetime is missing");
  if (/(?:^|,)\s*stale-while-revalidate(?:=|\s*,|$)/u.test(cacheControl)) failures.push("stale-while-revalidate is forbidden for public HTML");
  if (/(?:^|,)\s*(?:private|no-store)(?:\s*,|$)/u.test(cacheControl)) failures.push("public HTML is marked private or no-store");
  return Object.freeze(failures);
}
