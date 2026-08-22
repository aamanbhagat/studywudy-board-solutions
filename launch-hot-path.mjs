import { STUDY_CLUSTER_BASE } from "./study-cluster.mjs";

export const LAUNCH_HOT_PATH_RELEASE = "static-cold-start-v6-source-repair-hot-path";

const LOCAL_BUILD_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function isLocalLaunchHotPathBuildRequest(request) {
  if (request?.headers?.get("x-studywudy-static-build") !== LAUNCH_HOT_PATH_RELEASE) return false;
  try {
    return LOCAL_BUILD_HOSTNAMES.has(new URL(request.url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

const electrostaticsQuestions = Array.from({ length: 21 }, (_, index) => {
  const number = String(index + 1).padStart(3, "0");
  const questionId = `q-msb-balbharati-physics-standard-12-8-${number}`;
  return Object.freeze({
    kind: "electrostatics-question",
    questionId,
    rowId: 229_910 + index,
    publicPath: `${STUDY_CLUSTER_BASE}/questions/${questionId}`,
    assetPath: `/pages/launch-hot-path/electrostatics/${questionId}/`,
  });
});

const contentQualityQuestions = [
  {
    kind: "content-quality-question",
    questionId: "q-tn-samacheer-kalvi-science-term-1-class-4-1-001",
    rowId: 284_673,
    publicPath: "/tamil-nadu-board/class-4/science/samacheer-kalvi-science-term-1-class-4/my-body/questions/q-tn-samacheer-kalvi-science-term-1-class-4-1-001",
    assetPath: "/pages/launch-hot-path/content-quality/tamil-class-4-internal-organ/",
    inspection: "corrected-semantic-answer",
  },
  {
    kind: "content-quality-question",
    questionId: "q-msb-balbharati-marathi-composite-antarbharati-standard-10-11-001",
    rowId: 190_697,
    publicPath: "/maharashtra-board/class-10/marathi/balbharati-marathi-composite-antarbharati-standard-10/chapter-11/questions/q-msb-balbharati-marathi-composite-antarbharati-standard-10-11-001",
    assetPath: "/pages/launch-hot-path/content-quality/marathi-chapter-11-source-mismatch/",
    inspection: "authoritative-mapping-mismatch",
  },
  {
    kind: "content-quality-question",
    questionId: "q-cbse-ncert-exemplar-chemistry-exemplar-class-12-1-042",
    rowId: 43_145,
    publicPath: "/cbse/class-12/chemistry/ncert-exemplar-chemistry-exemplar-class-12/solid-states/questions/q-cbse-ncert-exemplar-chemistry-exemplar-class-12-1-042",
    assetPath: "/pages/launch-hot-path/content-quality/ncert-chemistry-source-typo/",
    inspection: "verified-source-typo-retained",
  },
  {
    kind: "content-quality-question",
    questionId: "q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-30-039",
    rowId: 61_547,
    publicPath: "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/gausss-law/questions/q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-30-039",
    assetPath: "/pages/launch-hot-path/content-quality/gauss-law-density-repair/",
    inspection: "gauss-law-density-repair",
  },
  {
    kind: "content-quality-question",
    questionId: "q-cbse-ncert-exemplar-physics-exemplar-class-12-1-030",
    rowId: 63_247,
    publicPath: "/cbse/class-12/physics/ncert-exemplar-physics-exemplar-class-12/electric-charges-and-fields/questions/q-cbse-ncert-exemplar-physics-exemplar-class-12-1-030",
    assetPath: "/pages/launch-hot-path/content-quality/fixed-charges-grammar-repair/",
    inspection: "fixed-charges-grammar-repair",
  },
].map((entry) => Object.freeze(entry));

const mathCriticalQuestions = [
  {
    kind: "math-critical-question",
    questionId: "q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-38-120",
    rowId: 62_208,
    publicPath: "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/electromagnetic-induction/questions/q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-38-120",
    assetPath: "/pages/launch-hot-path/math/lr-circuit-question-120/",
    inspection: "lr-semantic-roundtrip",
  },
].map((entry) => Object.freeze(entry));

const searchDocuments = [
  ["", "default"],
  ["type=numerical", "type-numerical"],
  ["hasDiagram=true", "has-diagram"],
  ["type=mcq_single", "type-mcq-single"],
  ["board=maharashtra-board", "board-maharashtra"],
].map(([search, slug]) => Object.freeze({
  kind: "question-search",
  publicPath: `/search${search ? `?${search}` : ""}`,
  pathname: "/search",
  search,
  assetPath: `/pages/launch-hot-path/search/${slug}/`,
}));

export const LAUNCH_HOT_PATH_DOCUMENTS = Object.freeze([
  ...electrostaticsQuestions,
  ...contentQualityQuestions,
  ...mathCriticalQuestions,
  ...searchDocuments,
]);

const questionByPath = new Map([...electrostaticsQuestions, ...contentQualityQuestions, ...mathCriticalQuestions].map((entry) => [entry.publicPath, entry]));
const searchByQuery = new Map(searchDocuments.map((entry) => [entry.search, entry]));

export function launchHotPathDocument(urlValue) {
  const url = urlValue instanceof URL ? urlValue : new URL(urlValue, "https://studywudy.invalid");
  const pathname = url.pathname.replace(/\/+$/u, "") || "/";
  const question = questionByPath.get(pathname);
  if (question && !url.search) return question;
  if (pathname !== "/search") return null;
  return searchByQuery.get(url.searchParams.toString()) || null;
}

export const ELECTROSTATICS_STATIC_QUESTION_COUNT = electrostaticsQuestions.length;
export const CONTENT_QUALITY_STATIC_QUESTION_COUNT = contentQualityQuestions.length;
export const MATH_CRITICAL_STATIC_QUESTION_COUNT = mathCriticalQuestions.length;
export const STATIC_QUESTION_SEARCH_COUNT = searchDocuments.length;
