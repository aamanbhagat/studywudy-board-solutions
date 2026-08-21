import { contentToText } from "./answer-completeness.mjs";
import { getQuestionUrl } from "./question-routes.mjs";
import {
  STUDY_CLUSTER_BASE,
  STUDY_CLUSTER_CONCEPTS,
  STUDY_CLUSTER_QBANK_BOOK,
} from "./study-cluster.mjs";

const PRIMARY_ROUTE = Object.freeze({
  boardSlug: "maharashtra-board",
  classNumber: 12,
  subjectSlug: "physics",
  textbookSlug: "balbharati-physics-standard-12",
  chapterSlug: "electrostatics",
});
const QBANK_ROUTE = Object.freeze({ ...PRIMARY_ROUTE, textbookSlug: STUDY_CLUSTER_QBANK_BOOK });

const PRIMARY_ANCHORS = Object.freeze({
  1: "Predict charge, potential and capacitance when plate separation increases",
  2: "Derive the capacitance with a partial dielectric slab",
  3: "Calculate stored and dissipated capacitor energy during charging",
  4: "Find the work done moving a charge along the semicircle",
  5: "Calculate capacitance and charge for parallel plates",
  6: "Find dipole potential and work along an equatorial path",
  7: "Derive the capacitance of a spherical capacitor",
  8: "Predict capacitance after inserting a metal plate",
  9: "Explain how a car shields passengers from lightning",
  10: "Calculate work moving charge on a spherical shell",
  11: "Find the electric field that balances dipole torque",
  12: "Find the charge ratio for zero electrostatic potential energy",
  13: "Compare capacitor energy before and after dielectric removal",
  14: "Compare voltage for series and parallel capacitor combinations",
  15: "Calculate electric flux through the charged sphere",
  16: "Calculate capacitor energy lost after charge sharing",
  17: "Calculate the potential of a combined liquid drop",
  18: "Calculate work required to rotate molecular dipoles",
  19: "Calculate potential and proton work in a two-charge system",
  20: "Calculate capacitance and charge with a mica dielectric",
  21: "Find equivalent capacitance from the plate diagram",
});

const QUESTION_CONCEPT = Object.freeze({
  1: "energy-stored-in-capacitor",
  2: "dielectric-slab-in-capacitor",
  3: "energy-stored-in-capacitor",
  4: "coulombs-law",
  5: "capacitors-in-parallel",
  6: "electric-potential",
  7: "electric-potential",
  8: "dielectric-slab-in-capacitor",
  9: "gauss-law",
  10: "electric-potential",
  11: "electric-potential",
  12: "coulombs-law",
  13: "dielectric-slab-in-capacitor",
  14: "capacitors-in-series",
  15: "gauss-law",
  16: "energy-stored-in-capacitor",
  17: "electric-potential",
  18: "electric-potential",
  19: "electric-potential",
  20: "dielectric-slab-in-capacitor",
  21: "capacitors-in-series",
});

const HARDER_QBANK = Object.freeze({
  "coulombs-law": 27,
  "electric-potential": 30,
  "gauss-law": 16,
  "capacitors-in-series": 22,
  "capacitors-in-parallel": 24,
  "dielectric-slab-in-capacitor": 29,
  "energy-stored-in-capacitor": 23,
});

