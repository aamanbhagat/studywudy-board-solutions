const POLICY_VERSION = "multilingual-text-v1";

const CYRILLIC_CONFUSABLES = Object.freeze({
  "а": "a", "А": "A", "е": "e", "Е": "E", "о": "o", "О": "O",
  "р": "p", "Р": "P", "с": "c", "С": "C", "х": "x", "Х": "X",
  "у": "y", "У": "Y", "к": "k", "К": "K", "м": "m", "М": "M",
  "т": "t", "Т": "T", "в": "b", "В": "B", "н": "h", "Н": "H",
  "і": "i", "І": "I", "ј": "j", "Ј": "J",
});

const GREEK_CONFUSABLES = Object.freeze({
  "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I",
  "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T",
  "Υ": "Y", "Χ": "X", "α": "a", "ε": "e", "ι": "i", "ο": "o",
  "ρ": "p", "υ": "y", "χ": "x",
});

const CONFUSABLES = Object.freeze({ ...CYRILLIC_CONFUSABLES, ...GREEK_CONFUSABLES });

const STANDARD_HINDI_BOOK_ID = "cbse::class-10::science::ncert-vigyaan-hindi-class-10";
const EXEMPLAR_HINDI_BOOK_ID = "cbse::class-10::science::ncert-exemplar-vigyan-exemplar-hindi-class-10";
const FRANK_MATHEMATICS_BOOK_ID = "cisce::class-10::mathematics::frank-mathematics-part-2-class-10";
const MAHARASHTRA_PHYSICS_BOOK_ID = "maharashtra-board::class-12::physics::balbharati-physics-standard-12";
const MAHARASHTRA_CLASS_8_MATHEMATICS_BOOK_ID = "maharashtra-board::class-8::mathematics::balbharati-mathematics-standard-8";
const MAHARASHTRA_CLASS_8_INTEGRATED_MATHEMATICS_BOOK_ID = "maharashtra-board::class-8::mathematics::balbharati-mathematics-integrated-standard-8";
const NCERT_CLASS_10_MATHEMATICS_EXEMPLAR_BOOK_ID = "cbse::class-10::mathematics::ncert-exemplar-mathematics-exemplar-class-10";
const HC_VERMA_PHYSICS_BOOK_ID = "cbse::class-12::physics::hc-verma-concepts-of-physics-volume-1-and-2-class-12";
const NCERT_CLASS_12_PHYSICS_EXEMPLAR_BOOK_ID = "cbse::class-12::physics::ncert-exemplar-physics-exemplar-class-12";

const REVIEWED_LOCALIZED_BOOK_TITLES = Object.freeze({
  [STANDARD_HINDI_BOOK_ID]: "एनसीईआरटी विज्ञान — कक्षा 10",
  [EXEMPLAR_HINDI_BOOK_ID]: "एनसीईआरटी विज्ञान प्रश्न प्रदर्शिका — कक्षा 10",
});

const STANDARD_HINDI_CHAPTER_TITLES = Object.freeze({
  "chapter-1": "रासायनिक अभिक्रियाएँ एवं समीकरण",
  "chapter-2": "अम्ल, क्षारक एवं लवण",
  "chapter-3": "धातु एवं अधातु",
  "chapter-4": "कार्बन एवं उसके यौगिक",
  "chapter-5": "जैव प्रक्रम",
  "chapter-6": "नियंत्रण एवं समन्वय",
  "chapter-7": "जीव जनन कैसे करते हैं?",
  "chapter-8": "आनुवंशिकता",
  "chapter-9": "प्रकाश — परावर्तन तथा अपवर्तन",
  "chapter-10": "मानव नेत्र तथा रंगबिरंगा संसार",
  "chapter-11": "विद्युत",
  "chapter-12": "विद्युत धारा के चुंबकीय प्रभाव",
  "chapter-13": "हमारा पर्यावरण",
});

