import { contentToText, renderedAnswerText } from "./answer-completeness.mjs";
import {
  academicBreadcrumbItems,
  CANONICAL_ORIGIN,
  renderBreadcrumbNavigation,
} from "./breadcrumbs.mjs";
import { getQuestionUrl } from "./question-routes.mjs";
import { formulaRepresentations, renderSemanticMath } from "./semantic-math.mjs";
import {
  stringifyStructuredData,
  studyResourceStructuredData,
} from "./structured-data.mjs";

export const STUDY_CLUSTER_BASE = "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electrostatics";
export const STUDY_CLUSTER_QBANK_BOOK = "maharashtra-state-board-hsc-question-bank-physics-standard-12";

const PRIMARY_ROUTE = Object.freeze({
  boardSlug: "maharashtra-board",
  classNumber: 12,
  subjectSlug: "physics",
  textbookSlug: "balbharati-physics-standard-12",
  chapterSlug: "electrostatics",
});
const QBANK_ROUTE = Object.freeze({ ...PRIMARY_ROUTE, textbookSlug: STUDY_CLUSTER_QBANK_BOOK });

export const STUDY_CLUSTER_CONCEPTS = Object.freeze([
  Object.freeze({
    slug: "coulombs-law",
    name: "Coulomb’s law",
    source: "F=\\frac{1}{4\\pi\\varepsilon_0}\\frac{|q_1q_2|}{r^2}",
    spokenText: "force equals one over four pi epsilon nought times the magnitude of q one q two over r squared",
    plainText: "F = (1/4πε₀)|q₁q₂|/r²",
    definition: "Coulomb’s law gives the magnitude and direction of the electrostatic force between two point charges. The force acts along the line joining the charges, varies directly with the product of their magnitudes, and varies inversely with the square of their separation.",
    use: "Use it when the charges can be treated as points and the distance between them is known. Decide attraction or repulsion separately from the magnitude calculation.",
    example: "If the separation doubles while both charges stay fixed, the force becomes one fourth of its original value because the distance is squared.",
    mistake: "Do not add scalar force magnitudes when several charges act on one charge. Find directions and add the force vectors.",
    primary: [4, 12, 19], qbank: [4, 27],
  }),
  Object.freeze({
    slug: "electric-potential",
    name: "Electric potential",
    source: "V=\\frac{U}{q_0};\\quad V=\\frac{1}{4\\pi\\varepsilon_0}\\frac{q}{r}",
    spokenText: "potential equals potential energy per unit test charge; for a point charge, one over four pi epsilon nought times q over r",
    plainText: "V = U/q₀; V = (1/4πε₀)(q/r)",
    definition: "Electric potential at a point is the work done per unit positive test charge in bringing it from the reference point to that point. It is a scalar, so potentials from several charges add algebraically.",
    use: "Use potential when a question asks about work, potential difference, energy per charge, or a location produced by one or more source charges.",
    example: "At a point equidistant from equal and opposite charges, the two scalar potentials cancel even though the electric field need not be zero.",
    mistake: "Do not treat potential like a vector. Include the sign of every source charge and add the scalar terms.",
    primary: [6, 7, 10, 11, 17, 18, 19], qbank: [2, 4, 5, 9, 13, 30],
  }),
  Object.freeze({
    slug: "gauss-law",
    name: "Gauss’s law",
    source: "\\Phi_E=\\oint\\vec{E}\\cdot d\\vec{A}=\\frac{Q_{\\mathrm{enclosed}}}{\\varepsilon_0}",
    spokenText: "electric flux through a closed surface equals enclosed charge divided by epsilon nought",
    plainText: "Φₑ = ∮E⃗·dA⃗ = Q(enclosed)/ε₀",
    definition: "Gauss’s law relates the net electric flux through any closed surface to the net charge enclosed by that surface.",
    use: "Use it to find fields only when symmetry makes the field magnitude constant on a convenient Gaussian surface, or to relate a known flux to enclosed charge.",
    example: "A closed surface enclosing no net charge has zero net flux, even when an external electric field passes through it.",
    mistake: "Zero net flux does not necessarily mean zero electric field everywhere on the surface; inward and outward flux can cancel.",
    primary: [9, 15], qbank: [16],
  }),
  Object.freeze({
    slug: "capacitors-in-series",
    name: "Capacitors in series",
    source: "\\frac{1}{C_s}=\\sum_i\\frac{1}{C_i}",
    spokenText: "one over equivalent series capacitance equals the sum of one over each capacitance",
    plainText: "1/Cₛ = Σ(1/Cᵢ)",
    definition: "Capacitors are in series when the same charge magnitude appears on each capacitor and the total potential difference is shared between them.",
    use: "Use the reciprocal rule after confirming there is no branching path between the capacitors. The equivalent capacitance is smaller than the smallest individual capacitance.",
    example: "Two identical capacitors C in series have equivalent capacitance C/2, not 2C.",
    mistake: "Do not assume the voltage is equal across unequal series capacitors; their charge is equal and voltage is inversely proportional to capacitance.",
    primary: [14, 16, 21], qbank: [6, 19, 22, 25],
  }),
  Object.freeze({
    slug: "capacitors-in-parallel",
    name: "Capacitors in parallel",
    source: "C_p=\\sum_i C_i",
    spokenText: "equivalent parallel capacitance equals the sum of the individual capacitances",
    plainText: "Cₚ = ΣCᵢ",
    definition: "Capacitors are in parallel when they share the same pair of nodes, so each has the same potential difference and the stored charges add.",
    use: "Use direct addition after tracing the circuit nodes. The equivalent capacitance must be larger than any individual branch capacitance.",
    example: "Two identical capacitors C in parallel have equivalent capacitance 2C and store twice the charge at the same voltage.",
    mistake: "A drawing that looks side-by-side is not enough. Confirm that both capacitor terminals connect to the same two nodes.",
    primary: [5, 14, 20, 21], qbank: [19, 24, 25],
  }),
  Object.freeze({
    slug: "dielectric-slab-in-capacitor",
    name: "Dielectric slab in a capacitor",
    source: "C=\\frac{\\varepsilon_0A}{d-t+\\frac{t}{K}}",
    spokenText: "capacitance equals epsilon nought A divided by d minus t plus t over K",
    plainText: "C = ε₀A/(d − t + t/K)",
    definition: "A dielectric polarizes in an electric field and reduces the effective field inside it. A slab that fills only part of the plate separation behaves like dielectric and air regions in series.",
    use: "Use the effective-separation form when a slab of thickness t spans the full plate area but not the full gap. Track whether the battery remains connected before predicting charge, voltage, or energy.",
    example: "If the dielectric fills the entire gap, t = d and the expression reduces to C = Kε₀A/d.",
    mistake: "Do not multiply the original capacitance by K unless the dielectric fills the complete electric-field region.",
    primary: [2, 8, 13, 20], qbank: [1, 7, 10, 29],
  }),
  Object.freeze({
    slug: "energy-stored-in-capacitor",
    name: "Energy stored in a capacitor",
    source: "U=\\frac{1}{2}CV^2=\\frac{Q^2}{2C}=\\frac{1}{2}QV",
    spokenText: "energy equals one half C V squared, equals Q squared over two C, equals one half Q V",
    plainText: "U = (1/2)CV² = Q²/(2C) = (1/2)QV",
    definition: "The energy stored in a charged capacitor is the work required to move charge onto its plates. Equivalent formula forms let you keep either charge or voltage explicit.",
    use: "Choose the form after deciding what remains constant. An isolated capacitor keeps Q fixed; a capacitor connected to an ideal battery keeps V fixed.",
    example: "At fixed voltage, doubling capacitance doubles stored energy. At fixed charge, doubling capacitance halves stored energy.",
    mistake: "Do not use the fixed-voltage conclusion after the battery has been disconnected; the conserved quantity changes the result.",
    primary: [1, 3, 10, 13, 14, 16], qbank: [11, 23, 25],
  }),
]);

