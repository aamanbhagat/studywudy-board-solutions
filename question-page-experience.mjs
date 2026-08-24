import {
  contentToText,
  evaluateAnswerCompleteness,
  renderableWorkedSteps,
  renderedAnswerText,
  simpleArithmeticIsAccurate,
} from "./answer-completeness.mjs";
import { getQuestionUrl } from "./question-routes.mjs";
import { subjectAwareQuestionTypeLabel } from "./question-type-labels.mjs";
import { renderQuestionSemanticGraph } from "./semantic-link-graph.mjs";
import { normalizedQuestionType } from "./question-classification.mjs";
import { sourceMappingReleaseEligibility } from "./source-mapping-quality.mjs";
import { createPlainSearchText } from "./search-excerpt.mjs";
import { extractFormulaSources, formulaRepresentations, renderMathText, renderSemanticMath } from "./semantic-math.mjs";
import { buildQuestionTrustRecord } from "./trust-transparency.mjs";
import {
  corpusQualityFindingForQuestion,
  corpusQuestionSnippetEligible,
  CORPUS_QUALITY_STYLES,
  renderCorpusQualityNote,
} from "./corpus-quality.mjs";

const QUESTION_TYPE_LABELS = Object.freeze({
  one_word: "One-word answer",
  one_sentence: "One-sentence answer",
  brief: "Brief answer",
  detailed: "Detailed answer",
  define: "Definition",
  give_reason: "Give reason",
  name_list: "Name or list",
  mcq_single: "Single-choice MCQ",
  mcq_multi: "Multiple-choice MCQ",
  assertion_reason: "Assertion–reason",
  true_false: "True or false",
  fill_blank: "Fill in the blank",
  match_column: "Match the columns",
  distinguish: "Distinguish between",
  passage: "Passage-based answer",
  numerical: "Numerical",
  diagram: "Diagram-based answer",
});

const EXPECTED_RESPONSE = Object.freeze({
  one_word: "One direct answer with a short clarifying context",
  one_sentence: "One direct sentence with the required context",
  brief: "A concise answer covering the required textbook points",
  detailed: "A structured, exam-ready explanation",
  define: "The exact term or definition with brief context",
  give_reason: "The conclusion followed by the governing reason",
  name_list: "The requested names or points in textbook order",
  mcq_single: "The correct option, principle, reasoning and distractor check",
  mcq_multi: "All correct options with reasoning and distractor checks",
  assertion_reason: "The correct relationship with an explanation",
  true_false: "The verdict, correction where needed, and reason",
  fill_blank: "The completed blank with a short explanation",
  match_column: "The complete matching set with supporting steps where needed",
  distinguish: "A point-by-point comparison using the required terminology",
  passage: "Each sub-question answered from the passage",
  numerical: "Formula, substitution, units, arithmetic and final answer",
  diagram: "A labelled diagram with alt text and explanation",
});

const MAX_DIRECT_ANSWER_LENGTH = 420;
const MAX_CARD_PROMPT_LENGTH = 180;

