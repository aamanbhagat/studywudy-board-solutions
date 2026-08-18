import baseWorker, { DOQueueHandler } from "../worker.js";
import { bookMatchesStream, streamsFor, streamLabel, subjectsFor } from "./stream-taxonomy.js";
import { BOOK_ARTWORK } from "./catalog-artwork-map.js";
import { CATALOG_ARTWORK_CSS } from "./catalog-artwork-inline.mjs";
import { quickFindAsyncAssets } from "./quick-find-critical.mjs";
import { THEME_CSS } from "./theme-inline.mjs";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const BOARD_PAGE_SLUGS = new Set(["maharashtra-board", "cbse", "cisce", "tamil-nadu-board"]);
const PHASE_2_VERSION = "20260818-phase2";
// The recovered RSC payload already references this opaque Next font URL. Its
// asset is replaced with IBM Plex Sans so the preload and CSS stay byte-identical.
const FONT_PRELOAD = "/_next/static/media/a343f882a40d2cc9-s.p.1sj6eobyi31rd.woff2";
const EDGE_HTML_CACHE = "public, max-age=0, s-maxage=3600, stale-while-revalidate=2592000";
const ARTWORK_STYLESHEET = `<style data-studywudy-catalog-artwork="inline">${CATALOG_ARTWORK_CSS}</style>`;
const ARTWORK_RUNTIME = `<script src="/catalog-artwork.js?v=${PHASE_2_VERSION}" defer data-studywudy-catalog-artwork="true"></script>`;
const THEME_BOOTSTRAP = '<script data-studywudy-theme="bootstrap">try{document.documentElement.dataset.theme=localStorage.getItem("studywudy-theme")==="dark"?"dark":"light"}catch{document.documentElement.dataset.theme="light"}</script>';
const THEME_ASSETS = `${THEME_BOOTSTRAP}<style data-studywudy-theme="inline">${THEME_CSS}</style><script src="/theme.js?v=${PHASE_2_VERSION}" defer data-studywudy-theme="true"></script>`;

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
        query = `SELECT slug AS id, title AS label,
          'Chapter ' || number || ' · ' || question_count || ' questions' AS meta
          FROM catalog_chapters WHERE book_id = ? ORDER BY position`;
        values = [book];
        break;
      case "questions": {
        if (!book || !chapter) return json({ error: "Textbook and chapter are required" }, 400);
        const like = `%${search}%`;
        query = `SELECT q.question_id AS id, q.display_label,
          q.type, q.prompt_text AS label,
          '/' || b.board_slug || '/' || b.grade_slug || '/' || b.subject_slug || '/' || b.slug ||
          '/' || q.chapter_slug || '/questions/' || q.question_id AS href
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
    const items = (result.results || []).map((item) => {
      if (step === "questions") return {
        ...item,
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

function subjectRoute(pathname) {
  const match = pathname.match(/^\/([^/]+)\/(class-\d+)\/([^/]+)\/?$/);
  if (!match || !BOARD_PAGE_SLUGS.has(match[1])) return null;
  return { board: match[1], grade: match[2], subject: match[3] };
}

function bookRoute(pathname) {
  const match = pathname.match(/^\/([^/]+)\/(class-\d+)\/([^/]+)\/([^/]+)\/?$/);
  if (!match || !BOARD_PAGE_SLUGS.has(match[1])) return null;
  return { board: match[1], grade: match[2], subject: match[3], book: match[4] };
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
  if (cacheControl) headers.set("cache-control", cacheControl);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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

function withTheme(response, addEdgeCacheFallback = false) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  let hasFontPreload = false;
  const rewriter = new HTMLRewriter()
    .on('link[rel="preload"][as="font"]', {
      element(element) {
        hasFontPreload = true;
        element.setAttribute("href", FONT_PRELOAD);
        element.setAttribute("type", "font/woff2");
        element.setAttribute("crossorigin", "");
      },
    })
    .on('link[href^="/quick-find.css"]', {
      element(element) {
        element.replace(quickFindAsyncAssets(`/quick-find.css?v=${PHASE_2_VERSION}`), { html: true });
      },
    })
    .on('script[src^="/quick-find.js"]', {
      element(element) {
        element.setAttribute("src", `/quick-find.js?v=${PHASE_2_VERSION}`);
        element.setAttribute("defer", "");
      },
    })
    .on("head", {
      element(element) {
        element.onEndTag((endTag) => {
          if (!hasFontPreload) {
            endTag.before(`<link rel="preload" href="${FONT_PRELOAD}" as="font" crossorigin="" type="font/woff2"/>`, { html: true });
          }
          endTag.before(THEME_ASSETS, { html: true });
        });
      },
    });
  const cacheControl = response.headers.get("cache-control") || "";
  const needsEdgeCache = addEdgeCacheFallback
    && response.ok
    && !cacheControl.includes("s-maxage=")
    && (!cacheControl || /private|no-store|must-revalidate/.test(cacheControl));
  return rewriter.transform(withTransformableHeaders(response, needsEdgeCache ? EDGE_HTML_CACHE : null));
}

function bookCoverMarkup(artwork, eager = false) {
  const src = artwork.src.replace(/\.jpg$/i, ".webp");
  return `<img class="catalog-real-book-cover" alt="${escapeHtmlAttribute(artwork.alt)}" decoding="async" fetchpriority="${eager ? "high" : "low"}" height="300" loading="${eager ? "eager" : "lazy"}" src="${escapeHtmlAttribute(src)}" width="216"/>`;
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
  books.forEach((book, index) => {
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
    const selector = `.book-card[data-book-slug="${escapeCssAttribute(book.slug)}"]`;
    if (allowedSlugs && !allowedSlugs.has(String(book.slug))) {
      rewriter.on(selector, {
        element(element) {
          element.remove();
        },
      });
      return;
    }
    rewriter.on(`${selector} .catalog-artwork-picture`, {
      element(element) {
        element.setInnerContent(bookCoverMarkup(artwork, index === 0), { html: true });
      },
    });
  });
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
  let allowedSlugs = null;
  if (subject && streamId) {
    const allowedBooks = books.filter((catalogBook) => bookMatchesStream({
      ...route,
      streamId,
      title: catalogBook.title,
    }));
    if (!allowedBooks.length) return response;
    allowedSlugs = new Set(allowedBooks.map((catalogBook) => String(catalogBook.slug)));
  }
  const pageConfig = {
    pathname: url.pathname,
    allowedSlugs: allowedSlugs ? [...allowedSlugs] : null,
    streamLabel: streamId ? streamLabel(route.board, route.grade, streamId) : null,
  };
  const rewriter = new HTMLRewriter().on("head", {
    element(element) {
      element.append(artworkHeadMarkup(pageConfig), { html: true });
    },
  });

  return rewriter.transform(withTransformableHeaders(response, streamId ? "no-store" : EDGE_HTML_CACHE));
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
  const rewriter = new HTMLRewriter()
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
  return rewriter.transform(withTransformableHeaders(response, EDGE_HTML_CACHE));
}

const afterWorker = {
  async fetch(request, env, ctx) {
    request = withoutConditionalHtmlValidators(request);
    const url = new URL(request.url);
    if (url.pathname === "/api/quick-find" && request.method === "GET") {
      return quickFind(request, env);
    }
    const boardsPage = await boardsPageResponse(request, env, ctx, url);
    if (boardsPage) return withTheme(boardsPage);
    const catalogArtwork = await catalogArtworkResponse(request, env, ctx, url);
    if (catalogArtwork) return withTheme(catalogArtwork);
    const boardSlug = url.pathname.replace(/^\//, "").replace(/\/$/, "");
    if ((request.method === "GET" || request.method === "HEAD") && BOARD_PAGE_SLUGS.has(boardSlug)) {
      return withTheme(await boardLandingResponse(request, env, url, boardSlug));
    }
    const response = await baseWorker.fetch(request, env, ctx);
    const cachePublicHtml = request.method === "GET" || request.method === "HEAD";
    return withTheme(response, cachePublicHtml);
  },
};

export { DOQueueHandler };
export default afterWorker;
