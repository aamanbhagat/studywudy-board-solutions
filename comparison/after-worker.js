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

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const BOARD_PAGE_SLUGS = new Set(["maharashtra-board", "cbse", "cisce", "tamil-nadu-board"]);
const PHASE_2_VERSION = "20260819-clean-semantic-metadata-v10";
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
const METHODOLOGY_STYLES = '<style id="phase4-sitewide-methodology-style">.phase4-methodology-footer{border-top:1px solid #c9c1b3;background:#f5f0e6;color:#101316}.phase4-methodology-footer .shell{display:flex;justify-content:space-between;gap:1rem;padding-top:1.15rem;padding-bottom:1.15rem}.phase4-methodology-footer a{font-weight:750}@media(max-width:620px){.phase4-methodology-footer .shell{align-items:flex-start;flex-direction:column}}</style>';
const METHODOLOGY_FOOTER = '<footer class="phase4-methodology-footer"><div class="shell"><span>How we review solutions</span><a href="/about/methodology">Verification &amp; publishing methodology →</a></div></footer>';

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
  const result = await env.DB.prepare(`SELECT q.row_id, q.question_id, q.display_label, q.prompt_text,
    b.title AS book_title, c.number AS chapter_number, c.title AS chapter_title
    FROM catalog_questions q
    JOIN catalog_books b ON b.id = q.book_id
    JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
    WHERE b.board_slug = ? AND b.grade_slug = ? AND b.subject_slug = ? AND b.slug = ?
      AND q.chapter_slug = ? AND q.question_id = ? LIMIT 1`)
    .bind(route.board, route.grade, route.subject, route.book, route.chapter, route.question)
    .first();
  if (!result) return response;
  const disambiguate = QUESTION_SEO_DISAMBIGUATED_ROWS.has(Number(result.row_id));
  const socialTitle = questionSocialTitle(result, disambiguate);
  const documentTitle = questionDocumentTitle(result, disambiguate);
  const description = questionDescription(result, disambiguate);
  const promptOverride = questionPrompt(result) !== String(result.prompt_text || "").replace(/\s+/g, " ").trim()
    ? questionPrompt(result)
    : null;
  const answerOverride = questionAnswerOverride(result);
  const canonical = new URL(url);
  canonical.search = "";
  canonical.hash = "";
  if (/^(?:localhost|127\.0\.0\.1)$/.test(canonical.hostname)) {
    canonical.protocol = "https:";
    canonical.host = "studywudy-board-solutions.amanbhagat17089.workers.dev";
  }
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
        author: { "@type": "Organization", name: "StudyWudy", url: `${canonical.origin}/about/methodology` },
      },
    },
  }).replaceAll("<", "\\u003c") : null;
  const rewriter = new HTMLRewriter()
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
  if (overrideSchema) {
    rewriter
      .on("head", {
        element(element) {
          element.append(`<script type="application/ld+json" data-studywudy-question-override>${overrideSchema}</script>`, { html: true });
        },
      })
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
  return rewriter.transform(withTransformableHeaders(response));
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

function publicHtmlCacheAllowed(response) {
  const robots = response.headers.get("x-robots-tag") || "";
  const cloudflareCache = response.headers.get("cloudflare-cdn-cache-control") || "";
  return !robots.toLowerCase().includes("noindex") && !cloudflareCache.toLowerCase().includes("no-store");
}

function edgeHtmlCacheKey(request) {
  if (request.method !== "GET") return null;
  const accept = request.headers.get("accept") || "";
  if (!accept.includes("text/html")) return null;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname === "/search") return null;
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

function edgeHtmlCacheStore(request, response, ctx) {
  const key = edgeHtmlCacheKey(request);
  const contentType = response.headers.get("content-type") || "";
  const cacheControl = response.headers.get("cache-control") || "";
  if (!key || typeof caches === "undefined" || !response.ok
    || !contentType.includes("text/html") || !publicHtmlCacheAllowed(response)
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

function withTheme(request, response, addEdgeCacheFallback = false) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  const pathname = new URL(request.url).pathname.replace(/\/$/, "") || "/";
  const pathParts = pathname.split("/").filter(Boolean);
  const isHomepage = pathname === "/";
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
  const rewriter = new HTMLRewriter()
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
  return rewriter.transform(withTransformableHeaders(response, needsEdgeCache ? EDGE_HTML_CACHE : null));
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
  for (const book of booksResult.results || []) {
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
  return rewriter.transform(withTransformableHeaders(response, EDGE_HTML_CACHE));
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
      return edgeHtmlCacheStore(
        request,
        enhanceResponse(request, withTheme(request, classCatalogArtwork), env),
        ctx,
      );
    }
    const catalogArtwork = await catalogArtworkResponse(request, env, ctx, url);
    if (catalogArtwork) {
      return edgeHtmlCacheStore(
        request,
        enhanceResponse(request, withTheme(request, catalogArtwork), env),
        ctx,
      );
    }
    const boardSlug = url.pathname.replace(/^\//, "").replace(/\/$/, "");
    if ((request.method === "GET" || request.method === "HEAD") && BOARD_PAGE_SLUGS.has(boardSlug)) {
      return edgeHtmlCacheStore(
        request,
        enhanceResponse(request, withTheme(request, await boardLandingResponse(request, env, url, boardSlug)), env),
        ctx,
      );
    }
    const response = await baseWorker.fetch(request, env, ctx);
    const questionResponse = await questionMetadataResponse(response, env, url);
    const metadataResponse = streamNavigationMetadataResponse(questionResponse, url);
    const cachePublicHtml = request.method === "GET" || request.method === "HEAD";
    return edgeHtmlCacheStore(
      request,
      enhanceResponse(request, withTheme(request, metadataResponse, cachePublicHtml), env),
      ctx,
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
