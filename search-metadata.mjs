const BOARD_SEARCH_NAMES = Object.freeze({
  "maharashtra-board": "Maharashtra Board",
  cbse: "CBSE",
  cisce: "ICSE",
  "tamil-nadu-board": "Tamil Nadu Board",
});

const NUMERICAL_TOPICS = Object.freeze([
  Object.freeze({ pattern: /\bdielectric\b[\s\S]{0,100}\bslab\b|\bslab\b[\s\S]{0,100}\bdielectric\b/iu, label: "capacitor" }),
  Object.freeze({ pattern: /\bequivalent capacitance\b/iu, label: "capacitance" }),
  Object.freeze({ pattern: /\bparallel[- ]plate capacitor\b/iu, label: "capacitor" }),
  Object.freeze({ pattern: /\bcapacitors?\b|\bcapacitance\b/iu, label: "capacitor" }),
  Object.freeze({ pattern: /\belectric potential\b|\bpotential difference\b/iu, label: "electric potential" }),
  Object.freeze({ pattern: /\bdipole\b/iu, label: "electric dipole" }),
  Object.freeze({ pattern: /\belectric field\b/iu, label: "electric field" }),
  Object.freeze({ pattern: /\belectric flux\b|\bGauss(?:’s|'s)? law\b/iu, label: "electric flux" }),
]);

function contentText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(contentText).join(" ");
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text;
    return [value.content, value.blocks, value.items, value.prompt]
      .filter((item) => item != null)
      .map(contentText)
      .join(" ");
  }
  return "";
}

function cleanText(value) {
  return contentText(value)
    .normalize("NFC")
    .replace(/<\/?[A-Za-z][^<>]*>/gu, " ")
    .replace(/\*\*|__|`/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
}

function countLabel(value) {
  return integer(value).toLocaleString("en-IN");
}

function boardSearchName(record) {
  return BOARD_SEARCH_NAMES[record.board_slug || record.boardSlug]
    || cleanText(record.board_short_name || record.board_name)
      .replace(/ State Board(?: of Secondary and Higher Secondary Education)?$/u, " Board")
    || "Board";
}

function classNumber(record) {
  return integer(record.class_number || record.classNumber || String(record.grade_slug || "").replace(/^class-/u, ""));
}

function subjectName(record) {
  return cleanText(record.subject_name || record.subjectName || record.subject_slug || record.subjectSlug)
    .replace(/\b\w/gu, (character) => character.toLocaleUpperCase("en-IN"));
}

function titleWithoutGrade(record) {
  const source = cleanText(record.book_title || record.title || record.textbook);
  const grade = classNumber(record);
  const romanGrades = Object.freeze({ 9: "IX", 10: "X", 11: "XI", 12: "XII" });
  const alternatives = [grade, romanGrades[grade]].filter(Boolean).join("|");
  return source
    .replace(new RegExp(`\\b(?:Class|Standard|Std\\.?)\\s*(?:${alternatives})\\b`, "giu"), " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function bookSearchLead(record) {
  const source = cleanText(record.book_title || record.title || record.textbook);
  const subject = subjectName(record);
  const escapedSubject = subject.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const withoutContext = titleWithoutGrade(record)
    .replace(new RegExp(`\\b${escapedSubject}\\b`, "giu"), " ")
    .replace(/\s*[-–—:]\s*/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return withoutContext || source || "Textbook";
}

function bookSearchName(record) {
  const subject = subjectName(record);
  const withoutGrade = titleWithoutGrade(record);
  const significantSubjectWords = subject.toLocaleLowerCase("en-IN").match(/[\p{L}\p{N}]+/gu)
    ?.filter((word) => word.length > 2 && !["and", "the"].includes(word)) || [];
  const sourceWords = new Set(withoutGrade.toLocaleLowerCase("en-IN").match(/[\p{L}\p{N}]+/gu) || []);
  const alreadyNamesSubject = significantSubjectWords.length > 1
    && significantSubjectWords.every((word) => sourceWords.has(word));
  if (alreadyNamesSubject) return `${withoutGrade} Class ${classNumber(record)}`;
  return `${bookSearchLead(record)} Class ${classNumber(record)} ${subject}`;
}

function subjectSearchMetadata(record) {
  const board = boardSearchName(record);
  const grade = classNumber(record);
  const subject = subjectName(record);
  const books = integer(record.book_count);
  const chapters = integer(record.chapter_count);
  const questions = integer(record.question_count);
  const socialTitle = `${board} Class ${grade} ${subject} Solutions and Question Bank`;
  const description = `Explore ${board} Class ${grade} ${subject} solutions and question bank across ${countLabel(books)} ${books === 1 ? "textbook" : "textbooks"}, ${countLabel(chapters)} chapters and ${countLabel(questions)} textbook-order answers.`;
  return { socialTitle, documentTitle: `${socialTitle} | StudyWudy`, description };
}

function bookSearchMetadata(record) {
  const name = bookSearchName(record);
  const chapters = integer(record.chapter_count);
  const questions = integer(record.question_count);
  const socialTitle = `${name} Solutions – All ${countLabel(chapters)} Chapters`;
  const description = `Study ${name} solutions across all ${countLabel(chapters)} chapters, with ${countLabel(questions)} textbook-order answers, chapter navigation and worked exam practice.`;
  return { socialTitle, documentTitle: `${socialTitle} | StudyWudy`, description };
}

function chapterQuestions(chapter) {
  if (!chapter) return [];
  const direct = Array.isArray(chapter.questions) ? chapter.questions : [];
  const exerciseQuestions = (Array.isArray(chapter.exercises) ? chapter.exercises : [])
    .flatMap((exercise) => Array.isArray(exercise.questions) ? exercise.questions : []);
  return [...direct, ...exerciseQuestions];
}

function questionTypeCounts(questions) {
  const counts = new Map();
  for (const question of questions) {
    const type = cleanText(question.type);
    if (type) counts.set(type, (counts.get(type) || 0) + 1);
  }
  return counts;
}

function dominantNumericalTopic(questions) {
  const numericals = questions.filter((question) => question.type === "numerical");
  const scores = new Map();
  for (const question of numericals) {
    const text = cleanText(question.prompt_text || question.prompt);
    for (const topic of NUMERICAL_TOPICS) {
      if (topic.pattern.test(text)) scores.set(topic.label, (scores.get(topic.label) || 0) + 1);
    }
  }
  return [...scores.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || "";
}

function chapterTypePhrases(questions) {
  const counts = questionTypeCounts(questions);
  const phrases = [];
  if ((counts.get("mcq_single") || 0) + (counts.get("mcq_multi") || 0)) phrases.push("MCQs");
  if (["brief", "one_sentence", "one_word", "give_reason", "define", "name_list"]
    .some((type) => counts.get(type))) phrases.push("brief answers");
  if ((counts.get("derivation") || 0) || questions.some((question) => /\bderive\b/iu.test(cleanText(question.prompt_text || question.prompt)))) {
    phrases.push("derivations");
  }
  if (counts.get("numerical")) {
    const topic = dominantNumericalTopic(questions);
    phrases.push(`${topic ? `${topic} ` : ""}numericals`);
  }
  if (counts.get("diagram")) phrases.push("diagram questions");
  return phrases.slice(0, 3);
}

function questionBookPages(questions) {
  const pages = new Set();
  for (const question of questions) {
    const value = question.bookPage ?? question.book_page;
    for (const match of String(value ?? "").matchAll(/\d+/gu)) pages.add(Number(match[0]));
  }
  return [...pages].filter(Number.isFinite).sort((left, right) => left - right);
}

function pagePhrase(questions) {
  const pages = questionBookPages(questions);
  if (!pages.length) return "";
  if (pages.length === 1) return ` on page ${pages[0]}`;
  return ` on pages ${pages[0]}–${pages.at(-1)}`;
}

function chapterSearchMetadata(record, suppliedQuestions = null) {
  const board = boardSearchName(record);
  const grade = classNumber(record);
  const subject = subjectName(record);
  const chapterNumber = integer(record.chapter_number || record.chapterNumber || record.chapter?.number);
  const chapterTitle = cleanText(record.chapter_title || record.chapterTitle || record.chapter?.title);
  const questions = suppliedQuestions || chapterQuestions(record.chapter);
  const phrases = chapterTypePhrases(questions);
  const textbook = cleanText(record.book_title || record.textbook || "the mapped textbook");
  const socialTitle = `${board} Class ${grade} ${subject} Chapter ${chapterNumber} ${chapterTitle} Solutions`;
  const includes = phrases.length
    ? `including ${phrases.join(", ")} and step-by-step textbook answers from ${textbook}`
    : `including ${countLabel(questions.length || record.question_count)} step-by-step textbook answers from ${textbook}`;
  const description = `Complete ${board} Class ${grade} ${subject} Chapter ${chapterNumber} ${chapterTitle} solutions, ${includes}${pagePhrase(questions)}.`;
  return { socialTitle, documentTitle: `${socialTitle} | StudyWudy`, description };
}

export {
  BOARD_SEARCH_NAMES,
  boardSearchName,
  bookSearchLead,
  bookSearchMetadata,
  bookSearchName,
  classNumber,
  chapterQuestions,
  chapterSearchMetadata,
  chapterTypePhrases,
  cleanText,
  subjectName,
  subjectSearchMetadata,
  titleWithoutGrade,
};
