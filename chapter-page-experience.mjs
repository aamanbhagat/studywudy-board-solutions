import { contentToText, renderedAnswerText } from "./answer-completeness.mjs";
import { getQuestionUrl } from "./question-routes.mjs";
import { formulaRepresentations, renderSemanticMath, validateFormulaRepresentations } from "./semantic-math.mjs";
import { corpusQuestionSnippetEligible } from "./corpus-quality.mjs";

const QUESTION_TYPE_LABELS = Object.freeze({
  one_word: "One-word answers",
  one_sentence: "One-sentence answers",
  brief: "Short answers",
  detailed: "Long answers",
  define: "Definitions",
  give_reason: "Give-reason answers",
  name_list: "Name or list answers",
  mcq_single: "Single-choice MCQs",
  mcq_multi: "Multiple-choice MCQs",
  assertion_reason: "Assertion–reason questions",
  true_false: "True or false",
  fill_blank: "Fill in the blanks",
  match_column: "Match the columns",
  distinguish: "Distinguish between",
  passage: "Passage-based answers",
  numerical: "Numericals",
  diagram: "Diagram questions",
});

const EXPECTED_FORMATS = Object.freeze({
  one_word: "Give the exact term, followed by brief context only where it helps.",
  one_sentence: "State the direct result in one complete sentence.",
  brief: "Answer the required textbook points concisely and use the chapter terminology.",
  detailed: "Organise the explanation into logical points or stages and finish with the conclusion.",
  define: "Write the exact definition and identify its defining quantity or condition.",
  give_reason: "State the conclusion first, then connect it to the governing principle.",
  name_list: "Give every requested name or point in textbook order.",
  mcq_single: "Choose one option and justify it using the governing relation or principle.",
  mcq_multi: "Identify every correct option and explain why the alternatives fail.",
  assertion_reason: "State the assertion–reason relationship, then justify that relationship.",
  true_false: "Give the verdict, correct the statement when false, and add the reason.",
  fill_blank: "Complete the blank and add a short explanation when the relation is not obvious.",
  match_column: "Show the complete matching set and the relation behind each match.",
  distinguish: "Compare the requested properties point by point in a parallel structure.",
  passage: "Answer every sub-question using evidence or information from the passage.",
  numerical: "Write the formula, substitute values with units, check the arithmetic, and box the result.",
  diagram: "Draw or read the required figure, label it clearly, and explain what it establishes.",
});

