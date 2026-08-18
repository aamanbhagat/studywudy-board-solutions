const stream = (label, meta, subjects) => ({ label, meta, subjects });

export const STREAM_TAXONOMY = {
  "maharashtra-board": {
    "class-11": {
      science: stream("Science", "Physics · Chemistry · Biology · Mathematics", [
        "physics", "chemistry", "biology", "mathematics", "economics", "psychology", "sociology",
        "information-technology", "english", "hindi", "marathi",
      ]),
      commerce: stream("Commerce", "Accountancy · Commerce · Economics · Mathematics", [
        "accountancy", "commerce", "economics", "information-technology",
        "mathematics", "english", "hindi", "marathi",
      ]),
      arts: stream("Arts & Humanities", "History · Geography · Psychology · Sociology", [
        "accountancy", "history", "geography", "political-science", "psychology", "sociology",
        "economics", "mathematics", "information-technology", "english", "hindi", "marathi",
      ]),
    },
    "class-12": {
      science: stream("Science", "Physics · Chemistry · Biology · Mathematics", [
        "physics", "chemistry", "biology", "mathematics", "economics", "psychology", "sociology",
        "information-technology", "english", "hindi", "marathi",
      ]),
      commerce: stream("Commerce", "Accountancy · Commerce · Economics · Mathematics", [
        "accountancy", "book-keeping-and-accountancy", "commerce", "economics",
        "information-technology-commerce", "information-technology", "mathematics-commerce",
        "mathematics", "english", "hindi", "marathi",
      ]),
      arts: stream("Arts & Humanities", "History · Geography · Psychology · Sociology", [
        "accountancy", "book-keeping-and-accountancy", "history", "geography", "political-science", "psychology", "sociology",
        "economics", "mathematics", "information-technology", "english", "hindi", "marathi",
      ]),
    },
  },
  cbse: {
    "class-11": {
      science: stream("Science", "Physics · Chemistry · Biology · Mathematics", [
        "physics", "chemistry", "mathematics", "biology", "computer-science", "english", "hindi",
      ]),
      commerce: stream("Commerce", "Accountancy · Business Studies · Economics", [
        "accountancy", "business-studies", "economics", "mathematics", "statistics", "english", "hindi",
      ]),
      humanities: stream("Arts & Humanities", "History · Geography · Political Science · Psychology", [
        "history", "political-science", "geography", "psychology", "sociology",
        "economics", "english", "hindi", "sanskrit",
      ]),
    },
    "class-12": {
      science: stream("Science", "Physics · Chemistry · Biology · Mathematics", [
        "physics", "chemistry", "mathematics", "biology", "computer-science", "english", "hindi",
      ]),
      commerce: stream("Commerce", "Accountancy · Business Studies · Economics", [
        "accountancy", "business-studies", "economics", "mathematics", "entrepreneurship", "english", "hindi",
      ]),
      humanities: stream("Arts & Humanities", "History · Geography · Political Science · Psychology", [
        "history", "political-science", "geography", "psychology", "sociology",
        "economics", "english", "hindi", "sanskrit",
      ]),
    },
  },
  cisce: {
    "class-12": {
      science: stream("Science", "Physics and shared electives", ["physics", "physical-education"]),
      commerce: stream("Commerce", "Commerce · Business Studies · Economics", [
        "commerce", "business-studies", "economics", "physical-education",
      ]),
      humanities: stream("Arts & Humanities", "History · Geography · Psychology · Sociology", [
        "history", "political-science", "geography", "psychology", "sociology", "economics", "physical-education",
      ]),
    },
  },
  "tamil-nadu-board": {
    "class-11": {
      science: stream("Science", "Physics · Chemistry · Biology · Mathematics", [
        "physics", "chemistry", "biology", "mathematics", "computer-science", "english",
      ]),
      commerce: stream("Commerce", "Accountancy · Commerce · Economics · Business Mathematics", [
        "accountancy", "commerce", "economics", "mathematics", "english",
      ]),
      arts: stream("Arts & Humanities", "Economics · English · Mathematics", [
        "economics", "english", "mathematics",
      ]),
    },
    "class-12": {
      science: stream("Science", "Physics · Chemistry · Biology · Mathematics", [
        "physics", "chemistry", "biology", "mathematics", "computer-science", "english",
      ]),
      commerce: stream("Commerce", "Accountancy · Commerce · Economics · Business Mathematics", [
        "accountancy", "commerce", "economics", "mathematics", "english",
      ]),
      arts: stream("Arts & Humanities", "Economics · English · Mathematics", [
        "economics", "english", "mathematics",
      ]),
    },
  },
};

export function streamsFor(board, grade) {
  return Object.entries(STREAM_TAXONOMY[board]?.[grade] || {}).map(([id, value]) => ({ id, ...value }));
}

export function subjectsFor(board, grade, streamId) {
  return STREAM_TAXONOMY[board]?.[grade]?.[streamId]?.subjects || [];
}

export function streamLabel(board, grade, streamId) {
  return STREAM_TAXONOMY[board]?.[grade]?.[streamId]?.label || streamId;
}

export function bookMatchesStream({ board, grade, subject, streamId, title }) {
  const value = String(title || "").toLowerCase();

  if (board === "maharashtra-board" && subject === "information-technology") {
    const markers = ["science", "commerce", "arts"];
    const marker = markers.find((candidate) => value.includes(` ${candidate} `));
    if (!marker) return true;
    if (streamId === "humanities") return marker === "arts";
    return marker === streamId;
  }

  if (board === "maharashtra-board" && subject === "mathematics") {
    if (value.includes("commerce")) return streamId === "commerce";
    if (value.includes("arts and science")) return streamId === "science" || streamId === "arts" || streamId === "humanities";
    return streamId !== "commerce";
  }

  if (board === "tamil-nadu-board" && subject === "mathematics") {
    if (value.includes("business mathematics")) return streamId === "commerce";
    return streamId === "science" || streamId === "arts" || streamId === "humanities";
  }

  if (board === "tamil-nadu-board" && subject === "computer-science") {
    if (value.includes("computer applications")) return streamId === "science" || streamId === "commerce";
    return streamId === "science";
  }

  // Most subjects use the same textbook in every stream in which they are
  // offered (languages, Economics, Psychology, Physical Education, and so on).
  return true;
}
