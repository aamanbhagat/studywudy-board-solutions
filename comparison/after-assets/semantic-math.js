(() => {
  document.addEventListener("copy", (event) => {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !event.clipboardData) return;

    const fragment = selection.getRangeAt(0).cloneContents();
    const formulas = [...fragment.querySelectorAll(".math[data-math-plain]")];
    if (!formulas.length) return;

    for (const formula of formulas) {
      if (!formula.isConnected && formula.parentNode == null) continue;
      formula.replaceWith(document.createTextNode(formula.getAttribute("data-math-plain") || ""));
    }

    const container = document.createElement("div");
    container.append(fragment);
    const plainText = (container.innerText || container.textContent || "")
      .replace(/[ \t]+\n/gu, "\n")
      .replace(/\n{3,}/gu, "\n\n")
      .trim();
    if (!plainText) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", plainText);
  });
})();