export const STUDY_CLUSTER_INDEXABLE_PATHS = Object.freeze([
  `${STUDY_CLUSTER_BASE}/study`,
  `${STUDY_CLUSTER_BASE}/revision`,
  `${STUDY_CLUSTER_BASE}/important-questions`,
  `${STUDY_CLUSTER_BASE}/practice`,
  `${STUDY_CLUSTER_BASE}/answer-writing`,
  ...STUDY_CLUSTER_CONCEPTS.map((concept) => `${STUDY_CLUSTER_BASE}/concepts/${concept.slug}`),
]);
export const STUDY_CLUSTER_PYQ_PATH = `${STUDY_CLUSTER_BASE}/previous-year-questions`;

const ROUTE_LABELS = Object.freeze({
  study: "Study centre",
  revision: "Chapter revision",
  "important-questions": "Important questions",
  practice: "Practice test",
  "answer-writing": "Answer-writing guide",
  "previous-year-questions": "PYQ evidence desk",
});

function clean(value) {
  return contentToText(value).replace(/<[^>]+>/gu, " ").replace(/\*\*|__|`/gu, "").replace(/\s+/gu, " ").trim();
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function flattenQuestion(question, exercise) {
  if (!question || typeof question !== "object") return [];
  return [{ ...question, exercise }, ...(question.subQuestions || []).flatMap((child) => flattenQuestion(child, exercise))];
}

function questionsFor(payload) {
  const chapter = (payload?.chapters || []).find((item) => item.slug === "electrostatics");
  return (chapter?.exercises || []).flatMap((exercise) =>
    (exercise.questions || []).flatMap((question) => flattenQuestion(question, exercise))
  ).filter((question) => question.id);
}

function byNumber(questions, number) {
  return questions.find((question) => Number(question.order || question.displayLabel) === number) || questions[number - 1] || null;
}

function concise(value, maximum = 190) {
  const text = clean(value);
  if ([...text].length <= maximum) return text;
  const clipped = [...text].slice(0, maximum - 1).join("");
  return `${clipped.replace(/\s+\S*$/u, "").trim() || clipped.trim()}…`;
}

function questionRef(question, source) {
  if (!question) return null;
  const route = source === "question-bank" ? QBANK_ROUTE : PRIMARY_ROUTE;
  const prompt = concise(question.prompt, 220);
  const anchorVerb = question.type === "numerical" ? "Calculate"
    : /derive|prove|show that/iu.test(prompt) ? "Derive"
      : question.type === "mcq_single" ? "Test your understanding of"
        : "Explain";
  const anchorSubject = prompt.replace(/^(?:choose the correct(?: option)?|calculate|derive|explain|find)\s*:?\s*/iu, "");
  const anchor = Number(question.order || question.displayLabel) === 2 && source === "textbook"
    ? "Derive the capacitance with a partial dielectric slab"
    : `${anchorVerb} ${anchorSubject.charAt(0).toLocaleLowerCase("en-IN")}${anchorSubject.slice(1)}`;
  return Object.freeze({
    id: question.id,
    label: clean(question.displayLabel || question.order || question.id),
    prompt,
    anchor,
    href: getQuestionUrl({ ...route, publicQuestionId: question.id }),
    type: question.type,
    choices: (question.choices || []).map((choice) => ({ id: clean(choice.id), content: clean(choice.content) })),
    correctChoiceId: clean(question.correctChoiceId),
    explanation: concise(renderedAnswerText(question) || question.explanation || question.answer, 420),
    source,
    hasDiagram: Boolean(question.promptMedia?.length || question.solutionMedia?.length || question.type === "diagram"),
    steps: Array.isArray(question.steps) ? question.steps.length : 0,
  });
}

function refs(numbers, questions, source) {
  return numbers.map((number) => questionRef(byNumber(questions, number), source)).filter(Boolean);
}

function difficulty(question) {
  const weight = (question.steps || 0) + (question.prompt.length > 150 ? 1 : 0)
    + (["numerical", "detailed", "diagram"].includes(question.type) ? 2 : 0);
  return weight >= 3 ? "challenging" : weight >= 1 ? "standard" : "foundation";
}

export function matchStudyClusterRoute(pathname) {
  const normalized = String(pathname || "").replace(/\/+$/u, "") || "/";
  if (!normalized.startsWith(`${STUDY_CLUSTER_BASE}/`)) return null;
  const suffix = normalized.slice(STUDY_CLUSTER_BASE.length + 1);
  if (ROUTE_LABELS[suffix]) {
    return Object.freeze({ kind: suffix, pathname: normalized, indexable: suffix !== "previous-year-questions" });
  }
  const conceptMatch = /^concepts\/([a-z0-9]+(?:-[a-z0-9]+)*)$/u.exec(suffix);
  if (!conceptMatch) return null;
  const concept = STUDY_CLUSTER_CONCEPTS.find((item) => item.slug === conceptMatch[1]);
  return concept ? Object.freeze({ kind: "concept", concept, pathname: normalized, indexable: true }) : null;
}

export function buildStudyClusterModel({ primaryPayload, questionBankPayload, catalog, reviewedAt }) {
  if (!catalog) return null;
  const textbookQuestions = questionsFor(primaryPayload);
  const questionBankQuestions = questionsFor(questionBankPayload);
  if (!textbookQuestions.length) return null;
  const concepts = STUDY_CLUSTER_CONCEPTS.map((concept) => Object.freeze({
    ...concept,
    formula: Object.freeze({
      ...formulaRepresentations(concept.source),
      spokenText: concept.spokenText,
      plainText: concept.plainText,
    }),
    textbookQuestions: refs(concept.primary, textbookQuestions, "textbook"),
    questionBankQuestions: refs(concept.qbank, questionBankQuestions, "question-bank"),
  }));
  const textbookMcqs = textbookQuestions.filter((question) => question.type === "mcq_single" && question.choices?.length)
    .map((question) => questionRef(question, "textbook"));
  const qbankMcqs = questionBankQuestions.filter((question) => question.type === "mcq_single" && question.choices?.length)
    .slice(0, 7).map((question) => questionRef(question, "question-bank"));
  const practiceQuestions = [...textbookMcqs, ...qbankMcqs].map((question) => Object.freeze({
    ...question, difficulty: difficulty(question),
  }));
  const important = [
    ...refs([2, 3, 4, 6, 12, 14, 15, 16, 20, 21], textbookQuestions, "textbook"),
    ...refs([16, 22, 23, 29], questionBankQuestions, "question-bank"),
  ];
  const diagramQuestions = textbookQuestions.filter((question) => question.promptMedia?.length || question.solutionMedia?.length)
    .map((question) => questionRef(question, "textbook"));
  const publishingGateDate = new Intl.DateTimeFormat("en-IN", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata",
  }).format(Number(reviewedAt || Date.now() / 1_000) * 1_000);
  return Object.freeze({
    route: PRIMARY_ROUTE,
    board: clean(catalog.board_name || "Maharashtra State Board"),
    classLabel: clean(catalog.grade_label || "Class 12"),
    subject: clean(catalog.subject_name || "Physics"),
    textbook: clean(catalog.book_title || "Balbharati Physics Standard 12"),
    chapter: clean(catalog.chapter_title || "Electrostatics"),
    chapterNumber: Number(catalog.chapter_number || 8),
    textbookQuestions: textbookQuestions.map((question) => questionRef(question, "textbook")),
    questionBankQuestions: questionBankQuestions.map((question) => questionRef(question, "question-bank")),
    concepts,
    important,
    practiceQuestions,
    diagramQuestions,
    publishingGateDate,
    reviewedIso: new Date(Number(reviewedAt || Date.now() / 1_000) * 1_000).toISOString().slice(0, 10),
    evidence: Object.freeze({
      textbookQuestionCount: textbookQuestions.length,
      questionBankQuestionCount: questionBankQuestions.length,
      verifiedPaperCount: 0,
      verifiedPaperQuestionCount: 0,
      verifiedMarkingSchemeCount: 0,
      hasVerifiedPaperMetadata: false,
    }),
  });
}

function questionCards(questions, { numbered = true } = {}) {
  return `<div class="study-question-list">${questions.map((question, index) => `<article><span>${numbered ? String(index + 1).padStart(2, "0") : escapeHtml(question.source === "textbook" ? "TB" : "QB")}</span><div><small>${question.source === "textbook" ? "Balbharati textbook" : "HSC Question Bank source"} · ${escapeHtml(question.type.replaceAll("_", " "))}</small><h3>${escapeHtml(question.prompt)}</h3><a href="${escapeHtml(question.href)}">${escapeHtml(question.anchor)} <span aria-hidden="true">→</span></a></div></article>`).join("")}</div>`;
}

function modeNavigation(current) {
  const modes = [
    ["study", "Study centre"], ["revision", "Revision"], ["important-questions", "Important questions"],
    ["practice", "Practice"], ["answer-writing", "Answer writing"],
  ];
  return `<nav class="study-mode-nav" aria-label="Electrostatics study modes"><a href="${STUDY_CLUSTER_BASE}">Chapter solutions</a>${modes.map(([slug, label]) => `<a href="${STUDY_CLUSTER_BASE}/${slug}"${current === slug ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>`;
}

function trustStrip(model) {
  return `<aside class="study-trust"><span>Evidence ledger</span><p><strong>${model.evidence.textbookQuestionCount}</strong> textbook solutions</p><p><strong>${model.evidence.questionBankQuestionCount}</strong> question-bank solutions</p><p><strong>0</strong> unverified PYQ claims published</p><small>Automated source build checked ${escapeHtml(model.publishingGateDate)} · <a href="/reviewers">human review status</a></small></aside>`;
}

function hero(model, route, eyebrow, title, description) {
  return `<section class="study-hero"><div class="study-field-art" aria-hidden="true"><b>+</b><i></i><i></i><i></i><b>−</b></div><div><span class="study-eyebrow">${escapeHtml(eyebrow)}</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><ul><li>Maharashtra Board</li><li>Class 12 Physics</li><li>Chapter 8</li></ul></div>${trustStrip(model)}</section>${modeNavigation(route.kind)}`;
}

function studyHub(model, route) {
  const modules = [
    ["revision", "01", "Chapter revision", "Summary, definitions, formulas, diagram checklist, common mistakes and a five-minute recall route."],
    ["important-questions", "02", "Important questions", "A transparent selection from mapped textbook exercises and the HSC Question Bank source."],
    ["practice", "03", "Private practice", "Timed MCQs, explanations, difficulty filters, saved questions, retry-mistakes and local progress."],
    ["answer-writing", "04", "Answer-writing guide", "Practical structures for 1, 2, 3 and 5 marks, numericals, diagrams, keywords and self-checks."],
  ];
  const cards = modules.map(([slug, number, name, text]) => `<a class="study-module-card" href="${STUDY_CLUSTER_BASE}/${slug}"><span>${number}</span><h2>${escapeHtml(name)}</h2><p>${escapeHtml(text)}</p><b>Study with ${escapeHtml(name.toLocaleLowerCase("en-IN"))} →</b></a>`).join("");
  const concepts = model.concepts.map((concept) => `<a href="${STUDY_CLUSTER_BASE}/concepts/${concept.slug}"><span>${escapeHtml(concept.plainText)}</span><strong>${escapeHtml(concept.name)}</strong><small>${concept.textbookQuestions.length + concept.questionBankQuestions.length} mapped solutions</small></a>`).join("");
  return `${hero(model, route, "Electrostatics study centre", "Study Electrostatics from concept to exam answer", "Move between the exact textbook solutions, focused revision, evidence-based important questions, private practice and concept explanations without losing your place.")}<section class="study-module-grid" aria-label="Study resources">${cards}</section><section class="study-section study-concept-index" id="concept-library"><header><span>Concept library</span><h2>Learn the idea, then solve where it appears</h2><p>Each guide links directly to its textbook questions, question-bank practice and chapter test.</p></header><div>${concepts}</div></section><section class="study-section study-pyq-status"><div><span>Previous-year papers</span><h2>Evidence required before publication</h2><p>No source record currently carries a verified paper year, official paper reference, marks, question number and marking-scheme source together. The question bank is not being relabelled as a previous-year paper.</p></div><a href="${STUDY_CLUSTER_PYQ_PATH}">Check the PYQ publication evidence →</a></section>`;
}

function revisionPage(model, route) {
  const definitions = [
    ["Electric field", "Force per unit positive test charge at a point."],
    ["Electric flux", "A measure of electric field passing through an oriented surface."],
    ["Electric potential", "Work done per unit positive test charge."],
    ["Equipotential surface", "A surface on which electric potential is constant."],
    ["Capacitance", "Charge stored per unit potential difference, C = Q/V."],
    ["Dielectric", "An insulating material that polarizes in an electric field."],
    ["Electrostatic shielding", "Protection of an interior region by a conducting enclosure."],
  ];
  const definitionCards = definitions.map(([term, meaning]) => `<article><h3>${escapeHtml(term)}</h3><p>${escapeHtml(meaning)}</p></article>`).join("");
  const formulaCards = model.concepts.map((concept) => `<article id="formula-${escapeHtml(concept.slug)}"><h3><a href="${STUDY_CLUSTER_BASE}/concepts/${concept.slug}">${escapeHtml(concept.name)}</a></h3>${renderSemanticMath(concept.formula, { visiblePlain: true })}<small>${concept.textbookQuestions.length + concept.questionBankQuestions.length} mapped questions</small></article>`).join("");
  const diagrams = model.diagramQuestions.slice(0, 5);
  return `${hero(model, route, "One-page chapter revision", "Electrostatics revision: definitions, formulas and exam checks", "Revise the complete Chapter 8 chain: charge and field, flux and potential, capacitance, combinations, dielectrics and stored energy.")}<section class="study-section study-overview"><header><span>Chapter in one page</span><h2>The story of Electrostatics</h2></header><div class="study-prose"><p>Electrostatics begins with charges at rest. Coulomb’s law predicts the force between point charges, while the electric field describes how a source charge influences the space around it. Gauss’s law connects a closed surface’s net flux to its enclosed charge and becomes especially powerful when symmetry is present.</p><p>Potential and potential energy turn the same physics into scalar calculations. Conductors in electrostatic equilibrium have no internal electric field and support electrostatic shielding. Capacitors then use separated charge to store energy: geometry controls capacitance, series and parallel connections change the equivalent value, and dielectrics change the field and capacitance. Whether charge or voltage stays fixed determines every energy prediction.</p></div></section><section class="study-section"><header><span>Key definitions</span><h2>Terms to recall exactly</h2></header><div class="study-definition-grid">${definitionCards}</div></section><section class="study-section"><header><span>Formula sheet</span><h2>Seven relations with linked practice</h2></header><div class="study-formula-grid">${formulaCards}</div></section><section class="study-section study-split"><div><span>Diagram checklist</span><h2>Figures worth practising</h2>${questionCards(diagrams, { numbered: false })}</div><div><span>Common mistakes</span><h2>Fast self-check before submitting</h2><ul class="study-checklist"><li>Separate scalar potential from vector electric field.</li><li>Identify whether charge or voltage stays constant before using an energy formula.</li><li>Test the circuit nodes before calling capacitors series or parallel.</li><li>Keep exponent signs, SI prefixes and units attached to their values.</li><li>For Gauss’s law, distinguish zero enclosed charge from zero field.</li><li>For a partial dielectric slab, include both dielectric and air regions.</li></ul></div></section><section class="study-section study-five-minute"><header><span>Five-minute revision</span><h2>Recall in this order</h2></header><ol><li><b>00:00–01:00</b><span>Say the definitions of field, flux, potential and capacitance.</span></li><li><b>01:00–02:00</b><span>Write Coulomb’s law, point-charge potential and Gauss’s law from memory.</span></li><li><b>02:00–03:00</b><span>Write the parallel-plate, series and parallel capacitance relations.</span></li><li><b>03:00–04:00</b><span>Compare energy changes for fixed Q and fixed V.</span></li><li><b>04:00–05:00</b><span>Explain one dielectric mistake and one circuit-identification mistake.</span></li></ol><a class="study-primary-action" href="${STUDY_CLUSTER_BASE}/practice">Start the 15-minute chapter test →</a></section>`;
}

function importantPage(model, route) {
  return `${hero(model, route, "Evidence-based selection", "Important Electrostatics questions—with the selection method shown", "These are not a vague “top 50.” Every item is drawn from a mapped source and selected for concept coverage, calculation depth or a required derivation/diagram.")}<section class="study-section"><header><span>Selection ledger</span><h2>What counted—and what did not</h2></header><div class="study-method-grid"><article class="is-used"><b>Used</b><h3>Textbook exercises</h3><p>${model.evidence.textbookQuestionCount} mapped Balbharati Chapter 8 questions.</p></article><article class="is-used"><b>Used</b><h3>HSC Question Bank source</h3><p>${model.evidence.questionBankQuestionCount} mapped Chapter 8 questions; not labelled as PYQs.</p></article><article><b>Not used</b><h3>Previous board papers</h3><p>No verified paper-year and official-source pair exists in the current records.</p></article><article><b>Not used</b><h3>Repeated board concepts</h3><p>No evidence-backed appearance counts exist yet, so no frequency claim is made.</p></article><article><b>Not used</b><h3>Syllabus outcomes</h3><p>Learning-outcome identifiers are not mapped in the current import.</p></article></div><p class="study-note"><strong>Editorial rule:</strong> selection increases coverage, not predicted-paper certainty. “Important” here means useful for mastering the mapped chapter, not guaranteed to appear in an exam.</p></section><section class="study-section"><header><span>Selected set</span><h2>Fourteen questions spanning the chapter</h2><p>Includes dielectric behaviour, potential, energy, flux, series/parallel combinations, derivations and numericals.</p></header>${questionCards(model.important)}</section><section class="study-section study-callout"><h2>Turn the set into practice</h2><p>Review the concept guides first, then answer under a 15-minute timer and retry only the questions you miss.</p><a class="study-primary-action" href="${STUDY_CLUSTER_BASE}/practice">Open private practice →</a></section>`;
}

function practiceQuestionMarkup(question, index) {
  const choices = question.choices.map((choice) => `<label><input type="radio" name="practice-${index}" value="${escapeHtml(choice.id)}"><span><b>${escapeHtml(choice.id.toUpperCase())}</b>${escapeHtml(choice.content)}</span></label>`).join("");
  return `<article class="practice-card" data-practice-id="${escapeHtml(question.id)}" data-answer="${escapeHtml(question.correctChoiceId)}" data-difficulty="${escapeHtml(question.difficulty)}" data-source="${escapeHtml(question.source)}"><header><span>Question ${index + 1}</span><button type="button" data-save aria-pressed="false">Save</button></header><small>${question.source === "textbook" ? "Balbharati textbook" : "HSC Question Bank source"} · ${escapeHtml(question.difficulty)} practice estimate</small><h2>${escapeHtml(question.prompt)}</h2><fieldset><legend>Choose one answer</legend>${choices}</fieldset><div class="practice-actions"><button type="button" data-check>Check answer</button><a href="${escapeHtml(question.href)}">${escapeHtml(question.anchor)}</a></div><p class="practice-feedback" data-feedback hidden></p><details><summary>Why?</summary><p>${escapeHtml(question.explanation || "Open the worked solution to review the governing relation.")}</p></details></article>`;
}

function practicePage(model, route) {
  const cards = model.practiceQuestions.map(practiceQuestionMarkup).join("");
  return `${hero(model, route, "No-login practice", "Electrostatics chapter test and MCQ practice", "Use the timer, filter by difficulty, save questions and retry mistakes. Progress stays in this browser; StudyWudy does not need your name, email or account.")}<section class="study-section practice-dashboard" data-study-practice="local-only-v1"><header><div><span>15-minute chapter test</span><h2>Your private practice desk</h2></div><div class="practice-timer"><output data-timer>15:00</output><button type="button" data-timer-toggle>Start timer</button><button type="button" data-timer-reset>Reset</button></div></header><div class="practice-controls"><label>Difficulty<select data-difficulty-filter><option value="all">All levels</option><option value="foundation">Foundation</option><option value="standard">Standard</option><option value="challenging">Challenging</option></select></label><button type="button" data-filter-saved>Saved only</button><button type="button" data-retry-mistakes>Retry mistakes</button><button type="button" data-show-all>Show all</button></div><div class="practice-progress" aria-live="polite"><span><b data-completed>0</b> checked</span><span><b data-correct>0</b> correct</span><span><b data-mistakes>0</b> to retry</span></div><p class="study-note"><strong>Difficulty note:</strong> foundation, standard and challenging are StudyWudy practice estimates based on question type, wording and solution steps—not official board ratings.</p><div class="practice-list">${cards}</div><noscript><p class="study-note">The questions and solution links remain available without JavaScript. Timer and browser-only progress need JavaScript.</p></noscript></section><section class="study-section"><header><span>Assertion–reason practice</span><h2>Two concept checks</h2></header><div class="study-definition-grid"><article><h3>Assertion: an isolated charged capacitor keeps the same charge when plate separation changes.</h3><p><strong>Reason:</strong> with no conducting path, charge cannot leave the plates. Both statements are true and the reason explains the assertion.</p></article><article><h3>Assertion: zero net flux through a closed surface means the field is zero everywhere.</h3><p><strong>Reason:</strong> flux is a signed surface sum. The assertion is false; inward and outward contributions can cancel while the local field is non-zero.</p></article></div></section><script src="/study-cluster.js?v=1" defer data-studywudy-practice="local-only-v1"></script>`;
}

function answerWritingPage(model, route) {
  const dielectricExample = model.concepts.find((concept) => concept.slug === "dielectric-slab-in-capacitor").textbookQuestions[0];
  return `${hero(model, route, "Board-exam practice structure", "How to write Class 12 Physics answers for 1, 2, 3 and 5 marks", "Match the depth of your response to the demand of the question: direct result first, then the exact principle, working, units, diagram and conclusion that earn clarity.")}<section class="study-section"><header><span>Answer-length ladder</span><h2>What a complete response usually contains</h2></header><div class="study-marks-grid"><article><strong>1 mark</strong><h3>One exact fact</h3><p>State the term, option, formula or result directly. Include the unit where the quantity requires one.</p></article><article><strong>2 marks</strong><h3>Result + governing reason</h3><p>Give the answer, name the principle or relation, and show one decisive reasoning step.</p></article><article><strong>3 marks</strong><h3>Method + working + result</h3><p>Write the formula, substitute clearly, keep signs and units, and finish with a separate final answer.</p></article><article><strong>5 marks</strong><h3>Structured derivation or explanation</h3><p>State assumptions, develop equations or labelled points in order, include the required diagram, and conclude.</p></article></div><p class="study-note"><strong>Evidence boundary:</strong> this is StudyWudy’s practice structure. The current Chapter 8 records do not contain an official marking scheme, so these are not claimed as official mark allocations.</p></section><section class="study-section study-split"><div><span>Numerical self-check</span><h2>Make every step visible</h2><ol class="study-numbered"><li><b>Given / required</b><span>Convert to SI units before substitution.</span></li><li><b>Formula</b><span>Name the relation and the constant quantity.</span></li><li><b>Substitution</b><span>Keep powers of ten and units attached.</span></li><li><b>Arithmetic</b><span>Check sign, exponent and sensible magnitude.</span></li><li><b>Final answer</b><span>Box the value with its unit.</span></li></ol></div><div><span>Keywords and diagrams</span><h2>Use terms that show the physics</h2><ul class="study-checklist"><li><strong>Potential:</strong> scalar, work per unit positive test charge.</li><li><strong>Conductor:</strong> electrostatic equilibrium, internal field zero, equipotential.</li><li><strong>Capacitor:</strong> same charge in series, same voltage in parallel.</li><li><strong>Dielectric:</strong> polarization, reduced effective field, dielectric constant.</li><li><strong>Gauss:</strong> closed surface, outward area vector, enclosed charge.</li><li>Label plate area, separation, dielectric thickness, field direction and circuit nodes where relevant.</li></ul></div></section><section class="study-section"><header><span>Model versus weak answer</span><h2>Example: dielectric slab in a capacitor</h2></header><div class="study-compare"><article><b>Weak</b><p>“The capacitance increases because dielectric is added.”</p><small>It states a trend but does not identify partial filling, the equivalent regions, or the usable relation.</small></article><article><b>Model</b><p>“The slab of thickness t and dielectric constant K leaves an air gap d − t. The two regions act in series, so the effective separation is d − t + t/K. Therefore C = ε₀A/(d − t + t/K), which is greater than ε₀A/d for K &gt; 1.”</p><small>Direct result, physical model, formula and conclusion are all specific to the question.</small></article></div><a class="study-primary-action" href="${dielectricExample.href}">${escapeHtml(dielectricExample.anchor)} →</a></section>`;
}

function conceptPage(model, route) {
  const concept = model.concepts.find((item) => item.slug === route.concept.slug);
  const related = model.concepts.filter((item) => item.slug !== concept.slug).slice(0, 3);
  return `${hero(model, route, "Electrostatics concept guide", `${concept.name}: meaning, formula and solved questions`, concept.definition)}<section class="study-section concept-core" id="core-relation"><div><span>Core relation</span><h2>${escapeHtml(concept.name)}</h2>${renderSemanticMath(concept.formula, { visiblePlain: true })}<p id="when-to-use">${escapeHtml(concept.use)}</p></div><aside><span>Quick example</span><p>${escapeHtml(concept.example)}</p><strong>Common mistake</strong><p>${escapeHtml(concept.mistake)}</p></aside></section><section class="study-section study-split"><div><span>Textbook solutions</span><h2>Where the concept is used in Balbharati</h2>${questionCards(concept.textbookQuestions, { numbered: false })}</div><div><span>Question-bank practice</span><h2>More mapped questions</h2>${questionCards(concept.questionBankQuestions, { numbered: false })}</div></section><section class="study-section concept-next"><header><span>Practise and connect</span><h2>Use the concept, then compare nearby ideas</h2></header><div><a class="study-primary-action" href="${STUDY_CLUSTER_BASE}/practice">Test this concept in chapter practice →</a><a href="${STUDY_CLUSTER_BASE}/revision">Revise all Chapter 8 formulas →</a></div><nav aria-label="Related Electrostatics concepts">${related.map((item) => `<a href="${STUDY_CLUSTER_BASE}/concepts/${item.slug}">${escapeHtml(item.name)} →</a>`).join("")}</nav></section>`;
}

function pyqEvidencePage(model, route) {
  return `${hero(model, route, "Not a PYQ collection yet", "Previous-year Electrostatics questions: verification desk", "This route is intentionally excluded from search indexing until the records contain verifiable paper provenance. A question bank is not a previous-year board paper.")}<section class="study-section pyq-ledger"><header><span>Publication gate</span><h2>Current verified inventory</h2></header><div><article><strong>0</strong><span>official papers with a year and source</span></article><article><strong>0</strong><span>paper questions mapped to Chapter 8</span></article><article><strong>0</strong><span>verified marking schemes</span></article></div><p class="study-note"><strong>Noindex status:</strong> this page is for transparency and data readiness. It will not enter the sitemap or become indexable merely to create a traffic category.</p></section><section class="study-section"><header><span>Required evidence</span><h2>A PYQ can publish only when all fields pass</h2></header><ol class="study-import-gate"><li><b>Official paper reference</b><span>Board-hosted PDF, archive reference, or preserved source record.</span></li><li><b>Year and session</b><span>For example, March 2025 or supplementary examination.</span></li><li><b>Paper question number</b><span>The exact location in the source paper.</span></li><li><b>Marks</b><span>Recorded from the paper, never inferred from answer length.</span></li><li><b>Chapter mapping</b><span>Reviewed mapping to Electrostatics and the relevant concept.</span></li><li><b>Marking-scheme source</b><span>Required before calling an answer marking-scheme-aligned.</span></li></ol></section><section class="study-section study-callout"><h2>What is available now</h2><p>The Maharashtra HSC Question Bank source has ${model.evidence.questionBankQuestionCount} mapped Electrostatics questions, but no verified paper year or official-paper provenance. Use it as additional practice, not as PYQ evidence.</p><a href="/${QBANK_ROUTE.boardSlug}/class-${QBANK_ROUTE.classNumber}/${QBANK_ROUTE.subjectSlug}/${QBANK_ROUTE.textbookSlug}/${QBANK_ROUTE.chapterSlug}">Open the HSC Question Bank chapter →</a></section>`;
}

function metadataFor(route) {
  if (route.kind === "concept") return {
    title: `${route.concept.name} – Class 12 Physics Electrostatics | StudyWudy`,
    description: `Learn ${route.concept.name} for Maharashtra Board Class 12 Physics with the key formula, worked example, common mistake, textbook solutions and chapter practice.`,
  };
  return ({
    study: {
      title: "Class 12 Electrostatics Study Centre: Revision, Tests and Concepts | StudyWudy",
      description: "Study Maharashtra Board Class 12 Physics Chapter 8 Electrostatics with revision notes, important questions, private practice, answer-writing guidance and concept guides.",
    },
    revision: {
      title: "Electrostatics Revision Notes and Formula Sheet – Class 12 | StudyWudy",
      description: "Revise Maharashtra Board Class 12 Physics Electrostatics with a one-page summary, key definitions, seven formulas, diagram checklist, common mistakes and a five-minute review.",
    },
    "important-questions": {
      title: "Important Electrostatics Questions – Class 12 Physics | StudyWudy",
      description: "Practise 14 evidence-selected Electrostatics questions from Balbharati exercises and the Maharashtra HSC Question Bank source, with a transparent selection method.",
    },
    practice: {
      title: "Electrostatics MCQ Practice and Chapter Test – Class 12 | StudyWudy",
      description: "Take a private 15-minute Electrostatics test with MCQs, answer explanations, difficulty filters, saved questions, retry-mistakes mode and browser-only progress.",
    },
    "answer-writing": {
      title: "Class 12 Physics Answer-Writing Guide for Electrostatics | StudyWudy",
      description: "Learn how to structure 1, 2, 3 and 5-mark Electrostatics answers, including formulas, substitutions, units, diagrams, keywords and final-answer checks.",
    },
    "previous-year-questions": {
      title: "Electrostatics PYQ Verification Desk – Class 12 Physics | StudyWudy",
      description: "See the evidence required before StudyWudy publishes previous-year Electrostatics questions, paper years, marks or marking-scheme-aligned answers.",
    },
  })[route.kind];
}

function breadcrumbItems(model, route) {
  const items = [...academicBreadcrumbItems({
    board_slug: PRIMARY_ROUTE.boardSlug,
    grade_slug: `class-${PRIMARY_ROUTE.classNumber}`,
    class_number: PRIMARY_ROUTE.classNumber,
    subject_slug: PRIMARY_ROUTE.subjectSlug,
    subject_name: model.subject,
    book_slug: PRIMARY_ROUTE.textbookSlug,
    book_title: model.textbook,
    chapter_slug: PRIMARY_ROUTE.chapterSlug,
    chapter_number: model.chapterNumber,
    chapter_title: model.chapter,
  })];
  if (route.kind === "concept") {
    items.push({ name: "Concepts", href: `${STUDY_CLUSTER_BASE}/study#concept-library` });
    items.push({ name: route.concept.name, href: route.pathname });
  } else {
    items.push({ name: ROUTE_LABELS[route.kind], href: route.pathname });
  }
  return items;
}

export function renderStudyClusterPage(model, route) {
  if (!model || !route) return null;
  const metadata = metadataFor(route);
  const breadcrumbs = breadcrumbItems(model, route);
  let content;
  if (route.kind === "study") content = studyHub(model, route);
  else if (route.kind === "revision") content = revisionPage(model, route);
  else if (route.kind === "important-questions") content = importantPage(model, route);
  else if (route.kind === "practice") content = practicePage(model, route);
  else if (route.kind === "answer-writing") content = answerWritingPage(model, route);
  else if (route.kind === "previous-year-questions") content = pyqEvidencePage(model, route);
  else content = conceptPage(model, route);
  const structuredData = stringifyStructuredData(studyResourceStructuredData({
    route,
    metadata,
    reviewedIso: model.reviewedIso,
    breadcrumbs,
    model,
  }));
  return Object.freeze({
    title: metadata.title,
    description: metadata.description,
    canonical: `${CANONICAL_ORIGIN}${route.pathname}`,
    robots: route.indexable ? "index, follow" : "noindex, follow",
    body: `${renderBreadcrumbNavigation(breadcrumbs)}<div class="shell study-cluster" data-study-cluster="electrostatics-v1">${content}<footer class="study-cluster-footer"><span>Source-specific study resources</span><p>Built from mapped chapter records; unsupported year, marks and repetition claims are withheld.</p><a href="/about/methodology">Review methodology →</a></footer></div><script type="application/ld+json" data-studywudy-study-cluster data-schema-profile="selective-v1">${structuredData}</script>`,
  });
}

export const STUDY_CLUSTER_STYLES = `<style id="study-cluster-styles">
.study-cluster{--study-ink:#11151a;--study-blue:#0757d8;--study-violet:#6338c7;--study-coral:#db4b34;--study-yellow:#ffd52a;--study-paper:#f5f0e6;--study-mint:#dff1e8;color:var(--study-ink);padding-bottom:4rem}.study-cluster *{box-sizing:border-box}.study-cluster a{text-underline-offset:.18em}.study-hero{position:relative;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(260px,.55fr);gap:2rem;overflow:hidden;margin:1.2rem 0 .8rem;padding:clamp(1.4rem,4vw,3.4rem);border:2px solid var(--study-ink);border-radius:28px;background:var(--study-paper);box-shadow:8px 8px 0 var(--study-ink)}.study-hero>div:not(.study-field-art){position:relative;z-index:1}.study-eyebrow,.study-section header>span,.study-section>div>span,.study-section>span,.study-concept-index header>span,.study-pyq-status span{display:block;color:var(--study-blue);font-size:.73rem;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.study-hero h1{max-width:19ch;margin:.45rem 0 .8rem;font-size:clamp(2.15rem,5.2vw,4.6rem);line-height:.97;letter-spacing:-.06em}.study-hero>div>p{max-width:65ch;margin:0;font-size:clamp(1rem,1.8vw,1.18rem);line-height:1.68}.study-hero ul{display:flex;flex-wrap:wrap;gap:.45rem;margin:1.1rem 0 0;padding:0;list-style:none}.study-hero li{padding:.38rem .6rem;border:1px solid var(--study-ink);border-radius:999px;background:#fff;font-size:.74rem;font-weight:800}.study-field-art{position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;opacity:.12;pointer-events:none}.study-field-art b{font-size:12rem;line-height:1}.study-field-art i{width:18%;height:2px;background:var(--study-blue);box-shadow:0 -38px 0 var(--study-blue),0 38px 0 var(--study-blue)}.study-trust{position:relative;z-index:1;align-self:end;padding:1rem;border:2px solid var(--study-ink);border-radius:18px;background:#fff}.study-trust>span{display:block;margin-bottom:.7rem;color:var(--study-violet);font-size:.7rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.study-trust p{display:flex;align-items:baseline;gap:.5rem;margin:.35rem 0;font-size:.8rem}.study-trust p strong{color:var(--study-blue);font-size:1.35rem}.study-trust small{display:block;margin-top:.8rem;padding-top:.7rem;border-top:1px solid #d9d2c6;color:#58616a;line-height:1.45}.study-mode-nav{display:flex;gap:.35rem;overflow-x:auto;padding:.5rem;border:1px solid #c8c1b6;border-radius:14px;background:#fff}.study-mode-nav a{flex:0 0 auto;padding:.6rem .72rem;border-radius:8px;color:#273039;font-size:.8rem;font-weight:800;text-decoration:none}.study-mode-nav a[aria-current=page]{background:var(--study-ink);color:#fff}.study-module-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.8rem;margin-top:1rem}.study-module-card{position:relative;min-height:230px;padding:1.25rem;border:2px solid var(--study-ink);border-radius:20px;background:#fff;color:inherit;text-decoration:none}.study-module-card:nth-child(2){background:var(--study-yellow)}.study-module-card:nth-child(3){background:var(--study-mint)}.study-module-card:nth-child(4){background:#eee6ff}.study-module-card>span{display:grid;place-items:center;width:2.35rem;height:2.35rem;border-radius:50%;background:var(--study-ink);color:#fff;font-size:.75rem;font-weight:900}.study-module-card h2{margin:1.4rem 0 .4rem;font-size:1.6rem;letter-spacing:-.03em}.study-module-card p{max-width:52ch;margin:.3rem 0 1.1rem;line-height:1.6}.study-module-card b{color:var(--study-blue);font-size:.85rem}.study-section{margin-top:1rem;padding:clamp(1.15rem,3vw,2.2rem);border:1px solid #cfc8bc;border-radius:22px;background:#fff}.study-section>header{display:flex;align-items:end;justify-content:space-between;gap:2rem;margin-bottom:1.2rem;padding-bottom:1rem;border-bottom:1px solid #ddd6ca}.study-section h2,.study-pyq-status h2{margin:.25rem 0 .45rem;font-size:clamp(1.55rem,3vw,2.45rem);letter-spacing:-.045em}.study-section header>p{max-width:56ch;margin:0;color:#56616a;line-height:1.55}.study-concept-index>div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.6rem}.study-concept-index>div>a{display:flex;min-height:155px;flex-direction:column;padding:1rem;border:1px solid #cfc8bc;border-radius:15px;background:var(--study-paper);color:inherit;text-decoration:none}.study-concept-index>div>a>span{overflow-x:auto;color:var(--study-violet);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.78rem;font-weight:800;white-space:nowrap}.study-concept-index strong{margin:auto 0 .3rem;font-size:1rem}.study-concept-index small{color:#58616a}.study-pyq-status{display:flex;align-items:center;justify-content:space-between;gap:2rem;background:var(--study-ink);color:#fff}.study-pyq-status span{color:#ffb8aa}.study-pyq-status p{max-width:75ch;color:#d6dadd;line-height:1.65}.study-pyq-status>a{flex:0 0 auto;color:#fff;font-weight:850}.study-prose{columns:2;column-gap:2.5rem}.study-prose p{margin-top:0;line-height:1.75}.study-definition-grid,.study-formula-grid,.study-method-grid,.study-marks-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem}.study-definition-grid article,.study-formula-grid article,.study-method-grid article,.study-marks-grid article{min-width:0;padding:1rem;border:1px solid #d3ccc1;border-radius:15px;background:#faf7f0}.study-definition-grid h3,.study-formula-grid h3,.study-method-grid h3,.study-marks-grid h3{margin:.1rem 0 .45rem;font-size:1rem}.study-definition-grid p,.study-method-grid p,.study-marks-grid p{margin:.25rem 0;color:#4e5962;font-size:.86rem;line-height:1.55}.study-formula-grid .math{display:block;overflow-x:auto;margin:.8rem 0;padding:.72rem;border-radius:9px;background:var(--study-ink);color:#fff!important;font-size:.82rem;white-space:nowrap}.study-formula-grid small{color:#55616a}.study-split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2rem}.study-split>div{min-width:0}.study-checklist{margin:1rem 0 0;padding:0;list-style:none}.study-checklist li{position:relative;padding:.75rem .4rem .75rem 2rem;border-top:1px solid #ded7cb;line-height:1.55}.study-checklist li::before{position:absolute;left:.35rem;content:"✓";color:var(--study-blue);font-weight:900}.study-five-minute ol,.study-numbered,.study-import-gate{margin:0;padding:0;list-style:none}.study-five-minute li,.study-numbered li,.study-import-gate li{display:grid;grid-template-columns:110px 1fr;gap:1rem;padding:.8rem 0;border-top:1px solid #d8d1c6}.study-five-minute li b,.study-numbered li b,.study-import-gate li b{color:var(--study-violet)}.study-primary-action{display:inline-flex;margin-top:1rem;padding:.75rem 1rem;border:2px solid var(--study-ink);border-radius:10px;background:var(--study-yellow);color:var(--study-ink);font-weight:900;text-decoration:none}.study-question-list{display:grid;gap:.5rem}.study-question-list article{display:grid;grid-template-columns:auto 1fr;gap:.8rem;padding:.9rem;border:1px solid #d4cdc2;border-radius:13px;background:#fff}.study-question-list article>span{display:grid;place-items:center;width:2.35rem;height:2.35rem;border-radius:10px;background:var(--study-ink);color:#fff;font-size:.72rem;font-weight:900}.study-question-list h3{margin:.25rem 0 .5rem;font-size:.94rem;line-height:1.42}.study-question-list small{color:#5b6570;font-size:.7rem;text-transform:capitalize}.study-question-list a{color:var(--study-blue);font-size:.8rem;font-weight:850}.study-method-grid article>b{color:#7a4f44;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase}.study-method-grid article.is-used{border-color:#7cab91;background:#ecf7f0}.study-method-grid article.is-used>b{color:#17603a}.study-note{margin:1rem 0 0;padding:.85rem 1rem;border-left:5px solid var(--study-violet);background:#f1ecfa;line-height:1.6}.study-callout{text-align:center;background:var(--study-yellow)}.practice-dashboard>header{align-items:center}.practice-timer{display:flex;align-items:center;gap:.45rem}.practice-timer output{min-width:5ch;font:900 1.7rem/1 ui-monospace,SFMono-Regular,Menlo,monospace}.practice-timer button,.practice-controls button,.practice-card button{padding:.58rem .7rem;border:1px solid var(--study-ink);border-radius:8px;background:#fff;color:var(--study-ink);font-weight:800;cursor:pointer}.practice-controls{display:flex;flex-wrap:wrap;gap:.5rem}.practice-controls label{display:flex;align-items:center;gap:.5rem;padding:.45rem .6rem;border:1px solid #cfc8bc;border-radius:8px}.practice-controls select{border:0;background:transparent;font:inherit}.practice-progress{display:flex;gap:.6rem;margin:1rem 0}.practice-progress span{padding:.55rem .7rem;border-radius:9px;background:var(--study-paper);font-size:.8rem}.practice-progress b{color:var(--study-blue)}.practice-list{display:grid;gap:.75rem;margin-top:1rem}.practice-card{padding:1rem;border:2px solid #cfc8bc;border-radius:18px;background:#fff}.practice-card[hidden]{display:none}.practice-card>header{display:flex;justify-content:space-between}.practice-card>small{text-transform:capitalize}.practice-card h2{max-width:75ch;margin:.7rem 0;font-size:1.08rem;line-height:1.45}.practice-card fieldset{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem;margin:0;padding:0;border:0}.practice-card legend{position:absolute;overflow:hidden;width:1px;height:1px;clip:rect(0 0 0 0)}.practice-card label{cursor:pointer}.practice-card label>input{position:absolute;opacity:0}.practice-card label>span{display:flex;gap:.6rem;height:100%;padding:.7rem;border:1px solid #d5cec3;border-radius:10px}.practice-card label>input:checked+span{border-color:var(--study-blue);background:#eaf1ff}.practice-card label b{color:var(--study-blue)}.practice-actions{display:flex;align-items:center;gap:.8rem;margin-top:.75rem}.practice-actions button{background:var(--study-ink);color:#fff}.practice-actions a{font-size:.8rem;font-weight:850}.practice-feedback{padding:.65rem;border-radius:8px;font-weight:800}.practice-feedback.is-correct{background:#dff1e8;color:#145832}.practice-feedback.is-wrong{background:#ffe7e1;color:#7b2e22}.study-marks-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.study-marks-grid article>strong{display:inline-grid;place-items:center;width:3.7rem;height:3.7rem;border-radius:50%;background:var(--study-blue);color:#fff}.study-numbered li{grid-template-columns:150px 1fr}.study-compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem}.study-compare article{padding:1.1rem;border:2px solid #d7cfc3;border-radius:15px}.study-compare article:last-child{border-color:#73a98a;background:#eaf6ee}.study-compare article>b{color:var(--study-coral);text-transform:uppercase}.study-compare article:last-child>b{color:#17603a}.study-compare p{line-height:1.65}.concept-core{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(260px,.75fr);gap:2rem;background:var(--study-paper)}.concept-core .math{display:block;overflow-x:auto;margin:1.2rem 0;padding:1rem;border-radius:12px;background:var(--study-ink);color:#fff!important;font-size:1.05rem;white-space:nowrap}.concept-core>div>p,.concept-core aside p{line-height:1.65}.concept-core aside{padding:1rem;border:2px solid var(--study-ink);border-radius:15px;background:#fff}.concept-core aside>strong{display:block;margin-top:1rem;color:var(--study-coral)}.concept-next>div{display:flex;gap:.6rem;align-items:center}.concept-next>div>a:not(.study-primary-action){margin-top:1rem;font-weight:850}.concept-next nav{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:1rem;padding-top:1rem;border-top:1px solid #d7cfc3}.concept-next nav a{padding:.55rem .7rem;border:1px solid #cbc4b8;border-radius:8px;font-size:.82rem;font-weight:800;text-decoration:none}.pyq-ledger>div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem}.pyq-ledger article{display:flex;min-height:140px;flex-direction:column;justify-content:center;padding:1rem;border:2px solid var(--study-ink);border-radius:15px;background:var(--study-paper);text-align:center}.pyq-ledger article strong{color:var(--study-coral);font-size:3rem;line-height:1}.pyq-ledger article span{margin-top:.5rem;font-size:.82rem;font-weight:800}.study-cluster-footer{display:flex;align-items:center;gap:1rem;margin-top:1rem;padding:1rem;border-top:2px solid var(--study-ink);font-size:.78rem}.study-cluster-footer>span{font-weight:900;text-transform:uppercase}.study-cluster-footer p{margin:0 auto}.study-cluster-footer a{font-weight:850}
@media(max-width:900px){.study-hero{grid-template-columns:1fr}.study-concept-index>div,.study-definition-grid,.study-formula-grid,.study-method-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.study-marks-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.study-section>header{align-items:start;flex-direction:column;gap:.5rem}.study-trust{max-width:520px}.study-prose{columns:1}}
@media(max-width:680px){.study-cluster{padding-inline:.15rem}.study-hero{padding:1.2rem;border-radius:18px;box-shadow:4px 4px 0 var(--study-ink)}.study-hero h1{font-size:2.35rem}.study-module-grid,.study-concept-index>div,.study-definition-grid,.study-formula-grid,.study-method-grid,.study-marks-grid,.study-split,.study-compare,.concept-core,.pyq-ledger>div{grid-template-columns:1fr}.study-section{padding:1rem;border-radius:16px}.study-pyq-status,.study-cluster-footer{align-items:flex-start;flex-direction:column}.study-pyq-status>a{white-space:normal}.practice-card fieldset{grid-template-columns:1fr}.practice-dashboard>header,.practice-timer{align-items:flex-start}.practice-timer{flex-wrap:wrap}.study-five-minute li,.study-numbered li,.study-import-gate li{grid-template-columns:1fr;gap:.25rem}.concept-next>div{align-items:flex-start;flex-direction:column}.study-cluster-footer p{margin:0}}
</style>`;
