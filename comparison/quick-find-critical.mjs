export const QUICK_FIND_CRITICAL_CSS = `.course-finder,
.board-explorer-compact,
.catalog-section:has(> .grade-grid) > .section-mini-heading,
.catalog-section:has(> .grade-grid) > .grade-grid,
.explorer-wrap { display: none !important; }
.catalog-section:has(> .grade-grid) { margin-top: calc(56rem + 6px + 2 * clamp(3.25rem, 7vw, 6rem)); }
.catalog-section:has(> .course-finder) { margin-top: calc(32rem + 6px + 2 * clamp(3.25rem, 7vw, 6rem)); }
.hero + .explorer-wrap + .section[aria-labelledby="boards-heading"] { margin-top: 0 !important; }
html:not(.qf-styles-ready) .qf-section { visibility: hidden; }
@media (max-width: 760px) {
  .catalog-section:has(> .grade-grid) { margin-top: calc(62.5rem + 6px); }
  .catalog-section:has(> .course-finder) { margin-top: calc(37.75rem + 6px); }
}`;

export function quickFindAsyncAssets(href) {
  return `<style data-studywudy-quick-find="critical">${QUICK_FIND_CRITICAL_CSS}</style><link rel="preload" as="style" href="${href}" onload="this.onload=null;this.rel='stylesheet';document.documentElement.classList.add('qf-styles-ready')" onerror="document.documentElement.classList.add('qf-styles-ready')" data-studywudy-comparison="after"/><noscript><link rel="stylesheet" href="${href}"/></noscript>`;
}
