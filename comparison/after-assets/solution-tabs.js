(() => {
  "use strict";

  // The Worker ships every answer view as a visible, labelled block so the page is
  // complete without this file. All this does is upgrade the labels the Worker
  // already rendered into a real tablist and hide the views that are not showing.
  //
  // The panels are siblings of the label list rather than its children, because the
  // stylesheet reaches the worked solution through `.solution-body>div>section` and
  // wrapping them would drop that rule family.
  const selector = ".standalone-question-page .solution-body .solution-tab-list";
  const enhanced = new WeakSet();

  function select(state, index, moveFocus) {
    const target = Math.max(0, Math.min(state.tabs.length - 1, index));
    state.tabs.forEach((tab, position) => {
      const active = position === target;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
      state.panels[position].classList.toggle("is-active", active);
    });
    if (moveFocus) state.tabs[target].focus();
  }

  function enhance(list) {
    if (enhanced.has(list)) return;
    const body = list.parentElement;
    const tabs = [...list.querySelectorAll(".solution-tab")];
    const panels = tabs
      .map((tab) => body && body.querySelector(`:scope > [data-solution-panel="${CSS.escape(tab.dataset.solutionTab || "")}"]`));
    // A label with no panel would hide a view with no way back to it.
    if (!body || tabs.length < 2 || panels.some((panel) => !panel)) return;
    enhanced.add(list);

    // The Worker ships the list as role="group" because the labels are not
    // interactive until this runs.
    list.setAttribute("role", "tablist");
    const state = { tabs, panels };
    tabs.forEach((tab, index) => {
      const panel = panels[index];
      if (!tab.id) tab.id = `${panel.id}-tab`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", panel.id);
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
      panel.tabIndex = 0;
      tab.addEventListener("click", () => select(state, index, false));
      tab.addEventListener("keydown", (event) => {
        const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 }[event.key];
        if (step) {
          event.preventDefault();
          select(state, (index + step + tabs.length) % tabs.length, true);
          return;
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          select(state, event.key === "Home" ? 0 : tabs.length - 1, true);
          return;
        }
        // The labels are spans so that they stay inert without this script; as
        // tabs they have to answer to Enter and Space themselves.
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select(state, index, false);
        }
      });
    });

    const opening = Math.max(0, tabs.findIndex((tab) => tab.classList.contains("is-active")));
    list.setAttribute("data-solution-tabs", "ready");
    select(state, opening, false);
  }

  function initialize() {
    document.querySelectorAll(selector).forEach(enhance);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