function cleanText(value) {
  return contentToText(value)
    .replace(/<[^>]+>/gu, " ")
    .replace(/\*\*|__|`/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function compactText(value, maximum = MAX_DIRECT_ANSWER_LENGTH) {
  const text = cleanText(value);
  if ([...text].length <= maximum) return text;
  // Clipping a TeX/Markdown source can strand an opening delimiter in the
  // crawler-visible summary. Long summaries therefore fall back to the shared
  // plain-text parser before they are shortened; the complete semantic formula
  // remains in the main answer immediately below.
  const safeText = createPlainSearchText(text);
  const clipped = [...safeText].slice(0, maximum - 1).join("");
  const sentence = clipped.match(/^.*[.!?।](?=\s|$)/u)?.[0];
  const wordBoundary = clipped.replace(/\s+\S*$/u, "").trim();
  return `${sentence || wordBoundary || clipped.trimEnd()}…`;
}

function firstSentence(value, maximum = MAX_DIRECT_ANSWER_LENGTH) {
  const text = cleanText(value);
  if (!text) return "";
  const sentence = text.match(/^.*?[.!?।](?=\s|$)/u)?.[0] || text;
  return compactText(sentence, maximum);
}

function textList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  const text = cleanText(value);
  return text ? [text] : [];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function principleMarkup(value) {
  const source = String(value || "").trim();
  const isFormulaOnly = /^(?:\$\$[\s\S]+\$\$|\$[^$\n]+\$|\\\([\s\S]+\\\)|\\\[[\s\S]+\\\])$/u.test(source);
  if (!isFormulaOnly) return `<p>${renderMathText(source)}</p>`;
  return `<p class="question-principle-formula">${renderSemanticMath(formulaRepresentations(source), { visiblePlain: true })}</p>`;
}

function normalize(value) {
  return cleanText(value).normalize("NFKC").toLocaleLowerCase("en-IN");
}

function flattenQuestions(question) {
  if (!question || typeof question !== "object") return [];
  return [question, ...(question.subQuestions || []).flatMap(flattenQuestions)];
}

export function findQuestionPageContext(payload, chapterSlug, questionId) {
  const chapter = (payload?.chapters || []).find((candidate) => candidate.slug === chapterSlug);
  if (!chapter) return null;
  for (const exercise of chapter.exercises || []) {
    const questions = (exercise.questions || []).flatMap(flattenQuestions);
    const question = questions.find((candidate) => candidate.id === questionId);
    if (question) return { chapter, exercise, question, exerciseQuestions: questions };
  }
  return null;
}

function correctChoices(question) {
  const correctIds = new Set(question.correctChoiceIds || (question.correctChoiceId ? [question.correctChoiceId] : []));
  return (question.choices || []).filter((choice) => correctIds.has(choice.id));
}

export function conciseDirectAnswer(question) {
  if (!question) return "";
  if (["mcq_single", "mcq_multi", "assertion_reason"].includes(question.type)) {
    const choices = correctChoices(question);
    if (choices.length) {
      return choices.map((choice) => {
        const label = String(choice.id || "").trim().toUpperCase();
        return `${label ? `Option ${label}: ` : ""}${cleanText(choice.content)}`;
      }).join("; ");
    }
  }
  if (question.type === "numerical") {
    const finalAnswer = cleanText(question.finalAnswer);
    if (finalAnswer) return compactText(finalAnswer);
  }
  if (question.result && typeof question.result.value === "boolean") {
    const verdict = question.result.value ? "True" : "False";
    const correction = cleanText(question.result.correction);
    return compactText(correction ? `${verdict}. ${correction}` : verdict);
  }
  if (question.blanks?.length) {
    return compactText(question.blanks.map((blank) => cleanText(blank.answer)).filter(Boolean).join("; "));
  }
  if (question.answers?.length) return compactText(question.answers.join("; "));
  const direct = cleanText(question.finalAnswer) || cleanText(question.answer);
  if (direct) return compactText(direct);
  return compactText(renderedAnswerText(question));
}

function explicitEdition(payload) {
  const candidates = [
    payload?.catalog?.book?.edition,
    payload?.catalog?.edition,
    payload?.textbookEdition,
    payload?.sourceEdition,
  ];
  return candidates.map(cleanText).find(Boolean) || null;
}

function explicitAcademicYear(payload, context) {
  const candidates = [
    context?.question?.academicYear,
    context?.exercise?.academicYear,
    payload?.catalog?.book?.academicYear,
    payload?.catalog?.academicYear,
    payload?.academicYear,
    payload?.sourceAcademicYear,
  ];
  return candidates.map(cleanText).find(Boolean) || null;
}

function explicitSourcePages(context, catalog) {
  const candidates = [
    context?.question?.sourcePages,
    context?.question?.sourcePage,
    context?.question?.pageNumber,
    context?.exercise?.sourcePages,
    context?.exercise?.sourcePage,
    context?.exercise?.bookPages,
    context?.chapter?.bookPages,
    catalog?.book_pages,
  ];
  return candidates.find((candidate) => Array.isArray(candidate) ? candidate.length : cleanText(candidate)) || null;
}

function diagramWasCheckedAgainstSource(question) {
  return question?.diagramSourceVerified === true
    || question?.sourceVerification?.diagram === true
    || question?.diagram?.sourceVerified === true;
}

function formulaOrPrinciple(question) {
  const explicit = [
    question.formulaUsed,
    question.formula,
    question.principleUsed,
    question.principle,
    question.governingPrinciple,
  ].map(cleanText).find(Boolean);
  if (explicit) return compactText(explicit);
  const explanation = cleanText(question.explanation);
  const steps = (question.steps || []).map((step) => cleanText(step.content)).filter(Boolean);
  const candidates = [explanation, ...steps];
  const completeFormula = candidates.flatMap((candidate) => extractFormulaSources(candidate)).find(Boolean);
  if (completeFormula) return `$$${completeFormula}$$`;
  const formula = candidates
    .flatMap((candidate) => candidate.split(/(?<=[.!?।])\s+/u))
    .find((candidate) => /(?:=|\\(?:frac|sqrt|times|div|cdot)|\b(?:because|therefore|hence|principle|law|theorem|rule)\b)/iu.test(candidate));
  return compactText(formula || firstSentence(explanation));
}

function explicitCommonMistake(question) {
  const explicit = [
    question.commonStudentMistake,
    question.commonMistake,
    question.examinerWarning,
    question.mistakeToAvoid,
  ].map(cleanText).find(Boolean);
  if (explicit) return compactText(explicit);
  const correctIds = new Set(question.correctChoiceIds || (question.correctChoiceId ? [question.correctChoiceId] : []));
  const distractor = (question.choices || []).find((choice) => !correctIds.has(choice.id) && cleanText(choice.explanation || choice.reason));
  if (!distractor) return null;
  return compactText(`Option ${String(distractor.id || "").toUpperCase()} (${cleanText(distractor.content)}): ${cleanText(distractor.explanation || distractor.reason)}`);
}

function explicitAlternativeMethods(question) {
  return [
    ...textList(question.alternativeMethod),
    ...textList(question.alternativeMethods),
    ...textList(question.otherMethod),
  ].filter((value, index, values) => values.findIndex((candidate) => normalize(candidate) === normalize(value)) === index)
    .slice(0, 3)
    .map((value) => compactText(value, 720));
}

function explicitWhyMethodWorks(question) {
  const value = [question.whyMethodWorks, question.methodExplanation, question.whyThisWorks]
    .map(cleanText)
    .find(Boolean);
  return value ? compactText(value, 720) : null;
}

function questionYear(question) {
  const candidates = [
    question.previousYear,
    question.examYear,
    question.year,
    question.boardExamYear,
    question.exam?.year,
  ];
  for (const candidate of candidates) {
    const match = cleanText(candidate).match(/\b(?:19|20)\d{2}\b/u);
    if (match) return match[0];
  }
  return null;
}

function questionRecord(route, chapterSlug, publicQuestionId) {
  const classNumber = Number(String(route.grade || "").replace(/^class-/u, ""));
  return {
    boardSlug: route.board,
    classNumber,
    subjectSlug: route.subject,
    textbookSlug: route.book,
    chapterSlug,
    publicQuestionId,
  };
}

function promptCard(question, route, chapterSlug, meta = "") {
  const prompt = compactText(createPlainSearchText(cleanText(question.prompt)), MAX_CARD_PROMPT_LENGTH);
  const anchorVerb = question.type === "numerical" ? "Calculate"
    : /derive|prove|show that/iu.test(prompt) ? "Derive"
      : question.type === "mcq_single" ? "Test your understanding of"
        : "Explain";
  const anchorSubject = prompt.replace(/^(?:choose the correct(?: option)?|calculate|derive|explain|find)\s*:?\s*/iu, "");
  return {
    id: question.id,
    label: String(question.displayLabel ?? question.order ?? ""),
    prompt,
    anchor: `${anchorVerb} ${anchorSubject.charAt(0).toLocaleLowerCase("en-IN")}${anchorSubject.slice(1)}`,
    href: getQuestionUrl(questionRecord(route, chapterSlug, question.id)),
    meta,
  };
}

function sharedConceptCount(left, right) {
  const leftTags = new Set((left.conceptTags || []).map(normalize).filter(Boolean));
  return (right.conceptTags || []).map(normalize).filter((tag) => leftTags.has(tag)).length;
}

function similarExerciseQuestions(context, route) {
  const currentIndex = context.exerciseQuestions.findIndex((candidate) => candidate.id === context.question.id);
  return context.exerciseQuestions
    .filter((candidate) => candidate.id !== context.question.id && candidate.id && corpusQuestionSnippetEligible(candidate.id, candidate))
    .map((candidate, index) => ({
      question: candidate,
      overlap: sharedConceptCount(context.question, candidate),
      distance: Math.abs(index - currentIndex),
    }))
    .sort((left, right) => right.overlap - left.overlap || left.distance - right.distance)
    .slice(0, 4)
    .map(({ question }) => promptCard(question, route, context.chapter.slug, context.exercise.displayLabel || "Same exercise"));
}

function relevantPreviousYearQuestions(context, route) {
  const candidates = [];
  for (const exercise of context.chapter.exercises || []) {
    for (const question of (exercise.questions || []).flatMap(flattenQuestions)) {
      if (question.id === context.question.id) continue;
      if (!corpusQuestionSnippetEligible(question.id, question)) continue;
      const year = questionYear(question);
      if (!year) continue;
      const overlap = sharedConceptCount(context.question, question);
      if ((context.question.conceptTags || []).length && overlap === 0) continue;
      candidates.push({ question, year, overlap });
    }
  }
  return candidates
    .sort((left, right) => right.overlap - left.overlap || Number(right.year) - Number(left.year))
    .slice(0, 4)
    .map(({ question, year }) => promptCard(question, route, context.chapter.slug, `${year} · ${context.chapter.title}`));
}

function solutionChecks(question, directAnswer, principle) {
  const checks = [];
  const steps = renderableWorkedSteps(question);
  if (steps.length) checks.push(`${steps.length} worked ${steps.length === 1 ? "step" : "steps"}`);
  if (cleanText(question.explanation)) checks.push("Method explained");
  if (principle) checks.push("Formula or principle identified");
  const calculationText = `${steps.map((step) => cleanText(step.content)).join(" ")} ${cleanText(question.finalAnswer)}`;
  const hasCalculation = /-?\d+(?:\.\d+)?\s*[+\-*/×÷]\s*-?\d+(?:\.\d+)?\s*=/u.test(calculationText);
  if (question.type === "numerical" && hasCalculation && simpleArithmeticIsAccurate(question)) checks.push("Arithmetic checked");
  if (question.type === "numerical" && /\d\s*(?:°[CF]|%|m|cm|mm|km|kg|g|mg|s|min|h|K|mol|A|V|W|J|N|Pa|Hz|C|L|mL)\b/u.test(calculationText)) checks.push("Units shown");
  if (question.diagram || question.solutionMedia?.length) checks.push("Diagram included");
  if (directAnswer) checks.push("Final answer separated");
  return checks;
}

function sourceRevision(payload) {
  const checksum = cleanText(payload?.sourceChecksum);
  const version = cleanText(payload?.sourceVersion);
  if (checksum) return `Checksum ${checksum.slice(0, 12)}`;
  return version || "Source revision not recorded";
}

export function buildQuestionPageExperience({ payload, context, route, catalog, reviewedAt, semanticGraph = null }) {
  const resolved = context || findQuestionPageContext(payload, route.chapter, route.question);
  if (!resolved?.question || !catalog) return null;
  const question = resolved.question;
  const questionType = normalizedQuestionType(question);
  const directAnswer = conciseDirectAnswer(question);
  const principle = formulaOrPrinciple(question);
  const edition = explicitEdition(payload);
  const academicYear = explicitAcademicYear(payload, resolved);
  const exerciseLabel = cleanText(resolved.exercise.displayLabel || resolved.exercise.id || "Textbook exercise");
  const marks = Number.isFinite(Number(question.marks)) && Number(question.marks) > 0 ? Number(question.marks) : null;
  const pathname = getQuestionUrl(questionRecord(route, resolved.chapter.slug, question.id));
  const completenessQuestion = questionType === question.type ? question : { ...question, type: questionType };
  const completeness = evaluateAnswerCompleteness(completenessQuestion);
  const contentQuality = corpusQualityFindingForQuestion(question.id, question);
  const internalMappingConsistent = question.id === route.question
    && resolved.chapter.slug === route.chapter
    && Boolean(resolved.exercise?.id || resolved.exercise?.displayLabel)
    && Boolean(catalog.row_id);
  const sourceMapping = sourceMappingReleaseEligibility({
    bookId: `${route.board}::${route.grade}::${route.subject}::${route.book}`,
    chapterSlug: route.chapter,
    internalMappingConsistent,
  });
  const trust = buildQuestionTrustRecord({
    question,
    pathname,
    sourceMappingVerified: sourceMapping.authoritative.authoritativeTextbookMappingVerified,
    internalMappingConsistent,
    authoritativeSourceMapping: sourceMapping.authoritative,
    exercise: exerciseLabel,
    sourcePages: explicitSourcePages(resolved, catalog),
    edition,
    academicYear,
    sourceRevision: sourceRevision(payload),
    reviewedAt,
    completeness,
    diagramSourceVerified: diagramWasCheckedAgainstSource(question),
  });
  const model = {
    board: cleanText(catalog.board_name || catalog.board_short_name || route.board),
    classLabel: cleanText(catalog.grade_label || `Class ${String(route.grade).replace(/^class-/u, "")}`),
    subject: cleanText(catalog.subject_name || route.subject),
    textbook: cleanText(catalog.book_title || payload?.catalog?.book?.title || route.book),
    chapter: cleanText(catalog.chapter_title || resolved.chapter.title),
    chapterNumber: Number(catalog.chapter_number || resolved.chapter.number || resolved.chapter.order),
    exercise: exerciseLabel,
    questionNumber: cleanText(question.displayLabel || catalog.display_label || question.order),
    questionType,
    questionTypeLabel: subjectAwareQuestionTypeLabel(
      questionType,
      route.subject,
      QUESTION_TYPE_LABELS[questionType] || "Textbook answer",
    ),
    prompt: cleanText(question.prompt),
    directAnswer,
    canonicalExplanation: cleanText(question.explanation),
    marks,
    expectedResponse: EXPECTED_RESPONSE[questionType] || "A complete answer using the required textbook terminology",
    edition,
    academicYear,
    editionStatus: sourceMapping.authoritative.status === "mismatch"
      ? `Authoritative textbook mapping mismatch: ${sourceMapping.authoritative.detail}`
      : sourceMapping.authoritative.authoritativeTextbookMappingVerified
        ? `Authoritative textbook mapping verified against ${cleanText(catalog.book_title || payload?.catalog?.book?.title)}${edition ? `, ${edition}` : ""}.`
        : `Catalog and imported payload are internally consistent; an authoritative textbook comparison is not recorded.`,
    sourceRevision: sourceRevision(payload),
    sourceVersion: cleanText(payload?.sourceVersion) || null,
    completeness,
    trust,
    principle,
    whyMethodWorks: explicitWhyMethodWorks(question),
    commonMistake: explicitCommonMistake(question),
    alternativeMethods: explicitAlternativeMethods(question),
    solutionChecks: solutionChecks(question, directAnswer, principle),
    sameExerciseQuestions: similarExerciseQuestions(resolved, route),
    previousYearQuestions: relevantPreviousYearQuestions(resolved, route),
    conceptTags: (question.conceptTags || []).map((tag) => cleanText(String(tag).replaceAll("-", " "))).filter(Boolean).slice(0, 6),
    semanticGraph,
    contentQuality,
    pathname,
  };
  model.ready = Boolean(
    model.board
    && model.classLabel
    && model.subject
    && model.textbook
    && model.chapter
    && model.exercise
    && model.questionNumber
    && model.prompt
    && model.directAnswer
    && model.trust?.internalMappingConsistent,
  );
  return model;
}

function cardsMarkup(cards, className) {
  return cards.map((card) => `<a class="${className}" href="${escapeHtml(card.href)}"><span>${escapeHtml(card.meta)}</span><strong>Question ${escapeHtml(card.label)}</strong><p>${escapeHtml(card.prompt)}</p><b>${escapeHtml(card.anchor || `Solve question ${card.label}`)} →</b></a>`).join("");
}

function trustLedgerRow(status, title, detail) {
  return `<div class="question-trust-row is-${escapeHtml(status)}"><span aria-hidden="true">${status === "passed" ? "✓" : "○"}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div></div>`;
}

function renderTrustPanel(model) {
  const trust = model.trust;
  const internalMapping = trustLedgerRow(
    trust.internalMappingConsistent ? "passed" : "pending",
    trust.internalMappingConsistent ? "Internal mapping consistent" : "Internal mapping incomplete",
    trust.internalMappingConsistent
      ? "The catalog route and imported payload agree on board, class, subject, textbook, chapter, exercise and question ID."
      : "One or more catalog and imported-payload identifiers do not agree.",
  );
  const authoritativeMapping = trust.authoritativeSourceMapping?.verified
    ? trustLedgerRow("passed", "Authoritative textbook mapping verified", trust.authoritativeSourceMapping.detail)
    : trust.authoritativeSourceMapping?.status === "mismatch"
      ? trustLedgerRow("pending", "Authoritative textbook mapping mismatch", trust.authoritativeSourceMapping.detail)
      : trustLedgerRow("pending", "Authoritative textbook comparison not recorded", trust.authoritativeSourceMapping?.detail || "No authoritative textbook comparison is recorded.");
  const answerGate = trustLedgerRow(
    trust.automatedAnswerGatePassed ? "passed" : "pending",
    trust.automatedAnswerGatePassed ? "Automated answer checks passed" : "Automated answer checks incomplete",
    trust.automatedAnswerGatePassed
      ? `${model.questionTypeLabel} structure satisfied the type-specific publishing checks.`
      : `${model.questionTypeLabel} structure is missing one or more required publishing checks.`,
  );
  const arithmetic = model.questionType === "numerical"
    ? trustLedgerRow(
      trust.automatedArithmeticChecksPassed ? "passed" : "pending",
      trust.automatedArithmeticChecksPassed ? "Automated arithmetic checks passed" : "Automated arithmetic checks incomplete",
      trust.automatedArithmeticChecksPassed
        ? "A machine check found an arithmetic expression and found no mismatch in the stated result."
        : "No arithmetic-pass claim is made until both the calculation pattern and result check succeed.",
    )
    : "";
  const diagram = trust.diagramStatus === "verified"
    ? trustLedgerRow("passed", "Diagram checked against source", "The source record explicitly carries a diagram-verification flag.")
    : trust.diagramStatus === "pending"
      ? trustLedgerRow("pending", "Diagram source check pending", "A diagram is present, but the source record does not prove a completed visual comparison.")
      : "";
  const manual = trust.manualReview
    ? `<aside class="question-human-review is-reviewed"><span>Human academic review</span><h3>Reviewed by ${escapeHtml(trust.manualReview.reviewer.name)}</h3><dl><div><dt>Qualification</dt><dd>${escapeHtml(trust.manualReview.reviewer.qualification)}</dd></div><div><dt>Reviewed on</dt><dd>${escapeHtml(trust.manualReview.reviewedOnDisplay)}</dd></div><div><dt>Textbook edition</dt><dd>${escapeHtml(trust.manualReview.textbookEdition)}</dd></div><div><dt>Academic year</dt><dd>${escapeHtml(trust.manualReview.academicYear)}</dd></div></dl><a href="/reviewers/${escapeHtml(trust.manualReview.reviewer.slug)}">Reviewer profile →</a></aside>`
    : `<aside class="question-human-review is-pending"><span>Human academic review</span><h3>Editorial review pending</h3><p>No verified named academic reviewer is attached to this answer. Automated validation is not presented as expert review.</p><a href="/reviewers">How reviewer labels work →</a></aside>`;
  const correctionStatus = trust.latestCorrectionDateDisplay
    ? `<p><strong>Answer corrected on ${escapeHtml(trust.latestCorrectionDateDisplay)}</strong><br><a href="/corrections#${escapeHtml(model.pathname.split("/").at(-1))}">Read the correction record →</a></p>`
    : `<p><strong>No dated answer correction is recorded.</strong><br><a href="/corrections">How corrections are logged →</a></p>`;
  return `<section class="question-trust-panel" aria-labelledby="question-source-review" data-review-status="${trust.manualReview ? "manual" : "pending"}"><header><span>Evidence ledger</span><h2 id="question-source-review">What has—and has not—been checked</h2><p>Internal, authoritative, automated and human checks are kept separate.</p></header><div class="question-trust-ledger">${internalMapping}${authoritativeMapping}${answerGate}${arithmetic}${diagram}</div>${manual}<div class="question-source-record"><h3>Source record</h3><dl><div><dt>Textbook</dt><dd>${escapeHtml(model.textbook)}</dd></div><div><dt>Chapter</dt><dd>${escapeHtml(`Chapter ${model.chapterNumber} · ${model.chapter}`)}</dd></div><div><dt>Exercise</dt><dd>${escapeHtml(trust.exercise)}</dd></div><div><dt>Source page</dt><dd>${escapeHtml(trust.sourcePages)}</dd></div><div><dt>Textbook edition</dt><dd>${escapeHtml(trust.edition || "Not recorded in source data")}</dd></div><div><dt>Academic year</dt><dd>${escapeHtml(trust.academicYear || "Not recorded in source data")}</dd></div><div><dt>Source revision</dt><dd>${escapeHtml(trust.sourceRevision)}</dd></div><div><dt>Automated publishing check</dt><dd>${escapeHtml(trust.publishingGateDate || "Date not recorded")}</dd></div></dl></div><footer>${correctionStatus}<a class="question-report-error" href="${escapeHtml(trust.reportUrl)}">Report an academic error</a></footer></section>`;
}

export function renderQuestionPageExperience(model) {
  if (!model?.ready) return null;
  const contextItems = [model.board, model.classLabel, model.subject, model.textbook, `Chapter ${String(model.chapterNumber).padStart(2, "0")}: ${model.chapter}`];
  const responseMeta = model.marks
    ? `${model.marks} ${model.marks === 1 ? "mark" : "marks"} · ${model.expectedResponse}`
    : model.expectedResponse;
  const aboveFold = `<section class="question-answer-summary" aria-labelledby="question-direct-answer"><ol aria-label="Question context">${contextItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol><div class="question-answer-summary-grid"><div><span class="question-answer-label">Question ${escapeHtml(model.questionNumber)} · ${escapeHtml(model.questionTypeLabel)}</span><h2 id="question-direct-answer">Direct answer</h2><p>${renderMathText(model.directAnswer)}</p></div><dl><div><dt>Expected response</dt><dd>${escapeHtml(responseMeta)}</dd></div><div><dt>Exercise</dt><dd>${escapeHtml(model.exercise)}</dd></div></dl></div><p class="question-verification ${model.edition ? "is-edition-verified" : "is-edition-pending"}">${model.edition ? "✓ " : "ⓘ "}${escapeHtml(model.editionStatus)}</p></section>`;
  const solutionOverview = `<div class="question-solution-overview" aria-label="What this solution covers"><span>Main solution</span><ul>${model.solutionChecks.map((check) => `<li>✓ ${escapeHtml(check)}</li>`).join("")}</ul></div>`;
  const conceptSection = model.principle || model.conceptTags.length
    ? `<section class="question-specific-panel" aria-labelledby="question-principle"><span>Related concept</span><h3 id="question-principle">Formula or principle used</h3>${model.principle ? principleMarkup(model.principle) : ""}${model.conceptTags.length ? `<ul class="question-concept-tags">${model.conceptTags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>` : ""}</section>`
    : "";
  const whySection = model.whyMethodWorks
    ? `<section class="question-specific-panel"><span>Method check</span><h3>Why this method works</h3><p>${escapeHtml(model.whyMethodWorks)}</p></section>`
    : "";
  const alternativeSection = model.alternativeMethods.length
    ? `<section class="question-specific-panel"><span>Another route</span><h3>Alternative method</h3>${model.alternativeMethods.map((method) => `<p>${escapeHtml(method)}</p>`).join("")}</section>`
    : "";
  const mistakeSection = model.commonMistake
    ? `<section class="question-specific-panel question-mistake"><span>Exam check</span><h3>Common student mistake</h3><p>${escapeHtml(model.commonMistake)}</p></section>`
    : "";
  const solutionSupplement = conceptSection || whySection || alternativeSection || mistakeSection
    ? `<div class="question-specific-grid">${conceptSection}${whySection}${alternativeSection}${mistakeSection}</div>`
    : "";
  const trust = renderTrustPanel(model);
  const contentQuality = renderCorpusQualityNote(model.contentQuality);
  const sameExercise = model.sameExerciseQuestions.length
    ? `<section class="question-exercise-related" aria-labelledby="same-exercise-heading"><header><span>Same exercise</span><h2 id="same-exercise-heading">Similar questions from ${escapeHtml(model.exercise)}</h2></header><div>${cardsMarkup(model.sameExerciseQuestions, "question-exercise-card")}</div></section>`
    : "";
  const previousYear = model.previousYearQuestions.length
    ? `<section class="question-exercise-related question-previous-year" aria-labelledby="previous-year-heading"><header><span>Exam practice</span><h2 id="previous-year-heading">Relevant previous-year questions</h2></header><div>${cardsMarkup(model.previousYearQuestions, "question-exercise-card")}</div></section>`
    : "";
  const semanticLinks = renderQuestionSemanticGraph(model.semanticGraph);
  const canonicalExplanation = model.canonicalExplanation
    ? `<p class="direct-answer canonical-answer-replacement"><strong class="answer-highlight">${renderMathText(model.canonicalExplanation)}</strong></p>`
    : "";
  return {
    aboveFold,
    solutionOverview,
    solutionSupplement,
    trust: `${contentQuality}${trust}`,
    sameExercise,
    previousYear,
    semanticLinks,
    canonicalExplanation,
    snippetEligible: model.contentQuality?.snippetEligible !== false,
  };
}

export const QUESTION_PAGE_EXPERIENCE_STYLES = `${CORPUS_QUALITY_STYLES}<style id="question-page-experience-styles">
.answer-page-hero{display:grid!important;grid-template-columns:minmax(0,1fr);align-items:start!important;gap:1rem}.answer-page-hero>div:first-child{grid-column:1;grid-row:1}.answer-page-hero>.answer-page-chapter{grid-column:1;grid-row:2}.question-answer-summary{grid-column:1;grid-row:3;width:100%;margin:.25rem 0 0;padding:1.25rem;border:1px solid #b8c9bd;border-radius:20px;background:linear-gradient(145deg,#f7fbf5,#eef7f0);box-shadow:0 14px 34px rgba(21,51,34,.08)}
.question-answer-summary ol{display:flex;flex-wrap:wrap;gap:.45rem;margin:0 0 1rem;padding:0;list-style:none}.question-answer-summary ol li{padding:.35rem .6rem;border:1px solid #d3ded5;border-radius:999px;background:#fff;font-size:.78rem;font-weight:700}.question-answer-summary-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(220px,.8fr);gap:1.25rem}.question-answer-label,.question-specific-panel>span,.question-exercise-related header>span,.question-solution-overview>span{display:block;color:#21603c;font-size:.76rem;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.question-answer-summary h2,.question-trust-panel h2,.question-exercise-related h2{margin:.35rem 0 .55rem}.question-answer-summary-grid>div>p{margin:0;font-size:1.05rem;font-weight:720;line-height:1.55}.question-answer-summary dl{margin:0}.question-answer-summary dl div{display:grid;grid-template-columns:130px 1fr;gap:.75rem;padding:.45rem 0;border-bottom:1px solid #dbe5dd}.question-answer-summary dt{color:#5e6c63;font-size:.78rem;font-weight:750}.question-answer-summary dd{margin:0;font-size:.88rem;font-weight:650}.question-verification{margin:1rem 0 0;padding-top:.9rem;border-top:1px solid #d3ded5;font-size:.84rem}.question-verification.is-edition-pending{color:#6a4a12}.question-solution-overview{margin:.5rem 0 1.25rem;padding:1rem;border:1px solid #d7d1c5;border-radius:14px;background:#fbf8f1}.question-solution-overview ul{display:flex;flex-wrap:wrap;gap:.5rem;margin:.7rem 0 0;padding:0;list-style:none}.question-solution-overview li{padding:.35rem .55rem;border-radius:8px;background:#fff;color:#294c35;font-size:.8rem;font-weight:700}.question-specific-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.85rem;margin-top:1.4rem}.question-specific-panel{padding:1rem;border:1px solid #ddd6ca;border-radius:14px;background:#fff}.question-specific-panel h3{margin:.3rem 0 .5rem}.question-specific-panel p{margin:.4rem 0;line-height:1.6}.question-principle-formula .math-semantic>math{font-weight:750}.question-specific-panel .math-inline,.question-specific-panel .math-inline>math{display:inline-block}.question-mistake{border-color:#dec9ad;background:#fffaf1}.question-concept-tags{display:flex;flex-wrap:wrap;gap:.4rem;margin:.7rem 0 0;padding:0;list-style:none}.question-concept-tags li{padding:.3rem .5rem;border-radius:999px;background:#edf5ef;font-size:.78rem}
.question-trust-panel{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(270px,.85fr);gap:1rem;align-items:start;margin:1.25rem 0;padding:1.2rem;border:1px solid #bcb4a6;border-left:6px solid #11151a;border-radius:16px;background:#f5f0e6}.question-trust-panel>header{grid-column:1/-1;padding-bottom:.9rem;border-bottom:1px solid #cfc6b8}.question-trust-panel>header>span,.question-human-review>span{display:block;color:#0757d8;font-size:.74rem;font-weight:850;letter-spacing:.09em;text-transform:uppercase}.question-trust-panel>header>p{margin:.25rem 0 0;color:#555d59}.question-trust-ledger{display:grid;gap:.55rem}.question-trust-row{display:grid;grid-template-columns:30px 1fr;gap:.65rem;align-items:start;padding:.7rem;border:1px solid #c8c3b9;border-radius:10px;background:#fff}.question-trust-row>span{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;font-weight:900}.question-trust-row strong,.question-trust-row small{display:block}.question-trust-row small{margin-top:.2rem;color:#5c645f;line-height:1.45}.question-trust-row.is-passed>span{background:#e3f3e8;color:#17603a}.question-trust-row.is-pending>span{background:#fff1cc;color:#8a5a00}.question-human-review{padding:1rem;border:1px solid #d5ad55;border-radius:12px;background:#fff7df}.question-human-review h3{margin:.3rem 0 .5rem;font-size:1.15rem}.question-human-review p{margin:.25rem 0 .65rem}.question-human-review dl,.question-source-record dl{margin:0}.question-human-review dl div,.question-source-record dl div{display:grid;grid-template-columns:135px 1fr;gap:.6rem;padding:.45rem 0;border-bottom:1px solid #d8d1c5}.question-human-review dt,.question-source-record dt{color:#616762;font-size:.78rem;font-weight:750}.question-human-review dd,.question-source-record dd{margin:0;font-size:.87rem;font-weight:650}.question-source-record{grid-column:1/-1;padding:1rem;border-top:1px solid #cfc6b8}.question-source-record h3{margin:0 0 .45rem}.question-source-record dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 1.4rem}.question-trust-panel>footer{grid-column:1/-1;display:flex;justify-content:space-between;gap:1rem;align-items:center;padding-top:1rem;border-top:1px solid #cfc6b8}.question-trust-panel>footer p{margin:0}.question-report-error{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:.65rem .85rem;border:1px solid #b44332;border-radius:10px;color:#8c2e20;font-weight:800;text-decoration:none;background:#fff}.question-report-error:focus-visible,.question-human-review a:focus-visible,.question-trust-panel>footer a:focus-visible{outline:3px solid #0757d8;outline-offset:3px}.question-exercise-related{margin:1.5rem 0}.question-exercise-related>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}.question-exercise-card{display:block;padding:1rem;border:1px solid #d7d1c5;border-radius:14px;background:#fff;color:inherit;text-decoration:none}.question-exercise-card>span{color:#657168;font-size:.75rem}.question-exercise-card strong{display:block;margin:.25rem 0}.question-exercise-card p{display:-webkit-box;margin:.4rem 0;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:3}.question-exercise-card b{color:#21603c;font-size:.82rem}
@media(max-width:1100px){.question-answer-summary-grid{grid-template-columns:1fr}}
@media(max-width:760px){.question-answer-summary-grid,.question-specific-grid,.question-trust-panel,.question-exercise-related>div,.question-source-record dl{grid-template-columns:1fr}.question-answer-summary dl div,.question-human-review dl div,.question-source-record dl div{grid-template-columns:1fr;gap:.15rem}.question-trust-panel>footer{align-items:stretch;flex-direction:column}.question-report-error{width:100%}}
</style>`;

export const QUESTION_PAGE_THEME_ALIGNMENT_STYLES = `<style id="question-page-theme-alignment-styles">
.standalone-question-page{
  --question-ink:var(--ink,#101316);
  --question-ink-soft:var(--ink-soft,#40464d);
  --question-paper:var(--paper,#fbf7ed);
  --question-paper-deep:var(--paper-deep,#efe8d9);
  --question-white:var(--white,#fffef9);
  --question-blue:var(--violet,#0757d8);
  --question-blue-soft:var(--violet-soft,#e5edff);
  --question-coral:var(--coral,#c4472f);
  --question-coral-soft:var(--coral-soft,#ffe0d9);
  --question-gold:var(--gold,#ffd51f);
  --question-gold-soft:var(--gold-soft,#fff3b0);
  --question-green:var(--green,#137a4a);
  --question-green-soft:var(--mint-soft,#e6f3ea);
  --question-shadow:var(--hard-shadow-small,4px 5px 0 #101316c2);
  --question-utility:var(--font-geist-mono,ui-monospace,SFMono-Regular,Menlo,monospace);
}
.standalone-question-page .question-answer-summary{
  position:relative;
  overflow:hidden;
  padding:clamp(1.1rem,2.4vw,1.5rem);
  border:3px solid var(--question-ink);
  border-radius:6px;
  background:var(--question-white);
  box-shadow:var(--question-shadow);
}
.standalone-question-page .question-answer-summary::before{
  position:absolute;
  top:0;
  right:0;
  left:0;
  height:7px;
  background:linear-gradient(90deg,var(--question-blue) 0 64%,var(--question-gold) 64% 82%,var(--question-coral) 82% 100%);
  content:"";
}
.standalone-question-page .question-answer-summary ol{gap:.4rem;margin:.3rem 0 1.15rem}
.standalone-question-page .question-answer-summary ol li{
  padding:.38rem .58rem;
  border:1.5px solid var(--question-ink);
  border-radius:3px;
  background:var(--question-paper);
  color:var(--question-ink);
  font-size:.7rem;
  font-weight:820;
}
.standalone-question-page .question-answer-summary ol li:first-child{background:var(--question-gold-soft)}
.standalone-question-page .question-answer-summary ol li:last-child{background:var(--question-blue-soft)}
.standalone-question-page .question-answer-summary-grid{gap:1.35rem}
.standalone-question-page .question-answer-label,
.standalone-question-page .question-specific-panel>span,
.standalone-question-page .question-exercise-related header>span,
.standalone-question-page .question-solution-overview>span,
.standalone-question-page .question-trust-panel>header>span,
.standalone-question-page .question-human-review>span{
  color:var(--question-blue);
  font-family:var(--question-utility);
  font-size:.68rem;
  font-weight:900;
  letter-spacing:.12em;
}
.standalone-question-page .question-answer-summary h2{color:var(--question-ink);font-size:1.12rem;font-weight:900}
.standalone-question-page .question-answer-summary-grid>div>p{
  padding:.15rem 0 .15rem 1rem;
  border-left:4px solid var(--question-blue);
  color:var(--question-ink);
  font-size:1.05rem;
  line-height:1.6;
}
.standalone-question-page .question-answer-summary dl{
  align-self:start;
  padding:.75rem .9rem;
  border:2px solid var(--question-ink);
  border-radius:4px;
  background:var(--question-blue-soft);
}
.standalone-question-page .question-answer-summary dl div{grid-template-columns:120px 1fr;border-color:color-mix(in srgb,var(--question-ink) 25%,transparent)}
.standalone-question-page .question-answer-summary dt{color:var(--question-ink-soft)}
.standalone-question-page .question-answer-summary dd{color:var(--question-ink);font-weight:800}
.standalone-question-page .question-verification{
  margin:1.1rem 0 0;
  padding:.85rem 0 0;
  border-top:2px solid var(--question-ink);
  color:#755119;
  line-height:1.5;
}
.standalone-question-page .question-solution-overview{
  position:relative;
  overflow:hidden;
  margin:.35rem 0 1.35rem;
  padding:1.05rem;
  border:2px solid var(--question-ink);
  border-radius:5px;
  background:var(--question-white);
  box-shadow:var(--question-shadow);
}
.standalone-question-page .question-solution-overview::before,
.standalone-question-page .question-specific-panel::before,
.standalone-question-page .question-exercise-card::before{
  position:absolute;
  top:0;
  right:0;
  left:0;
  height:5px;
  background:var(--question-green);
  content:"";
}
.standalone-question-page .question-solution-overview ul{gap:.45rem;margin:.8rem 0 0}
.standalone-question-page .question-solution-overview li{
  min-height:2rem;
  padding:.4rem .62rem;
  border:1.5px solid var(--question-ink);
  border-radius:4px;
  background:var(--question-green-soft);
  color:var(--question-ink);
  box-shadow:none;
  font-size:.76rem;
  font-weight:820;
}
.standalone-question-page .question-specific-grid{gap:1rem;margin-top:1.5rem}
.standalone-question-page .question-specific-panel{
  --question-panel-accent:var(--question-blue);
  --question-panel-tint:var(--question-blue-soft);
  position:relative;
  overflow:hidden;
  padding:1.1rem;
  border:2px solid var(--question-ink);
  border-radius:5px;
  background:var(--question-white);
  box-shadow:var(--question-shadow);
}
.standalone-question-page .question-specific-panel:nth-child(2){--question-panel-accent:var(--question-green);--question-panel-tint:var(--question-green-soft)}
.standalone-question-page .question-specific-panel:nth-child(3){--question-panel-accent:var(--question-coral);--question-panel-tint:var(--question-coral-soft)}
.standalone-question-page .question-specific-panel::before{background:var(--question-panel-accent)}
.standalone-question-page .question-specific-panel>span{color:var(--question-panel-accent)}
.standalone-question-page .question-specific-panel h3{color:var(--question-ink);font-size:.96rem;font-weight:900}
.standalone-question-page .question-principle-formula{
  padding:.7rem .8rem;
  border-left:4px solid var(--question-panel-accent);
  background:var(--question-panel-tint);
  color:var(--question-ink);
}
.standalone-question-page .question-concept-tags li{
  padding:.3rem .55rem;
  border:1px solid color-mix(in srgb,var(--question-ink) 56%,transparent);
  border-radius:999px;
  background:var(--question-green-soft);
  color:var(--question-ink);
  font-size:.7rem;
  font-weight:780;
}
.standalone-question-page .phase4-review-signal{
  display:grid;
  grid-template-columns:minmax(230px,.75fr) minmax(0,1.25fr);
  gap:.35rem 1rem;
  align-items:center;
  margin:1.4rem 0;
  padding:1rem 1.1rem;
  border:2px solid var(--question-ink);
  border-left:9px solid var(--question-green);
  border-radius:5px;
  background:var(--question-green-soft);
  box-shadow:var(--question-shadow);
}
.standalone-question-page .phase4-review-signal.is-pending{border-left-color:var(--question-gold);background:var(--question-gold-soft)}
.standalone-question-page .phase4-review-signal a{color:var(--question-ink);font-weight:900;line-height:1.35;text-decoration:none}
.standalone-question-page .phase4-review-signal small{
  color:var(--question-ink-soft);
  font-family:var(--question-utility);
  font-size:.64rem;
  font-weight:800;
  letter-spacing:.04em;
  text-transform:uppercase;
}
.standalone-question-page .phase4-review-signal>span{
  grid-column:1/-1;
  display:block;
  padding-top:.65rem;
  border-top:1px solid color-mix(in srgb,var(--question-ink) 30%,transparent);
  color:var(--question-ink-soft);
  font-size:.78rem;
  line-height:1.5;
}
.standalone-question-page .question-trust-panel{
  position:relative;
  overflow:hidden;
  gap:1rem;
  padding:1.25rem;
  border:3px solid var(--question-ink);
  border-radius:6px;
  background:var(--question-white);
  box-shadow:var(--question-shadow);
}
.standalone-question-page .question-trust-panel::before{
  position:absolute;
  top:0;
  right:0;
  left:0;
  height:7px;
  background:linear-gradient(90deg,var(--question-blue) 0 52%,var(--question-gold) 52% 76%,var(--question-coral) 76% 100%);
  content:"";
}
.standalone-question-page .question-trust-panel>header{padding:.3rem 0 1rem;border-bottom:2px solid var(--question-ink)}
.standalone-question-page .question-trust-panel>header>p{color:var(--question-ink-soft)}
.standalone-question-page .question-trust-ledger{gap:.6rem}
.standalone-question-page .question-trust-row{
  padding:.75rem;
  border:1.5px solid var(--question-ink);
  border-left-width:6px;
  border-radius:4px;
  background:var(--question-paper);
}
.standalone-question-page .question-trust-row.is-passed{border-left-color:var(--question-green)}
.standalone-question-page .question-trust-row.is-pending{border-left-color:var(--question-gold)}
.standalone-question-page .question-trust-row>span{border:1px solid color-mix(in srgb,var(--question-ink) 30%,transparent);border-radius:50%}
.standalone-question-page .question-trust-row strong{color:var(--question-ink);font-weight:900}
.standalone-question-page .question-trust-row small{color:var(--question-ink-soft)}
.standalone-question-page .question-human-review{
  padding:1rem;
  border:2px solid var(--question-ink);
  border-radius:5px;
  background:var(--question-gold-soft);
  box-shadow:3px 3px 0 color-mix(in srgb,var(--question-ink) 72%,transparent);
}
.standalone-question-page .question-human-review h3{color:var(--question-ink);font-weight:900}
.standalone-question-page .question-human-review a{color:var(--question-ink);font-weight:800;text-underline-offset:3px}
.standalone-question-page .question-source-record{
  grid-column:1/-1;
  padding:1rem;
  border:1.5px solid var(--question-ink);
  border-radius:4px;
  background:var(--question-paper);
}
.standalone-question-page .question-source-record h3{color:var(--question-ink);font-weight:900}
.standalone-question-page .question-source-record dl div{border-color:color-mix(in srgb,var(--question-ink) 22%,transparent)}
.standalone-question-page .question-source-record dt{color:var(--question-ink-soft)}
.standalone-question-page .question-source-record dd{color:var(--question-ink);font-weight:780}
.standalone-question-page .question-trust-panel>footer{border-top:2px solid var(--question-ink)}
.standalone-question-page .question-report-error{
  border:2px solid var(--question-ink);
  border-radius:4px;
  background:var(--question-white);
  color:var(--question-coral);
  box-shadow:3px 3px 0 var(--question-ink);
}
.standalone-question-page .question-report-error:hover{background:var(--question-gold-soft);box-shadow:1px 1px 0 var(--question-ink);transform:translate(2px,2px)}
.standalone-question-page .question-exercise-related{margin:1.75rem 0}
.standalone-question-page .question-exercise-related>header{margin-bottom:1rem;padding-bottom:.75rem;border-bottom:2px solid var(--question-ink)}
.standalone-question-page .question-exercise-related header>span{color:var(--question-coral)}
.standalone-question-page .question-exercise-related h2{color:var(--question-ink);font-size:1.35rem;font-weight:900;letter-spacing:-.025em}
.standalone-question-page .question-exercise-related>div{gap:1rem}
.standalone-question-page .question-exercise-card{
  position:relative;
  overflow:hidden;
  padding:1.15rem;
  border:2px solid var(--question-ink);
  border-radius:5px;
  background:var(--question-white);
  color:var(--question-ink);
  box-shadow:var(--question-shadow);
  transition:transform .16s ease,box-shadow .16s ease;
}
.standalone-question-page .question-exercise-card::before{background:var(--question-blue)}
.standalone-question-page .question-exercise-card:nth-child(even)::before{background:var(--question-coral)}
.standalone-question-page .question-exercise-card>span{color:var(--question-blue);font-family:var(--question-utility);font-size:.66rem;font-weight:850;text-transform:uppercase}
.standalone-question-page .question-exercise-card strong{color:var(--question-ink);font-size:1rem;font-weight:900}
.standalone-question-page .question-exercise-card p{color:var(--question-ink-soft);line-height:1.5}
.standalone-question-page .question-exercise-card b{color:var(--question-green);font-weight:900}
.standalone-question-page .question-exercise-card:hover{box-shadow:6px 7px 0 var(--question-ink);transform:translate(-2px,-2px)}
.standalone-question-page .question-answer-summary a:focus-visible,
.standalone-question-page .phase4-review-signal a:focus-visible,
.standalone-question-page .question-specific-panel a:focus-visible,
.standalone-question-page .question-exercise-card:focus-visible,
.standalone-question-page .question-report-error:focus-visible{outline:3px solid var(--question-blue);outline-offset:3px}
@media(max-width:760px){
  .standalone-question-page .question-answer-summary{padding:1rem}
  .standalone-question-page .question-answer-summary dl{padding:.65rem .75rem}
  .standalone-question-page .phase4-review-signal{grid-template-columns:1fr}
  .standalone-question-page .phase4-review-signal>span{grid-column:1}
  .standalone-question-page .question-trust-panel{padding:1rem}
  .standalone-question-page .question-exercise-related h2{font-size:1.15rem}
}
@media(prefers-reduced-motion:reduce){
  .standalone-question-page .question-exercise-card,.standalone-question-page .question-report-error{transition:none}
}
</style>`;
