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

const DOCUMENT_TITLE_SUFFIX = " | StudyWudy";
const DOCUMENT_TITLE_LIMIT = 160;
// Google clips the SERP line by pixel width, somewhere around 55-60 characters.
// Hub titles may run past that — a chapter name is worth printing in full for
// the browser tab and the social card — but everything that tells two hub pages
// apart has to sit inside this budget, or the clip publishes duplicates.
const SERP_HUB_TITLE_BUDGET = 60;

// A clip that never ends mid-word and never ends on a dangling function word,
// which is how a truncated book title came back as "HC Verma Concepts of…".
const TRAILING_FUNCTION_WORD = /[\s,;:–—-]+(?:and|of|the|for|in|to|a|an|on|with|by|from)$/iu;

function clipWords(value, limit) {
  const characters = [...cleanText(value)];
  if (characters.length <= limit) return characters.join("");
  const clipped = characters.slice(0, limit - 1).join("");
  let wordSafe = clipped.replace(/\s+\S*$/u, "").trimEnd();
  while (TRAILING_FUNCTION_WORD.test(wordSafe)) wordSafe = wordSafe.replace(TRAILING_FUNCTION_WORD, "");
  return `${wordSafe || clipped.trimEnd()}…`;
}

function documentTitle(socialTitle) {
  const available = DOCUMENT_TITLE_LIMIT - [...DOCUMENT_TITLE_SUFFIX].length;
  const clipped = clipWords(socialTitle, available);
  return `${clipped}${DOCUMENT_TITLE_SUFFIX}`;
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

// Subject names run to 37 characters ("Mathematics and Statistics (Commerce)"),
// which alone would eat two thirds of the visible window. Every subject in the
// corpus longer than 16 characters has an entry here, so nothing reaches the
// clamp below and no title carries a subject truncated mid-word.
const SHORT_SUBJECT_NAMES = Object.freeze({
  "Mathematics": "Maths",
  "Mathematics And Statistics (Commerce)": "Maths-Stats Com",
  "Mathematics And Statistics (Arts And Science)": "Maths-Stats Sci",
  "Organisation Of Commerce And Management": "OCM",
  "Book-Keeping And Accountancy": "Book-Keeping",
  "Information Technology": "IT",
  "Information Technology (Commerce)": "IT (Commerce)",
  "Environmental Studies": "EVS",
  "Computer Science": "Comp Sci",
  "Political Science": "Pol Sci",
  "Social Science": "Social Sci",
  "Business Studies": "Business",
  "Physical Education": "PE",
  "General Studies": "Gen Studies",
});

function shortSubjectName(record) {
  const subject = subjectName(record);
  return SHORT_SUBJECT_NAMES[subject] || clipWords(subject, 16);
}

// bookSearchLead strips the grade and subject; these strip the boilerplate that
// survives it, so a book code spends its characters on the distinguishing words.
const BOOK_CODE_ABBREVIATIONS = Object.freeze([
  [/\bInformation Technology\b/giu, "IT"],
  [/\bMathematics and Statistics\b/giu, "Maths-Stats"],
  [/\bMathematics\b/giu, "Maths"],
  [/\bArts and Science\b/giu, "Arts-Science"],
  [/\bCompany Accounts and Analysis of Financial Statements\b/giu, "Company Accounts"],
  [/\bOrganisation of Commerce and Management\b/giu, "OCM"],
  [/\bUniversity Press\b/giu, "UP"],
  [/\bBrothers Prakashan\b/giu, "Bros"],
  [/\bStandard\b/giu, ""],
  [/\bTextbook\b/giu, ""],
  [/\bPrakashan\b/giu, ""],
  [/\bPublications?\b/giu, ""],
  [/\bPart\b/giu, "Pt"],
  [/\bVolume\b/giu, "Vol"],
]);

function bookCodeLead(record) {
  // The subject comes out here rather than via bookSearchLead because a compound
  // subject strands its conjunction mid-string. Deleting "Mathematics" from
  // "Balbharati Mathematics and Statistics 1 Arts and Science" left "Balbharati
  // and Statistics 1 Arts and Science" — which also stops the "Mathematics and
  // Statistics" abbreviation below from ever matching, since its first half is
  // already gone. That clamped to the contentless code "Balbharati and…" and put
  // 111 pages into a single 45-character SERP group. Swallowing the conjunction
  // along with the subject keeps the distinctive half of the compound instead.
  const escapedSubject = subjectName(record).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  let lead = titleWithoutGrade(record)
    .replace(new RegExp(`\\b${escapedSubject}\\b(?:\\s+(?:and|&)\\b)?`, "giu"), " ")
    .replace(/\s*[-–—:]\s*/gu, " ")
    .replace(/\s+/gu, " ")
    .trim() || bookSearchLead(record);
  for (const [pattern, replacement] of BOOK_CODE_ABBREVIATIONS) lead = lead.replace(pattern, replacement);
  // bookSearchLead removes the subject name verbatim, so a compound subject
  // strands its conjunction: "Mathematics and Statistics 1 Standard XII" comes
  // back as "and Statistics 1". Six Maharashtra books open on that conjunction,
  // which is 1,921 question titles starting with a lowercase word.
  lead = lead.replace(/^(?:and|of|the|for|in)\s+/iu, "");
  return cleanText(lead) || "Textbook";
}

// The shelf mark a hub title is built around. `record.book_code` comes from the
// phase-3 build manifest and is the shortest string unique within the book's
// class and subject — which is exactly the scope the rest of the title pins
// down. Records that arrive without one fall back to a plain clamp, which is
// not guaranteed unique; scripts/search-metadata-gate.mjs fails the release if
// any catalogue hub takes that path.
const BOOK_CODE_LIMIT = 18;

function hubBookCode(record) {
  return cleanText(record.book_code || record.bookCode) || clipWords(bookCodeLead(record), BOOK_CODE_LIMIT);
}

function bookSearchName(record) {
  const subject = subjectName(record);
  const withoutGrade = titleWithoutGrade(record);
  const significantSubjectWords = subject.toLocaleLowerCase("en-IN").match(/[\p{L}\p{N}]+/gu)
    ?.filter((word) => word.length > 2 && !["and", "the"].includes(word)) || [];
  const sourceWords = new Set(withoutGrade.toLocaleLowerCase("en-IN").match(/[\p{L}\p{N}]+/gu) || []);
  const alreadyNamesSubject = significantSubjectWords.length > 0
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
  // "Textbook Solutions" rather than a bare "Solutions": a subject that stocks a
  // single book whose code is the board name ("CBSE Class 12 Entrepreneurship")
  // would otherwise clip to the same visible title as that book's own hub.
  const socialTitle = `${board} Class ${grade} ${subject} Textbook Solutions`;
  const description = `Explore ${board} Class ${grade} ${subject} solutions and question bank across ${countLabel(books)} ${books === 1 ? "textbook" : "textbooks"}, ${countLabel(chapters)} chapters and ${countLabel(questions)} textbook-order answers.`;
  return { socialTitle, documentTitle: documentTitle(socialTitle), description };
}

function bookSearchMetadata(record) {
  const name = bookSearchName(record);
  const chapters = integer(record.chapter_count);
  const questions = integer(record.question_count);
  // bookSearchName runs to 134 characters, which pushed the chapter count — the
  // only varying part of the old title — past the clip on 476 of 477 books.
  const socialTitle = `${hubBookCode(record)} Class ${classNumber(record)} ${subjectName(record)} Solutions`;
  const description = `Study ${name} solutions across all ${countLabel(chapters)} chapters, with ${countLabel(questions)} textbook-order answers, chapter navigation and worked exam practice.`;
  return { socialTitle, documentTitle: documentTitle(socialTitle), description };
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
  // The same syllabus chapter often exists in NCERT, Exemplar and several
  // reference books, so the source textbook has to be in the title. Spelling it
  // out was the problem: "Balbharati Physics Class 12 Chapter 8: …" spent the
  // whole visible window on context shared by every chapter of the book, and
  // 1,367 chapter pages clipped to the same 60 characters. The compact prefix
  // below is byte-identical to the one this chapter's question pages carry.
  const socialTitle = `${hubBookCode(record)} Cl${grade} ${shortSubjectName(record)} Ch${chapterNumber}: ${chapterTitle} Solutions`;
  const includes = phrases.length
    ? `including ${phrases.join(", ")} and step-by-step textbook answers from ${textbook}`
    : `including ${countLabel(questions.length || record.question_count)} step-by-step textbook answers from ${textbook}`;
  const description = `Complete ${board} Class ${grade} ${subject} Chapter ${chapterNumber} ${chapterTitle} solutions, ${includes}${pagePhrase(questions)}.`;
  return { socialTitle, documentTitle: documentTitle(socialTitle), description };
}

export {
  BOARD_SEARCH_NAMES,
  SERP_HUB_TITLE_BUDGET,
  SHORT_SUBJECT_NAMES,
  boardSearchName,
  bookCodeLead,
  bookSearchLead,
  bookSearchMetadata,
  bookSearchName,
  classNumber,
  chapterQuestions,
  chapterSearchMetadata,
  chapterTypePhrases,
  cleanText,
  clipWords,
  documentTitle,
  hubBookCode,
  shortSubjectName,
  subjectName,
  subjectSearchMetadata,
  titleWithoutGrade,
};