function clean(value) {
  return contentToText(value).replace(/<[^>]+>/gu, " ").replace(/\*\*|__|`/gu, "").replace(/\s+/gu, " ").trim();
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function flattenQuestion(question) {
  if (!question || typeof question !== "object") return [];
  return [question, ...(question.subQuestions || []).flatMap(flattenQuestion)];
}

function questionsFor(payload) {
  const chapter = (payload?.chapters || []).find((item) => item.slug === "electrostatics");
  return (chapter?.exercises || []).flatMap((exercise) =>
    (exercise.questions || []).flatMap(flattenQuestion)
  ).filter((question) => question.id);
}

function numberOf(question) {
  return Number(question?.order || question?.displayLabel || 0);
}

function questionByNumber(questions, number) {
  return questions.find((question) => numberOf(question) === Number(number)) || null;
}

function compact(value, maximum = 92) {
  const text = clean(value).replace(/^(?:choose the correct(?: option)?|choose the correct)\s*:?\s*/iu, "");
  if ([...text].length <= maximum) return text;
  const clipped = [...text].slice(0, maximum - 1).join("");
  return `${clipped.replace(/\s+\S*$/u, "").trim() || clipped.trim()}…`;
}

export function descriptiveQuestionAnchor(question, source = "textbook") {
  const number = numberOf(question);
  if (source === "textbook" && PRIMARY_ANCHORS[number]) return PRIMARY_ANCHORS[number];
  const prompt = compact(question?.prompt);
  const verb = question?.type === "numerical" ? "Calculate"
    : /derive|prove|show that/iu.test(prompt) ? "Derive"
      : question?.type === "mcq_single" ? "Test your understanding of"
        : "Explain";
  const normalized = prompt.replace(/^(?:calculate|derive|explain|find|test)\s+/iu, "");
  return `${verb} ${normalized.charAt(0).toLocaleLowerCase("en-IN")}${normalized.slice(1)}`.trim();
}

function questionLink(question, source) {
  if (!question) return null;
  const route = source === "question-bank" ? QBANK_ROUTE : PRIMARY_ROUTE;
  return Object.freeze({
    href: getQuestionUrl({ ...route, publicQuestionId: question.id }),
    label: descriptiveQuestionAnchor(question, source),
    source,
    questionId: question.id,
  });
}

function rank(question) {
  if (["mcq_single", "one_word", "fill_blank", "true_false"].includes(question?.type)) return 1;
  if (["brief", "give_reason", "one_sentence", "define"].includes(question?.type)) return 2;
  return 3;
}

function conceptForNumber(number) {
  const slug = QUESTION_CONCEPT[number];
  return STUDY_CLUSTER_CONCEPTS.find((concept) => concept.slug === slug) || null;
}

function primaryNumbersForConcept(slug) {
  const assigned = Object.entries(QUESTION_CONCEPT)
    .filter(([, conceptSlug]) => conceptSlug === slug)
    .map(([number]) => Number(number));
  const profiled = STUDY_CLUSTER_CONCEPTS.find((concept) => concept.slug === slug)?.primary || [];
  return [...new Set([...assigned, ...profiled])];
}

function nearestQuestion(current, candidates) {
  const currentNumber = numberOf(current);
  return candidates
    .filter((candidate) => candidate.id !== current.id)
    .sort((left, right) => {
      const leftScore = Math.abs(numberOf(left) - currentNumber) + Math.abs(rank(left) - rank(current)) * 2;
      const rightScore = Math.abs(numberOf(right) - currentNumber) + Math.abs(rank(right) - rank(current)) * 2;
      return leftScore - rightScore;
    })[0] || null;
}

function easierQuestion(current, candidates) {
  const easier = candidates.filter((candidate) => candidate.id !== current.id && rank(candidate) < rank(current));
  return easier.sort((left, right) => rank(right) - rank(left) || Math.abs(numberOf(left) - numberOf(current)) - Math.abs(numberOf(right) - numberOf(current)))[0] || null;
}

export function buildQuestionSemanticGraph({ primaryPayload, questionBankPayload, questionId }) {
  const primaryQuestions = questionsFor(primaryPayload);
  const questionBankQuestions = questionsFor(questionBankPayload);
  const current = primaryQuestions.find((question) => question.id === questionId);
  if (!current) return null;
  const questionNumber = numberOf(current);
  const concept = conceptForNumber(questionNumber);
  if (!concept) return null;
  const conceptUrl = `${STUDY_CLUSTER_BASE}/concepts/${concept.slug}`;
  const conceptQuestions = primaryNumbersForConcept(concept.slug)
    .map((number) => questionByNumber(primaryQuestions, number)).filter(Boolean);
  const similar = nearestQuestion(current, conceptQuestions);
  const easier = easierQuestion(current, conceptQuestions);
  const harder = questionByNumber(questionBankQuestions, HARDER_QBANK[concept.slug])
    || nearestQuestion(current, questionBankQuestions);
  const links = [
    Object.freeze({
      relation: "Formula used",
      href: `${conceptUrl}#core-relation`,
      label: `Use ${concept.plainText} for ${concept.name}`,
      destinationType: "formula",
    }),
    Object.freeze({
      relation: "Concept explanation",
      href: conceptUrl,
      label: `Understand ${concept.name} before applying it`,
      destinationType: "concept",
    }),
    similar ? Object.freeze({
      relation: "Similar textbook problem",
      ...questionLink(similar, "textbook"),
      destinationType: "question",
    }) : null,
    easier ? Object.freeze({
      relation: "Easier prerequisite",
      ...questionLink(easier, "textbook"),
      destinationType: "question",
    }) : Object.freeze({
      relation: "Easier prerequisite",
      href: `${conceptUrl}#when-to-use`,
      label: `Build the prerequisite: when to use ${concept.name}`,
      destinationType: "concept",
    }),
    harder ? Object.freeze({
      relation: "Harder problem",
      ...questionLink(harder, "question-bank"),
      destinationType: "question",
    }) : null,
    Object.freeze({
      relation: "Chapter test",
      href: `${STUDY_CLUSTER_BASE}/practice`,
      label: `Test ${concept.name} in the 15-minute Electrostatics chapter test`,
      destinationType: "quiz",
    }),
    Object.freeze({
      relation: "Revision note",
      href: `${STUDY_CLUSTER_BASE}/revision#formula-${concept.slug}`,
      label: `Revise ${concept.name} in the Chapter 8 formula sheet`,
      destinationType: "revision",
    }),
  ].filter(Boolean);
  return Object.freeze({
    questionId: current.id,
    pathname: getQuestionUrl({ ...PRIMARY_ROUTE, publicQuestionId: current.id }),
    questionLabel: descriptiveQuestionAnchor(current, "textbook"),
    concept: concept.name,
    links: Object.freeze(links),
    previousYear: null,
    previousYearStatus: `No verified paper-year source is mapped to ${concept.name}; the HSC Question Bank is not being relabelled as a previous-year paper.`,
  });
}

