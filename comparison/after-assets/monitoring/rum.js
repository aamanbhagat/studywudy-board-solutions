(() => {
  "use strict";
  const api = globalThis.webVitals;
  if (!api || typeof api.onCLS !== "function" || typeof api.onINP !== "function" || typeof api.onLCP !== "function") return;
  // Lighthouse/Playwright measurements belong in the lab reports, not in the
  // field dataset. Keeping them out prevents throttled CI sessions from
  // masquerading as real student regressions.
  if (navigator.webdriver
    || /(?:Lighthouse|HeadlessChrome)/i.test(navigator.userAgent)
    || new URLSearchParams(location.search).has("__sw_lab")) return;

  const endpoint = "/api/monitoring/web-vitals";
  const send = ({ name, value, delta, rating, navigationType }) => {
    const payload = JSON.stringify({ name, value, delta, rating, navigationType });
    if (navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }))) return;
    fetch(endpoint, {
      method: "POST",
      body: payload,
      headers: { "content-type": "application/json" },
      credentials: "omit",
      keepalive: true,
    }).catch(() => {});
  };

  api.onCLS(send);
  api.onINP(send);
  api.onLCP(send);
})();
