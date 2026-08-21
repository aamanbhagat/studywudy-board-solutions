import baseWorker, { DOQueueHandler } from "../worker.js";
import { bookMatchesStream, streamsFor, streamLabel, subjectsFor } from "./stream-taxonomy.js";
import { BOOK_ARTWORK } from "./catalog-artwork-map.js";
import { CATALOG_ARTWORK_CSS } from "./catalog-artwork-inline.mjs";
import { quickFindAsyncAssets } from "./quick-find-critical.mjs";
import { PHASE3_QUESTION_SEO } from "../phase3-question-seo-manifest.mjs";
import {
  questionAnswerOverride,
  questionDescription,
  questionDocumentTitle,
  questionPrompt,
  questionSocialTitle,
} from "../question-seo.mjs";
import {
  cleanupPhase5ContactRequests,
  enhancePhase5Response,
  handlePhase5Request,
} from "../phase5-compliance.mjs";
import {
  cleanupPhase6WebVitals,
  enhancePhase6Response,
  handlePhase6Request,
} from "../phase6-monitoring.mjs";
import {
  handlePhase6CrawlBatch,
  schedulePhase6WeeklyCrawl,
} from "../phase6-crawl.mjs";
import {
  getQuestionUrl,
  isLegacyQuestionId,
  questionRecordFromCatalogRow,
} from "../question-routes.mjs";
import { isQuestionRowIndexable } from "../answer-completeness.mjs";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import {
  buildQuestionPageExperience,
  findQuestionPageContext,
  QUESTION_PAGE_EXPERIENCE_STYLES,
  renderQuestionPageExperience,
} from "../question-page-experience.mjs";
import {
  buildChapterPageExperience,
  CHAPTER_PAGE_EXPERIENCE_STYLES,
  findChapterPageContext,
  renderChapterPageExperience,
} from "../chapter-page-experience.mjs";
import {
  bookSearchMetadata,
  chapterQuestions,
  chapterSearchMetadata,
  subjectSearchMetadata,
} from "../search-metadata.mjs";
import {
  academicBreadcrumbItems,
  renderBreadcrumbNavigation,
  renderBreadcrumbStructuredData,
} from "../breadcrumbs.mjs";
import {
  formulaRepresentations,
  repairCrawlerFormulaSource,
  renderSemanticMath,
  SEMANTIC_MATH_STYLES,
} from "../semantic-math.mjs";
import {
  buildStudyClusterModel,
  matchStudyClusterRoute,
  renderStudyClusterPage,
  STUDY_CLUSTER_BASE,
  STUDY_CLUSTER_QBANK_BOOK,
  STUDY_CLUSTER_STYLES,
} from "../study-cluster.mjs";
import {
  buildQuestionSemanticGraph,
  descriptiveQuestionAnchor,
  renderSemanticPromotion,
  semanticPromotionForPath,
  SEMANTIC_LINK_GRAPH_STYLES,
  SEMANTIC_PROMOTION_STYLES,
} from "../semantic-link-graph.mjs";
import {
  homepageStructuredData,
  originalDiagramStructuredData,
  stringifyStructuredData,
} from "../structured-data.mjs";
import {
  applyKnownPayloadRepairs,
  bookIdFromPathname,
  isBookQuarantined,
  localizationForPathname,
  repairKnownText,
  repairKnownTextEverywhere,
  reviewedBookTitle,
  reviewedChapterTitle,
} from "../multilingual-text-quality.mjs";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const BOARD_PAGE_SLUGS = new Set(["maharashtra-board", "cbse", "cisce", "tamil-nadu-board"]);
const PHASE_2_VERSION = "20260821-resource-hotfix-v36";
const MAX_BOOK_COMPRESSED_BYTES = 4 * 1024 * 1024;
const MAX_BOOK_JSON_CHARACTERS = 20 * 1024 * 1024;
const BOARD_METADATA_LABELS = Object.freeze({
  "maharashtra-board": "Maharashtra State Board",
  cbse: "CBSE",
  cisce: "CISCE",
  "tamil-nadu-board": "Tamil Nadu",
});
const COURSE_METADATA_LABELS = Object.freeze({
  "hsc-science-general": "HSC Science (General)",
  "hsc-science-information-technology": "HSC Science with Information Technology",
  "hsc-commerce-general": "HSC Commerce (General)",
  "hsc-commerce-mathematics": "HSC Commerce with Mathematics",
  "hsc-arts-general": "HSC Arts (General)",
  "cbse-science": "CBSE Science",
  "cbse-commerce": "CBSE Commerce",
  "cbse-humanities": "CBSE Humanities",
  "isc-science": "ISC Science",
  "isc-commerce": "ISC Commerce",
  "isc-humanities": "ISC Humanities",
  "tn-hse-science": "Tamil Nadu HSE Science",
  "tn-hse-commerce": "Tamil Nadu HSE Commerce",
});
const QUESTION_SEO_DISAMBIGUATED_ROWS = new Set(PHASE3_QUESTION_SEO.disambiguatedRowIds);
// The recovered RSC payload already references this opaque Next font URL. Its
// asset is replaced with IBM Plex Sans so the preload and CSS stay byte-identical.
const FONT_PRELOAD = "/_next/static/media/a343f882a40d2cc9-s.p.1sj6eobyi31rd.woff2";
const EDGE_HTML_CACHE = "public, max-age=0, s-maxage=3600, stale-while-revalidate=2592000";
const ARTWORK_STYLESHEET = `<style data-studywudy-catalog-artwork="inline">${CATALOG_ARTWORK_CSS}</style>`;
const ARTWORK_RUNTIME = `<script src="/catalog-artwork.js?v=${PHASE_2_VERSION}" defer data-studywudy-catalog-artwork="true"></script>`;
const NAVIGATION_FEEDBACK_STYLES = `<link rel="stylesheet" href="/navigation-feedback.css?v=${PHASE_2_VERSION}" data-studywudy-navigation-feedback="styles"/>`;
const NAVIGATION_FEEDBACK_RUNTIME = `<script src="/navigation-feedback.js?v=${PHASE_2_VERSION}" defer data-studywudy-navigation-feedback="runtime"></script>`;
const HOMEPAGE_FINDER_RUNTIME = `<script src="/home-finder.js?v=${PHASE_2_VERSION}" defer data-studywudy-home-finder="runtime"></script>`;
const SEMANTIC_MATH_RUNTIME = `<script src="/semantic-math.js?v=${PHASE_2_VERSION}" defer data-studywudy-semantic-math="runtime"></script>`;
const METHODOLOGY_STYLES = '<style id="phase4-sitewide-methodology-style">.phase4-methodology-footer{border-top:1px solid #c9c1b3;background:#f5f0e6;color:#101316}.phase4-methodology-footer .shell{display:flex;justify-content:space-between;gap:1rem;padding-top:1.15rem;padding-bottom:1.15rem}.phase4-methodology-footer nav{display:flex;flex-wrap:wrap;gap:.55rem 1rem}.phase4-methodology-footer a{font-weight:750}@media(max-width:620px){.phase4-methodology-footer .shell{align-items:flex-start;flex-direction:column}}</style>';
const METHODOLOGY_FOOTER = '<footer class="phase4-methodology-footer"><div class="shell"><span>How each solution is checked</span><nav aria-label="Trust and corrections"><a href="/about/methodology">Publishing methodology</a><a href="/reviewers">Reviewer registry</a><a href="/corrections">Corrections history</a></nav></div></footer>';
const CANONICAL_BREADCRUMB_STYLES = '<style data-studywudy-breadcrumb="canonical-v1">.breadcrumb-bar[data-studywudy-breadcrumb="canonical-v1"] .breadcrumb-list li:last-child>a[aria-current="page"]{color:var(--ink);font-weight:800;text-overflow:ellipsis;overflow:hidden}</style>';
const QUESTION_TYPE_LABELS = Object.freeze({
  one_word: "One word",
  one_sentence: "One sentence",
  brief: "Brief answer",
  detailed: "Detailed answer",
  define: "Definition",
  give_reason: "Give reason",
  name_list: "Name / list",
  mcq_single: "Single-choice MCQ",
  mcq_multi: "Multiple-choice MCQ",
  assertion_reason: "Assertion–reason",
  true_false: "True / false",
  fill_blank: "Fill in the blank",
  match_column: "Match the columns",
  distinguish: "Distinguish between",
  passage: "Passage-based",
  numerical: "Numerical",
  diagram: "Diagram-based",
});