export function renderQuestionSemanticGraph(graph) {
  if (!graph?.links?.length) return "";
  const links = graph.links.map((link) => `<a href="${escapeHtml(link.href)}" data-link-relation="${escapeHtml(link.relation)}"><span>${escapeHtml(link.relation)}</span><strong>${escapeHtml(link.label)}</strong><i aria-hidden="true">→</i></a>`).join("");
  const relatedLinks = graph.links.map((link) => new URL(link.href, "https://studywudy-board-solutions.amanbhagat17089.workers.dev").toString());
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `https://studywudy-board-solutions.amanbhagat17089.workers.dev${graph.pathname || ""}#semantic-links`,
    relatedLink: relatedLinks,
  }).replaceAll("<", "\\u003c");
  return `<section class="question-semantic-graph" aria-labelledby="question-semantic-graph-heading" data-semantic-link-graph="electrostatics-v1"><header><span>Connected study path</span><h2 id="question-semantic-graph-heading">Move from this question to the exact next resource</h2><p>Each relationship is selected from the mapped concept and source records.</p></header><div class="question-semantic-map"><div class="question-semantic-origin"><small>This question</small><strong>${escapeHtml(graph.questionLabel)}</strong></div><nav aria-label="Resources related to this question">${links}<div class="question-semantic-unavailable"><span>Previous-year question</span><p>${escapeHtml(graph.previousYearStatus)}</p></div></nav></div></section><script type="application/ld+json" data-studywudy-semantic-links>${structuredData}</script>`;
}