const EXEMPLAR_HINDI_CHAPTER_TITLES = Object.freeze({
  ...STANDARD_HINDI_CHAPTER_TITLES,
  "chapter-5": "तत्वों का आवर्त वर्गीकरण",
  "chapter-6": "जैव प्रक्रम",
  "chapter-7": "नियंत्रण एवं समन्वय",
  "chapter-8": "जीव जनन कैसे करते हैं?",
  "chapter-9": "आनुवंशिकता एवं जैव विकास",
  "chapter-10": "प्रकाश — परावर्तन तथा अपवर्तन",
  "chapter-11": "मानव नेत्र तथा रंगबिरंगा संसार",
  "chapter-12": "विद्युत",
  "chapter-13": "विद्युत धारा के चुंबकीय प्रभाव",
  "chapter-14": "ऊर्जा के स्रोत",
  "chapter-15": "हमारा पर्यावरण",
  "chapter-16": "प्राकृतिक संसाधनों का प्रबंधन",
});

const REVIEWED_CHAPTER_TITLES = Object.freeze({
  [STANDARD_HINDI_BOOK_ID]: STANDARD_HINDI_CHAPTER_TITLES,
  [EXEMPLAR_HINDI_BOOK_ID]: EXEMPLAR_HINDI_CHAPTER_TITLES,
  [FRANK_MATHEMATICS_BOOK_ID]: Object.freeze({ "goods-and-services-ta": "Goods and Services Tax" }),
  [NCERT_CLASS_10_MATHEMATICS_EXEMPLAR_BOOK_ID]: Object.freeze({ "quadatric-euation": "Quadratic Equations" }),
});

const SOURCE_TITLE_REPAIRS = Object.freeze({
  [STANDARD_HINDI_BOOK_ID]: Object.freeze({
    "रसयनक अभकरयए एव समकरण": STANDARD_HINDI_CHAPTER_TITLES["chapter-1"],
    "अमल कषरक एव लवण": STANDARD_HINDI_CHAPTER_TITLES["chapter-2"],
    "धत एव अधत": STANDARD_HINDI_CHAPTER_TITLES["chapter-3"],
    "करबन एव उसक यगक": STANDARD_HINDI_CHAPTER_TITLES["chapter-4"],
    "जव परकरम": STANDARD_HINDI_CHAPTER_TITLES["chapter-5"],
    "नयतरण एव समनवय": STANDARD_HINDI_CHAPTER_TITLES["chapter-6"],
    "जव जनन कस करत ह": STANDARD_HINDI_CHAPTER_TITLES["chapter-7"],
    "अनवशकत": STANDARD_HINDI_CHAPTER_TITLES["chapter-8"],
    "परकश परवरतन एव अपवरतन": STANDARD_HINDI_CHAPTER_TITLES["chapter-9"],
    "मनव नतर एव रगबरग ससर": STANDARD_HINDI_CHAPTER_TITLES["chapter-10"],
    "वदयत": STANDARD_HINDI_CHAPTER_TITLES["chapter-11"],
    "वदयत धर क चबकय परभव": STANDARD_HINDI_CHAPTER_TITLES["chapter-12"],
    "हमर परयवरण": STANDARD_HINDI_CHAPTER_TITLES["chapter-13"],
  }),
  [EXEMPLAR_HINDI_BOOK_ID]: Object.freeze({
    "रसयनक अभकरयए एव समकरण": EXEMPLAR_HINDI_CHAPTER_TITLES["chapter-1"],
    "अमल कषरक एव लवण": EXEMPLAR_HINDI_CHAPTER_TITLES["chapter-2"],
    "धत एव अधत": EXEMPLAR_HINDI_CHAPTER_TITLES["chapter-3"],
    "करबन एव उसक यगक": EXEMPLAR_HINDI_CHAPTER_TITLES["chapter-4"],
    "ततव क आरवत वरगकरण": EXEMPLAR_HINDI_CHAPTER_TITLES["chapter-5"],
    "जव परकरम": EXEMPLAR_HINDI_CHAPTER_TITLES["chapter-6"],
    "नयतरण और समनवय": EXEMPLAR_HINDI_CHAPTER_TITLES["chapter-7"],
    "जव जनन कस करत ह": EXEMPLAR_HINDI_CHAPTER_TITLES["chapter-8"],
    "आनवशकत एव जव वकस": EXEMPLAR_HINDI_CHAPTER_TITLES["chapter-9"],
    "परकश परवरतन तथ अपरवरतन": EXEMPLAR_HINDI_CHAPTER_TITLES["chapter-10"],
    "मनव नतर तथ रगबरग ससर": EXEMPLAR_HINDI_CHAPTER_TITLES["chapter-11"],
    "वददत": EXEMPLAR_HINDI_CHAPTER_TITLES["chapter-12"],
    "वददत धर क चबकय परभव": EXEMPLAR_HINDI_CHAPTER_TITLES["chapter-13"],
    "ऊरज क सतरत": EXEMPLAR_HINDI_CHAPTER_TITLES["chapter-14"],
    "हमर परयवरण": EXEMPLAR_HINDI_CHAPTER_TITLES["chapter-15"],
    "परकतक ससधन क परबधन": EXEMPLAR_HINDI_CHAPTER_TITLES["chapter-16"],
  }),
  [FRANK_MATHEMATICS_BOOK_ID]: Object.freeze({ "Goods and Services Taх": "Goods and Services Tax" }),
  [NCERT_CLASS_10_MATHEMATICS_EXEMPLAR_BOOK_ID]: Object.freeze({
    "Quadatric Euation": "Quadratic Equations",
    "Quadatric": "Quadratic",
    "quadatric euation": "quadratic equations",
  }),
  [HC_VERMA_PHYSICS_BOOK_ID]: Object.freeze({
    "Gausss Law": "Gauss’s Law",
  }),
});

