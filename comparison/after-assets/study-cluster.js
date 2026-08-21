(() => {
  const root = document.querySelector('[data-study-practice="local-only-v1"]');
  if (!root) return;

  const storageKey = "studywudy:electrostatics-practice:v1";
  const cards = [...root.querySelectorAll("[data-practice-id]")];
  const readState = () => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return {
        checked: value.checked && typeof value.checked === "object" ? value.checked : {},
        saved: Array.isArray(value.saved) ? value.saved : [],
      };
    } catch {
      return { checked: {}, saved: [] };
    }
  };
  let state = readState();
  let activeView = "all";

  const writeState = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // The quiz still works when browser storage is unavailable.
    }
  };

  const updateProgress = () => {
    const attempts = Object.values(state.checked);
    const correct = attempts.filter((attempt) => attempt.correct).length;
    const mistakes = attempts.length - correct;
    root.querySelector("[data-completed]").textContent = String(attempts.length);
    root.querySelector("[data-correct]").textContent = String(correct);
    root.querySelector("[data-mistakes]").textContent = String(mistakes);
  };

  const applyView = () => {
    const difficulty = root.querySelector("[data-difficulty-filter]").value;
    for (const card of cards) {
      const id = card.dataset.practiceId;
      const matchesDifficulty = difficulty === "all" || card.dataset.difficulty === difficulty;
      const matchesView = activeView === "saved"
        ? state.saved.includes(id)
        : activeView === "mistakes"
          ? state.checked[id] && !state.checked[id].correct
          : true;
      card.hidden = !(matchesDifficulty && matchesView);
    }
  };

  for (const card of cards) {
    const id = card.dataset.practiceId;
    const save = card.querySelector("[data-save]");
    const feedback = card.querySelector("[data-feedback]");
    const paintSaved = () => {
      const saved = state.saved.includes(id);
      save.setAttribute("aria-pressed", String(saved));
      save.textContent = saved ? "Saved" : "Save";
    };
    paintSaved();

    save.addEventListener("click", () => {
      state.saved = state.saved.includes(id)
        ? state.saved.filter((savedId) => savedId !== id)
        : [...state.saved, id];
      paintSaved();
      writeState();
      applyView();
    });

    card.querySelector("[data-check]").addEventListener("click", () => {
      const selected = card.querySelector("input:checked");
      if (!selected) {
        feedback.hidden = false;
        feedback.className = "practice-feedback is-wrong";
        feedback.textContent = "Choose an option before checking.";
        return;
      }
      const correct = selected.value === card.dataset.answer;
      state.checked[id] = { correct, selected: selected.value };
      feedback.hidden = false;
      feedback.className = `practice-feedback ${correct ? "is-correct" : "is-wrong"}`;
      feedback.textContent = correct
        ? "Correct. Open “Why?” to review the principle."
        : `Not yet. The correct option is ${card.dataset.answer.toUpperCase()}; review the explanation and retry it.`;
      writeState();
      updateProgress();
    });
  }

  root.querySelector("[data-difficulty-filter]").addEventListener("change", applyView);
  root.querySelector("[data-filter-saved]").addEventListener("click", () => {
    activeView = "saved";
    applyView();
  });
  root.querySelector("[data-retry-mistakes]").addEventListener("click", () => {
    activeView = "mistakes";
    applyView();
  });
  root.querySelector("[data-show-all]").addEventListener("click", () => {
    activeView = "all";
    root.querySelector("[data-difficulty-filter]").value = "all";
    applyView();
  });

  const timerOutput = root.querySelector("[data-timer]");
  const timerToggle = root.querySelector("[data-timer-toggle]");
  let seconds = 15 * 60;
  let timerId = null;
  const paintTimer = () => {
    const minutes = Math.floor(seconds / 60);
    timerOutput.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  };
  const stopTimer = () => {
    if (timerId) clearInterval(timerId);
    timerId = null;
    timerToggle.textContent = seconds > 0 ? "Start timer" : "Time complete";
  };
  timerToggle.addEventListener("click", () => {
    if (timerId || seconds <= 0) {
      stopTimer();
      return;
    }
    timerToggle.textContent = "Pause timer";
    timerId = setInterval(() => {
      seconds = Math.max(0, seconds - 1);
      paintTimer();
      if (seconds === 0) stopTimer();
    }, 1000);
  });
  root.querySelector("[data-timer-reset]").addEventListener("click", () => {
    stopTimer();
    seconds = 15 * 60;
    paintTimer();
  });

  updateProgress();
  applyView();
})();
