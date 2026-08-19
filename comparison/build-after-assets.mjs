import { readFile, writeFile } from "node:fs/promises";

const indexPath = new URL("./after-assets/index.html", import.meta.url);
let html = await readFile(indexPath, "utf8");

const stylesheet = '<link rel="stylesheet" href="/quick-find.css" data-studywudy-comparison="after"/>';
const script = '<script src="/quick-find.js" defer data-studywudy-comparison="after"></script>';
const finderMarkup = `<section class="qf-section" id="quick-find" aria-labelledby="qf-heading" data-quick-find>
  <div class="qf-shell">
    <div class="qf-layout">
      <div class="qf-copy">
        <p class="qf-kicker">Quick finder · mobile first</p>
        <h2 id="qf-heading">From your board to <em>the exact question.</em></h2>
        <p>Make one choice at a time. Your path stays visible, and every step can be changed without starting over.</p>
      </div>
      <div class="qf-panel" aria-live="polite">
        <div class="qf-panel-top">
          <span class="qf-counter">Step 1 of 6</span>
          <button class="qf-reset" type="button" hidden>Start over</button>
        </div>
        <ol class="qf-trail" aria-label="Your selected study path"></ol>
        <div class="qf-current">
          <span class="qf-step-number" aria-hidden="true">01</span>
          <div><small>Board</small><h3>Choose your board</h3></div>
        </div>
        <label class="qf-search" hidden>
          <span>Search within this chapter</span>
          <input type="search" placeholder="Question number or a few words" autocomplete="off"/>
        </label>
        <div class="qf-options"></div>
        <p class="qf-status">Loading choices…</p>
        <noscript><p>JavaScript is required for the quick finder. <a href="/boards">Browse all boards instead.</a></p></noscript>
      </div>
    </div>
  </div>
</section>`;

// The finder is mounted after Next.js hydration by quick-find.js. Keeping custom
// markup inside the server-rendered React tree would cause hydration mismatch.
html = html.replace(finderMarkup, "");

if (!html.includes('data-studywudy-comparison="after"')) {
  html = html.replace("</head>", `${stylesheet}${script}</head>`);
  html = html.replace('<a class="primary-button" href="/boards">Find my textbook', '<a class="primary-button" href="#quick-find">Find my textbook');
}

await writeFile(indexPath, html);

const boardPages = ["maharashtra-board", "cbse", "cisce", "tamil-nadu-board"];
for (const board of boardPages) {
  const boardPath = new URL(`./after-assets/pages/${board}/index.html`, import.meta.url);
  let boardHtml = await readFile(boardPath, "utf8");
  if (!boardHtml.includes('data-studywudy-comparison="after"')) {
    boardHtml = boardHtml.replace("</head>", `${stylesheet}${script}</head>`);
    await writeFile(boardPath, boardHtml);
  }
}