const VERIFIED_SOURCE_REPAIRS = Object.freeze({
  [MAHARASHTRA_PHYSICS_BOOK_ID]: Object.freeze({
    "plate separation I mm": "plate separation 1 mm",
  }),
  [MAHARASHTRA_CLASS_8_MATHEMATICS_BOOK_ID]: Object.freeze({
    "Sides of a triangle are cm 45 cm, 39 cm and 42 cm, find its area.": "The sides of a triangle are 45 cm, 39 cm and 42 cm. Find its area.",
  }),
  [MAHARASHTRA_CLASS_8_INTEGRATED_MATHEMATICS_BOOK_ID]: Object.freeze({
    "Sides of a triangle are cm 45 cm, 39 cm and 42 cm, find its area.": "The sides of a triangle are 45 cm, 39 cm and 42 cm. Find its area.",
  }),
  [STANDARD_HINDI_BOOK_ID]: Object.freeze({
    "संlद्रता": "सांद्रता",
  }),
  [EXEMPLAR_HINDI_BOOK_ID]: Object.freeze({
    "देता हैजबकि": "देता है जबकि",
    "Bगरम": "B गरम",
    "देता हैइनको": "देता है। इनको",
    "संबंधित हैI": "संबंधित है।",
  }),
  [HC_VERMA_PHYSICS_BOOK_ID]: Object.freeze({
    "uniform charge distribution of density ρρ": "uniform charge distribution of density ρ",
    "number of charge carries be nand the average": "number of charge carriers be n and the average",
    "charge carries": "charge carriers",
  }),
  [NCERT_CLASS_12_PHYSICS_EXEMPLAR_BOOK_ID]: Object.freeze({
    "the line joining the two fixed charged": "the line joining the two fixed charges",
    "elecric field": "electric field",
  }),
});

