export const PREVIEW_BRANCH = "codex/studywudy-quality-overhaul-2026-08-21";

export const ELECTROSTATICS_BASE =
  "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electrostatics";

export const PHYSICS_BOOK_BASE =
  "/maharashtra-board/class-12/physics/balbharati-physics-standard-12";

export const MATHEMATICS_SUBJECT_BASE =
  "/maharashtra-board/class-12/mathematics";

export const MATHEMATICAL_LOGIC_BOOK_BASE =
  `${MATHEMATICS_SUBJECT_BASE}/balbharati-mathematics-and-statistics-1-arts-and-science-standard-12`;

export const MATHEMATICAL_LOGIC_BASE =
  `${MATHEMATICAL_LOGIC_BOOK_BASE}/mathematical-logic`;

export const MATHEMATICAL_LOGIC_QUESTIONS_BASE =
  `${MATHEMATICAL_LOGIC_BASE}/questions`;

export const CORE_PREVIEW_ROUTES = Object.freeze([
  "/",
  "/boards",
  "/search",
  "/maharashtra-board",
  "/maharashtra-board/class-12",
  "/maharashtra-board/class-12/physics",
  MATHEMATICS_SUBJECT_BASE,
  MATHEMATICAL_LOGIC_BOOK_BASE,
  MATHEMATICAL_LOGIC_BASE,
  PHYSICS_BOOK_BASE,
  ELECTROSTATICS_BASE,
  `${ELECTROSTATICS_BASE}/study`,
  `${ELECTROSTATICS_BASE}/revision`,
  `${ELECTROSTATICS_BASE}/important-questions`,
  `${ELECTROSTATICS_BASE}/practice`,
  `${ELECTROSTATICS_BASE}/answer-writing`,
  `${ELECTROSTATICS_BASE}/concepts/coulombs-law`,
  `${ELECTROSTATICS_BASE}/concepts/electric-potential`,
  `${ELECTROSTATICS_BASE}/concepts/gauss-law`,
  `${ELECTROSTATICS_BASE}/concepts/capacitors-in-series`,
  `${ELECTROSTATICS_BASE}/concepts/capacitors-in-parallel`,
  `${ELECTROSTATICS_BASE}/concepts/dielectric-slab-in-capacitor`,
  `${ELECTROSTATICS_BASE}/concepts/energy-stored-in-capacitor`,
  `${ELECTROSTATICS_BASE}/previous-year-questions`,
  "/cbse/class-10/science",
  "/cisce/class-10/mathematics",
  "/tamil-nadu-board",
  "/about",
  "/about/methodology",
  "/privacy",
  "/terms",
  "/contact",
  "/reviewers",
  "/reviewers/aman-bhagat",
  "/reviewers/studywudy-editorial-process",
  "/corrections",
]);

export function normalizePreviewRoute(value) {
  const route = String(value || "").split("#", 1)[0].split("?", 1)[0] || "/";
  if (!route.startsWith("/")) throw new Error(`Preview route must start with /: ${route}`);
  return route === "/" ? route : route.replace(/\/+$/, "");
}

export function previewSnapshotRelativePath(route, compressed = true) {
  const normalized = normalizePreviewRoute(route);
  const suffix = compressed ? "index.html.gz" : "index.html";
  return normalized === "/" ? suffix : `${normalized.slice(1)}/${suffix}`;
}
