import {
  boardSearchName,
  classNumber,
  cleanText,
  subjectName,
  titleWithoutGrade,
} from "./search-metadata.mjs";

const CANONICAL_ORIGIN = "https://studywudy-board-solutions.amanbhagat17089.workers.dev";

function routeLabel(value) {
  return cleanText(value)
    .replaceAll("-", " ")
    .replace(/\b\w/gu, (character) => character.toLocaleUpperCase("en-IN"));
}

function routeSegment(value, field) {
  const segment = String(value || "").trim();
  if (!segment) return "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(segment)) {
    throw new Error(`Invalid ${field} breadcrumb route segment: ${segment}`);
  }
  return segment;
}

function academicBreadcrumbItems(record) {
  const boardSlug = routeSegment(record.board_slug || record.boardSlug || record.board, "board");
  if (!boardSlug) return Object.freeze([{ name: "Home", href: "/" }]);

  const grade = classNumber(record);
  const gradeSlug = routeSegment(
    record.grade_slug || record.gradeSlug || record.grade || (grade ? `class-${grade}` : ""),
    "class",
  );
  const subjectSlug = routeSegment(record.subject_slug || record.subjectSlug || record.subject, "subject");
  const bookSlug = routeSegment(
    record.book_slug || record.bookSlug || record.textbookSlug || record.book,
    "textbook",
  );
  const chapterSlug = routeSegment(
    record.chapter_slug || record.chapterSlug || record.chapter?.slug,
    "chapter",
  );
  const questionId = routeSegment(
    record.question_id || record.questionId || record.publicQuestionId || record.question,
    "question",
  );

  if (subjectSlug && !gradeSlug) throw new Error("Subject breadcrumb is missing its class route");
  if (bookSlug && !subjectSlug) throw new Error("Textbook breadcrumb is missing its subject route");
  if (chapterSlug && !bookSlug) throw new Error("Chapter breadcrumb is missing its textbook route");
  if (questionId && !chapterSlug) throw new Error("Question breadcrumb is missing its chapter route");

  const items = [{ name: "Home", href: "/" }];
  const boardPath = `/${boardSlug}`;
  items.push({ name: boardSearchName({ ...record, board_slug: boardSlug }), href: boardPath });

  if (gradeSlug) {
    items.push({
      name: `Class ${grade || gradeSlug.replace(/^class-/u, "")}`,
      href: `${boardPath}/${gradeSlug}`,
    });
  }
  if (subjectSlug) {
    items.push({
      name: subjectName({ ...record, subject_slug: subjectSlug }),
      href: `${boardPath}/${gradeSlug}/${subjectSlug}`,
    });
  }
  if (bookSlug) {
    const bookName = titleWithoutGrade(record) || routeLabel(bookSlug);
    items.push({
      name: bookName,
      href: `${boardPath}/${gradeSlug}/${subjectSlug}/${bookSlug}`,
    });
  }
  if (chapterSlug) {
    const chapterNumber = cleanText(record.chapter_number || record.chapterNumber || record.chapter?.number);
    const chapterTitle = cleanText(record.chapter_title || record.chapterTitle || record.chapter?.title)
      || routeLabel(chapterSlug);
    items.push({
      name: chapterNumber ? `Chapter ${chapterNumber} ${chapterTitle}` : chapterTitle,
      href: `${boardPath}/${gradeSlug}/${subjectSlug}/${bookSlug}/${chapterSlug}`,
    });
  }
  if (questionId) {
    const displayLabel = cleanText(record.display_label || record.displayLabel) || questionId;
    items.push({
      name: `Question ${displayLabel}`,
      href: `${boardPath}/${gradeSlug}/${subjectSlug}/${bookSlug}/${chapterSlug}/questions/${questionId}`,
    });
  }

  return Object.freeze(items.map((item) => Object.freeze(item)));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function renderBreadcrumbNavigation(items) {
  if (!Array.isArray(items) || !items.length) throw new Error("Breadcrumb navigation needs at least one item");
  const links = items.map((item, index) => {
    const current = index === items.length - 1 ? ' aria-current="page"' : "";
    return `<li><a href="${escapeHtml(item.href)}"${current}>${escapeHtml(item.name)}</a></li>`;
  }).join("");
  return `<nav aria-label="Breadcrumb" class="breadcrumb-bar" data-studywudy-breadcrumb="canonical-v1"><ol class="shell breadcrumb-list">${links}</ol></nav>`;
}

function breadcrumbStructuredData(items, origin = CANONICAL_ORIGIN) {
  const canonicalOrigin = new URL(origin).origin;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: new URL(item.href, `${canonicalOrigin}/`).toString(),
    })),
  };
}

function renderBreadcrumbStructuredData(items, origin = CANONICAL_ORIGIN) {
  return JSON.stringify(breadcrumbStructuredData(items, origin)).replaceAll("<", "\\u003c");
}

export {
  CANONICAL_ORIGIN,
  academicBreadcrumbItems,
  breadcrumbStructuredData,
  renderBreadcrumbNavigation,
  renderBreadcrumbStructuredData,
};