const ENGLISH_STANDARD_BOOK = "/cbse/class-10/science/ncert-science-class-10";
const HINDI_STANDARD_BOOK = "/cbse/class-10/science/ncert-vigyaan-hindi-class-10";
const ENGLISH_EXEMPLAR_BOOK = "/cbse/class-10/science/ncert-exemplar-science-exemplar-class-10";
const HINDI_EXEMPLAR_BOOK = "/cbse/class-10/science/ncert-exemplar-vigyan-exemplar-hindi-class-10";

const STANDARD_ENGLISH_CHAPTER_SLUGS = Object.freeze([
  "chemical-reactions-and-equations", "acids-bases-and-salts", "metals-and-non-metals",
  "carbon-and-its-compounds", "life-processes", "control-and-coordination",
  "how-do-organisms-reproduce", "heredity", "light-reflection-and-refraction",
  "the-human-eye-and-the-colourful-world", "electricity",
  "magnetic-effects-of-electric-current", "our-environment",
]);

const EXEMPLAR_ENGLISH_CHAPTER_SLUGS = Object.freeze([
  "chemical-reactions-and-equations", "acids-bases-and-salts", "metals-and-non-metals",
  "carbon-and-its-compounds", "periodic-classification-of-elements", "life-processes",
  "control-and-coordination", "how-do-organisms-reproduce", "heredity-and-evolution",
  "light-reflection-and-refraction", "the-human-eye-and-the-colourful-world", "electricity",
  "magnetic-effects-of-electric-current", "sources-of-energy", "our-environment",
  "management-of-natural-resources",
]);

function buildEquivalentPaths() {
  const pairs = [
    [ENGLISH_STANDARD_BOOK, HINDI_STANDARD_BOOK],
    [ENGLISH_EXEMPLAR_BOOK, HINDI_EXEMPLAR_BOOK],
  ];
  STANDARD_ENGLISH_CHAPTER_SLUGS.forEach((slug, index) => {
    pairs.push([`${ENGLISH_STANDARD_BOOK}/${slug}`, `${HINDI_STANDARD_BOOK}/chapter-${index + 1}`]);
  });
  EXEMPLAR_ENGLISH_CHAPTER_SLUGS.forEach((slug, index) => {
    pairs.push([`${ENGLISH_EXEMPLAR_BOOK}/${slug}`, `${HINDI_EXEMPLAR_BOOK}/chapter-${index + 1}`]);
  });
  const output = new Map();
  for (const [english, hindi] of pairs) {
    const alternates = Object.freeze({ en: english, hi: hindi });
    output.set(english, alternates);
    output.set(hindi, alternates);
  }
  return output;
}

const EQUIVALENT_PATHS = buildEquivalentPaths();

function normalizePathname(pathname) {
  const value = `/${String(pathname || "").replace(/^\/+|\/+$/gu, "")}`;
  return value === "/" ? value : value.replace(/\/+$/gu, "");
}

function bookIdFromPathname(pathname) {
  const parts = normalizePathname(pathname).split("/").filter(Boolean);
  if (parts.length < 4 || !/^class-\d+$/u.test(parts[1])) return null;
  return `${parts[0]}::${parts[1]}::${parts[2]}::${parts[3]}`;
}

function languageForBookId(bookId) {
  const parts = String(bookId || "").split("::");
  if (parts.length !== 4) return null;
  const subject = parts[2].toLowerCase();
  const slug = parts[3].toLowerCase();
  if (subject === "hindi" || /(?:^|-)hindi(?:-|$)/u.test(slug)) return "hi";
  if (subject === "tamil" || /(?:^|-)tamil(?:-|$)/u.test(slug)) return "ta";
  return null;
}

function isReviewedLocalizedBook(bookId) {
  return Object.hasOwn(REVIEWED_LOCALIZED_BOOK_TITLES, String(bookId || ""));
}

function isBookQuarantined(bookId) {
  return Boolean(languageForBookId(bookId) && !isReviewedLocalizedBook(bookId));
}