function enhanceResponse(request, response, environment) {
  return enhancePhase6Response(request, enhancePhase5Response(request, response, environment));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function clean(value, max = 180) {
  return String(value || "").trim().slice(0, max);
}

async function quickFind(request, env) {
  const url = new URL(request.url);
  const step = clean(url.searchParams.get("step"), 24);
  const board = clean(url.searchParams.get("board"), 80);
  const grade = clean(url.searchParams.get("grade"), 80);
  const stream = clean(url.searchParams.get("stream"), 40);
  const subject = clean(url.searchParams.get("subject"), 80);
  const book = clean(url.searchParams.get("book"), 240);
  const chapter = clean(url.searchParams.get("chapter"), 160);
  const search = clean(url.searchParams.get("q"), 80);

  try {
    let query;
    let values = [];

    switch (step) {
      case "boards":
        query = `SELECT slug AS id, short_name AS label, region AS meta
          FROM catalog_boards ORDER BY CASE slug
          WHEN 'maharashtra-board' THEN 1 WHEN 'cbse' THEN 2
          WHEN 'cisce' THEN 3 WHEN 'tamil-nadu-board' THEN 4 ELSE 5 END`;
        break;
      case "grades":
        if (!board) return json({ error: "Board is required" }, 400);
        query = `SELECT g.slug AS id, g.label,
          COUNT(DISTINCT s.id) || ' subjects' AS meta
          FROM catalog_grades g
          LEFT JOIN catalog_subjects s ON s.board_slug = g.board_slug AND s.grade_slug = g.slug
          WHERE g.board_slug = ? GROUP BY g.id ORDER BY g.class_number`;
        values = [board];
        break;
      case "streams":
        if (!board || !grade) return json({ error: "Board and class are required" }, 400);
        return json({
          items: streamsFor(board, grade).map(({ id, label, meta }) => ({ id, label, meta })),
          limited: false,
        });
      case "subjects": {
        if (!board || !grade) return json({ error: "Board and class are required" }, 400);
        const streamSubjects = stream ? subjectsFor(board, grade, stream) : [];
        if (stream && !streamSubjects.length) return json({ error: "That stream is not available for this board and class" }, 400);
        const streamClause = streamSubjects.length
          ? ` AND s.slug IN (${streamSubjects.map(() => "?").join(",")})`
          : "";
        query = `SELECT s.slug AS id, s.name AS label,
          '/' || s.board_slug || '/' || s.grade_slug || '/' || s.slug AS href,
          COUNT(DISTINCT b.id) || ' textbooks' AS meta,
          json_group_array(DISTINCT b.title) AS book_titles
          FROM catalog_subjects s
          LEFT JOIN catalog_books b ON b.board_slug = s.board_slug
            AND b.grade_slug = s.grade_slug AND b.subject_slug = s.slug
          WHERE s.board_slug = ? AND s.grade_slug = ?${streamClause}
          GROUP BY s.id ORDER BY s.name`;
        values = [board, grade, ...streamSubjects];
        break;
      }
      case "books":
        if (!board || !grade || !subject) return json({ error: "Board, class and subject are required" }, 400);
        query = `SELECT id, title AS label,
          chapter_count || ' chapters · ' || question_count || ' questions' AS meta
          FROM catalog_books WHERE board_slug = ? AND grade_slug = ? AND subject_slug = ?
          ORDER BY title`;
        values = [board, grade, subject];
        break;
      case "chapters":
        if (!book) return json({ error: "Textbook is required" }, 400);
        if (isBookQuarantined(book)) return json({ items: [], limited: false });
        query = `SELECT slug AS id, title AS label,
          'Chapter ' || number || ' · ' || question_count || ' questions' AS meta
          FROM catalog_chapters WHERE book_id = ? ORDER BY position`;
        values = [book];
        break;
      case "questions": {
        if (!book || !chapter) return json({ error: "Textbook and chapter are required" }, 400);
        if (isBookQuarantined(book)) return json({ items: [], limited: false });
        const like = `%${search}%`;
        query = `SELECT q.question_id AS id, q.question_id, q.display_label,
          q.type, q.prompt_text AS label, b.board_slug, b.grade_slug,
          b.subject_slug, b.slug AS book_slug, q.chapter_slug
          FROM catalog_questions q JOIN catalog_books b ON b.id = q.book_id
          WHERE q.book_id = ? AND q.chapter_slug = ?
          AND (? = '' OR q.prompt_text LIKE ? OR q.display_label LIKE ?)
          ORDER BY q.row_id LIMIT 60`;
        values = [book, chapter, search, like, like];
        break;
      }
      default:
        return json({ error: "Unknown finder step" }, 400);
    }

    const result = await env.DB.prepare(query).bind(...values).all();
    const resultRows = (result.results || []).filter((item) => step !== "books" || !isBookQuarantined(item.id));
    const items = resultRows.map((item) => {
      if (step === "books") return {
        ...item,
        label: reviewedBookTitle(item.id, repairKnownText(item.id, item.label)),
      };
      if (step === "chapters") return {
        ...item,
        label: reviewedChapterTitle(book, item.id, repairKnownText(book, item.label)),
      };
      if (step === "questions") return {
        ...item,
        href: getQuestionUrl(questionRecordFromCatalogRow(item)),
        label: clean(item.label, 360),
        meta: `Question ${item.display_label} · ${String(item.type || "answer").replaceAll("_", " ")}`,
      };
      if (step === "subjects") {
        const { book_titles: bookTitles, ...subjectItem } = item;
        if (!stream) return subjectItem;
        return {
          ...subjectItem,
          meta: (() => {
          let titles = [];
          try { titles = JSON.parse(bookTitles || "[]").filter(Boolean); } catch { titles = []; }
          const count = titles.filter((title) => bookMatchesStream({
            board,
            grade,
            subject: item.id,
            streamId: stream,
            title,
          })).length;
          return `${count} ${count === 1 ? "textbook" : "textbooks"}`;
          })(),
          href: `${item.href}?stream=${encodeURIComponent(stream)}`,
        };
      }
      return item;
    });

    return json({ items, limited: step === "questions" && items.length === 60 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Finder query failed" }, 500);
  }
}

function decodeConceptTags(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function searchQuestionCardMarkup(row) {
  const href = getQuestionUrl(questionRecordFromCatalogRow(row));
  const type = QUESTION_TYPE_LABELS[row.type] || "Answer";
  const tags = decodeConceptTags(row.concept_tags)
    .map((tag) => tag.replaceAll("-", " "))
    .slice(0, 4);
  const context = [
    reviewedBookTitle(row.book_id, repairKnownText(row.book_id, row.book_title)),
    reviewedChapterTitle(row.book_id, row.chapter_slug, repairKnownText(row.book_id, row.chapter_title)),
    ...tags,
  ].filter(Boolean).join(" · ");
  const prompt = clean(row.prompt_text, 520);
  const anchorVerb = row.type === "numerical" ? "Calculate"
    : /derive|prove|show that/iu.test(prompt) ? "Derive"
      : row.type === "mcq_single" ? "Test your understanding of"
        : "Explain";
  const anchorSubject = clean(prompt.replace(/^(?:choose the correct(?: option)?|calculate|derive|explain|find)\s*:?\s*/iu, ""), 110);
  const descriptiveAnchor = `${anchorVerb} ${anchorSubject.charAt(0).toLocaleLowerCase("en-IN")}${anchorSubject.slice(1)}`;
  return `<a href="${escapeHtmlAttribute(href)}"><div><span>Question ${escapeHtmlAttribute(row.display_label)}</span><i>${escapeHtmlAttribute(type)}</i></div><h2>${escapeHtmlAttribute(prompt)}</h2><p>${escapeHtmlAttribute(context)}</p><b>${escapeHtmlAttribute(descriptiveAnchor)} →</b></a>`;
}

async function searchQuestionRows(env, search) {
  const projection = `SELECT q.question_id, q.display_label, q.type, q.prompt_text, q.concept_tags,
    b.id AS book_id,
    b.board_slug, b.grade_slug, b.subject_slug, b.slug AS book_slug, b.title AS book_title,
    q.chapter_slug, c.title AS chapter_title`;
  if (search) {
    const escaped = search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    const like = `%${escaped}%`;
    return env.DB.prepare(`${projection}
      FROM catalog_questions q
      JOIN catalog_books b ON b.id = q.book_id
      JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
      WHERE q.prompt_text LIKE ? ESCAPE '\\' OR q.concept_tags LIKE ? ESCAPE '\\'
      ORDER BY q.row_id LIMIT 50`).bind(like, like).all();
  }
  const statements = [...BOARD_PAGE_SLUGS].map((boardSlug) => env.DB.prepare(`${projection}
      FROM catalog_questions q
      JOIN catalog_books b ON b.id = q.book_id
      JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
      WHERE b.board_slug = ?
      ORDER BY CAST(SUBSTR(b.grade_slug, 7) AS INTEGER) DESC, q.row_id
      LIMIT 4`).bind(boardSlug));
  const batches = await env.DB.batch(statements);
  return { results: batches.flatMap((batch) => batch.results || []) };
}

async function searchQuestionBankResponse(request, env, ctx, url) {
  if (request.method !== "GET" || url.pathname.replace(/\/+$/u, "") !== "/search") return null;
  const search = clean(url.searchParams.get("q"), 80);
  let response;
  let result;
  try {
    [response, result] = await Promise.all([
      baseWorker.fetch(request, env, ctx),
      searchQuestionRows(env, search),
    ]);
  } catch (error) {
    console.error(JSON.stringify({ event: "question_bank_query_failed", error: String(error) }));
    return new Response("Question Bank is temporarily unavailable.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("text/html")) return response;
  const rows = (result.results || []).filter((row) => !isBookQuarantined(row.book_id));
  const cards = rows.length
    ? rows.map(searchQuestionCardMarkup).join("")
    : '<div class="empty-state"><span>⌕</span><div><h2>No exact match yet.</h2><p>Try a shorter concept name, question type or chapter topic.</p><a href="/search">Clear search →</a></div></div>';
  const heading = search ? `Results for “${search}”` : "Browse sample questions";
  return new HTMLRewriter()
    .on(".section-mini-heading > div > span", {
      element(element) {
        element.setInnerContent(String(rows.length));
      },
    })
    .on(".section-mini-heading > div > h2", {
      element(element) {
        element.setInnerContent(heading);
      },
    })
    .on(".search-result-list", {
      element(element) {
        element.setInnerContent(cards, { html: true });
      },
    })
    .transform(withTransformableHeaders(response, search ? "no-store" : EDGE_HTML_CACHE));
}

function subjectRoute(pathname) {
  const match = pathname.match(/^\/([^/]+)\/(class-\d+)\/([^/]+)\/?$/);
  if (!match || !BOARD_PAGE_SLUGS.has(match[1])) return null;
  return { board: match[1], grade: match[2], subject: match[3] };
}

function classRoute(pathname) {
  const match = pathname.match(/^\/([^/]+)\/(class-\d+)\/?$/);
  if (!match || !BOARD_PAGE_SLUGS.has(match[1])) return null;
  return { board: match[1], grade: match[2] };
}

function bookRoute(pathname) {
  const match = pathname.match(/^\/([^/]+)\/(class-\d+)\/([^/]+)\/([^/]+)\/?$/);
  if (!match || !BOARD_PAGE_SLUGS.has(match[1])) return null;
  return { board: match[1], grade: match[2], subject: match[3], book: match[4] };
}

function addSearchMetadataHandlers(rewriter, metadata) {
  return rewriter
    .on("title", {
      element(element) {
        element.setInnerContent(metadata.documentTitle);
      },
    })
    .on('meta[property="og:title"]', {
      element(element) {
        element.setAttribute("content", metadata.socialTitle);
      },
    })
    .on('meta[name="twitter:title"]', {
      element(element) {
        element.setAttribute("content", metadata.socialTitle);
      },
    })
    .on('meta[name="description"]', {
      element(element) {
        element.setAttribute("content", metadata.description);
      },
    })
    .on('meta[property="og:description"]', {
      element(element) {
        element.setAttribute("content", metadata.description);
      },
    })
    .on('meta[name="twitter:description"]', {
      element(element) {
        element.setAttribute("content", metadata.description);
      },
    });
}

function addCanonicalBreadcrumbHandlers(rewriter, items) {
  const navigation = renderBreadcrumbNavigation(items);
  const structuredData = renderBreadcrumbStructuredData(items);
  return rewriter
    .on("head", {
      element(element) {
        element.append(CANONICAL_BREADCRUMB_STYLES, { html: true });
      },
    })
    .on('main > script[type="application/ld+json"]:first-child', {
      element(element) {
        element.setAttribute("data-studywudy-breadcrumb", "canonical-v1");
        element.setInnerContent(structuredData);
      },
    })
    .on('nav[aria-label="Breadcrumb"]', {
      element(element) {
        element.replace(navigation, { html: true });
      },
    });
}

function markCanonicalBreadcrumbResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("X-StudyWudy-Breadcrumbs", "canonical-v1");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function semanticPromotionResponse(response, url, requestMethod = "GET") {
  const promotion = semanticPromotionForPath(url.pathname);
  const contentType = response.headers.get("content-type") || "";
  if (!promotion || !response.ok || !contentType.includes("text/html")) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  headers.set("X-StudyWudy-Semantic-Promotion", "electrostatics-v1");
  response = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  if (requestMethod === "HEAD" || typeof HTMLRewriter !== "function") return response;
  const markup = renderSemanticPromotion(promotion);
  return new HTMLRewriter()
    .on("head", {
      element(element) {
        element.append(SEMANTIC_PROMOTION_STYLES, { html: true });
      },
    })
    .on("main#main-content", {
      element(element) {
        element.onEndTag((endTag) => endTag.before(markup, { html: true }));
      },
    })
    .transform(response);
}

async function academicSearchMetadataResponse(response, env, url) {
  const contentType = response.headers.get("content-type") || "";
  const subject = subjectRoute(url.pathname);
  const book = bookRoute(url.pathname);
  if ((!subject && !book) || !env.DB || !response.ok || !contentType.includes("text/html")
    || typeof HTMLRewriter !== "function") return response;

  let metadata = null;
  let breadcrumbs = null;
  try {
    if (book) {
      const row = await env.DB.prepare(`SELECT b.id AS book_id, b.title AS book_title,
        b.slug AS book_slug, b.chapter_count, b.question_count, b.board_slug, b.grade_slug, b.subject_slug,
        bo.name AS board_name, bo.short_name AS board_short_name,
        g.label AS grade_label, g.class_number, s.name AS subject_name
        FROM catalog_books b
        JOIN catalog_boards bo ON bo.slug = b.board_slug
        JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
        JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
          AND s.slug = b.subject_slug
        WHERE b.board_slug = ? AND b.grade_slug = ? AND b.subject_slug = ? AND b.slug = ? LIMIT 1`)
        .bind(book.board, book.grade, book.subject, book.book)
        .first();
      if (row) {
        row.book_title = reviewedBookTitle(row.book_id, repairKnownText(row.book_id, row.book_title));
        metadata = bookSearchMetadata(row);
        breadcrumbs = academicBreadcrumbItems(row);
      }
    } else if (subject) {
      const result = await env.DB.prepare(`SELECT b.id AS book_id, b.chapter_count, b.question_count,
        b.board_slug, b.grade_slug, b.subject_slug,
        bo.name AS board_name, bo.short_name AS board_short_name,
        g.label AS grade_label, g.class_number, s.name AS subject_name
        FROM catalog_books b
        JOIN catalog_boards bo ON bo.slug = b.board_slug
        JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
        JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
          AND s.slug = b.subject_slug
        WHERE b.board_slug = ? AND b.grade_slug = ? AND b.subject_slug = ? ORDER BY b.id`)
        .bind(subject.board, subject.grade, subject.subject)
        .all();
      const catalogRows = result.results || [];
      const books = catalogRows.filter((row) => !isBookQuarantined(row.book_id));
      if (catalogRows.length) breadcrumbs = academicBreadcrumbItems(catalogRows[0]);
      if (books.length) {
        const subjectRecord = {
          ...books[0],
          book_count: books.length,
          chapter_count: books.reduce((total, row) => total + Number(row.chapter_count || 0), 0),
          question_count: books.reduce((total, row) => total + Number(row.question_count || 0), 0),
        };
        metadata = subjectSearchMetadata(subjectRecord);
      }
    }
  } catch (error) {
    console.error(JSON.stringify({
      message: "search metadata unavailable",
      path: url.pathname,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  if (!metadata && !breadcrumbs) return response;
  let rewriter = new HTMLRewriter();
  if (metadata) rewriter = addSearchMetadataHandlers(rewriter, metadata);
  if (breadcrumbs) rewriter = addCanonicalBreadcrumbHandlers(rewriter, breadcrumbs);
  const transformed = rewriter.transform(withTransformableHeaders(response));
  const headers = new Headers(transformed.headers);
  if (metadata) headers.set("X-StudyWudy-Search-Metadata", "catalog-data-v1");
  if (breadcrumbs) headers.set("X-StudyWudy-Breadcrumbs", "canonical-v1");
  return new Response(transformed.body, {
    status: transformed.status,
    statusText: transformed.statusText,
    headers,
  });
}

function questionRoute(pathname) {
  const match = pathname.match(/^\/([^/]+)\/(class-\d+)\/([^/]+)\/([^/]+)\/([^/]+)\/questions\/([^/]+)\/?$/);
  if (!match || !BOARD_PAGE_SLUGS.has(match[1])) return null;
  return {
    board: match[1],
    grade: match[2],
    subject: match[3],
    book: match[4],
    chapter: match[5],
    question: match[6],
  };
}

function catalogBlobBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Uint8Array) return value;
  return Uint8Array.from(value || []);
}

async function loadCatalogBookPayload(env, bookId) {
  if (!env.DB) return null;
  const result = await env.DB.prepare(
    "SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index",
  ).bind(bookId).all();
  const chunks = (result.results || []).map((row) => catalogBlobBytes(row.content_chunk));
  if (!chunks.length) return null;
  const compressedBytes = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  if (compressedBytes > MAX_BOOK_COMPRESSED_BYTES) throw new Error("Textbook payload exceeds the bounded compressed size");
  const compressed = new Uint8Array(compressedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    compressed.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const decompressed = new Blob([compressed.buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  const json = await new Response(decompressed).text();
  if (json.length > MAX_BOOK_JSON_CHARACTERS) throw new Error("Textbook payload exceeds the bounded decoded size");
  return applyKnownPayloadRepairs(bookId, JSON.parse(json));
}

async function questionPageCatalogRecord(env, route) {
  if (!env.DB) return null;
  const row = await env.DB.prepare(`SELECT q.row_id, q.book_id, q.display_label, q.type,
    b.title AS book_title, bo.name AS board_name, bo.short_name AS board_short_name,
    g.label AS grade_label, g.class_number, s.name AS subject_name,
    c.number AS chapter_number, c.title AS chapter_title, c.book_pages
    FROM catalog_questions q
    JOIN catalog_books b ON b.id = q.book_id
    JOIN catalog_boards bo ON bo.slug = b.board_slug
    JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
    JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
      AND s.slug = b.subject_slug
    JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
    WHERE b.board_slug = ? AND b.grade_slug = ? AND b.subject_slug = ? AND b.slug = ?
      AND q.chapter_slug = ? AND q.question_id = ? LIMIT 1`)
    .bind(route.board, route.grade, route.subject, route.book, route.chapter, route.question)
    .first();
  if (!row) return null;
  row.book_title = reviewedBookTitle(row.book_id, repairKnownText(row.book_id, row.book_title));
  row.chapter_title = reviewedChapterTitle(row.book_id, route.chapter, repairKnownText(row.book_id, row.chapter_title));
  return row;
}

async function questionPageExperienceResponse(response, env, url, requestMethod, route = questionRoute(url.pathname)) {
  const contentType = response.headers.get("content-type") || "";
  if (!route || !response.ok || !contentType.includes("text/html")) return { response, ready: !route };
  let experience = null;
  try {
    const bookId = `${route.board}::${route.grade}::${route.subject}::${route.book}`;
    const semanticGraphEligible = route.board === "maharashtra-board"
      && route.grade === "class-12"
      && route.subject === "physics"
      && route.book === "balbharati-physics-standard-12"
      && route.chapter === "electrostatics";
    const [payload, catalog] = await Promise.all([
      loadCatalogBookPayload(env, bookId),
      questionPageCatalogRecord(env, route),
    ]);
    const context = findQuestionPageContext(payload, route.chapter, route.question);
    const semanticGraph = semanticGraphEligible
      ? buildQuestionSemanticGraph({ primaryPayload: payload, questionBankPayload: null, questionId: route.question })
      : null;
    const model = buildQuestionPageExperience({
      payload,
      context,
      route,
      catalog,
      reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
      semanticGraph,
    });
    experience = renderQuestionPageExperience(model);
  } catch (error) {
    console.error(JSON.stringify({
      message: "question experience unavailable",
      path: url.pathname,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  const ready = Boolean(experience);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  headers.set("X-StudyWudy-Question-Experience", ready ? "question-specific-trust-v2" : "unavailable");
  response = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  if (!ready || requestMethod === "HEAD" || typeof HTMLRewriter !== "function") return { response, ready };

  const solutionHeading = experience.solutionOverview.includes("worked step") ? "Step-by-step solution" : "Answer and explanation";
  const questionExperienceStyles = `${QUESTION_PAGE_EXPERIENCE_STYLES}${experience.semanticLinks ? SEMANTIC_LINK_GRAPH_STYLES : ""}`;
  const rewriter = new HTMLRewriter()
    .on("head", {
      element(element) {
        element.append(questionExperienceStyles, { html: true });
      },
    })
    .on(".answer-page-hero", {
      element(element) {
        element.append(experience.aboveFold, { html: true });
      },
    })
    .on(".solution-body", {
      element(element) {
        element.prepend(experience.solutionOverview, { html: true });
        if (experience.solutionSupplement) element.append(experience.solutionSupplement, { html: true });
      },
    })
    .on(".solution-body > .solution-kicker", {
      element(element) {
        element.setInnerContent(solutionHeading);
      },
    })
    .on(".question-pagination", {
      element(element) {
        element.before(`${experience.semanticLinks || ""}${experience.trust}`, { html: true });
      },
    })
    .on(".related-questions", {
      element(element) {
        if (experience.sameExercise) element.before(experience.sameExercise, { html: true });
        if (experience.previousYear) element.before(experience.previousYear, { html: true });
      },
    });
  return { response: rewriter.transform(response), ready };
}

function chapterRoute(pathname) {
  const match = pathname.match(/^\/([^/]+)\/(class-(\d+))\/([^/]+)\/([^/]+)\/([^/]+)\/?$/u);
  if (!match || !BOARD_PAGE_SLUGS.has(match[1])) return null;
  return {
    boardSlug: match[1],
    classNumber: Number(match[3]),
    subjectSlug: match[4],
    textbookSlug: match[5],
    chapterSlug: match[6],
  };
}

async function chapterPageCatalogRecord(env, route) {
  if (!env.DB) return null;
  const row = await env.DB.prepare(`SELECT b.id AS book_id, b.title AS book_title,
    bo.name AS board_name, bo.short_name AS board_short_name,
    g.label AS grade_label, g.class_number, s.name AS subject_name,
    c.number AS chapter_number, c.title AS chapter_title, c.question_count
    FROM catalog_books b
    JOIN catalog_boards bo ON bo.slug = b.board_slug
    JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
    JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
      AND s.slug = b.subject_slug
    JOIN catalog_chapters c ON c.book_id = b.id
    WHERE b.board_slug = ? AND b.grade_slug = ? AND b.subject_slug = ? AND b.slug = ?
      AND c.slug = ? LIMIT 1`)
    .bind(
      route.boardSlug,
      `class-${route.classNumber}`,
      route.subjectSlug,
      route.textbookSlug,
      route.chapterSlug,
    )
    .first();
  if (!row) return null;
  row.book_title = reviewedBookTitle(row.book_id, repairKnownText(row.book_id, row.book_title));
  row.chapter_title = reviewedChapterTitle(row.book_id, route.chapterSlug, repairKnownText(row.book_id, row.chapter_title));
  return row;
}

async function chapterPageExperienceResponse(response, env, url, requestMethod, route = chapterRoute(url.pathname)) {
  const contentType = response.headers.get("content-type") || "";
  if (!route || !response.ok || !contentType.includes("text/html")) return response;
  let experience = null;
  let searchMetadata = null;
  let breadcrumbs = null;
  try {
    const bookId = `${route.boardSlug}::class-${route.classNumber}::${route.subjectSlug}::${route.textbookSlug}`;
    const [payloadResult, catalogResult] = await Promise.allSettled([
      loadCatalogBookPayload(env, bookId),
      chapterPageCatalogRecord(env, route),
    ]);
    const catalog = catalogResult.status === "fulfilled" ? catalogResult.value : null;
    if (catalog) {
      breadcrumbs = academicBreadcrumbItems({
        ...catalog,
        board_slug: route.boardSlug,
        grade_slug: `class-${route.classNumber}`,
        subject_slug: route.subjectSlug,
        book_slug: route.textbookSlug,
        chapter_slug: route.chapterSlug,
      });
    }
    const rejected = [payloadResult, catalogResult].find((result) => result.status === "rejected");
    if (rejected) throw rejected.reason;
    const payload = payloadResult.value;
    const chapter = findChapterPageContext(payload, route.chapterSlug);
    const model = buildChapterPageExperience({
      payload,
      chapter,
      route,
      catalog,
      reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
    });
    experience = renderChapterPageExperience(model);
    if (chapter && catalog) {
      searchMetadata = chapterSearchMetadata({
        ...catalog,
        board_slug: route.boardSlug,
        class_number: route.classNumber,
        subject_slug: route.subjectSlug,
        chapter,
      }, chapterQuestions(chapter));
    }
  } catch (error) {
    console.error(JSON.stringify({
      message: "chapter experience unavailable",
      path: url.pathname,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  headers.set("X-StudyWudy-Chapter-Experience", experience ? "evidence-v1" : "unavailable");
  if (searchMetadata) headers.set("X-StudyWudy-Search-Metadata", "catalog-data-v1");
  if (breadcrumbs) headers.set("X-StudyWudy-Breadcrumbs", "canonical-v1");
  response = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  if ((!experience && !searchMetadata && !breadcrumbs) || requestMethod === "HEAD" || typeof HTMLRewriter !== "function") return response;

  let rewriter = new HTMLRewriter();
  if (searchMetadata) rewriter = addSearchMetadataHandlers(rewriter, searchMetadata);
  if (breadcrumbs) rewriter = addCanonicalBreadcrumbHandlers(rewriter, breadcrumbs);
  if (!experience) return rewriter.transform(response);
  return rewriter.on("head", {
      element(element) {
        element.append(CHAPTER_PAGE_EXPERIENCE_STYLES, { html: true });
      },
    })
    .on(".chapter-header-copy .chapter-summary", {
      element(element) {
        element.setInnerContent(experience.headerSummary);
      },
    })
    .on("details.course-finder-directory", {
      element(element) {
        element.remove();
      },
    })
    .on(".shell.study-layout", {
      element(element) {
        element.before(experience.hub, { html: true });
        element.after(experience.directory, { html: true });
      },
    })
    .transform(response);
}

async function studyClusterResponse(request, env, url, ctx) {
  const route = matchStudyClusterRoute(url.pathname);
  if (!route || (request.method !== "GET" && request.method !== "HEAD")) return null;
  try {
    const primaryBookId = "maharashtra-board::class-12::physics::balbharati-physics-standard-12";
    const questionBankBookId = `maharashtra-board::class-12::physics::${STUDY_CLUSTER_QBANK_BOOK}`;
    const chapter = chapterRoute(STUDY_CLUSTER_BASE);
    const [primaryPayload, questionBankPayload, catalog] = await Promise.all([
      loadCatalogBookPayload(env, primaryBookId),
      loadCatalogBookPayload(env, questionBankBookId),
      chapterPageCatalogRecord(env, chapter),
    ]);
    const model = buildStudyClusterModel({
      primaryPayload,
      questionBankPayload,
      catalog,
      reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
    });
    const page = renderStudyClusterPage(model, route);
    if (!page) throw new Error("Study cluster model is incomplete");

    const shellUrl = new URL(url);
    shellUrl.pathname = STUDY_CLUSTER_BASE;
    shellUrl.search = "";
    shellUrl.hash = "";
    const shellRequest = new Request(shellUrl, {
      method: "GET",
      headers: request.headers,
    });
    const shell = await baseWorker.fetch(shellRequest, env, ctx);
    if (!shell.ok || !(shell.headers.get("content-type") || "").includes("text/html")) {
      throw new Error(`Chapter shell returned ${shell.status}`);
    }

    const transformed = new HTMLRewriter()
      .on("title", { element(element) { element.setInnerContent(page.title); } })
      .on('meta[name="description"]', { element(element) { element.setAttribute("content", page.description); } })
      .on('meta[name="robots"]', { element(element) { element.setAttribute("content", page.robots); } })
      .on('link[rel="canonical"]', { element(element) { element.setAttribute("href", page.canonical); } })
      .on('meta[property="og:title"]', { element(element) { element.setAttribute("content", page.title.replace(/ \| StudyWudy$/u, "")); } })
      .on('meta[property="og:description"]', { element(element) { element.setAttribute("content", page.description); } })
      .on('meta[property="og:url"]', { element(element) { element.setAttribute("content", page.canonical); } })
      .on('meta[name="twitter:title"]', { element(element) { element.setAttribute("content", page.title.replace(/ \| StudyWudy$/u, "")); } })
      .on('meta[name="twitter:description"]', { element(element) { element.setAttribute("content", page.description); } })
      .on('script[type="application/ld+json"]', { element(element) { element.remove(); } })
      .on("head", { element(element) { element.append(`${SEMANTIC_MATH_STYLES}${STUDY_CLUSTER_STYLES}`, { html: true }); } })
      .on("main#main-content", { element(element) { element.setInnerContent(page.body, { html: true }); } })
      .transform(withTransformableHeaders(shell, route.indexable ? EDGE_HTML_CACHE : "no-store"));
    const headers = new Headers(transformed.headers);
    headers.set("X-StudyWudy-Study-Cluster", "electrostatics-v1");
    headers.set("X-StudyWudy-Study-Evidence", "textbook-and-question-bank-no-pyq-inference");
    if (!route.indexable) headers.set("X-Robots-Tag", "noindex, follow");
    const response = new Response(request.method === "HEAD" ? null : transformed.body, {
      status: transformed.status,
      statusText: transformed.statusText,
      headers,
    });
    return response;
  } catch (error) {
    console.error(JSON.stringify({
      message: "study cluster unavailable",
      path: url.pathname,
      error: error instanceof Error ? error.message : String(error),
    }));
    return new Response("Study resource unavailable", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
}

function chapterSolutionLinksResponse(response, url) {
  const chapter = chapterRoute(url.pathname);
  const contentType = response.headers.get("content-type") || "";
  if (!chapter || !response.ok || !contentType.includes("text/html") || typeof HTMLRewriter !== "function") return response;
  const questionUrlStack = [];
  const descriptiveElectrostaticsAnchors = chapter.boardSlug === "maharashtra-board"
    && chapter.classNumber === 12
    && chapter.subjectSlug === "physics"
    && chapter.textbookSlug === "balbharati-physics-standard-12"
    && chapter.chapterSlug === "electrostatics";
  return new HTMLRewriter()
    .on("article.question-card[id]", {
      element(element) {
        const publicQuestionId = element.getAttribute("id");
        const currentQuestionUrl = publicQuestionId
          ? getQuestionUrl({ ...chapter, publicQuestionId })
          : null;
        const numericSuffix = Number(String(publicQuestionId || "").match(/-(\d{3})$/u)?.[1] || 0);
        questionUrlStack.push({
          href: currentQuestionUrl,
          anchor: descriptiveElectrostaticsAnchors && numericSuffix
            ? descriptiveQuestionAnchor({ order: numericSuffix }, "textbook")
            : null,
        });
        element.onEndTag(() => {
          questionUrlStack.pop();
        });
      },
    })
    .on("span.solution-page-button", {
      element(element) {
        const currentQuestion = questionUrlStack.at(-1);
        if (!currentQuestion?.href) return;
        element.tagName = "a";
        element.setAttribute("href", currentQuestion.href);
        element.removeAttribute("aria-hidden");
      },
    })
    .on(".solution-page-button > span", {
      element(element) {
        const anchor = questionUrlStack.at(-1)?.anchor;
        if (anchor) element.setInnerContent(anchor);
      },
    })
    .transform(withTransformableHeaders(response));
}

function routeLabel(value) {
  return String(value || "").replaceAll("-", " ").replace(/\b\w/gu, (character) => character.toUpperCase());
}

function compactMetadataText(value, maximum = 72) {
  const normalized = String(value || "").replace(/\s+/gu, " ").trim();
  if ([...normalized].length <= maximum) return normalized;
  const clipped = [...normalized].slice(0, Math.max(1, maximum - 1)).join("");
  const wordBoundary = clipped.replace(/\s+\S*$/u, "").trim();
  return `${wordBoundary || clipped.trimEnd()}…`;
}

function streamNavigationMetadataResponse(response, url) {
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("text/html") || typeof HTMLRewriter !== "function") return response;
  const match = url.pathname.match(/^\/([^/]+)\/(class-(\d+))\/streams\/([^/]+)\/([^/]+)(?:\/([^/]+))?\/?$/u);
  if (!match || !BOARD_PAGE_SLUGS.has(match[1])) return response;
  const board = BOARD_METADATA_LABELS[match[1]] || routeLabel(match[1]);
  const grade = match[3];
  const course = COURSE_METADATA_LABELS[match[5]] || routeLabel(match[5]);
  const subject = match[6] ? routeLabel(match[6]) : null;
  const socialTitle = compactMetadataText(subject
    ? `Class ${grade} ${subject} — ${course}, ${board} Solutions`
    : `Class ${grade} ${course} — ${board} Textbooks`);
  const documentTitle = `${socialTitle} | StudyWudy`;
  return new HTMLRewriter()
    .on("title", {
      element(element) {
        element.setInnerContent(documentTitle);
      },
    })
    .on('meta[property="og:title"]', {
      element(element) {
        element.setAttribute("content", socialTitle);
      },
    })
    .on('meta[name="twitter:title"]', {
      element(element) {
        element.setAttribute("content", socialTitle);
      },
    })
    .transform(withTransformableHeaders(response));
}

async function questionMetadataResponse(response, env, url) {
  const route = questionRoute(url.pathname);
  const contentType = response.headers.get("content-type") || "";
  if (!route || !response.ok || !contentType.includes("text/html") || typeof HTMLRewriter !== "function") return response;
  const result = await env.DB.prepare(`SELECT q.row_id, q.book_id, q.question_id, q.display_label, q.type,
    q.prompt_text, q.concept_tags, q.chapter_slug, b.title AS book_title, b.slug AS book_slug,
    b.board_slug, b.grade_slug, b.subject_slug,
    bo.name AS board_name, bo.short_name AS board_short_name,
    g.label AS grade_label, g.class_number, s.name AS subject_name,
    c.number AS chapter_number, c.title AS chapter_title
    FROM catalog_questions q
    JOIN catalog_books b ON b.id = q.book_id
    JOIN catalog_boards bo ON bo.slug = b.board_slug
    JOIN catalog_grades g ON g.board_slug = b.board_slug AND g.slug = b.grade_slug
    JOIN catalog_subjects s ON s.board_slug = b.board_slug AND s.grade_slug = b.grade_slug
      AND s.slug = b.subject_slug
    JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
    WHERE b.board_slug = ? AND b.grade_slug = ? AND b.subject_slug = ? AND b.slug = ?
      AND q.chapter_slug = ? AND q.question_id = ? LIMIT 1`)
    .bind(route.board, route.grade, route.subject, route.book, route.chapter, route.question)
    .first();
  if (!result) return response;
  result.book_title = reviewedBookTitle(result.book_id, repairKnownText(result.book_id, result.book_title));
  result.chapter_title = reviewedChapterTitle(result.book_id, route.chapter, repairKnownText(result.book_id, result.chapter_title));
  const disambiguate = QUESTION_SEO_DISAMBIGUATED_ROWS.has(Number(result.row_id));
  const socialTitle = questionSocialTitle(result, disambiguate);
  const documentTitle = questionDocumentTitle(result, disambiguate);
  const description = questionDescription(result, disambiguate);
  const promptOverride = questionPrompt(result) !== String(result.prompt_text || "").replace(/\s+/g, " ").trim()
    ? questionPrompt(result)
    : null;
  const answerOverride = questionAnswerOverride(result);
  const breadcrumbs = academicBreadcrumbItems(result);
  const canonical = new URL(url);
  canonical.search = "";
  canonical.hash = "";
  if (/^(?:localhost|127\.0\.0\.1)$/.test(canonical.hostname)) {
    canonical.protocol = "https:";
    canonical.host = "studywudy-board-solutions.amanbhagat17089.workers.dev";
  }
  const originalDiagram = originalDiagramStructuredData(route, canonical.toString(), canonical.origin);
  const originalDiagramSchema = originalDiagram ? stringifyStructuredData(originalDiagram) : null;
  const overrideSchema = answerOverride ? JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${canonical.toString()}#webpage`,
    url: canonical.toString(),
    name: `${promptOverride} — Solution`,
    isAccessibleForFree: true,
    mainEntity: {
      "@type": "Question",
      "@id": `${canonical.toString()}#question`,
      name: promptOverride,
      text: promptOverride,
      acceptedAnswer: {
        "@type": "Answer",
        text: answerOverride,
        author: { "@id": `${canonical.origin}/#organization` },
      },
    },
  }).replaceAll("<", "\\u003c") : null;
  const rewriter = addCanonicalBreadcrumbHandlers(new HTMLRewriter(), breadcrumbs)
    .on("title", {
      element(element) {
        element.setInnerContent(documentTitle);
      },
    })
    .on('meta[property="og:title"]', {
      element(element) {
        element.setAttribute("content", socialTitle);
      },
    })
    .on('meta[name="twitter:title"]', {
      element(element) {
        element.setAttribute("content", socialTitle);
      },
    })
    .on('meta[name="description"]', {
      element(element) {
        element.setAttribute("content", description);
      },
    })
    .on('meta[property="og:description"]', {
      element(element) {
        element.setAttribute("content", description);
      },
    })
    .on('meta[name="twitter:description"]', {
      element(element) {
        element.setAttribute("content", description);
      },
    });
  if (overrideSchema || originalDiagramSchema) {
    rewriter.on("head", {
      element(element) {
        if (overrideSchema) {
          element.append(`<script type="application/ld+json" data-studywudy-question-override>${overrideSchema}</script>`, { html: true });
        }
        if (originalDiagramSchema) {
          element.append(`<script type="application/ld+json" data-studywudy-original-diagram>${originalDiagramSchema}</script><style data-studywudy-original-diagram-credit>.studywudy-original-diagram-credit{display:block;margin-top:.35rem;color:#4f5d55;font-size:.74rem;font-weight:750}</style>`, { html: true });
        }
      },
    });
  }
  if (overrideSchema) {
    rewriter
      .on(".answer-page-hero h1 > span", {
        element(element) {
          element.setInnerContent(`${promptOverride} — Question ${result.display_label}`);
        },
      })
      .on(".question-card .question-prompt > span", {
        element(element) {
          element.setInnerContent(promptOverride);
        },
      })
      .on(".question-card .question-prompt img", {
        element(element) {
          element.setAttribute("alt", `${promptOverride} Textbook illustration.`);
        },
      });
  }
  if (originalDiagramSchema) {
    rewriter.on(".solution-body figure figcaption", {
      element(element) {
        element.append('<span class="studywudy-original-diagram-credit">Original solution diagram · StudyWudy Editorial Team</span>', { html: true });
      },
    });
  }
  const transformed = rewriter.transform(withTransformableHeaders(response));
  const headers = new Headers(transformed.headers);
  headers.set("X-StudyWudy-Search-Metadata", "catalog-data-v1");
  headers.set("X-StudyWudy-Breadcrumbs", "canonical-v1");
  return new Response(transformed.body, {
    status: transformed.status,
    statusText: transformed.statusText,
    headers,
  });
}

async function questionCompletenessIndexingResponse(response, env, url, requestMethod, route = questionRoute(url.pathname), experienceReady = true) {
  const contentType = response.headers.get("content-type") || "";
  if (!route || !response.ok || !contentType.includes("text/html")) return response;
  let row = null;
  try {
    row = await env.DB?.prepare(`SELECT q.row_id FROM catalog_questions q
      JOIN catalog_books b ON b.id = q.book_id
      WHERE b.board_slug = ? AND b.grade_slug = ? AND b.subject_slug = ? AND b.slug = ?
        AND q.chapter_slug = ? AND q.question_id = ? LIMIT 1`)
      .bind(route.board, route.grade, route.subject, route.book, route.chapter, route.question)
      .first();
  } catch {
    row = null;
  }
  const indexable = Boolean(experienceReady && row && isQuestionRowIndexable(PHASE4_GATE_MANIFEST, Number(row.row_id)));
  const directive = indexable
    ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
    : "noindex, follow";
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  headers.set("X-Robots-Tag", directive);
  headers.set("X-StudyWudy-Publish-Gate", `${PHASE4_GATE_MANIFEST.policyVersion}; ${indexable ? "complete" : "review-required"}`);
  if (indexable) {
    headers.set("Cache-Control", EDGE_HTML_CACHE);
    headers.delete("Cloudflare-CDN-Cache-Control");
  } else {
    headers.set("Cache-Control", EDGE_HTML_CACHE);
    headers.delete("Cloudflare-CDN-Cache-Control");
  }
  response = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  if (requestMethod === "HEAD" || typeof HTMLRewriter !== "function") return response;

  const reviewed = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(Number(PHASE4_GATE_MANIFEST.reviewedAt) * 1_000);
  const panel = `<section class="shell phase4-review-signal" aria-label="Automated solution publishing check"><a class="phase4-review-badge ${indexable ? "is-passed" : "is-queued"}" href="/about/methodology">${indexable ? "✓ Automated completeness gate passed" : "Automated answer checks incomplete"}</a><small>Automated publishing gate run: ${escapeHtmlAttribute(reviewed)}</small><span>${indexable ? "The answer passed type-specific structure, mapping, equation, canonical and duplicate-intent checks. This is not a human academic-review claim." : "This page stays available to students but is not indexable until its type-specific automated requirements are complete."}</span></section>`;
  let foundReviewPanel = false;
  let foundRobots = false;
  return new HTMLRewriter()
    .on('meta[name="robots"], meta[name="googlebot"]', {
      element(element) {
        foundRobots = true;
        element.setAttribute("content", directive);
      },
    })
    .on(".phase4-review-signal", {
      element(element) {
        foundReviewPanel = true;
        element.replace(panel, { html: true });
      },
    })
    .on("head", {
      element(element) {
        element.onEndTag((endTag) => {
          if (!foundRobots) endTag.before(`<meta name="robots" content="${directive}">`, { html: true });
        });
      },
    })
    .on("body", {
      element(element) {
        element.onEndTag((endTag) => {
          if (!foundReviewPanel) endTag.before(panel, { html: true });
        });
      },
    })
    .transform(response);
}

function escapeCssAttribute(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function withTransformableHeaders(response, cacheControl = null) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  // The site does not use interest-cohort advertising. Omitting the
  // inconsistently supported browsing-topics token also prevents Chromium from
  // emitting a console warning before application code runs.
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  if (cacheControl) headers.set("cache-control", cacheControl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function completenessPolicyHeaders(response, url) {
  if (!(url.pathname === "/sitemap.xml" || url.pathname.startsWith("/sitemaps/"))) return response;
  const headers = new Headers(response.headers);
  headers.set("X-StudyWudy-Publish-Gate", `${PHASE4_GATE_MANIFEST.policyVersion}; indexable=${PHASE4_GATE_MANIFEST.indexableCount}`);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function publicHtmlCacheAllowed(response, { allowNoindex = false } = {}) {
  const robots = response.headers.get("x-robots-tag") || "";
  const cloudflareCache = response.headers.get("cloudflare-cdn-cache-control") || "";
  return (allowNoindex || !robots.toLowerCase().includes("noindex"))
    && !cloudflareCache.toLowerCase().includes("no-store");
}

function edgeHtmlCacheKey(request) {
  if (request.method !== "GET") return null;
  const accept = request.headers.get("accept") || "";
  if (!accept.includes("text/html")) return null;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return null;
  if (url.pathname === "/search" && url.searchParams.get("q")) return null;
  // Tracking, preview, filter, and debug parameters canonicalize to the same
  // document and must not force another expensive SSR pass. Retain only the
  // two parameters that can change real page content.
  const page = url.searchParams.get("page");
  const stream = url.searchParams.get("stream");
  url.search = "";
  if (page) url.searchParams.set("page", page);
  if (stream) url.searchParams.set("stream", stream);
  // Versioning the private cache key makes every deployment self-invalidating
  // without adding a query parameter to the public/canonical URL.
  url.searchParams.set("__studywudy_edge_version", PHASE_2_VERSION);
  return new Request(url.toString(), {
    method: "GET",
    headers: { accept: "text/html" },
  });
}

async function edgeHtmlCacheMatch(request) {
  const key = edgeHtmlCacheKey(request);
  if (!key || typeof caches === "undefined") return null;
  const cached = await caches.default.match(key);
  if (!cached) return null;
  const headers = new Headers(cached.headers);
  headers.set("x-studywudy-edge-cache", "HIT");
  return new Response(cached.body, {
    status: cached.status,
    statusText: cached.statusText,
    headers,
  });
}

function edgeHtmlCacheStore(request, response, ctx, options = {}) {
  const key = edgeHtmlCacheKey(request);
  const contentType = response.headers.get("content-type") || "";
  const cacheControl = response.headers.get("cache-control") || "";
  if (!key || typeof caches === "undefined" || !response.ok
    || !contentType.includes("text/html") || !publicHtmlCacheAllowed(response, options)
    || !/s-maxage=(?:[1-9]\d*)/.test(cacheControl) || /(?:private|no-store)/i.test(cacheControl)) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("x-studywudy-edge-cache", "MISS");
  const cacheable = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  ctx.waitUntil(caches.default.put(key, cacheable.clone()).catch(() => {}));
  return cacheable;
}

function withoutConditionalHtmlValidators(request) {
  const accept = request.headers.get("accept") || "";
  if (!(["GET", "HEAD"].includes(request.method) && accept.includes("text/html"))) return request;
  if (!request.headers.has("if-none-match") && !request.headers.has("if-modified-since")) return request;
  const headers = new Headers(request.headers);
  headers.delete("if-none-match");
  headers.delete("if-modified-since");
  return new Request(request, { headers });
}

function semanticMathResponse(response, requestMethod) {
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("text/html")) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  headers.set("X-StudyWudy-Semantic-Math", "source-mathml-spoken-plain-v1");
  response = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  if (requestMethod === "HEAD" || typeof HTMLRewriter !== "function") return response;

  return new HTMLRewriter()
    .on("head", {
      element(element) {
        element.append(`${SEMANTIC_MATH_STYLES}${SEMANTIC_MATH_RUNTIME}`, { html: true });
      },
    })
    .on(".math[aria-label]", {
      element(element) {
        const existingSource = element.getAttribute("data-math-source") || "";
        const originalSource = existingSource || element.getAttribute("aria-label");
        const source = repairCrawlerFormulaSource(originalSource);
        if (!source) return;
        if (existingSource && source === existingSource) return;
        const representation = formulaRepresentations(source);
        element.setAttribute("data-math-source", representation.source);
        element.setAttribute("data-math-spoken", representation.spokenText);
        element.setAttribute("data-math-plain", representation.plainText);
        element.removeAttribute("aria-label");
        element.removeAttribute("role");
        if (existingSource) {
          element.setInnerContent(renderSemanticMath(representation, { visiblePlain: true }), { html: true });
        } else {
          element.prepend(renderSemanticMath(representation), { html: true });
        }
      },
    })
    .on(".math > .math-semantic[data-math-source]", {
      element(element) {
        const original = element.getAttribute("data-math-source") || "";
        if (repairCrawlerFormulaSource(original) !== original) element.remove();
      },
    })
    .on(".math[data-math-source]", {
      element(element) {
        const original = element.getAttribute("data-math-source") || "";
        const source = repairCrawlerFormulaSource(original);
        if (!source || source === original) return;
        const representation = formulaRepresentations(source);
        element.setAttribute("data-math-source", representation.source);
        element.setAttribute("data-math-spoken", representation.spokenText);
        element.setAttribute("data-math-plain", representation.plainText);
        element.setInnerContent(renderSemanticMath(representation, { visiblePlain: true }), { html: true });
      },
    })
    .on(".math > .katex, .math > .katex-display", {
      element(element) {
        element.setAttribute("aria-hidden", "true");
        element.setAttribute("data-nosnippet", "");
      },
    })
    .transform(response);
}

function localizedCanonicalUrl(request, pathname) {
  const canonical = new URL(pathname, request.url);
  canonical.search = "";
  canonical.hash = "";
  if (/^(?:localhost|127\.0\.0\.1)$/u.test(canonical.hostname)) {
    canonical.protocol = "https:";
    canonical.hostname = "studywudy-board-solutions.amanbhagat17089.workers.dev";
    canonical.port = "";
  }
  return canonical.toString();
}

function multilingualTextHandler() {
  let fragments = [];
  return {
    text(textChunk) {
      fragments.push(textChunk.text);
      if (!textChunk.lastInTextNode) {
        textChunk.remove();
        return;
      }
      const wasChunked = fragments.length > 1;
      const source = fragments.join("");
      fragments = [];
      const repaired = repairKnownTextEverywhere(source);
      if (wasChunked || repaired !== source) textChunk.replace(repaired, { html: true });
    },
  };
}

function multilingualTextResponse(request, response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  const url = new URL(request.url);
  const localization = localizationForPathname(url.pathname);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  headers.set("X-StudyWudy-Language-Quality", "nfc-script-native-v1");
  if (localization?.language) headers.set("Content-Language", localization.language);
  response = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  if (request.method === "HEAD" || typeof HTMLRewriter !== "function") return response;

  const canonicalHref = localization ? localizedCanonicalUrl(request, localization.pathname) : null;
  const alternateMarkup = localization?.alternates
    ? Object.entries(localization.alternates).map(([language, pathname]) =>
      `<link rel="alternate" hreflang="${escapeHtmlAttribute(language)}" href="${escapeHtmlAttribute(localizedCanonicalUrl(request, pathname))}">`
    ).join("")
    : "";
  const isBookPage = Boolean(localization && !localization.chapterSlug);
  const isChapterPage = Boolean(localization?.chapterSlug && !localization.isQuestion);
  const documentTitle = localization?.language === "hi" && localization.bookTitle
    ? (isBookPage
      ? `${localization.bookTitle} समाधान | StudyWudy`
      : isChapterPage && localization.chapterTitle
        ? `${localization.chapterTitle} प्रश्नोत्तर | ${localization.bookTitle} | StudyWudy`
        : null)
    : null;
  let foundCanonical = false;
  const rewriter = new HTMLRewriter()
    .on("html", {
      element(element) {
        if (localization?.language) element.setAttribute("lang", localization.language);
      },
    })
    .on('link[rel="canonical"]', {
      element(element) {
        if (!canonicalHref) return;
        foundCanonical = true;
        element.setAttribute("href", canonicalHref);
      },
    })
    .on('link[rel="alternate"][hreflang]', {
      element(element) {
        element.remove();
      },
    })
    .on("title", {
      element(element) {
        if (documentTitle) element.setInnerContent(documentTitle);
      },
    })
    .on('meta[property="og:title"], meta[name="twitter:title"]', {
      element(element) {
        if (documentTitle) element.setAttribute("content", documentTitle.replace(/\s*\|\s*StudyWudy$/u, ""));
      },
    })
    .on(".book-hero h1", {
      element(element) {
        if (isBookPage && localization.bookTitle) element.setInnerContent(localization.bookTitle);
      },
    })
    .on(".chapter-header-copy h1", {
      element(element) {
        if (isChapterPage && localization.chapterTitle) element.setInnerContent(localization.chapterTitle);
      },
    })
    .on("body", multilingualTextHandler())
    .on("head", {
      element(element) {
        element.onEndTag((endTag) => {
          if (canonicalHref && !foundCanonical) {
            endTag.before(`<link rel="canonical" href="${escapeHtmlAttribute(canonicalHref)}">`, { html: true });
          }
          if (alternateMarkup) endTag.before(alternateMarkup, { html: true });
        });
      },
    });
  return rewriter.transform(response);
}

function multilingualQuarantineResponse(request, url) {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const bookId = bookIdFromPathname(url.pathname);
  if (!bookId || !isBookQuarantined(bookId)) return null;
  const language = localizationForPathname(url.pathname)?.language || "en";
  const hindi = language === "hi";
  const title = hindi ? "भाषा-समीक्षा जारी है" : "Language review in progress";
  const message = hindi
    ? "इस संस्करण को सही वर्तनी और पाठ्यपुस्तक मिलान की जाँच पूरी होने तक प्रकाशित नहीं किया जाएगा।"
    : "This edition will remain unavailable until its spelling and textbook mapping review is complete.";
  const body = `<!doctype html><html lang="${escapeHtmlAttribute(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, follow"><link rel="canonical" href="${escapeHtmlAttribute(localizedCanonicalUrl(request, url.pathname))}"><title>${title} | StudyWudy</title><style>body{margin:0;background:#f5f0e6;color:#17231d;font:500 1rem/1.65 system-ui,sans-serif}.language-review{max-width:44rem;margin:12vh auto;padding:clamp(1.5rem,5vw,3.5rem);border:1px solid #174d31;border-radius:22px;background:#fff}.language-review small{color:#23603e;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.language-review h1{margin:.45rem 0 1rem;font-size:clamp(2rem,6vw,4rem);line-height:1.05}.language-review a{color:#174d31;font-weight:800}</style></head><body><main class="language-review"><small>StudyWudy language review</small><h1>${title}</h1><p>${message}</p><p><a href="/${escapeHtmlAttribute(url.pathname.split("/").filter(Boolean).slice(0, 3).join("/"))}">← Browse reviewed textbooks</a></p></main></body></html>`;
  return new Response(request.method === "HEAD" ? null : body, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      "content-language": language,
      "retry-after": "86400",
      "x-robots-tag": "noindex, follow",
      "x-studywudy-language-quality": "quarantined",
    },
  });
}

function withTheme(request, response, addEdgeCacheFallback = false) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  const pathname = new URL(request.url).pathname.replace(/\/$/, "") || "/";
  const pathParts = pathname.split("/").filter(Boolean);
  const isHomepage = pathname === "/";
  const homepageSchema = stringifyStructuredData(homepageStructuredData(request.url));
  const isFinderPage = (pathParts.length === 1 || (pathParts.length === 2 && /^class-\d+$/.test(pathParts[1])))
    && BOARD_PAGE_SLUGS.has(pathParts[0]);
  let hasFontPreload = false;
  let hasMethodologyLink = false;
  let hasMethodologyStyles = false;
  let hasQuickFindStyles = false;
  let hasQuickFindRuntime = false;
  let hasNavigationFeedbackStyles = false;
  let hasNavigationFeedbackRuntime = false;
  let hasHomepageFinderRuntime = false;
  let siteIdentityHandled = false;
  const rewriter = new HTMLRewriter()
    .on('body > script[type="application/ld+json"]:first-child', {
      element(element) {
        siteIdentityHandled = true;
        if (!isHomepage) {
          element.remove();
          return;
        }
        element.setAttribute("data-studywudy-site-identity", "homepage-only-v1");
        element.setInnerContent(homepageSchema);
      },
    })
    .on('link[rel="preload"][as="script"]', {
      element(element) {
        element.remove();
      },
    })
    .on('script[src^="/_next/static/chunks/"]', {
      element(element) {
        element.remove();
      },
    })
    .on('body > script[id="_R_"]', {
      element(element) {
        element.remove();
      },
    })
    .on('body > script:not([src]):not([type]):not([id])', {
      element(element) {
        element.remove();
      },
    })
    .on('link[rel="preload"][as="font"]', {
      element(element) {
        hasFontPreload = true;
        element.setAttribute("href", FONT_PRELOAD);
        element.setAttribute("type", "font/woff2");
        element.setAttribute("crossorigin", "");
      },
    })
    .on("html[data-theme]", {
      element(element) {
        element.removeAttribute("data-theme");
      },
    })
    .on('[data-studywudy-theme]', {
      element(element) {
        element.remove();
      },
    })
    .on('style[data-studywudy-quick-find="critical"]', {
      element(element) {
        if (!isFinderPage) {
          element.remove();
          return;
        }
        hasQuickFindStyles = true;
      },
    })
    .on('link[href^="/quick-find.css"]', {
      element(element) {
        if (!isFinderPage) {
          element.remove();
          return;
        }
        hasQuickFindStyles = true;
        element.replace(quickFindAsyncAssets(`/quick-find.css?v=${PHASE_2_VERSION}`), { html: true });
      },
    })
    .on('script[src^="/quick-find.js"]', {
      element(element) {
        if (!isFinderPage) {
          element.remove();
          return;
        }
        hasQuickFindRuntime = true;
        element.setAttribute("src", `/quick-find.js?v=${PHASE_2_VERSION}`);
        element.setAttribute("defer", "");
      },
    })
    .on('link[href^="/navigation-feedback.css"]', {
      element(element) {
        hasNavigationFeedbackStyles = true;
        element.setAttribute("href", `/navigation-feedback.css?v=${PHASE_2_VERSION}`);
        element.setAttribute("rel", "stylesheet");
      },
    })
    .on('script[src^="/navigation-feedback.js"]', {
      element(element) {
        hasNavigationFeedbackRuntime = true;
        element.setAttribute("src", `/navigation-feedback.js?v=${PHASE_2_VERSION}`);
        element.setAttribute("defer", "");
      },
    })
    .on('script[src^="/home-finder.js"]', {
      element(element) {
        if (!isHomepage) {
          element.remove();
          return;
        }
        hasHomepageFinderRuntime = true;
        element.setAttribute("src", `/home-finder.js?v=${PHASE_2_VERSION}`);
        element.setAttribute("defer", "");
      },
    })
    .on(".explorer-wrap", {
      element(element) {
        if (isHomepage) element.setAttribute("id", "quick-find");
      },
    })
    .on('a[href="/about/methodology"]', {
      element() {
        hasMethodologyLink = true;
      },
    })
    .on('#phase4-trust-styles, #phase4-sitewide-methodology-style', {
      element() {
        hasMethodologyStyles = true;
      },
    })
    .on("head", {
      element(element) {
        element.onEndTag((endTag) => {
          if (!hasFontPreload) {
            endTag.before(`<link rel="preload" href="${FONT_PRELOAD}" as="font" crossorigin="" type="font/woff2"/>`, { html: true });
          }
          if (!hasMethodologyStyles) endTag.before(METHODOLOGY_STYLES, { html: true });
          if (!hasNavigationFeedbackStyles) endTag.before(NAVIGATION_FEEDBACK_STYLES, { html: true });
          if (!hasNavigationFeedbackRuntime) endTag.before(NAVIGATION_FEEDBACK_RUNTIME, { html: true });
          if (isHomepage && !hasHomepageFinderRuntime) endTag.before(HOMEPAGE_FINDER_RUNTIME, { html: true });
          if (isFinderPage && !hasQuickFindStyles) {
            endTag.before(quickFindAsyncAssets(`/quick-find.css?v=${PHASE_2_VERSION}`), { html: true });
          }
          if (isFinderPage && !hasQuickFindRuntime) {
            endTag.before(`<script src="/quick-find.js?v=${PHASE_2_VERSION}" defer data-studywudy-comparison="after"></script>`, { html: true });
          }
        });
      },
    })
    .on("body", {
      element(element) {
        element.onEndTag((endTag) => {
          if (isHomepage && !siteIdentityHandled) {
            endTag.before(`<script type="application/ld+json" data-studywudy-site-identity="homepage-only-v1">${homepageSchema}</script>`, { html: true });
          }
          if (!hasMethodologyLink) endTag.before(METHODOLOGY_FOOTER, { html: true });
        });
      },
    });
  const cacheControl = response.headers.get("cache-control") || "";
  const needsEdgeCache = addEdgeCacheFallback
    && response.ok
    && publicHtmlCacheAllowed(response)
    && !cacheControl.includes("s-maxage=")
    && (!cacheControl || /private|no-store|must-revalidate/.test(cacheControl));
  const themed = rewriter.transform(withTransformableHeaders(response, needsEdgeCache ? EDGE_HTML_CACHE : null));
  return multilingualTextResponse(request, semanticMathResponse(themed, request.method));
}

function bookCoverMarkup(artwork, eager = false) {
  const src = optimizedBookCoverPath(artwork);
  return `<img class="catalog-real-book-cover" alt="${escapeHtmlAttribute(artwork.alt)}" decoding="async" fetchpriority="${eager ? "high" : "low"}" height="300" loading="${eager ? "eager" : "lazy"}" src="${escapeHtmlAttribute(src)}" width="216"/>`;
}

function optimizedBookCoverPath(artwork) {
  return artwork.src.replace(/\.jpg(?=$|[?#])/i, ".webp");
}

function subjectBookCovers(books) {
  return books.flatMap((book) => {
    const artwork = BOOK_ARTWORK[book.id];
    return artwork ? [{ src: optimizedBookCoverPath(artwork), title: book.title }] : [];
  });
}

function subjectCoverSetMarkup(covers) {
  const count = covers.length;
  if (!count) return "";
  const layout = count === 1 ? "single" : count <= 4 ? "fan" : "grid";
  const columns = layout === "grid" ? Math.ceil(count / 2) : count;
  const signature = covers.map((cover) => cover.src).join("|");
  const images = covers.map((cover) => `<img alt="" aria-hidden="true" decoding="async" height="96" loading="lazy" src="${escapeHtmlAttribute(cover.src)}" width="68"/>`).join("");
  return `<span aria-hidden="true" class="catalog-subject-book-covers catalog-subject-book-covers-${layout}" data-cover-count="${count}" data-cover-signature="${escapeHtmlAttribute(signature)}" style="--cover-cols:${columns}">${images}</span>`;
}

function artworkHeadMarkup(pageConfig = null) {
  const config = pageConfig
    ? `<script data-studywudy-catalog-artwork="config">window.__STUDYWUDY_ARTWORK_PAGE__=${JSON.stringify(pageConfig).replaceAll("<", "\\u003c")};</script>`
    : "";
  return `${ARTWORK_STYLESHEET}${config}${ARTWORK_RUNTIME}`;
}

function optimizedBoardLogoPath(slug) {
  return `/catalog-artwork/boards/logos/${slug}-384.webp`;
}

function setBoardLogoAttributes(element, slug, size, eager = false) {
  element.setAttribute("src", optimizedBoardLogoPath(slug));
  element.removeAttribute("srcset");
  element.setAttribute("decoding", "async");
  element.setAttribute("fetchpriority", eager ? "high" : "low");
  element.setAttribute("height", String(size));
  element.setAttribute("loading", eager ? "eager" : "lazy");
  element.setAttribute("width", String(size));
}

function addBoardArtworkHandlers(rewriter) {
  BOARD_PAGE_SLUGS.forEach((slug) => {
    rewriter.on(`.board-card-${slug} .board-artwork img`, {
      element(element) {
        setBoardLogoAttributes(element, slug, 192);
      },
    });
  });
  return rewriter;
}

function addArtworkHandlers(rewriter, books, options = {}) {
  const { bookHero = false, allowedSlugs = null } = options;
  let visibleBookIndex = 0;
  books.forEach((book) => {
    const selector = `.book-card[data-book-slug="${escapeCssAttribute(book.slug)}"]`;
    if (allowedSlugs && !allowedSlugs.has(String(book.slug))) {
      rewriter.on(selector, {
        element(element) {
          element.remove();
        },
      });
      return;
    }
    const artwork = BOOK_ARTWORK[book.id];
    if (!artwork) return;
    if (bookHero) {
      rewriter.on(".book-hero .catalog-artwork-picture", {
        element(element) {
          element.setInnerContent(bookCoverMarkup(artwork, true), { html: true });
        },
      });
      return;
    }
    const eager = visibleBookIndex === 0;
    visibleBookIndex += 1;
    rewriter.on(`${selector} .catalog-artwork-picture`, {
      element(element) {
        element.setInnerContent(bookCoverMarkup(artwork, eager), { html: true });
      },
    });
  });
  return rewriter;
}

async function catalogArtworkResponse(request, env, ctx, url) {
  if (request.method !== "GET") return null;
  const subject = subjectRoute(url.pathname);
  const book = bookRoute(url.pathname);
  const route = subject || book;
  if (!route) return null;

  const streamId = clean(url.searchParams.get("stream"), 32);
  let streamSubjects = [];
  if (subject && streamId) {
    streamSubjects = subjectsFor(route.board, route.grade, streamId);
    if (!streamSubjects.includes(route.subject)) {
      return new Response("This subject is not available in the selected stream.", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }
  }

  const [response, booksResult] = await Promise.all([
    baseWorker.fetch(request, env, ctx),
    book
      ? env.DB.prepare(`SELECT id, slug, title FROM catalog_books
          WHERE board_slug = ? AND grade_slug = ? AND subject_slug = ? AND slug = ? LIMIT 1`)
          .bind(route.board, route.grade, route.subject, route.book).all()
      : env.DB.prepare(`SELECT id, slug, title FROM catalog_books
          WHERE board_slug = ? AND grade_slug = ? AND subject_slug = ? ORDER BY title`)
          .bind(route.board, route.grade, route.subject).all(),
  ]);
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("text/html")) return response;

  const books = booksResult.results || [];
  let allowedSlugs = subject
    ? new Set(books.filter((catalogBook) => !isBookQuarantined(catalogBook.id)).map((catalogBook) => String(catalogBook.slug)))
    : null;
  if (subject && streamId) {
    const allowedBooks = books.filter((catalogBook) => bookMatchesStream({
      ...route,
      streamId,
      title: catalogBook.title,
    }) && !isBookQuarantined(catalogBook.id));
    if (!allowedBooks.length) return response;
    allowedSlugs = new Set(allowedBooks.map((catalogBook) => String(catalogBook.slug)));
  }
  const pageConfig = {
    pathname: url.pathname,
    allowedSlugs: allowedSlugs ? [...allowedSlugs] : null,
    streamLabel: streamId ? streamLabel(route.board, route.grade, streamId) : null,
  };
  const rewriter = addArtworkHandlers(new HTMLRewriter(), books, {
    bookHero: Boolean(book),
    allowedSlugs,
  }).on("head", {
    element(element) {
      element.append(artworkHeadMarkup(pageConfig), { html: true });
    },
  });

  const cacheControl = publicHtmlCacheAllowed(response) ? (streamId ? "no-store" : EDGE_HTML_CACHE) : null;
  return rewriter.transform(withTransformableHeaders(response, cacheControl));
}

async function classCatalogArtworkResponse(request, env, ctx, url) {
  if (request.method !== "GET") return null;
  const route = classRoute(url.pathname);
  if (!route) return null;

  const [response, booksResult] = await Promise.all([
    baseWorker.fetch(request, env, ctx),
    env.DB.prepare(`SELECT id, slug, subject_slug, title FROM catalog_books
      WHERE board_slug = ? AND grade_slug = ? ORDER BY subject_slug, title`)
      .bind(route.board, route.grade).all(),
  ]);
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("text/html")) return response;

  const coversBySubject = {};
  for (const book of (booksResult.results || []).filter((catalogBook) => !isBookQuarantined(catalogBook.id))) {
    const subject = String(book.subject_slug || "");
    if (!subject) continue;
    (coversBySubject[subject] ||= []).push(book);
  }

  const pageSubjectCovers = {};
  let rewriter = new HTMLRewriter();
  for (const [subject, books] of Object.entries(coversBySubject)) {
    const covers = subjectBookCovers(books);
    if (!covers.length) continue;
    pageSubjectCovers[subject] = covers;
    const href = `/${route.board}/${route.grade}/${subject}`;
    rewriter = rewriter.on(`a[class*="SubjectGrid-module"][class*="__card"][href="${escapeCssAttribute(href)}"]`, {
      element(element) {
        element.prepend(subjectCoverSetMarkup(covers), { html: true });
      },
    });
  }

  rewriter = rewriter.on("head", {
    element(element) {
      element.append(artworkHeadMarkup({
        pathname: url.pathname,
        board: route.board,
        grade: route.grade,
        subjectCovers: pageSubjectCovers,
      }), { html: true });
    },
  });
  rewriter = addCanonicalBreadcrumbHandlers(rewriter, academicBreadcrumbItems({
    board_slug: route.board,
    grade_slug: route.grade,
  }));
  return markCanonicalBreadcrumbResponse(
    rewriter.transform(withTransformableHeaders(response, EDGE_HTML_CACHE)),
  );
}

async function boardsPageResponse(request, env, ctx, url) {
  if (request.method !== "GET" || url.pathname.replace(/\/+$/, "") !== "/boards") return null;
  const response = await baseWorker.fetch(request, env, ctx);
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("text/html")) return response;

  const rewriter = addBoardArtworkHandlers(new HTMLRewriter()).on("head", {
    element(element) {
      element.append(artworkHeadMarkup(), { html: true });
    },
  });
  return rewriter.transform(withTransformableHeaders(response, EDGE_HTML_CACHE));
}

async function boardLandingResponse(request, env, url, board) {
  const assetUrl = new URL(`/pages/${board}/`, url);
  const response = await env.ASSETS.fetch(new Request(assetUrl, request));
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("text/html")) return response;
  const rewriter = addCanonicalBreadcrumbHandlers(new HTMLRewriter(), academicBreadcrumbItems({
    board_slug: board,
  }))
    .on("head", {
      element(element) {
        element.append(artworkHeadMarkup(), { html: true });
      },
    })
    .on(".catalog-stat-artwork img", {
      element(element) {
        setBoardLogoAttributes(element, board, 180, true);
      },
    });
  return markCanonicalBreadcrumbResponse(
    rewriter.transform(withTransformableHeaders(response, EDGE_HTML_CACHE)),
  );
}

const afterWorker = {
  async fetch(request, env, ctx) {
    request = withoutConditionalHtmlValidators(request);
    const url = new URL(request.url);
    const quarantinedLanguagePage = multilingualQuarantineResponse(request, url);
    if (quarantinedLanguagePage) {
      return enhanceResponse(request, withTheme(request, quarantinedLanguagePage), env);
    }
    const edgeCached = await edgeHtmlCacheMatch(request);
    if (edgeCached) return edgeCached;
    const phase6Response = await handlePhase6Request(request, env);
    if (phase6Response) return phase6Response;
    const phase5Response = await handlePhase5Request(request, env);
    if (phase5Response) {
      return edgeHtmlCacheStore(
        request,
        enhanceResponse(request, withTheme(request, phase5Response), env),
        ctx,
      );
    }
    if (url.pathname === "/api/quick-find" && request.method === "GET") {
      return quickFind(request, env);
    }
    const routedQuestion = questionRoute(url.pathname);
    if (routedQuestion && isLegacyQuestionId(routedQuestion.question)) {
      return new Response("Not found", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }
    const studyCluster = await studyClusterResponse(request, env, url, ctx);
    if (studyCluster) {
      return edgeHtmlCacheStore(
        request,
        enhanceResponse(request, withTheme(request, studyCluster, studyCluster.headers.get("cache-control") !== "no-store"), env),
        ctx,
      );
    }
    const questionBank = await searchQuestionBankResponse(request, env, ctx, url);
    if (questionBank) {
      return edgeHtmlCacheStore(
        request,
        enhanceResponse(request, withTheme(request, questionBank), env),
        ctx,
      );
    }
    const boardsPage = await boardsPageResponse(request, env, ctx, url);
    if (boardsPage) {
      return edgeHtmlCacheStore(
        request,
        enhanceResponse(request, withTheme(request, boardsPage), env),
        ctx,
      );
    }
    const classCatalogArtwork = await classCatalogArtworkResponse(request, env, ctx, url);
    if (classCatalogArtwork) {
      const promotedClassPage = semanticPromotionResponse(classCatalogArtwork, url, request.method);
      return edgeHtmlCacheStore(
        request,
        enhanceResponse(request, withTheme(request, promotedClassPage), env),
        ctx,
      );
    }
    const catalogArtwork = await catalogArtworkResponse(request, env, ctx, url);
    if (catalogArtwork) {
      const catalogSearchMetadata = await academicSearchMetadataResponse(catalogArtwork, env, url);
      const promotedCatalogPage = semanticPromotionResponse(catalogSearchMetadata, url, request.method);
      return edgeHtmlCacheStore(
        request,
        enhanceResponse(request, withTheme(request, promotedCatalogPage), env),
        ctx,
      );
    }
    const boardSlug = url.pathname.replace(/^\//, "").replace(/\/$/, "");
    if ((request.method === "GET" || request.method === "HEAD") && BOARD_PAGE_SLUGS.has(boardSlug)) {
      const boardLanding = await boardLandingResponse(request, env, url, boardSlug);
      const promotedBoardLanding = semanticPromotionResponse(boardLanding, url, request.method);
      return edgeHtmlCacheStore(
        request,
        enhanceResponse(request, withTheme(request, promotedBoardLanding), env),
        ctx,
      );
    }
    const response = completenessPolicyHeaders(await baseWorker.fetch(request, env, ctx), url);
    const chapterResponse = chapterSolutionLinksResponse(response, url);
    const chapterExperienceResponse = await chapterPageExperienceResponse(
      chapterResponse,
      env,
      url,
      request.method,
    );
    const academicMetadataResponse = await academicSearchMetadataResponse(chapterExperienceResponse, env, url);
    const questionResponse = await questionMetadataResponse(academicMetadataResponse, env, url);
    const questionExperience = await questionPageExperienceResponse(questionResponse, env, url, request.method, routedQuestion);
    const indexingResponse = await questionCompletenessIndexingResponse(
      questionExperience.response,
      env,
      url,
      request.method,
      routedQuestion,
      questionExperience.ready,
    );
    const metadataResponse = streamNavigationMetadataResponse(indexingResponse, url);
    const promotedResponse = semanticPromotionResponse(metadataResponse, url, request.method);
    const cachePublicHtml = request.method === "GET" || request.method === "HEAD";
    return edgeHtmlCacheStore(
      request,
      enhanceResponse(request, withTheme(request, promotedResponse, cachePublicHtml), env),
      ctx,
      { allowNoindex: Boolean(routedQuestion) },
    );
  },
  async scheduled(controller, env, ctx) {
    if (typeof baseWorker.scheduled === "function") baseWorker.scheduled(controller, env, ctx);
    else ctx.waitUntil(cleanupPhase5ContactRequests(env));
    ctx.waitUntil(cleanupPhase6WebVitals(env));
    ctx.waitUntil(schedulePhase6WeeklyCrawl(controller, env));
  },
  async queue(batch, env) {
    await handlePhase6CrawlBatch(batch, env);
  },
};

export { DOQueueHandler };
export default afterWorker;