export const SEMANTIC_LINK_GRAPH_STYLES = `<style id="semantic-link-graph-styles">
.question-semantic-graph{margin:1.35rem 0;padding:clamp(1rem,2.5vw,1.6rem);border:2px solid #10151a;border-radius:20px;background:#f8fbff;box-shadow:6px 6px 0 #10151a}.question-semantic-graph>header{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,.6fr);gap:.35rem 1.5rem;padding-bottom:1rem;border-bottom:1px solid #b8c5d6}.question-semantic-graph>header>span{color:#0757d8;font-size:.72rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.question-semantic-graph h2{margin:.3rem 0;font-size:clamp(1.4rem,3vw,2.1rem);letter-spacing:-.04em}.question-semantic-graph>header>p{grid-column:2;grid-row:1 / span 2;margin:0;color:#536170;line-height:1.55}.question-semantic-map{display:grid;grid-template-columns:minmax(180px,.38fr) minmax(0,1fr);gap:1rem;margin-top:1rem}.question-semantic-origin{position:relative;display:flex;min-height:150px;flex-direction:column;justify-content:center;padding:1rem;border-radius:50% 46% 52% 48%;background:#10151a;color:#fff;text-align:center}.question-semantic-origin::after{position:absolute;top:50%;right:-1.05rem;width:1.05rem;height:2px;background:#0757d8;content:""}.question-semantic-origin small{color:#9fbfff;font-weight:850;text-transform:uppercase}.question-semantic-origin strong{margin-top:.45rem;font-size:.85rem;line-height:1.45}.question-semantic-map nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem}.question-semantic-map nav>a{position:relative;display:grid;grid-template-columns:1fr auto;gap:.25rem .7rem;min-height:94px;padding:.8rem;border:1px solid #aebdce;border-radius:12px;background:#fff;color:#10151a;text-decoration:none}.question-semantic-map nav>a::before{position:absolute;top:50%;left:-.58rem;width:.58rem;height:1px;background:#0757d8;content:""}.question-semantic-map nav>a>span{grid-column:1;color:#5d39b8;font-size:.68rem;font-weight:900;letter-spacing:.07em;text-transform:uppercase}.question-semantic-map nav>a>strong{grid-column:1;font-size:.82rem;line-height:1.42}.question-semantic-map nav>a>i{grid-column:2;grid-row:1 / span 2;align-self:center;color:#0757d8;font-style:normal;font-weight:900}.question-semantic-map nav>a:hover,.question-semantic-map nav>a:focus-visible{border-color:#0757d8;background:#edf4ff;outline:3px solid rgba(7,87,216,.17);outline-offset:2px}.question-semantic-unavailable{grid-column:1 / -1;padding:.7rem .85rem;border-left:4px solid #d14c36;background:#fff0ed}.question-semantic-unavailable>span{color:#803427;font-size:.7rem;font-weight:900;letter-spacing:.07em;text-transform:uppercase}.question-semantic-unavailable p{margin:.25rem 0;color:#69483f;font-size:.77rem;line-height:1.5}
@media(max-width:760px){.question-semantic-graph{box-shadow:3px 3px 0 #10151a}.question-semantic-graph>header,.question-semantic-map{grid-template-columns:1fr}.question-semantic-graph>header>p{grid-column:auto;grid-row:auto}.question-semantic-origin{min-height:auto;border-radius:14px}.question-semantic-origin::after{display:none}.question-semantic-map nav{grid-template-columns:1fr}.question-semantic-map nav>a::before{display:none}}
</style>`;