function reviewedBookTitle(bookId, fallback = "") {
  return REVIEWED_LOCALIZED_BOOK_TITLES[bookId] || fallback;
}

function reviewedChapterTitle(bookId, chapterSlug, fallback = "") {
  return REVIEWED_CHAPTER_TITLES[bookId]?.[chapterSlug] || fallback;
}

function repairKnownText(bookId, value) {
  let output = String(value ?? "").normalize("NFC")
    .replaceAll("\u001c(\u001c", "$")
    .replaceAll("\u001c)\u001c", "$")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, " ");
  const repairs = [
    ...Object.entries(SOURCE_TITLE_REPAIRS[bookId] || {}),
    ...Object.entries(VERIFIED_SOURCE_REPAIRS[bookId] || {}),
  ]
    .sort(([left], [right]) => right.length - left.length);
  for (const [source, replacement] of repairs) {
    output = output.replaceAll(source, replacement);
  }
  return repairConfusableTokens(output).value;
}

function repairKnownTextEverywhere(value) {
  let output = String(value ?? "").normalize("NFC");
  const bookIds = new Set([...Object.keys(SOURCE_TITLE_REPAIRS), ...Object.keys(VERIFIED_SOURCE_REPAIRS)]);
  for (const bookId of bookIds) output = repairKnownText(bookId, output);
  output = output
    .replaceAll("NCERT Vigyaan Hindi Class 10", REVIEWED_LOCALIZED_BOOK_TITLES[STANDARD_HINDI_BOOK_ID])
    .replaceAll("NCERT Exemplar Vigyan Exemplar Hindi Class 10", REVIEWED_LOCALIZED_BOOK_TITLES[EXEMPLAR_HINDI_BOOK_ID])
    .replaceAll("Since C = εA/d and V = Q/C", "Since C = ε₀A/d and V = Q/C")
    .replaceAll("Since C = eA/d and V = Q/C", "Since C = ε₀A/d and V = Q/C");
  return repairConfusableTokens(output).value;
}

function applyKnownPayloadRepairs(bookId, payload) {
  if (!payload || typeof payload !== "object") return payload;
  const repairNestedStrings = (value) => {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        value[index] = typeof value[index] === "string" ? repairKnownText(bookId, value[index]) : repairNestedStrings(value[index]);
      }
      return value;
    }
    if (!value || typeof value !== "object") return value;
    for (const [key, entry] of Object.entries(value)) {
      value[key] = typeof entry === "string" ? repairKnownText(bookId, entry) : repairNestedStrings(entry);
    }
    return value;
  };
  repairNestedStrings(payload);
  const bookTitle = REVIEWED_LOCALIZED_BOOK_TITLES[bookId];
  if (bookTitle && payload.catalog?.book) payload.catalog.book.title = bookTitle;
  for (const chapter of payload.chapters || []) {
    if (!chapter || typeof chapter !== "object") continue;
    chapter.title = reviewedChapterTitle(bookId, chapter.slug, repairKnownText(bookId, chapter.title));
    if (typeof chapter.summary === "string") chapter.summary = repairKnownText(bookId, chapter.summary);
    if (Array.isArray(chapter.keyConcepts)) {
      chapter.keyConcepts = chapter.keyConcepts.map((value) => typeof value === "string" ? repairKnownText(bookId, value) : value);
    }
  }
  return payload;
}

