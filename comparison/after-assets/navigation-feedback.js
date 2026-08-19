(() => {
  if (window.__STUDYWUDY_NAVIGATION_FEEDBACK__) return;
  window.__STUDYWUDY_NAVIGATION_FEEDBACK__ = true;

  const root = document.documentElement;
  let active = false;
  let slowTimer = 0;
  let safetyTimer = 0;
  let loader;
  let message;

  function ensureInterface() {
    if (loader?.isConnected) return;
    const progress = document.createElement("div");
    progress.className = "sw-route-progress";
    progress.setAttribute("aria-hidden", "true");
    progress.innerHTML = '<span class="sw-route-progress__bar"></span>';

    loader = document.createElement("div");
    loader.className = "sw-route-loader";
    loader.setAttribute("aria-hidden", "true");
    loader.setAttribute("aria-live", "polite");
    loader.setAttribute("aria-atomic", "true");
    loader.setAttribute("role", "status");
    loader.innerHTML = `
      <div class="sw-route-loader__sheet">
        <div class="sw-route-loader__brand" aria-hidden="true">
          <span class="sw-route-loader__mark">S</span>
          <b>StudyWudy</b>
        </div>
        <div class="sw-route-loader__content">
          <div class="sw-route-loader__book" aria-hidden="true">
            <span></span><i></i><b></b>
          </div>
          <div class="sw-route-loader__copy">
            <small>Turning to the right page</small>
            <strong data-sw-navigation-label>Opening the next page…</strong>
            <span class="sw-route-loader__line sw-route-loader__line--long" aria-hidden="true"></span>
            <span class="sw-route-loader__line sw-route-loader__line--short" aria-hidden="true"></span>
          </div>
        </div>
      </div>`;
    message = loader.querySelector("[data-sw-navigation-label]");
    document.body.append(progress, loader);
  }

  function clearFeedback() {
    window.clearTimeout(slowTimer);
    window.clearTimeout(safetyTimer);
    active = false;
    root.classList.remove("sw-route-pending", "sw-route-slow");
    if (loader) loader.setAttribute("aria-hidden", "true");
  }

  function wordsFromPath(url) {
    const part = url.pathname.split("/").filter(Boolean).at(-1) || "next page";
    try {
      return decodeURIComponent(part).replace(/[-_]+/g, " ");
    } catch {
      return part.replace(/[-_]+/g, " ");
    }
  }

  function destinationLabel(anchor, url) {
    const heading = anchor?.querySelector("h1, h2, h3, [data-navigation-label]");
    const source = heading?.textContent
      || anchor?.getAttribute("aria-label")
      || anchor?.getAttribute("title")
      || anchor?.textContent
      || wordsFromPath(url);
    const label = String(source || "next page").replace(/\s+/g, " ").trim();
    return label.length > 64 ? `${label.slice(0, 61).trim()}…` : label;
  }

  function beginFeedback(label) {
    ensureInterface();
    if (active) return;
    active = true;
    message.textContent = `Opening ${label || "the next page"}…`;
    loader.setAttribute("aria-hidden", "false");
    root.classList.add("sw-route-pending");
    slowTimer = window.setTimeout(() => root.classList.add("sw-route-slow"), 120);
    safetyTimer = window.setTimeout(clearFeedback, 30_000);
  }

  function internalDestination(event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!anchor || anchor.hasAttribute("download") || anchor.dataset.noNavigationFeedback === "true") return null;
    const target = (anchor.getAttribute("target") || "").toLowerCase();
    if (target && target !== "_self") return null;

    let url;
    try {
      url = new URL(anchor.href, location.href);
    } catch {
      return null;
    }
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return null;
    const current = new URL(location.href);
    if (url.pathname === current.pathname && url.search === current.search && url.hash) return null;
    if (url.href === current.href) return null;
    return { anchor, url };
  }

  document.addEventListener("click", (event) => {
    const destination = internalDestination(event);
    if (!destination) return;

    // The recovered Next router waits silently on an uncached RSC request. A
    // document navigation can use the edge-cached HTML and gives us a reliable
    // transition boundary on every template.
    event.preventDefault();
    beginFeedback(destinationLabel(destination.anchor, destination.url));
    requestAnimationFrame(() => location.assign(destination.url.href));
  }, true);

  if (window.navigation?.addEventListener) {
    window.navigation.addEventListener("navigate", (event) => {
      if (active || event.navigationType !== "traverse") return;
      try {
        const url = new URL(event.destination.url);
        if (url.origin === location.origin) beginFeedback(wordsFromPath(url));
      } catch {}
    });
  }

  addEventListener("pageshow", clearFeedback);
  addEventListener("beforeunload", () => root.classList.add("sw-route-pending"));

  function mountAfterHydration() {
    requestAnimationFrame(() => requestAnimationFrame(ensureInterface));
    // The recovered app hydrates the document root and can discard nodes added
    // during its first pass. Recheck once after that reconciliation finishes.
    window.setTimeout(ensureInterface, 250);
  }
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mountAfterHydration, { once: true });
  else mountAfterHydration();
})();
