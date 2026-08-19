(function () {
  "use strict";

  var STORAGE_KEY = "studywudy-theme";
  var root = document.documentElement;

  function storedTheme() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
    } catch (_error) {
      return "light";
    }
  }

  function setTheme(theme, persist) {
    var dark = theme === "dark";
    root.dataset.theme = dark ? "dark" : "light";
    if (persist) {
      try {
        window.localStorage.setItem(STORAGE_KEY, dark ? "dark" : "light");
      } catch (_error) {
        // The theme still works when storage is unavailable.
      }
    }

    var button = document.querySelector("[data-studywudy-theme-toggle]");
    if (button) {
      button.setAttribute("aria-pressed", String(dark));
      button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      button.title = dark ? "Switch to light mode" : "Switch to dark mode";
      button.querySelector("[data-theme-icon]").textContent = dark ? "☀" : "☾";
    }
  }

  function mountToggle() {
    if (document.querySelector("[data-studywudy-theme-toggle]")) return;
    var actions = document.querySelector(".site-header .header-actions");
    if (!actions) return;

    var button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";
    button.dataset.studywudyThemeToggle = "true";
    button.innerHTML = '<span aria-hidden="true" data-theme-icon></span>';
    button.addEventListener("click", function () {
      setTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
    });
    actions.prepend(button);
    setTheme(root.dataset.theme, false);
  }

  function mountAfterHydration(attempt) {
    if (document.querySelector("next-route-announcer") || attempt >= 300) {
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(mountToggle);
      });
      return;
    }
    window.requestAnimationFrame(function () {
      mountAfterHydration(attempt + 1);
    });
  }

  setTheme(storedTheme(), false);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { mountAfterHydration(0); }, { once: true });
  } else {
    mountAfterHydration(0);
  }
})();
