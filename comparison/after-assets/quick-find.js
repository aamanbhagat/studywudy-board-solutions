const quickFindMarkup = `<section class="qf-section" id="quick-find" aria-labelledby="qf-heading" data-quick-find>
  <div class="qf-shell"><div class="qf-layout">
    <div class="qf-copy">
      <p class="qf-kicker">Find your learning path</p>
      <h2 id="qf-heading">Your path. <em>Straight to your textbooks.</em></h2>
      <p>Choose your board, class and subject in the order you already know. Change any step without starting over.</p>
    </div>
    <div class="qf-panel" aria-live="polite">
      <div class="qf-panel-top"><span class="qf-counter">Step 1</span><button class="qf-reset" type="button" hidden>Start over</button></div>
      <ol class="qf-trail" aria-label="Your selected study path"></ol>
      <div class="qf-current"><span class="qf-step-number" aria-hidden="true">01</span><div><small>Board</small><p class="qf-step-title">Choose your board</p></div></div>
      <div class="qf-options"></div><p class="qf-status">Loading choices…</p>
      <noscript><p>JavaScript is required for the quick finder. <a href="/boards">Browse all boards instead.</a></p></noscript>
    </div>
  </div></div>
</section>`;

function mountQuickFind() {
  const boardLabels = {
    "maharashtra-board": "Maharashtra State Board",
    cbse: "CBSE",
    cisce: "CISCE",
    "tamil-nadu-board": "Tamil Nadu State Board",
  };
  const pathname = location.pathname.replace(/\/$/, "");
  const pathParts = pathname.split("/").filter(Boolean);
  const isBoardPage = pathParts.length === 1 && Object.hasOwn(boardLabels, pathParts[0]);
  const isClassPage = pathParts.length === 2
    && Object.hasOwn(boardLabels, pathParts[0])
    && /^class-\d+$/.test(pathParts[1]);
  const pageBoardSlug = isBoardPage || isClassPage ? pathParts[0] : "";
  const boardContext = pageBoardSlug ? { id: pageBoardSlug, label: boardLabels[pageBoardSlug] } : null;
  const gradeContext = isClassPage
    ? { id: pathParts[1], label: `Class ${pathParts[1].replace("class-", "")}` }
    : null;
  const lockedStepKeys = new Set([
    ...(boardContext ? ["board"] : []),
    ...(gradeContext ? ["grade"] : []),
  ]);
  let finder = document.querySelector("[data-quick-find]");
  if (!finder) {
    if (isClassPage) {
      const catalogSection = [...document.querySelectorAll("main .catalog-section")]
        .find((section) => section.querySelector(".course-finder"));
      if (!catalogSection) return;
      catalogSection.insertAdjacentHTML("beforebegin", quickFindMarkup);
      catalogSection.querySelector(".course-finder")?.remove();
    } else if (isBoardPage) {
      const catalogSection = [...document.querySelectorAll("main .catalog-section")]
        .find((section) => section.querySelector(".course-finder") && section.querySelector(".grade-grid"));
      if (!catalogSection) return;
      catalogSection.insertAdjacentHTML("beforebegin", quickFindMarkup);
      catalogSection.querySelector(".course-finder")?.remove();
      catalogSection.querySelector(".section-mini-heading")?.remove();
      catalogSection.querySelector(".grade-grid")?.remove();
    } else {
      const hero = document.querySelector("main .hero");
      if (!hero) return;
      hero.insertAdjacentHTML("afterend", quickFindMarkup);
    }
    finder = document.querySelector("[data-quick-find]");
  }
  if (!finder || finder.dataset.ready === "true") return;
  finder.classList.toggle("qf-board-context", isBoardPage);
  finder.dataset.ready = "true";
  const pointHeroToFinder = () => {
    const heroLink = [...document.querySelectorAll("a")].find((link) => link.textContent.trim().startsWith("Find my textbook"));
    if (heroLink) heroLink.setAttribute("href", "#quick-find");
  };
  pointHeroToFinder();
  setTimeout(pointHeroToFinder, 750);
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || !link.textContent.trim().startsWith("Find my textbook")) return;
    event.preventDefault();
    finder.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }, true);

  const allSteps = [
    { key: "board", endpoint: "boards", title: "Choose your board", noun: "Board" },
    { key: "grade", endpoint: "grades", title: "Which class are you in?", noun: "Class" },
    { key: "stream", endpoint: "streams", title: "Choose your stream", noun: "Stream" },
    { key: "subject", endpoint: "subjects", title: "Choose your subject", noun: "Subject" },
  ];

  const state = {};
  if (boardContext) state.board = boardContext;
  if (gradeContext) state.grade = gradeContext;
  const els = {
    panel: finder.querySelector(".qf-panel"),
    counter: finder.querySelector(".qf-counter"),
    reset: finder.querySelector(".qf-reset"),
    trail: finder.querySelector(".qf-trail"),
    number: finder.querySelector(".qf-step-number"),
    noun: finder.querySelector(".qf-current small"),
    title: finder.querySelector(".qf-step-title"),
    options: finder.querySelector(".qf-options"),
    status: finder.querySelector(".qf-status"),
  };

  let activeIndex = 0;
  let requestId = 0;

  function isSeniorGrade() {
    return state.grade?.id === "class-11" || state.grade?.id === "class-12";
  }

  function steps() {
    if (!state.grade || isSeniorGrade()) return allSteps;
    return allSteps.filter((step) => step.key !== "stream");
  }

  function firstEditableIndex() {
    if (gradeContext) return 2;
    if (boardContext) return 1;
    return 0;
  }

  function clearFromKey(key) {
    const start = allSteps.findIndex((step) => step.key === key);
    for (let index = start; index < allSteps.length; index += 1) delete state[allSteps[index].key];
  }

  function paramsFor(index, search = "") {
    const params = new URLSearchParams({ step: steps()[index].endpoint });
    for (const key of ["board", "grade", "stream"]) {
      if (state[key]?.id) params.set(key, state[key].id);
    }
    if (search) params.set("q", search);
    return params;
  }

  function syncUrl() {
    const url = new URL(location.href);
    for (const step of allSteps) url.searchParams.delete(`find_${step.key}`);
    for (const step of allSteps.slice(0, -1)) {
      if (lockedStepKeys.has(step.key)) continue;
      if (state[step.key]?.id) url.searchParams.set(`find_${step.key}`, state[step.key].id);
    }
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function renderTrail() {
    els.trail.replaceChildren();
    steps().slice(0, activeIndex).forEach((step, index) => {
      const selected = state[step.key];
      if (!selected) return;
      const item = document.createElement("li");
      const button = document.createElement("button");
      const isLockedStep = lockedStepKeys.has(step.key);
      button.type = "button";
      const actionLabel = isLockedStep ? `Selected ${step.noun.toLowerCase()}: ` : `Change ${step.noun}: `;
      button.innerHTML = `<b aria-hidden="true">${String(index + 1).padStart(2, "0")}</b><span class="qf-sr-only">${escapeHtml(actionLabel)}</span><span>${escapeHtml(selected.label)}</span><i aria-hidden="true">${isLockedStep ? "✓" : "×"}</i>`;
      if (isLockedStep) {
        button.disabled = true;
        button.classList.add("is-locked");
      } else {
        button.addEventListener("click", () => {
          clearFromKey(step.key);
          syncUrl();
          loadStep(index);
        });
      }
      item.append(button);
      els.trail.append(item);
    });
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value || "");
    return div.innerHTML;
  }

  function cleanPrompt(value) {
    return String(value || "")
      .replace(/\*\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function iconFor(step, item) {
    const attrs = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const subjectIcons = {
      physics: `<svg ${attrs}><circle cx="12" cy="12" r="2"/><path d="M4.6 8c2.2-3.8 12.6-3.8 14.8 0S9 19.8 4.6 16 17.2 4.2 19.4 8"/></svg>`,
      chemistry: `<svg ${attrs}><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M8 15h8"/></svg>`,
      biology: `<svg ${attrs}><path d="M19 4C11 4 5 8 5 15c0 3 2 5 5 5 7 0 9-8 9-16Z"/><path d="M5 20c2-5 6-8 11-11"/></svg>`,
      mathematics: `<svg ${attrs}><path d="M18 5H8l6 7-6 7h10"/><path d="M5 7h1M5 17h1"/></svg>`,
      accountancy: `<svg ${attrs}><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2m3 0h3M8 15h2m3 0h3"/></svg>`,
      economics: `<svg ${attrs}><path d="M4 19h16M6 16l4-5 3 2 5-7"/><path d="m15 6 3 0 0 3"/></svg>`,
      commerce: `<svg ${attrs}><path d="M3 9h18l-2 10H5L3 9Z"/><path d="M8 9V6a4 4 0 0 1 8 0v3M8 13h.01M16 13h.01"/></svg>`,
    };
    if (step.key === "stream" && item.id === "science") return `<svg ${attrs}><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M8 15c2-1 6 1 8 0"/></svg>`;
    if (step.key === "stream" && item.id === "commerce") return `<svg ${attrs}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/></svg>`;
    if (step.key === "stream" && (item.id === "arts" || item.id === "humanities")) return `<svg ${attrs}><path d="m3 9 9-5 9 5M5 10h14M6 10v7m4-7v7m4-7v7m4-7v7M4 20h16"/></svg>`;
    if (step.key === "subject" && subjectIcons[item.id]) return subjectIcons[item.id];
    if (step.key === "board") return `<svg ${attrs}><path d="m3 9 9-5 9 5"/><path d="M5 10h14M6 10v7m4-7v7m4-7v7m4-7v7M4 20h16"/></svg>`;
    if (step.key === "grade") return `<svg ${attrs}><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5"/></svg>`;
    return `<svg ${attrs}><path d="M4 6h16v12H4zM8 10h8M8 14h5"/></svg>`;
  }

  function renderOptions(items, index) {
    els.options.replaceChildren();
    const activeSteps = steps();
    const step = activeSteps[index];
    items.forEach((item, optionIndex) => {
      const isFinal = step.key === "subject";
      const control = document.createElement(isFinal ? "a" : "button");
      control.className = "qf-option";
      control.dataset.choice = item.id;
      if (isFinal) control.href = item.href;
      else control.type = "button";
      const label = cleanPrompt(item.label);
      control.innerHTML = `
        <span class="qf-option-index">${iconFor(step, item)}</span>
        <span class="qf-option-copy"><strong>${escapeHtml(label)}</strong>${item.meta ? `<small>${escapeHtml(item.meta)}</small>` : ""}</span>
        <span class="qf-option-arrow" aria-hidden="true">${isFinal ? "↗" : "→"}</span>`;
      if (!isFinal) {
        control.addEventListener("click", () => {
          state[step.key] = { id: item.id, label: item.label };
          const nextStep = allSteps[allSteps.findIndex((candidate) => candidate.key === step.key) + 1];
          if (nextStep) clearFromKey(nextStep.key);
          if (step.key === "grade" && !isSeniorGrade()) delete state.stream;
          syncUrl();
          loadStep(index + 1);
        });
      }
      els.options.append(control);
    });
  }

  async function fetchItems(index, search = "") {
    const response = await fetch(`/api/quick-find?${paramsFor(index, search)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load choices");
    return data;
  }

  async function loadStep(index, search = "") {
    const activeSteps = steps();
    activeIndex = Math.min(index, activeSteps.length - 1);
    finder.dataset.step = String(activeIndex + 1);
    els.panel.dataset.step = String(activeIndex + 1);
    const step = activeSteps[activeIndex];
    const thisRequest = ++requestId;
    els.panel.classList.add("qf-loading");
    els.counter.textContent = `Step ${activeIndex + 1} of ${activeSteps.length}`;
    els.number.textContent = String(activeIndex + 1).padStart(2, "0");
    els.noun.textContent = step.noun;
    els.title.textContent = step.title;
    els.reset.hidden = activeIndex === firstEditableIndex();
    els.status.dataset.error = "false";
    els.status.textContent = step.key === "subject" ? "Loading subjects…" : "Loading choices…";
    renderTrail();

    try {
      const data = await fetchItems(activeIndex, search);
      if (thisRequest !== requestId) return;
      renderOptions(data.items, activeIndex);
      if (!data.items.length) {
        els.status.textContent = search ? "No questions match that search. Try fewer words or a question number." : "No choices are available here yet.";
      } else if (step.key === "subject") {
        els.status.textContent = `${data.items.length} subjects · tap one to open its textbooks`;
      } else {
        els.status.textContent = `${data.items.length} choices · tap one to continue`;
      }
    } catch (error) {
      if (thisRequest !== requestId) return;
      els.options.replaceChildren();
      els.status.dataset.error = "true";
      els.status.textContent = error instanceof Error ? error.message : "Could not load this step.";
    } finally {
      if (thisRequest === requestId) els.panel.classList.remove("qf-loading");
    }
  }

  async function restore() {
    const url = new URL(location.href);
    let index = firstEditableIndex();
    for (; index < steps().length - 1; index += 1) {
      const step = steps()[index];
      const id = url.searchParams.get(`find_${step.key}`);
      if (!id) break;
      try {
        const data = await fetchItems(index);
        const match = data.items.find((item) => String(item.id) === id);
        if (!match) break;
        state[step.key] = { id: match.id, label: match.label };
      } catch {
        break;
      }
    }
    syncUrl();
    loadStep(index);
  }

  els.reset.addEventListener("click", () => {
    const index = firstEditableIndex();
    clearFromKey(steps()[index].key);
    if (boardContext) state.board = boardContext;
    if (gradeContext) state.grade = gradeContext;
    syncUrl();
    loadStep(index);
  });

  restore();
}

function mountQuickFindAfterHydration(attempt = 0) {
  if (!document.documentElement.classList.contains("qf-styles-ready") && attempt < 300) {
    requestAnimationFrame(() => mountQuickFindAfterHydration(attempt + 1));
    return;
  }
  document.documentElement.classList.add("qf-styles-ready");
  if (document.querySelector("next-route-announcer") || attempt >= 300) {
    requestAnimationFrame(() => requestAnimationFrame(mountQuickFind));
    return;
  }
  requestAnimationFrame(() => mountQuickFindAfterHydration(attempt + 1));
}

mountQuickFindAfterHydration();