const CHAPTER_PROFILES = Object.freeze({
  "physics/electrostatics": Object.freeze({
    overview: Object.freeze([
      "Electrostatics studies electric charges at rest and the forces, fields, potentials and energy associated with them. The chapter moves from charge interactions and electric flux to potential, conductors and electrostatic shielding.",
      "Its second major thread is capacitance: how geometry and dielectrics change a capacitor, how capacitors combine, and how charge, voltage and stored energy respond when a battery is connected or removed. The chapter questions therefore require both conceptual predictions and careful numerical work.",
    ]),
    formulas: Object.freeze([
      Object.freeze({
        id: "coulombs-law",
        name: "Coulomb’s law",
        source: "F=\\frac{1}{4\\pi\\varepsilon_0}\\frac{|q_1q_2|}{r^2}",
        note: "Magnitude of the force between two point charges separated by distance r.",
        patterns: Object.freeze([/\bCoulomb(?:’s|'s)?\b/iu, /force between (?:two )?charges/iu, /electrostatic force/iu]),
      }),
      Object.freeze({
        id: "electric-field",
        name: "Electric field",
        source: "E=\\frac{F}{q_0}",
        note: "Force per unit positive test charge; field contributions combine vectorially.",
        patterns: Object.freeze([/electric field/iu, /\bE\s*=\s*(?:\\frac|[^.;]{1,80})/u]),
      }),
      Object.freeze({
        id: "electric-potential",
        name: "Electric potential",
        source: "V=\\frac{U}{q_0};\\quad V=\\frac{1}{4\\pi\\varepsilon_0}\\frac{q}{r}",
        note: "Potential is scalar, so contributions from several charges add algebraically.",
        patterns: Object.freeze([/electric potential/iu, /potential difference/iu, /\bV_[{(]?\w+[})]?\s*=/u]),
      }),
      Object.freeze({
        id: "capacitance",
        name: "Capacitance",
        source: "C=\\frac{Q}{V};\\quad C=\\frac{\\varepsilon_0A}{d}",
        note: "Relates stored charge to potential difference and, for parallel plates, to geometry.",
        patterns: Object.freeze([/capacitance/iu, /parallel[- ]plate capacitor/iu, /\bC\s*=\s*(?:\\frac|[^.;]{1,80})/u]),
      }),
      Object.freeze({
        id: "capacitor-combinations",
        name: "Capacitors in series and parallel",
        source: "\\frac{1}{C_s}=\\sum_i\\frac{1}{C_i};\\quad C_p=\\sum_i C_i",
        note: "Reciprocals add in series; capacitances add directly in parallel.",
        patterns: Object.freeze([/capacitors? in series/iu, /series combination/iu, /parallel combination/iu, /equivalent capacitance/iu]),
      }),
      Object.freeze({
        id: "capacitor-energy",
        name: "Energy stored in a capacitor",
        source: "U=\\frac{1}{2}CV^2=\\frac{Q^2}{2C}=\\frac{1}{2}QV",
        note: "Choose the form that keeps the known or fixed quantities visible.",
        patterns: Object.freeze([/energy stored/iu, /stored in (?:a|the) capacitor/iu, /\bU\s*=\s*(?:\\frac|[^.;]{1,80})/u]),
      }),
      Object.freeze({
        id: "gauss-law",
        name: "Gauss’s law",
        source: "\\Phi_E=\\oint\\vec{E}\\cdot d\\vec{A}=\\frac{Q_{\\mathrm{enclosed}}}{\\varepsilon_0}",
        note: "Links electric flux through a closed surface to the charge enclosed by it.",
        patterns: Object.freeze([/Gauss(?:’s|'s)? law/iu, /electric flux/iu, /enclosed charge/iu]),
      }),
    ]),
  }),
});

function cleanText(value) {
  return contentToText(value)
    .replace(/<[^>]+>/gu, " ")
    .replace(/\*\*|__|`/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalize(value) {
  return cleanText(value).normalize("NFKC").toLocaleLowerCase("en-IN");
}

function compactText(value, maximum = 180) {
  const text = cleanText(value);
  if ([...text].length <= maximum) return text;
  const clipped = [...text].slice(0, maximum - 1).join("");
  const wordBoundary = clipped.replace(/\s+\S*$/u, "").trim();
  return `${wordBoundary || clipped.trimEnd()}…`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function flattenQuestion(question, exercise) {
  if (!question || typeof question !== "object") return [];
  return [
    { ...question, exercise },
    ...(question.subQuestions || []).flatMap((child) => flattenQuestion(child, exercise)),
  ];
}

function chapterQuestions(chapter) {
  return (chapter?.exercises || []).flatMap((exercise) =>
    (exercise.questions || []).flatMap((question) => flattenQuestion(question, exercise))
  );
}

function questionEvidenceText(question) {
  return cleanText([
    question.prompt,
    renderedAnswerText(question),
    question.formula,
    question.formulaUsed,
    question.principle,
    question.principleUsed,
    question.solutionMedia?.map((media) => [media.alt, media.caption]),
  ]);
}

function questionRecord(route, chapterSlug, publicQuestionId) {
  return {
    boardSlug: route.boardSlug,
    classNumber: route.classNumber,
    subjectSlug: route.subjectSlug,
    textbookSlug: route.textbookSlug,
    chapterSlug,
    publicQuestionId,
  };
}

function questionLink(question, route, chapterSlug) {
  return {
    id: question.id,
    label: cleanText(question.displayLabel || question.order || question.id),
    prompt: compactText(question.prompt, 150),
    href: getQuestionUrl(questionRecord(route, chapterSlug, question.id)),
    anchor: `#${question.id}`,
  };
}

function formulaEntries(profile, questions, route, chapterSlug) {
  if (!profile?.formulas?.length) return automaticFormulaEntries(questions, route, chapterSlug);
  return profile.formulas.map((formula) => {
    const uses = questions.filter((question) => {
      const text = questionEvidenceText(question);
      return formula.patterns.some((pattern) => pattern.test(text));
    });
    return {
      ...formula,
      ...formulaRepresentations(formula.source),
      uses: uses.map((question) => questionLink(question, route, chapterSlug)),
    };
  }).filter((formula) => formula.uses.length && validateFormulaRepresentations(formula).complete);
}

function readableFormula(value) {
  let formula = String(value || "").replace(/^\$+|\$+$/gu, "").trim();
  for (let pass = 0; pass < 3; pass += 1) {
    formula = formula.replace(/\\(?:dfrac|frac)\{([^{}]+)\}\{([^{}]+)\}/gu, "($1) / ($2)");
  }
  return formula
    .replaceAll("\\varepsilon_0", "ε₀")
    .replaceAll("\\epsilon_0", "ε₀")
    .replaceAll("\\pi", "π")
    .replaceAll("\\times", "×")
    .replaceAll("\\cdot", "·")
    .replaceAll("\\quad", " ")
    .replace(/\\text\{([^{}]+)\}/gu, "$1")
    .replace(/_\{([^{}]+)\}/gu, "_$1")
    .replace(/\^\{([^{}]+)\}/gu, "^$1")
    .replace(/[{}]/gu, "")
    .replace(/\\,/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function automaticFormulaEntries(questions, route, chapterSlug) {
  const byFormula = new Map();
  for (const question of questions) {
    const explicit = [question.formulaUsed, question.formula, question.principleUsed]
      .map(cleanText)
      .filter(Boolean);
    const text = questionEvidenceText(question);
    const inline = [...text.matchAll(/\$\$([^$]{3,180})\$\$|\$([^$\n]{3,120})\$/gu)]
      .map((match) => match[1] || match[2])
      .filter((candidate) => /(?:=|\\frac|\\dfrac)/u.test(candidate))
      .filter((candidate) => (candidate.match(/\d/gu) || []).length <= 5);
    for (const candidate of [...explicit, ...inline]) {
      const source = String(candidate).replace(/^\$+|\$+$/gu, "").trim();
      const equation = readableFormula(source);
      if (!equation || equation.length < 4 || equation.length > 150) continue;
      const key = normalize(equation.replace(/\s+/gu, ""));
      const existing = byFormula.get(key) || { source, questions: [] };
      if (!existing.questions.some((item) => item.id === question.id)) existing.questions.push(question);
      byFormula.set(key, existing);
    }
  }
  return [...byFormula.values()]
    .sort((left, right) => right.questions.length - left.questions.length || left.source.length - right.source.length)
    .slice(0, 6)
    .map((entry, index) => ({
      id: `chapter-relation-${index + 1}`,
      name: "Key relation",
      ...formulaRepresentations(entry.source),
      note: "Taken from the worked solution where it is applied.",
      uses: entry.questions.map((question) => questionLink(question, route, chapterSlug)),
    }))
    .filter((formula) => validateFormulaRepresentations(formula).complete);
}

function hasDiagramEvidence(question) {
  const prompt = cleanText(question.prompt);
  return Boolean(
    question.type === "diagram"
    || question.diagram
    || question.promptMedia?.length
    || question.solutionMedia?.length
    || question.media?.length
    || /\b(?:diagram|figure|graph|sketch|draw|field[- ]line)\b/iu.test(prompt)
  );
}

function examYears(question) {
  const candidates = [
    question.previousYears,
    question.examYears,
    question.boardExamYears,
    question.previousYear,
    question.examYear,
    question.boardExamYear,
    question.year,
    question.exam?.year,
    (question.appearances || []).map((appearance) => appearance?.year),
  ];
  const years = cleanText(candidates).match(/\b(?:19|20)\d{2}\b/gu) || [];
  return [...new Set(years)];
}

function explicitAppearanceCount(question) {
  const numeric = [
    question.pastPaperAppearanceCount,
    question.boardAppearanceCount,
    question.previousYearCount,
    question.repetitionCount,
  ].map(Number).find((value) => Number.isFinite(value) && value > 0);
  return numeric || examYears(question).length;
}

function isFrequentlyRepeated(question) {
  return Boolean(question.frequentlyRepeated || question.repeatedBoardQuestion || explicitAppearanceCount(question) >= 2);
}

function questionGroups(questions, route, chapterSlug) {
  const matcherGroups = [
    {
      id: "mcqs",
      label: "MCQs",
      description: "Choice questions with option-level reasoning.",
      match: (question) => ["mcq_single", "mcq_multi", "assertion_reason"].includes(question.type),
    },
    {
      id: "give-reason",
      label: "Give reason",
      description: "Conclusion-and-principle answers.",
      match: (question) => question.type === "give_reason" || /\b(?:give (?:a )?reason|justify|why)\b/iu.test(cleanText(question.prompt)),
    },
    {
      id: "derivations",
      label: "Derivations",
      description: "Equations developed from assumptions to a final relation.",
      match: (question) => /\b(?:derive|prove|show that|obtain (?:an |the )?(?:expression|relation)|deduce)\b/iu.test(cleanText(question.prompt)),
    },
    {
      id: "numericals",
      label: "Numericals",
      description: "Formula, substitution, units and final-value practice.",
      match: (question) => question.type === "numerical",
    },
    {
      id: "diagrams",
      label: "Diagram questions",
      description: "Questions whose prompt or solution includes visual evidence.",
      match: hasDiagramEvidence,
    },
    {
      id: "frequently-repeated",
      label: "Frequently repeated board questions",
      description: "Shown only where the source records at least two board-paper appearances.",
      match: isFrequentlyRepeated,
    },
    {
      id: "short-answers",
      label: "Short answers",
      description: "Concise written responses in textbook order.",
      match: (question) => ["one_word", "one_sentence", "brief", "define", "name_list"].includes(question.type),
    },
  ];
  const groups = matcherGroups.map((group) => {
    const matched = questions.filter(group.match);
    return {
      ...group,
      questions: matched.map((question) => questionLink(question, route, chapterSlug)),
    };
  }).filter((group) => group.questions.length);
  const groupedQuestionIds = new Set(groups.flatMap((group) => group.questions.map((question) => question.id)));
  const remaining = questions.filter((question) => !groupedQuestionIds.has(question.id));
  if (remaining.length) {
    groups.push({
      id: "other-formats",
      label: "Other question formats",
      description: "Additional mapped activities and formats from this chapter.",
      questions: remaining.map((question) => questionLink(question, route, chapterSlug)),
    });
  }
  return groups;
}

function meaningfulConcepts(chapter, formulaList, questions) {
  if (formulaList.length) {
    return formulaList
      .map((formula) => ({ label: formula.name, count: formula.uses.length }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 5);
  }
  const excluded = new Set([normalize(chapter.slug), normalize(chapter.title)]);
  const counts = new Map();
  for (const question of questions) {
    for (const tag of question.conceptTags || []) {
      const key = normalize(String(tag).replaceAll("-", " "));
      if (!key || excluded.has(key)) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label: label.replace(/\b\w/gu, (character) => character.toUpperCase()), count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 5);
}

function typicalMarks(questions) {
  const values = questions
    .map((question) => Number(question.marks))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return null;
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const typical = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0][0];
  return {
    typical,
    recordedCount: values.length,
    label: `${typical} ${typical === 1 ? "mark" : "marks"}`,
  };
}

function explicitCommonMistakes(questions, route, chapterSlug) {
  const results = [];
  for (const question of questions) {
    const mistake = [
      question.commonStudentMistake,
      question.commonMistake,
      question.examinerWarning,
      question.mistakeToAvoid,
    ].map(cleanText).find(Boolean);
    if (!mistake) continue;
    results.push({ ...questionLink(question, route, chapterSlug), mistake: compactText(mistake, 220) });
  }
  return results.slice(0, 4);
}

function expectedFormats(questions) {
  const counts = new Map();
  for (const question of questions) counts.set(question.type, (counts.get(question.type) || 0) + 1);
  return [...counts.entries()]
    .filter(([type]) => EXPECTED_FORMATS[type])
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([type, count]) => ({
      type,
      count,
      label: QUESTION_TYPE_LABELS[type] || type.replaceAll("_", " "),
      guidance: EXPECTED_FORMATS[type],
    }));
}

function chapterOverview(profile, chapter, formulaList, questions) {
  if (profile?.overview?.length) return [...profile.overview];
  const concepts = meaningfulConcepts(chapter, formulaList, questions).map((concept) => concept.label);
  const summary = cleanText(chapter.summary);
  if (summary && !/^For .+?, the chapter pairs textbook-order practice/iu.test(summary)) return [summary];
  if (concepts.length) {
    return [`${chapter.title} develops ${concepts.slice(0, -1).join(", ")}${concepts.length > 1 ? ` and ${concepts.at(-1)}` : concepts[0]}. Students use these ideas in the chapter’s conceptual and worked-answer questions.`];
  }
  return [`${chapter.title} is organised around the definitions, relationships and problem-solving methods used by its ${questions.length} textbook questions.`];
}

function bookChapterDirectory(payload, route, currentChapterSlug) {
  return (payload?.chapters || [])
    .filter((chapter) => chapter.slug && chapter.title)
    .sort((left, right) => Number(left.position || left.number || 0) - Number(right.position || right.number || 0))
    .map((chapter) => ({
      number: Number(chapter.number || chapter.position || 0),
      title: cleanText(chapter.title),
      current: chapter.slug === currentChapterSlug,
      href: `/${route.boardSlug}/class-${route.classNumber}/${route.subjectSlug}/${route.textbookSlug}/${chapter.slug}`,
    }));
}

export function findChapterPageContext(payload, chapterSlug) {
  return (payload?.chapters || []).find((chapter) => chapter.slug === chapterSlug) || null;
}

export function buildChapterPageExperience({ payload, chapter, route, catalog, reviewedAt }) {
  const resolvedChapter = chapter || findChapterPageContext(payload, route.chapterSlug);
  if (!resolvedChapter || !catalog) return null;
  const questions = chapterQuestions(resolvedChapter).filter((question) => question.id);
  if (!questions.length) return null;
  const profile = CHAPTER_PROFILES[`${route.subjectSlug}/${route.chapterSlug}`] || null;
  const formulas = formulaEntries(profile, questions, route, resolvedChapter.slug);
  const groups = questionGroups(questions, route, resolvedChapter.slug);
  const diagrams = questions.filter(hasDiagramEvidence).map((question) => questionLink(question, route, resolvedChapter.slug));
  const yearLinked = questions.filter((question) => examYears(question).length);
  const appearanceCount = questions.reduce((total, question) => total + explicitAppearanceCount(question), 0);
  const overview = chapterOverview(profile, resolvedChapter, formulas, questions);
  const publishingGateDate = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(Number(reviewedAt) * 1_000);
  const model = {
    board: cleanText(catalog.board_name || route.boardSlug),
    classLabel: cleanText(catalog.grade_label || `Class ${route.classNumber}`),
    subject: cleanText(catalog.subject_name || route.subjectSlug),
    textbook: cleanText(catalog.book_title || payload?.catalog?.book?.title || route.textbookSlug),
    chapter: cleanText(catalog.chapter_title || resolvedChapter.title),
    chapterNumber: Number(catalog.chapter_number || resolvedChapter.number || resolvedChapter.position || 0),
    questionCount: questions.length,
    overview,
    headerSummary: overview[0],
    formulas,
    groups,
    examPreparation: {
      concepts: meaningfulConcepts(resolvedChapter, formulas, questions),
      marks: typicalMarks(questions),
      diagrams,
      commonMistakes: explicitCommonMistakes(questions, route, resolvedChapter.slug),
      formats: expectedFormats(questions),
      pastPapers: yearLinked.length ? { questionCount: yearLinked.length, appearanceCount } : null,
      evidenceBasis: `Counts below come from the ${questions.length} mapped questions in this textbook chapter. Past-paper frequency and marks are shown only when those fields exist in the source record.`,
    },
    directory: bookChapterDirectory(payload, route, resolvedChapter.slug),
    publishingGateDate,
    studyCluster: route.subjectSlug === "physics" && route.chapterSlug === "electrostatics"
      ? `/${route.boardSlug}/class-${route.classNumber}/${route.subjectSlug}/${route.textbookSlug}/${route.chapterSlug}`
      : null,
    snippetExcludedQuestionIds: questions
      .filter((question) => !corpusQuestionSnippetEligible(question.id, question))
      .map((question) => question.id),
  };
  model.ready = Boolean(
    model.chapter
    && model.textbook
    && model.questionCount
    && model.overview.length
    && model.groups.length
    && model.directory.length
  );
  return model;
}

function questionPills(questions, hrefKey = "anchor") {
  const visible = questions.slice(0, 8);
  const links = visible.map((question) =>
    `<a href="${escapeHtml(question[hrefKey])}" title="${escapeHtml(question.prompt)}">Q${escapeHtml(question.label)}</a>`
  ).join("");
  const remaining = questions.length - visible.length;
  return `${links}${remaining > 0 ? `<span aria-label="${remaining} more questions">+${remaining}</span>` : ""}`;
}

function overviewMarkup(model) {
  const context = [model.board, model.classLabel, model.subject, model.textbook]
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  return `<section class="chapter-hub-overview" id="chapter-overview" aria-labelledby="chapter-overview-heading"><div><span class="chapter-hub-kicker">Chapter overview</span><h2 id="chapter-overview-heading">What you learn in ${escapeHtml(model.chapter)}</h2>${model.overview.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div><aside aria-label="Chapter context"><ol>${context}</ol><p><strong>${model.questionCount}</strong> mapped textbook questions</p><small>Automated catalog check ${escapeHtml(model.publishingGateDate)} · <a href="/reviewers">human editorial review status</a></small></aside></section>`;
}

function studyModesMarkup(model) {
  if (!model.studyCluster) return "";
  const links = [
    ["study", "Study centre", "All chapter resources in one place"],
    ["revision", "Revision", "Summary, definitions and formula sheet"],
    ["important-questions", "Important questions", "Selection method shown"],
    ["practice", "Private practice", "Timer, retry mistakes and local progress"],
    ["answer-writing", "Answer writing", "1, 2, 3 and 5-mark response structure"],
  ];
  return `<section class="chapter-study-modes" aria-labelledby="chapter-study-modes-heading"><header><span class="chapter-hub-kicker">Study modes</span><h2 id="chapter-study-modes-heading">Go beyond the question catalogue</h2><p>Revise the chapter, practise privately, strengthen individual concepts and improve exam-answer structure.</p></header><nav aria-label="Electrostatics study resources">${links.map(([slug, label, detail]) => `<a href="${escapeHtml(model.studyCluster)}/${slug}"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></a>`).join("")}</nav><p><strong>Previous-year status:</strong> paper-year, marks and official-source evidence are not present in the current records, so no questions are being relabelled as PYQs.</p></section>`;
}

function formulasMarkup(model) {
  if (!model.formulas.length) return "";
  const cards = model.formulas.map((formula, index) => `<article id="formula-${escapeHtml(formula.id)}"><header><span>${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(formula.name)}</h3></header><div class="chapter-formula-equation">${renderSemanticMath(formula, { visiblePlain: true })}</div><p>${escapeHtml(formula.note)}</p><div class="chapter-formula-uses"><small>Used in</small>${questionPills(formula.uses, "href")}</div></article>`).join("");
  return `<section class="chapter-hub-section" id="formula-sheet" aria-labelledby="formula-sheet-heading"><header class="chapter-hub-heading"><div><span class="chapter-hub-kicker">Formula sheet</span><h2 id="formula-sheet-heading">Relations used in this chapter</h2></div><p>Every formula is connected to the mapped solutions where it is applied.</p></header><div class="chapter-formula-grid">${cards}</div></section>`;
}

function groupsMarkup(model) {
  const cards = model.groups.map((group) => `<article id="group-${escapeHtml(group.id)}"><header><span>${group.questions.length}</span><div><h3>${escapeHtml(group.label)}</h3><p>${escapeHtml(group.description)}</p></div></header><nav aria-label="${escapeHtml(group.label)} questions">${questionPills(group.questions)}</nav></article>`).join("");
  return `<section class="chapter-hub-section" id="question-groups" aria-labelledby="question-groups-heading"><header class="chapter-hub-heading"><div><span class="chapter-hub-kicker">Question grouping</span><h2 id="question-groups-heading">Jump straight to the practice you need</h2></div><p>Groups appear only when a matching question exists in this chapter.</p></header><div class="chapter-group-grid">${cards}</div></section>`;
}

function conceptsMarkup(concepts) {
  if (!concepts.length) return "";
  return `<article><span class="chapter-evidence-index">01</span><h3>Most represented concepts</h3><p>Frequency within this mapped chapter set.</p><ol>${concepts.map((concept) => `<li><span>${escapeHtml(concept.label)}</span><strong>${concept.count} ${concept.count === 1 ? "question" : "questions"}</strong></li>`).join("")}</ol></article>`;
}

function marksMarkup(marks) {
  if (!marks) return "";
  return `<article><span class="chapter-evidence-index">02</span><h3>Typical marks</h3><p><strong>${escapeHtml(marks.label)}</strong> is the most frequent value among ${marks.recordedCount} questions with marks metadata.</p></article>`;
}

function diagramsMarkup(diagrams) {
  if (!diagrams.length) return "";
  return `<article><span class="chapter-evidence-index">03</span><h3>Required diagrams</h3><p>${diagrams.length} ${diagrams.length === 1 ? "question has" : "questions have"} an explicit diagram, figure or visual solution.</p><nav aria-label="Questions with diagrams">${questionPills(diagrams)}</nav></article>`;
}

function pastPapersMarkup(pastPapers) {
  if (!pastPapers) return "";
  return `<article><span class="chapter-evidence-index">04</span><h3>Past-paper appearances</h3><p>${pastPapers.appearanceCount} recorded appearances across ${pastPapers.questionCount} year-linked questions.</p></article>`;
}

function mistakesMarkup(mistakes) {
  if (!mistakes.length) return "";
  return `<article class="chapter-evidence-wide"><span class="chapter-evidence-index">05</span><h3>Source-recorded student mistakes</h3><ul>${mistakes.map((item) => `<li><a href="${escapeHtml(item.anchor)}">Q${escapeHtml(item.label)}</a><span>${escapeHtml(item.mistake)}</span></li>`).join("")}</ul></article>`;
}

function formatsMarkup(formats) {
  if (!formats.length) return "";
  return `<article class="chapter-evidence-wide"><span class="chapter-evidence-index">06</span><h3>Expected answer format</h3><dl>${formats.map((format) => `<div><dt>${escapeHtml(format.label)} <span>${format.count}</span></dt><dd>${escapeHtml(format.guidance)}</dd></div>`).join("")}</dl></article>`;
}

function examPreparationMarkup(model) {
  const evidence = model.examPreparation;
  const cards = [
    conceptsMarkup(evidence.concepts),
    marksMarkup(evidence.marks),
    diagramsMarkup(evidence.diagrams),
    pastPapersMarkup(evidence.pastPapers),
    mistakesMarkup(evidence.commonMistakes),
    formatsMarkup(evidence.formats),
  ].filter(Boolean).join("");
  if (!cards) return "";
  return `<section class="chapter-hub-section chapter-exam-prep" id="exam-preparation" aria-labelledby="exam-preparation-heading"><header class="chapter-hub-heading"><div><span class="chapter-hub-kicker">Exam preparation</span><h2 id="exam-preparation-heading">What the chapter evidence supports</h2></div><p>${escapeHtml(evidence.evidenceBasis)}</p></header><div class="chapter-evidence-grid">${cards}</div></section>`;
}

function directoryMarkup(model) {
  const links = model.directory.map((chapter) => `<a href="${escapeHtml(chapter.href)}"${chapter.current ? ' aria-current="page"' : ""}><span>${String(chapter.number).padStart(2, "0")}</span><strong>${escapeHtml(chapter.title)}</strong>${chapter.current ? "<small>Current</small>" : ""}</a>`).join("");
  return `<details class="shell chapter-directory-after"><summary><span>Continue with this textbook</span><strong>Browse all ${model.directory.length} chapters after the questions</strong></summary><nav aria-label="All chapters in ${escapeHtml(model.textbook)}">${links}</nav></details>`;
}

export function renderChapterPageExperience(model) {
  if (!model?.ready) return null;
  const jumpLinks = [
    ["chapter-overview", "Overview"],
    ...(model.formulas.length ? [["formula-sheet", "Formulas"]] : []),
    ["question-groups", "Practice groups"],
    ["exam-preparation", "Exam preparation"],
    ["question-register", "All questions"],
  ];
  const jumpNav = `<nav class="chapter-hub-jumps" aria-label="Chapter study sections"><span>Study this chapter</span>${jumpLinks.map(([href, label]) => `<a href="#${href}">${escapeHtml(label)}</a>`).join("")}</nav>`;
  const hub = `<div class="shell chapter-learning-hub" data-studywudy-chapter-hub="evidence-v1">${jumpNav}${overviewMarkup(model)}${studyModesMarkup(model)}${formulasMarkup(model)}${groupsMarkup(model)}${examPreparationMarkup(model)}</div>`;
  return {
    hub,
    directory: directoryMarkup(model),
    headerSummary: model.headerSummary,
    snippetExcludedQuestionIds: model.snippetExcludedQuestionIds,
  };
}

export const CHAPTER_PAGE_EXPERIENCE_STYLES = `<style id="chapter-page-experience-styles">
.chapter-learning-hub{margin-top:2rem;margin-bottom:2rem}.chapter-hub-jumps{display:flex;align-items:center;gap:.45rem;overflow-x:auto;padding:.55rem;border:1px solid #c9c1b3;border-radius:14px;background:#fff;scrollbar-width:thin}.chapter-hub-jumps>span{flex:0 0 auto;padding:.5rem .65rem;color:#435149;font-size:.73rem;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.chapter-hub-jumps a{flex:0 0 auto;padding:.55rem .72rem;border-radius:9px;color:#173d2a;font-size:.82rem;font-weight:760;text-decoration:none}.chapter-hub-jumps a:hover,.chapter-hub-jumps a:focus-visible{background:#eaf2e9;outline:none}.chapter-hub-overview{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(250px,.65fr);gap:2rem;margin-top:1rem;padding:clamp(1.25rem,3vw,2.2rem);border:1px solid #174d31;border-radius:22px;background:#f6f0e4;color:#17231d;box-shadow:0 16px 36px rgba(35,47,39,.08)}.chapter-hub-kicker{display:block;color:#23603e;font-size:.74rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.chapter-hub-overview h2,.chapter-hub-heading h2{margin:.35rem 0 .8rem;font-size:clamp(1.55rem,3vw,2.35rem);letter-spacing:-.035em}.chapter-hub-overview>div>p{max-width:72ch;margin:.65rem 0;line-height:1.72}.chapter-hub-overview aside{align-self:stretch;padding:1.1rem;border-left:1px solid #bdb5a8}.chapter-hub-overview aside ol{display:flex;flex-wrap:wrap;gap:.35rem;margin:0 0 1.2rem;padding:0;list-style:none}.chapter-hub-overview aside li{padding:.32rem .5rem;border:1px solid #c8c0b4;border-radius:999px;background:#fff;font-size:.72rem;font-weight:720}.chapter-hub-overview aside p{margin:.5rem 0}.chapter-hub-overview aside p strong{display:block;color:#174d31;font-size:2rem;line-height:1}.chapter-hub-overview aside small{color:#58645d;line-height:1.5}.chapter-hub-section{margin-top:1rem;padding:clamp(1.15rem,2.8vw,2rem);border:1px solid #d2cabd;border-radius:22px;background:#fff}.chapter-hub-heading{display:flex;align-items:end;justify-content:space-between;gap:2rem;margin-bottom:1.25rem;padding-bottom:1rem;border-bottom:1px solid #ded8cd}.chapter-hub-heading h2{margin-bottom:0}.chapter-hub-heading>p{max-width:52ch;margin:0;color:#5b675f;line-height:1.55}.chapter-formula-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}.chapter-formula-grid article{padding:1rem;border:1px solid #d6d0c5;border-radius:15px;background:#fbf8f1}.chapter-formula-grid article header{display:flex;align-items:center;gap:.65rem}.chapter-formula-grid article header>span{display:grid;place-items:center;width:2rem;height:2rem;border-radius:50%;background:#174d31;color:#fff;font-size:.72rem;font-weight:850}.chapter-formula-grid h3{margin:0;font-size:1rem}.chapter-formula-grid article>p{margin:.6rem 0;color:#4d5b53;font-size:.88rem;line-height:1.55}.chapter-formula-equation{overflow-x:auto;padding:.75rem;border-radius:10px;background:#17231d!important;color:#f7f0e4!important;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92rem!important;font-weight:700;white-space:nowrap}.chapter-formula-uses{display:flex;align-items:center;flex-wrap:wrap;gap:.35rem;margin-top:.75rem}.chapter-formula-uses small{margin-right:.2rem;color:#66736b;font-weight:750}.chapter-formula-uses a,.chapter-formula-uses span,.chapter-group-grid nav a,.chapter-group-grid nav span,.chapter-evidence-grid nav a,.chapter-evidence-grid nav span{display:inline-flex;align-items:center;justify-content:center;min-width:2.05rem;min-height:2.05rem;padding:.3rem .45rem;border:1px solid #b9c9bd;border-radius:8px;background:#fff;color:#174d31;font-size:.76rem;font-weight:820;text-decoration:none}.chapter-formula-uses a:hover,.chapter-formula-uses a:focus-visible,.chapter-group-grid nav a:hover,.chapter-group-grid nav a:focus-visible,.chapter-evidence-grid nav a:hover,.chapter-evidence-grid nav a:focus-visible{border-color:#174d31;background:#edf4ee;outline:none}.chapter-group-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem}.chapter-group-grid article{padding:1rem;border:1px solid #d8d1c6;border-radius:15px;background:#fff}.chapter-group-grid article>header{display:flex;align-items:flex-start;gap:.75rem}.chapter-group-grid article>header>span{display:grid;place-items:center;flex:0 0 auto;width:2.3rem;height:2.3rem;border-radius:10px;background:#eee5d5;color:#174d31;font-size:1rem;font-weight:900}.chapter-group-grid h3{margin:.05rem 0 .25rem;font-size:1rem}.chapter-group-grid p{margin:0;color:#5f6b64;font-size:.82rem;line-height:1.45}.chapter-group-grid nav,.chapter-evidence-grid nav{display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.8rem}.chapter-exam-prep{background:#17231d;color:#f7f0e4}.chapter-exam-prep .chapter-hub-kicker{color:#9ec6a8}.chapter-exam-prep .chapter-hub-heading{border-color:#3a4b41}.chapter-exam-prep .chapter-hub-heading>p{color:#bdc8c0}.chapter-evidence-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem}.chapter-evidence-grid>article{position:relative;padding:1rem;border:1px solid #43544a;border-radius:15px;background:#213027}.chapter-evidence-index{display:block;margin-bottom:.7rem;color:#9ec6a8;font-size:.7rem;font-weight:900;letter-spacing:.1em}.chapter-evidence-grid h3{margin:0 0 .4rem;color:#fff;font-size:1rem}.chapter-evidence-grid p{margin:.35rem 0;color:#c3cdc6;font-size:.84rem;line-height:1.55}.chapter-evidence-grid ol{margin:.75rem 0 0;padding:0;list-style:none}.chapter-evidence-grid ol li{display:flex;justify-content:space-between;gap:.75rem;padding:.45rem 0;border-top:1px solid #3b4b42;font-size:.8rem}.chapter-evidence-grid ol strong{color:#b5d3bc;white-space:nowrap}.chapter-evidence-grid nav a{border-color:#607469;background:#17231d;color:#eff7f0}.chapter-evidence-wide{grid-column:span 2}.chapter-evidence-wide>ul{margin:.7rem 0 0;padding:0;list-style:none}.chapter-evidence-wide>ul li{display:grid;grid-template-columns:auto 1fr;gap:.65rem;padding:.55rem 0;border-top:1px solid #3b4b42}.chapter-evidence-wide>ul a{color:#bfe0c7;font-weight:850}.chapter-evidence-wide dl{margin:.7rem 0 0}.chapter-evidence-wide dl>div{display:grid;grid-template-columns:minmax(150px,.55fr) 1fr;gap:1rem;padding:.6rem 0;border-top:1px solid #3b4b42}.chapter-evidence-wide dt{color:#fff;font-weight:780}.chapter-evidence-wide dt span{margin-left:.3rem;color:#9ec6a8}.chapter-evidence-wide dd{margin:0;color:#c3cdc6;font-size:.84rem;line-height:1.55}.course-finder-directory{display:none!important}.chapter-directory-after{margin-top:2rem;margin-bottom:2rem;border:1px solid #c9c1b3;border-radius:16px;background:#f7f2e8}.chapter-directory-after summary{display:flex;align-items:center;justify-content:space-between;gap:1rem;cursor:pointer;padding:1rem 1.15rem;list-style:none}.chapter-directory-after summary::-webkit-details-marker{display:none}.chapter-directory-after summary>span{color:#23603e;font-size:.73rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.chapter-directory-after summary>strong{font-size:.92rem}.chapter-directory-after nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.45rem;padding:0 1rem 1rem}.chapter-directory-after nav a{display:grid;grid-template-columns:auto 1fr auto;gap:.55rem;align-items:center;padding:.65rem;border:1px solid #d6cfc3;border-radius:10px;background:#fff;color:inherit;text-decoration:none}.chapter-directory-after nav a[aria-current="page"]{border-color:#174d31;background:#e9f1e9}.chapter-directory-after nav a>span{color:#23603e;font-size:.72rem;font-weight:850}.chapter-directory-after nav a>strong{font-size:.78rem}.chapter-directory-after nav a>small{color:#23603e;font-size:.66rem;font-weight:800}.question-card[id]{scroll-margin-top:1.25rem}
.chapter-study-modes{margin-top:1rem;padding:1.25rem;border:2px solid #17231d;border-radius:20px;background:#fff}.chapter-study-modes header{display:grid;grid-template-columns:1fr minmax(260px,.8fr);gap:.4rem 2rem}.chapter-study-modes h2{margin:.3rem 0;font-size:clamp(1.45rem,3vw,2.1rem);letter-spacing:-.035em}.chapter-study-modes header p{grid-column:2;grid-row:1 / span 2;margin:0;color:#536159;line-height:1.55}.chapter-study-modes nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.5rem;margin-top:1rem}.chapter-study-modes nav a{display:flex;min-height:105px;flex-direction:column;justify-content:flex-end;padding:.8rem;border:1px solid #cbc3b7;border-radius:12px;background:#f6f0e4;color:inherit;text-decoration:none}.chapter-study-modes nav a:nth-child(3){background:#eaf2e9}.chapter-study-modes nav a:nth-child(4){background:#efe8ff}.chapter-study-modes nav strong{font-size:.86rem}.chapter-study-modes nav small{margin-top:.3rem;color:#5b675f;font-size:.7rem;line-height:1.4}.chapter-study-modes>p{margin:.8rem 0 0;color:#5a665f;font-size:.76rem;line-height:1.5}
.chapter-formula-grid article,.chapter-group-grid article,.chapter-evidence-grid>article{min-width:0}.chapter-formula-grid article>p{overflow-wrap:anywhere}.chapter-formula-equation{overflow-wrap:normal!important}.chapter-formula-uses{min-width:0}
@media(max-width:980px){.chapter-hub-overview{grid-template-columns:1fr}.chapter-hub-overview aside{border-top:1px solid #bdb5a8;border-left:0}.chapter-group-grid,.chapter-evidence-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.chapter-directory-after nav,.chapter-study-modes nav{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:700px){.chapter-learning-hub{margin-top:1rem}.chapter-hub-heading{align-items:start;flex-direction:column;gap:.65rem}.chapter-formula-grid,.chapter-group-grid,.chapter-evidence-grid{grid-template-columns:1fr}.chapter-evidence-wide{grid-column:auto}.chapter-evidence-wide dl>div{grid-template-columns:1fr;gap:.2rem}.chapter-directory-after summary{align-items:flex-start;flex-direction:column}.chapter-directory-after nav,.chapter-study-modes nav,.chapter-study-modes header{grid-template-columns:1fr}.chapter-study-modes header p{grid-column:auto;grid-row:auto}.chapter-hub-overview,.chapter-hub-section{border-radius:16px}}

/* StudyWudy theme alignment: hard study-sheet frames, ruled-paper surfaces and brand tabs. */
.chapter-learning-hub{
  --hub-ink:var(--ink,#101316);
  --hub-ink-soft:var(--ink-soft,#40464d);
  --hub-paper:var(--paper,#fbf7ed);
  --hub-paper-deep:var(--paper-deep,#efe8d9);
  --hub-white:var(--white,#fffef9);
  --hub-blue:var(--violet,#0757d8);
  --hub-blue-soft:var(--violet-soft,#e5edff);
  --hub-coral:var(--coral,#c4472f);
  --hub-coral-soft:var(--coral-soft,#ffe0d9);
  --hub-green:var(--green,#137a4a);
  --hub-green-soft:var(--green-soft,#e6f3ea);
  --hub-gold:var(--gold,#ffd51f);
  --hub-navy:var(--navy,#092044);
  --hub-shadow:var(--hard-shadow-small,4px 5px 0 #101316c2);
}
.chapter-hub-overview,.chapter-hub-section{
  position:relative;
  overflow:hidden;
  border:3px solid var(--hub-ink);
  border-radius:6px;
  background:var(--hub-white);
  color:var(--hub-ink);
  box-shadow:var(--hub-shadow);
}
.chapter-hub-overview{margin-top:1.15rem;background:linear-gradient(110deg,var(--hub-white) 0 68%,var(--hub-blue-soft) 68% 100%)}
.chapter-hub-section{margin-top:1.25rem}
.chapter-hub-overview::before,.chapter-hub-section::before{
  position:absolute;
  z-index:1;
  top:0;
  right:0;
  left:0;
  height:7px;
  background:var(--hub-blue);
  content:"";
}
#formula-sheet::before{background:var(--hub-coral)}
#question-groups::before{background:var(--hub-gold)}
.chapter-hub-overview>*,.chapter-hub-section>*{position:relative;z-index:2}
.chapter-hub-kicker{
  color:var(--hub-coral);
  font-family:var(--font-geist-mono,ui-monospace,SFMono-Regular,Menlo,monospace);
  font-size:.68rem;
  font-weight:900;
  letter-spacing:.14em;
}
.chapter-hub-overview h2,.chapter-hub-heading h2{
  color:inherit;
  font-size:clamp(1.55rem,3vw,2.25rem);
  font-weight:900;
  letter-spacing:-.045em;
  line-height:1.08;
}
.chapter-hub-overview>div>p{color:var(--hub-ink-soft)}
.chapter-hub-overview aside{
  padding:1.2rem;
  border-left:2px solid var(--hub-ink);
  background:color-mix(in srgb,var(--hub-blue-soft) 78%,transparent);
}
.chapter-hub-overview aside ol{gap:.4rem;margin-bottom:1.35rem}
.chapter-hub-overview aside li{
  border:1.5px solid var(--hub-ink);
  border-radius:3px;
  background:var(--hub-white);
  color:var(--hub-ink);
  font-size:.68rem;
  font-weight:800;
}
.chapter-hub-overview aside p strong{color:var(--hub-blue);font-family:var(--font-geist-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:2.15rem}
.chapter-hub-overview aside small{color:var(--hub-ink-soft)}
.chapter-hub-overview aside a{font-weight:800;text-decoration-thickness:1.5px;text-underline-offset:2px}
.chapter-hub-heading{border-bottom:2px solid var(--hub-ink);padding-top:.2rem;padding-bottom:1rem}
.chapter-hub-heading>p{color:var(--hub-ink-soft);font-size:.86rem}
.chapter-formula-grid{gap:1rem}
.chapter-group-grid,.chapter-evidence-grid{gap:.8rem}
.chapter-evidence-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.chapter-formula-grid article,.chapter-group-grid article{
  border:2px solid var(--hub-ink);
  border-radius:5px;
  background:var(--hub-paper);
}
.chapter-formula-grid article{
  --formula-accent:var(--hub-blue);
  --formula-tint:color-mix(in srgb,var(--hub-blue-soft) 68%,var(--hub-white));
  position:relative;
  isolation:isolate;
  overflow:hidden;
  padding:1.1rem;
  border:1.5px solid color-mix(in srgb,var(--hub-ink) 82%,transparent);
  border-radius:9px;
  background:var(--hub-white);
  box-shadow:0 4px 0 color-mix(in srgb,var(--hub-ink) 14%,transparent);
}
.chapter-formula-grid article:nth-child(3n+2){--formula-accent:var(--hub-coral);--formula-tint:color-mix(in srgb,var(--hub-coral-soft) 58%,var(--hub-white))}
.chapter-formula-grid article:nth-child(3n){--formula-accent:var(--hub-green);--formula-tint:color-mix(in srgb,var(--hub-green-soft) 75%,var(--hub-white))}
.chapter-formula-grid article::before{
  position:absolute;
  top:0;
  right:0;
  left:0;
  height:5px;
  background:var(--formula-accent);
  content:"";
}
.chapter-formula-grid article header{margin-bottom:.75rem}
.chapter-formula-grid article header>span{
  width:1.9rem;
  height:1.9rem;
  border:0;
  border-radius:4px;
  background:var(--formula-accent);
  color:#fff;
  box-shadow:none;
  font-family:var(--font-geist-mono,ui-monospace,SFMono-Regular,Menlo,monospace);
}
.chapter-formula-grid h3{color:var(--hub-ink);font-size:.82rem;font-weight:900;letter-spacing:.035em;text-transform:uppercase}
.chapter-group-grid h3{color:var(--hub-ink);font-weight:850}
.chapter-formula-grid article>p,.chapter-group-grid p{color:var(--hub-ink-soft)}
.chapter-formula-grid article>p{margin:.7rem 0 .45rem;font-size:.82rem;line-height:1.5}
.chapter-formula-equation{
  padding:.78rem .9rem;
  border:0;
  border-left:4px solid var(--formula-accent);
  border-radius:0 6px 6px 0;
  background:var(--formula-tint)!important;
  color:var(--hub-navy)!important;
  font-family:"STIX Two Math","Cambria Math",Georgia,serif;
  font-size:1.05rem!important;
}
.chapter-formula-uses{gap:.35rem;margin-top:.65rem}
.chapter-formula-uses small{
  margin-right:.15rem;
  color:var(--hub-ink-soft);
  font-family:var(--font-geist-mono,ui-monospace,SFMono-Regular,Menlo,monospace);
  font-size:.66rem;
  font-weight:850;
  letter-spacing:.06em;
  text-transform:uppercase;
}
.chapter-formula-uses a,.chapter-formula-uses span,.chapter-group-grid nav a,.chapter-group-grid nav span,.chapter-evidence-grid nav a,.chapter-evidence-grid nav span{
  min-width:2rem;
  min-height:2rem;
  border:1.5px solid var(--hub-ink);
  border-radius:3px;
  background:var(--hub-white);
  color:var(--hub-ink);
  font-family:var(--font-geist-mono,ui-monospace,SFMono-Regular,Menlo,monospace);
  box-shadow:2px 2px 0 color-mix(in srgb,var(--hub-ink) 70%,transparent);
}
.chapter-formula-uses a:hover,.chapter-formula-uses a:focus-visible,.chapter-group-grid nav a:hover,.chapter-group-grid nav a:focus-visible,.chapter-evidence-grid nav a:hover,.chapter-evidence-grid nav a:focus-visible{
  border-color:var(--hub-ink);
  background:var(--hub-gold);
  color:#101316;
  outline:3px solid var(--hub-blue);
  outline-offset:2px;
  box-shadow:none;
  transform:translate(2px,2px);
}
.chapter-formula-uses a,.chapter-formula-uses span{
  min-width:auto;
  min-height:1.7rem;
  padding:.22rem .5rem;
  border:1px solid color-mix(in srgb,var(--hub-ink) 58%,transparent);
  border-radius:999px;
  background:var(--hub-white);
  box-shadow:none;
  font-size:.68rem;
}
.chapter-formula-uses a:hover,.chapter-formula-uses a:focus-visible{
  border-color:var(--formula-accent);
  background:var(--formula-tint);
  color:var(--hub-ink);
  outline:2px solid var(--formula-accent);
  outline-offset:2px;
  box-shadow:none;
  transform:none;
}
.chapter-group-grid article{background:var(--hub-white)}
.chapter-group-grid article:nth-child(3n+2){background:var(--hub-blue-soft)}
.chapter-group-grid article>header>span{
  width:2.3rem;
  height:2.3rem;
  border:1.5px solid var(--hub-ink);
  border-radius:3px;
  background:var(--hub-gold);
  color:#101316;
  box-shadow:2px 2px 0 var(--hub-ink);
  font-family:var(--font-geist-mono,ui-monospace,SFMono-Regular,Menlo,monospace);
}
.chapter-exam-prep{
  border-color:var(--hub-ink);
  background:var(--hub-white);
  color:var(--hub-ink);
}
.chapter-exam-prep::before{background:linear-gradient(90deg,var(--hub-blue) 0 58%,var(--hub-gold) 58% 78%,var(--hub-coral) 78% 100%)}
.chapter-exam-prep .chapter-hub-kicker{color:var(--hub-coral)}
.chapter-exam-prep .chapter-hub-heading{border-color:var(--hub-ink)}
.chapter-exam-prep .chapter-hub-heading>p{color:var(--hub-ink-soft)}
.chapter-evidence-grid>article{
  border:2px solid var(--hub-ink);
  border-radius:5px;
  background:var(--hub-white);
  color:var(--hub-ink);
  box-shadow:3px 3px 0 #0008;
}
.chapter-exam-prep .chapter-evidence-grid>article:nth-child(2){background:var(--hub-blue-soft)}
.chapter-exam-prep .chapter-evidence-grid>article:nth-child(3){background:var(--hub-paper-deep)}
.chapter-evidence-index{color:var(--hub-blue);font-family:var(--font-geist-mono,ui-monospace,SFMono-Regular,Menlo,monospace)}
.chapter-evidence-grid h3{color:var(--hub-ink);font-weight:850}
.chapter-evidence-grid p,.chapter-evidence-wide dd{color:var(--hub-ink-soft)}
.chapter-evidence-grid ol li,.chapter-evidence-wide>ul li,.chapter-evidence-wide dl>div{border-color:color-mix(in srgb,var(--hub-ink) 24%,transparent)}
.chapter-evidence-grid ol strong,.chapter-evidence-wide dt span,.chapter-evidence-wide>ul a{color:var(--hub-blue)}
.chapter-evidence-wide dt{color:var(--hub-ink)}
.chapter-evidence-grid nav a{border-color:var(--hub-ink);background:var(--hub-blue-soft);color:var(--hub-ink)}
@media(max-width:980px){
  .chapter-hub-overview{background:var(--hub-white)}
  .chapter-hub-overview aside{border-top:2px solid var(--hub-ink);border-left:0;background:var(--hub-blue-soft)}
}
@media(max-width:700px){
  .chapter-hub-overview,.chapter-hub-section{border-radius:5px;box-shadow:3px 4px 0 color-mix(in srgb,var(--hub-ink) 78%,transparent)}
  .chapter-hub-overview::before,.chapter-hub-section::before{height:6px}
  .chapter-hub-overview,.chapter-hub-section{padding:1.2rem}
  .chapter-formula-grid article,.chapter-group-grid article,.chapter-evidence-grid>article{padding:.9rem}
}
@media(prefers-reduced-motion:reduce){
  .chapter-formula-uses a,.chapter-group-grid nav a,.chapter-evidence-grid nav a{transition:none}
}
</style>`;
