(() => {
  "use strict";

  const root = document.querySelector("#quick-find .board-explorer");
  if (!root || root.dataset.finderReady === "true") return;
  root.dataset.finderReady = "true";

  const controls = {
    board: root.querySelector("#board"),
    grade: root.querySelector("#class"),
    subject: root.querySelector("#subject"),
  };
  const go = root.querySelector(".explorer-go");
  if (!controls.board || !controls.grade || !controls.subject || !go) return;

  const state = { board: "maharashtra-board", grade: "class-12", subject: "physics" };
  const cache = new Map();
  let requestSequence = 0;
  const valueNode = (button) => button.querySelector(".select-value");
  const selectRoot = (button) => button.closest(".custom-select");
  const menuId = (key) => `${controls[key].id}-listbox`;

  function close(key, restoreFocus = false) {
    const button = controls[key];
    selectRoot(button).classList.remove("is-open");
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-activedescendant");
    selectRoot(button).querySelector(".select-menu")?.remove();
    if (restoreFocus) button.focus();
  }

  function closeAll(except = "") {
    for (const key of Object.keys(controls)) if (key !== except) close(key);
  }

  function setGoHref() {
    go.href = `/${encodeURIComponent(state.board)}/${encodeURIComponent(state.grade)}/${encodeURIComponent(state.subject)}`;
  }

  async function fetchItems(step, params = {}) {
    const search = new URLSearchParams({ step, ...params });
    const key = search.toString();
    if (cache.has(key)) return cache.get(key);
    const response = await fetch(`/api/quick-find?${key}`, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error(`Finder request failed (${response.status})`);
    const payload = await response.json();
    const items = Array.isArray(payload.items) ? payload.items : [];
    cache.set(key, items);
    return items;
  }

  function endpoint(key) {
    if (key === "board") return ["boards", {}];
    if (key === "grade") return ["grades", { board: state.board }];
    return ["subjects", { board: state.board, grade: state.grade }];
  }

  function moveOption(menu, delta) {
    const options = [...menu.querySelectorAll("button.select-option")];
    if (!options.length) return;
    const current = Math.max(0, options.indexOf(document.activeElement));
    const next = delta === "home" ? 0
      : delta === "end" ? options.length - 1
      : (current + delta + options.length) % options.length;
    options[next].focus();
    controls[menu.dataset.key].setAttribute("aria-activedescendant", options[next].id);
  }

  function renderMenu(key, items) {
    const button = controls[key];
    const select = selectRoot(button);
    select.querySelector(".select-menu")?.remove();
    const menu = document.createElement("div");
    menu.className = "select-menu";
    menu.id = menuId(key);
    menu.dataset.key = key;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Available options");
    const selectedIndex = Math.max(0, items.findIndex((item) => item.id === state[key]));

    items.forEach((item, index) => {
      const selected = item.id === state[key];
      const option = document.createElement("button");
      option.type = "button";
      option.id = `${menu.id}-option-${index}`;
      option.className = `select-option${selected ? " is-selected" : ""}${index === selectedIndex ? " is-active" : ""}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(selected));
      option.tabIndex = -1;
      option.innerHTML = `<span aria-hidden="true" class="select-option-dot"></span><span></span><span aria-hidden="true" class="select-option-check">${selected ? "✓" : ""}</span>`;
      option.children[1].textContent = item.label;
      option.addEventListener("click", () => choose(key, item));
      option.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          moveOption(menu, event.key === "ArrowDown" ? 1 : -1);
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          moveOption(menu, event.key.toLowerCase());
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          option.click();
        } else if (event.key === "Escape") {
          event.preventDefault();
          close(key, true);
        }
      });
      menu.append(option);
    });

    if (!items.length) {
      const empty = document.createElement("span");
      empty.className = "select-option";
      empty.textContent = "No options available";
      menu.append(empty);
    }
    select.append(menu);
    select.classList.add("is-open");
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-controls", menu.id);
    const active = menu.querySelector(".is-active");
    if (active?.id) button.setAttribute("aria-activedescendant", active.id);
  }

  async function open(key, focusOption = false) {
    closeAll(key);
    const button = controls[key];
    const select = selectRoot(button);
    if (select.classList.contains("is-open")) return close(key);
    const sequence = ++requestSequence;
    button.setAttribute("aria-busy", "true");
    try {
      const [step, params] = endpoint(key);
      const items = await fetchItems(step, params);
      if (sequence !== requestSequence) return;
      renderMenu(key, items);
      if (focusOption) select.querySelector("button.is-active")?.focus();
    } catch {
      if (sequence === requestSequence) renderMenu(key, []);
    } finally {
      button.removeAttribute("aria-busy");
    }
  }

  async function choose(key, item) {
    state[key] = item.id;
    valueNode(controls[key]).textContent = item.label;
    close(key, true);
    if (key === "board") {
      const grades = await fetchItems("grades", { board: state.board });
      const grade = grades.find((candidate) => candidate.id === "class-12") || grades[0];
      if (!grade) return;
      state.grade = grade.id;
      valueNode(controls.grade).textContent = grade.label;
      const subjects = await fetchItems("subjects", { board: state.board, grade: state.grade });
      const subject = subjects.find((candidate) => candidate.id === "physics") || subjects[0];
      if (!subject) return;
      state.subject = subject.id;
      valueNode(controls.subject).textContent = subject.label;
    } else if (key === "grade") {
      const subjects = await fetchItems("subjects", { board: state.board, grade: state.grade });
      const subject = subjects.find((candidate) => candidate.id === state.subject)
        || subjects.find((candidate) => candidate.id === "physics")
        || subjects[0];
      if (!subject) return;
      state.subject = subject.id;
      valueNode(controls.subject).textContent = subject.label;
    }
    setGoHref();
  }

  for (const [key, button] of Object.entries(controls)) {
    button.addEventListener("click", () => open(key));
    button.addEventListener("keydown", (event) => {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        open(key, true);
      } else if (event.key === "Escape") close(key);
    });
  }
  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target)) closeAll();
  });
  setGoHref();
})();