export const SEMANTIC_PROMOTION_STYLES = `<style id="semantic-promotion-styles">
.semantic-cluster-promotion{margin-top:2rem;margin-bottom:2rem;padding:clamp(1rem,2.6vw,1.7rem);border:2px solid #10151a;border-radius:20px;background:#eef4ff;color:#10151a}.semantic-cluster-promotion>header{display:flex;align-items:end;justify-content:space-between;gap:1.5rem;margin-bottom:1rem}.semantic-cluster-promotion>header span{color:#0757d8;font-size:.72rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.semantic-cluster-promotion h2{margin:.3rem 0 0;font-size:clamp(1.45rem,3vw,2.2rem);letter-spacing:-.04em}.semantic-cluster-promotion>header p{max-width:54ch;margin:0;color:#526071;line-height:1.55}.semantic-cluster-promotion nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.55rem}.semantic-cluster-promotion nav a{display:flex;min-height:105px;flex-direction:column;justify-content:space-between;padding:.85rem;border:1px solid #aebdce;border-radius:12px;background:#fff;color:inherit;text-decoration:none}.semantic-cluster-promotion nav a span{color:#5d39b8;font-size:.68rem;font-weight:900;letter-spacing:.07em;text-transform:uppercase}.semantic-cluster-promotion nav a strong{font-size:.85rem;line-height:1.45}.semantic-cluster-promotion nav a:hover,.semantic-cluster-promotion nav a:focus-visible{border-color:#0757d8;background:#f8fbff;outline:3px solid rgba(7,87,216,.17);outline-offset:2px}
@media(max-width:760px){.semantic-cluster-promotion>header{align-items:start;flex-direction:column;gap:.5rem}.semantic-cluster-promotion nav{grid-template-columns:1fr}}
</style>`;

const PROMOTION_PATHS = Object.freeze(new Set([
  "/",
  "/maharashtra-board",
  "/maharashtra-board/class-12",
  "/maharashtra-board/class-12/physics",
  `${STUDY_CLUSTER_BASE.replace(/\/electrostatics$/u, "")}/current-electricity`,
  `${STUDY_CLUSTER_BASE.replace(/\/electrostatics$/u, "")}/magnetic-fields-due-to-electric-current`,
  `${STUDY_CLUSTER_BASE.replace(/\/electrostatics$/u, "")}/electromagnetic-induction`,
]));

export function semanticPromotionForPath(pathname) {
  const normalized = String(pathname || "").replace(/\/+$/u, "") || "/";
  if (!PROMOTION_PATHS.has(normalized)) return null;
  const isRelatedChapter = normalized.includes("balbharati-physics-standard-12") && !normalized.endsWith("/physics");
  const context = normalized === "/" ? "Featured study path"
    : normalized === "/maharashtra-board" ? "Featured Maharashtra Board resource"
      : normalized === "/maharashtra-board/class-12" ? "Class 12 Physics focus"
        : normalized.endsWith("/physics") ? "Physics study path"
          : "Connect this Physics chapter";
  const title = isRelatedChapter
    ? "Use Electrostatics as the field-and-potential foundation"
    : "Study Maharashtra Board Class 12 Electrostatics beyond the answer list";
  const description = isRelatedChapter
    ? "Electric potential, field and stored energy are prerequisites for later electricity and electromagnetism chapters."
    : "Move through revision, concept explanations and a private chapter test, all linked to the exact textbook solutions.";
  return Object.freeze({
    context,
    title,
    description,
    links: Object.freeze([
      Object.freeze({ eyebrow: "Complete pathway", href: `${STUDY_CLUSTER_BASE}/study`, label: "Study Electrostatics from concepts to exam answers" }),
      Object.freeze({ eyebrow: "Formula revision", href: `${STUDY_CLUSTER_BASE}/revision`, label: "Revise the seven Electrostatics formulas with linked questions" }),
      Object.freeze({ eyebrow: "Private practice", href: `${STUDY_CLUSTER_BASE}/practice`, label: "Take the 15-minute Electrostatics chapter test" }),
    ]),
  });
}

export function renderSemanticPromotion(promotion) {
  if (!promotion) return "";
  const links = promotion.links.map((link) => `<a href="${escapeHtml(link.href)}"><span>${escapeHtml(link.eyebrow)}</span><strong>${escapeHtml(link.label)} →</strong></a>`).join("");
  return `<aside class="shell semantic-cluster-promotion" aria-labelledby="semantic-cluster-promotion-heading" data-semantic-promotion="electrostatics-v1"><header><div><span>${escapeHtml(promotion.context)}</span><h2 id="semantic-cluster-promotion-heading">${escapeHtml(promotion.title)}</h2></div><p>${escapeHtml(promotion.description)}</p></header><nav aria-label="Featured Electrostatics study resources">${links}</nav></aside>`;
}