function repairConfusableTokens(value) {
  const repairs = [];
  const repaired = String(value).replace(/[\p{L}\p{M}]+/gu, (token, offset, input) => {
    const hasLatin = /\p{Script=Latin}/u.test(token);
    const suspicious = [...token].filter((character) => Object.hasOwn(CONFUSABLES, character));
    if (!hasLatin || suspicious.length === 0) return token;
    const nextCharacter = input[offset + token.length] || "";
    const formulaContext = input.slice(Math.max(0, offset - 3), offset + token.length + 4);
    const hasScientificGreekSymbol = suspicious.some((character) => /[αεμρ]/u.test(character))
      && (/[^\s][\d₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹_^]/u.test(`${token}${nextCharacter}`)
        || /[=+−\-*/^_()[\]]/u.test(formulaContext));
    if (hasScientificGreekSymbol) return token;
    const hasUnmappedCyrillicOrGreek = [...token].some((character) =>
      /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(character) && !Object.hasOwn(CONFUSABLES, character)
    );
    if (hasUnmappedCyrillicOrGreek) return token;
    const next = [...token].map((character) => CONFUSABLES[character] || character).join("");
    if (next !== token) repairs.push({ code: "mixed-script-confusable", source: token, replacement: next });
    return next;
  });
  return { value: repaired, repairs };
}

function scriptsInToken(token) {
  const scripts = [];
  if (/\p{Script=Latin}/u.test(token)) scripts.push("Latin");
  if (/\p{Script=Cyrillic}/u.test(token)) scripts.push("Cyrillic");
  if (/\p{Script=Greek}/u.test(token)) scripts.push("Greek");
  if (/\p{Script=Devanagari}/u.test(token)) scripts.push("Devanagari");
  if (/\p{Script=Tamil}/u.test(token)) scripts.push("Tamil");
  return scripts;
}

function hasBrokenTamilCombiningSequence(value) {
  const characters = [...String(value)];
  const dependent = /[\u0bbe-\u0bcc\u0bcd\u0bd7]/u;
  const base = /[\u0b95-\u0bb9\u0b9c\u0b9e\u0ba9\u0bb6]/u;
  const mark = /[\u0bbe-\u0bcd\u0bd7]/u;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (!dependent.test(character)) continue;
    const previous = characters[index - 1] || "";
    if (!base.test(previous) && !mark.test(previous)) return true;
    if (mark.test(previous) && character !== "ௗ") return true;
  }
  return false;
}

function validateImportedText(value, options = {}) {
  const expectedLanguage = String(options.expectedLanguage || "").toLowerCase();
  const field = String(options.field || "text");
  const kind = String(options.kind || "prose");
  const source = String(value ?? "");
  const repairs = [];
  let normalized = source;
  const nfc = normalized.normalize("NFC");
  if (nfc !== normalized) {
    repairs.push({ code: "unicode-nfc", source: normalized, replacement: nfc });
    normalized = nfc;
  }
  const confusableRepair = repairConfusableTokens(normalized);
  normalized = confusableRepair.value;
  repairs.push(...confusableRepair.repairs);

  const issues = [];
  const add = (code, detail) => issues.push({ code, field, detail });
  if (/\uFFFD|[\u0080-\u009f]|(?:Ã.|Â.|â€|à¤|à®)/u.test(normalized)) {
    add("ocr-or-encoding-corruption", "Replacement, mojibake, or invalid control characters remain.");
  }
  for (const token of normalized.match(/[\p{L}\p{M}]+/gu) || []) {
    const scripts = scriptsInToken(token);
    if (scripts.length > 1) add("mixed-script-token", `${token} mixes ${scripts.join(" and ")}.`);
  }

  const devanagari = normalized.match(/\p{Script=Devanagari}/gu) || [];
  const devanagariDependentMarks = normalized.match(/[\u0900-\u0903\u093a-\u094d\u094e-\u0957\u0962-\u0963]/gu) || [];
  if (expectedLanguage === "hi" && devanagari.length >= 10
    && devanagariDependentMarks.length / devanagari.length < 0.06) {
    add("missing-devanagari-vowel-marks", "The Devanagari text is implausibly consonant-heavy for a Hindi title.");
  }
  if (expectedLanguage === "hi" && field === "principal" && devanagari.length === 0
    && (normalized.match(/\p{Script=Latin}/gu) || []).length >= 4) {
    add("transliteration-instead-of-native-text", "A Hindi principal title must use Devanagari rather than Latin transliteration.");
  }

  const tamil = normalized.match(/\p{Script=Tamil}/gu) || [];
  if (expectedLanguage === "ta" && field === "principal" && tamil.length === 0
    && (normalized.match(/\p{Script=Latin}/gu) || []).length >= 4) {
    add("transliteration-instead-of-native-text", "A Tamil principal title must use Tamil script rather than Latin transliteration.");
  }
  if (tamil.length > 0 && hasBrokenTamilCombiningSequence(normalized)) {
    add("broken-tamil-combining-sequence", "A Tamil dependent sign is detached or ordered incorrectly.");
  }

  if (kind === "formula" || kind === "scientific") {
    if (/\d\s*[xX*]\s*\d/u.test(normalized)) {
      add("incorrect-multiplication-symbol", "Use × for numeric multiplication and reserve x for variables.");
    }
    if (/(?:\^|\u00d7\s*10)\s*-\s*\d/u.test(normalized)) {
      add("ascii-hyphen-as-minus", "Use the mathematical minus sign − in an exponent.");
    }
    if (/\b\d\s+\d(?:\s*[\u2212-]\s*\d+)?\b/u.test(normalized)) {
      add("repeated-whitespace-in-scientific-notation", "Numerals in scientific notation are separated by whitespace.");
    }
    if (/\d\s{2,}(?:mm|cm|m|km|mg|g|kg|ms|s|A|V|W|J|N|Pa|Hz)\b/u.test(normalized)) {
      add("detached-unit", "A value and its unit contain repeated whitespace.");
    }
  }

  return Object.freeze({
    input: source,
    value: normalized,
    changed: normalized !== source,
    complete: issues.length === 0,
    repairs: Object.freeze(repairs),
    issues: Object.freeze(issues),
  });
}

