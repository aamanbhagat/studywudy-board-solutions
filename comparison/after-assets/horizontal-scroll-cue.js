(() => {
  "use strict";

  const selector = ".standalone-question-page .question-table-scroll";
  const idleDelay = 1400;
  const initialDelay = 2400;
  const states = new WeakMap();

  function update(state) {
    const { cue, scroller, thumb } = state;
    const maximum = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const scrollable = maximum > 2;
    scroller.classList.toggle("has-horizontal-scroll-cue", scrollable);
    cue.hidden = !scrollable;
    if (!scrollable) return false;

    const thumbPercent = Math.max(18, Math.min(100, (scroller.clientWidth / scroller.scrollWidth) * 100));
    const progress = Math.max(0, Math.min(1, scroller.scrollLeft / maximum));
    thumb.style.width = `${thumbPercent}%`;
    thumb.style.left = `${progress * (100 - thumbPercent)}%`;
    return true;
  }

  function show(state, delay = idleDelay) {
    if (!update(state)) return;
    clearTimeout(state.timer);
    state.cue.classList.add("is-visible");
    state.timer = window.setTimeout(() => state.cue.classList.remove("is-visible"), delay);
  }

  function enhance(scroller) {
    if (states.has(scroller)) return;
    const cue = document.createElement("div");
    const thumb = document.createElement("span");
    cue.className = "question-horizontal-scroll-cue";
    cue.setAttribute("aria-hidden", "true");
    cue.append(thumb);
    scroller.insertAdjacentElement("afterend", cue);
    if (!scroller.hasAttribute("tabindex")) scroller.tabIndex = 0;
    if (!scroller.hasAttribute("aria-label")) scroller.setAttribute("aria-label", "Scrollable table");

    const state = { cue, scroller, thumb, timer: 0 };
    states.set(scroller, state);
    update(state);
    scroller.addEventListener("scroll", () => show(state), { passive: true });
    scroller.addEventListener("pointerdown", () => show(state, initialDelay), { passive: true });
    scroller.addEventListener("touchstart", () => show(state, initialDelay), { passive: true });
    scroller.addEventListener("focusin", () => show(state, initialDelay));
    scroller.addEventListener("keydown", () => show(state, initialDelay));
    scroller.addEventListener("pointerenter", () => show(state, initialDelay), { passive: true });

    if ("ResizeObserver" in window) new ResizeObserver(() => update(state)).observe(scroller);
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        show(state, initialDelay);
        observer.disconnect();
      }, { threshold: 0.2 });
      observer.observe(scroller);
    } else {
      show(state, initialDelay);
    }
  }

  function initialize() {
    document.querySelectorAll(selector).forEach(enhance);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
