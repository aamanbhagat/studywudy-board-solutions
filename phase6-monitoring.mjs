const PHASE6_RUM_PATH = "/api/monitoring/web-vitals";
const PHASE6_RUM_MAX_BYTES = 2_048;
const PHASE6_CLIENT_VERSION = "20260819-phase6-v2-real-user-only";
const PHASE6_METRICS = new Set(["CLS", "INP", "LCP"]);
const PHASE6_RATINGS = new Set(["good", "needs-improvement", "poor"]);
const PHASE6_NAVIGATION_TYPES = new Set([
  "navigate",
  "reload",
  "back-forward",
  "back-forward-cache",
  "prerender",
  "restore",
  "soft-navigation",
]);

const PHASE6_RUM_SCRIPTS = `<script src="/monitoring/web-vitals.iife.js?v=6.1.1" defer data-phase6-rum="library"></script><script src="/monitoring/rum.js?v=${PHASE6_CLIENT_VERSION}" defer data-phase6-rum="client"></script>`;

function noStoreResponse(body = null, status = 204, contentType = null) {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "cross-origin-resource-policy": "same-origin",
    "x-content-type-options": "nosniff",
  });
  if (contentType) headers.set("content-type", contentType);
  return new Response(body, { status, headers });
}

function jsonError(message, status) {
  return noStoreResponse(JSON.stringify({ error: message }), status, "application/json; charset=utf-8");
}

function finiteNumber(value, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function pageType(pathname) {
  if (pathname === "/") return "home";
  if (pathname === "/boards" || pathname === "/search") return "index";
  if (pathname.includes("/questions/")) return "question";
  if (/^\/(?:about|privacy|terms|contact)(?:\/|$)/.test(pathname)) return "trust";
  const depth = pathname.split("/").filter(Boolean).length;
  if (depth >= 5) return "chapter";
  if (depth >= 3) return "subject";
  return "index";
}

function sameOriginRequest(request, url) {
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) return false;
  const referer = request.headers.get("referer");
  if (!origin && !referer) return false;
  if (referer) {
    try {
      if (new URL(referer).origin !== url.origin) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function metricPath(request, url) {
  const referer = request.headers.get("referer");
  if (!referer) return "/";
  try {
    const parsed = new URL(referer);
    return parsed.origin === url.origin ? parsed.pathname.slice(0, 1_024) || "/" : "/";
  } catch {
    return "/";
  }
}

async function webVitalsResponse(request, environment) {
  if (request.method === "OPTIONS") {
    return noStoreResponse(null, 204);
  }
  if (request.method !== "POST") return jsonError("Method not allowed", 405);
  const url = new URL(request.url);
  if (!sameOriginRequest(request, url)) return jsonError("Same-origin metric submissions only", 403);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > PHASE6_RUM_MAX_BYTES) return jsonError("Payload too large", 413);
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > PHASE6_RUM_MAX_BYTES) return jsonError("Payload too large", 413);

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const name = String(payload?.name || "").toUpperCase();
  const rating = String(payload?.rating || "");
  const navigationType = String(payload?.navigationType || "navigate");
  const maximum = name === "CLS" ? 20 : 120_000;
  const value = finiteNumber(payload?.value, 0, maximum);
  const delta = finiteNumber(payload?.delta, 0, maximum);
  if (!PHASE6_METRICS.has(name) || !PHASE6_RATINGS.has(rating) || !PHASE6_NAVIGATION_TYPES.has(navigationType) || value === null || delta === null) {
    return jsonError("Invalid web-vitals metric", 400);
  }
  const pathname = metricPath(request, url);
  const template = pageType(pathname);
  // Analytics Engine adds its own timestamp. Deliberately omit IP, user agent,
  // cookie values and the web-vitals page-load ID: none are needed to catch a
  // template regression, and this site is child-directed.
  if (environment.WEB_VITALS && typeof environment.WEB_VITALS.writeDataPoint === "function") {
    environment.WEB_VITALS.writeDataPoint({
      indexes: [`${name}:${template}`],
      blobs: [name, rating, template, pathname, navigationType, PHASE6_CLIENT_VERSION],
      doubles: [value, delta],
    });
  } else if (environment.DB && typeof environment.DB.prepare === "function") {
    await environment.DB.prepare(`INSERT INTO phase6_web_vitals
      (recorded_at, metric, value, delta, rating, template, pathname, navigation_type, client_version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        Math.floor(Date.now() / 1000),
        name,
        value,
        delta,
        rating,
        template,
        pathname,
        navigationType,
        PHASE6_CLIENT_VERSION,
      )
      .run();
  } else {
    return jsonError("Metrics dataset unavailable", 503);
  }
  return noStoreResponse(null, 204);
}

export async function cleanupPhase6WebVitals(environment, retentionDays = 90) {
  if (!environment.DB || typeof environment.DB.prepare !== "function") return { deleted: 0 };
  const cutoff = Math.floor(Date.now() / 1000) - Math.max(1, retentionDays) * 86_400;
  const result = await environment.DB.prepare("DELETE FROM phase6_web_vitals WHERE recorded_at < ?")
    .bind(cutoff)
    .run();
  return { deleted: Number(result.meta?.changes || 0), cutoff };
}

export async function handlePhase6Request(request, environment) {
  const url = new URL(request.url);
  if (url.pathname === PHASE6_RUM_PATH) return webVitalsResponse(request, environment);
  return null;
}

export function enhancePhase6Response(request, response) {
  if (request.method !== "GET" || response.status >= 400 || typeof globalThis.HTMLRewriter !== "function") return response;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("text/html")) return response;

  let hasLibrary = false;
  let hasClient = false;
  const rewriter = new globalThis.HTMLRewriter()
    .on('script[data-phase6-rum="library"]', { element() { hasLibrary = true; } })
    .on('script[data-phase6-rum="client"]', { element() { hasClient = true; } })
    .on("head", {
      element(element) {
        element.onEndTag((endTag) => {
          if (!hasLibrary || !hasClient) endTag.before(PHASE6_RUM_SCRIPTS, { html: true });
        });
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

export const PHASE6_MONITORING = Object.freeze({
  endpoint: PHASE6_RUM_PATH,
  clientVersion: PHASE6_CLIENT_VERSION,
  metrics: Object.freeze([...PHASE6_METRICS]),
  storesPersonalIdentifiers: false,
  d1RetentionDays: 90,
});