function equivalenceAlternates(pathname) {
  return EQUIVALENT_PATHS.get(normalizePathname(pathname)) || null;
}

function localizationForPathname(pathname) {
  const normalized = normalizePathname(pathname);
  const bookId = bookIdFromPathname(normalized);
  if (!bookId) return null;
  const language = languageForBookId(bookId);
  const parts = normalized.split("/").filter(Boolean);
  const chapterSlug = parts.length >= 5 ? parts[4] : null;
  const isQuestion = parts[5] === "questions" && Boolean(parts[6]);
  return Object.freeze({
    pathname: normalized,
    bookId,
    language,
    chapterSlug,
    isQuestion,
    quarantined: isBookQuarantined(bookId),
    bookTitle: reviewedBookTitle(bookId, ""),
    chapterTitle: chapterSlug ? reviewedChapterTitle(bookId, chapterSlug, "") : "",
    alternates: equivalenceAlternates(normalized),
  });
}

export {
  EXEMPLAR_HINDI_BOOK_ID,
  FRANK_MATHEMATICS_BOOK_ID,
  MAHARASHTRA_PHYSICS_BOOK_ID,
  MAHARASHTRA_CLASS_8_MATHEMATICS_BOOK_ID,
  MAHARASHTRA_CLASS_8_INTEGRATED_MATHEMATICS_BOOK_ID,
  NCERT_CLASS_10_MATHEMATICS_EXEMPLAR_BOOK_ID,
  POLICY_VERSION,
  REVIEWED_CHAPTER_TITLES,
  REVIEWED_LOCALIZED_BOOK_TITLES,
  SOURCE_TITLE_REPAIRS,
  VERIFIED_SOURCE_REPAIRS,
  STANDARD_HINDI_BOOK_ID,
  applyKnownPayloadRepairs,
  bookIdFromPathname,
  equivalenceAlternates,
  isBookQuarantined,
  isReviewedLocalizedBook,
  languageForBookId,
  localizationForPathname,
  repairKnownText,
  repairKnownTextEverywhere,
  reviewedBookTitle,
  reviewedChapterTitle,
  validateImportedText,
};
