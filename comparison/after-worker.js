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
import { subjectAwareQuestionTypeLabel } from "../question-type-labels.mjs";
import { isQuestionEquationReviewPending, isQuestionRenderedDiagramAvailable } from "../answer-completeness.mjs";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import { QUESTION_PAYLOAD_ASSET_MANIFEST } from "../question-payload-assets-manifest.mjs";
import {
  isQuestionPubliclyEligible,
  PUBLIC_QUESTION_ELIGIBILITY_POLICY_VERSION,
} from "../public-question-eligibility.mjs";
import {
  buildQuestionPageExperience,
  conciseDirectAnswer,
  findQuestionPageContext,
  QUESTION_PAGE_EXPERIENCE_STYLES,
  QUESTION_PAGE_THEME_ALIGNMENT_STYLES,
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
  buildCanonicalFormulaLookup,
  canonicalFormulaForLegacyLabel,
  evaluateQuestionFormulaAccessibility,
  formulaRepresentations,
  invalidRenderedMathFound,
  repairCrawlerFormulaSource,
  repairMalformedFormulaText,
  renderMathText,
  renderSemanticMath,
  SEMANTIC_MATH_STYLES,
  validateFormulaStructure,
} from "../semantic-math.mjs";
import { STUDY_CLUSTER_BASE } from "../study-cluster.mjs";
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
  languageForBookId,
  localizationForPathname,
  repairKnownText,
  repairKnownTextEverywhere,
  reviewedBookTitle,
  reviewedChapterTitle,
} from "../multilingual-text-quality.mjs";
import {
  BOARD_HUB_SSR_RELEASE,
  CBSE_SERVER_BOARD_VALUE,
  CBSE_SERVER_CLASS_NAVIGATION,
  CBSE_SERVER_RENDERED_STYLES,
} from "../board-landing-ssr.mjs";
import {
  createPlainSearchText,
  evaluateSearchExcerptSource,
  SEARCH_EXCERPT_RELEASE,
  truncateSearchExcerpt,
} from "../search-excerpt.mjs";
import {
  buildQuestionSearchPlan,
  DIAGRAM_EVIDENCE_SQL,
  parseQuestionSearchCriteria,
  questionHasNumericalEvidence,
  questionSearchHeading,
  renderActiveSearchFilterInputs,
  renderPopularQuestionFilters,
  SEARCH_FILTER_RELEASE,
  normalizedQuestionType,
} from "../question-search.mjs";
import {
  QUESTION_SHOWCASE_ENTRIES,
  QUESTION_SHOWCASE_SOURCE_GATE,
} from "../question-showcase-manifest.mjs";
import {
  PUBLIC_BRAND_HYGIENE_RELEASE,
  PUBLIC_BRAND_REPLACEMENT,
  publicDocumentUrl,
  repairPublicBrandCopy,
  rewritePublicAssetPath,
  rewritePublicInfrastructureOrigin,
  rewritePublicMetadataValue,
} from "../public-brand-hygiene.mjs";
import { ACCESSIBILITY_TEXT_RELEASE } from "../accessibility-text.mjs";
import {
  isLocalLaunchHotPathBuildRequest,
  LAUNCH_HOT_PATH_RELEASE,
  launchHotPathDocument,
} from "../launch-hot-path.mjs";
import { filterStaticSearchEligibility } from "../static-search-eligibility.mjs";
import {
  HOMEPAGE_DOCUMENT_TITLE,
  PUBLIC_TITLE_QUALITY_RELEASE,
} from "../public-title-quality.mjs";
import {
  corpusQuestionIndexEligible,
  corpusQuestionSearchEligible,
  CORPUS_QUALITY_POLICY_VERSION,
} from "../corpus-quality.mjs";
import {
  CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS,
} from "../corpus-quality-manifest.mjs";
import {
  PUBLIC_HTML_CACHE_CONTROL,
  RENDER_CONSISTENCY_RELEASE,
} from "../render-consistency.mjs";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const BOARD_PAGE_SLUGS = new Set(["maharashtra-board", "cbse", "cisce", "tamil-nadu-board"]);
const PHASE_2_VERSION = "20260824-related-questions-v93";
const STATIC_CORPUS_PAGE_ASSETS = Object.freeze({
  "/cbse/class-10/mathematics/ncert-exemplar-mathematics-exemplar-class-10/quadatric-euation": "/pages/corpus-quality/quadratic-equations/",
  "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/electric-field-and-potential/questions/q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-29-031": "/pages/corpus-quality/source-review-61425/",
  "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/friction/questions/q-cbse-hc-verma-concepts-of-physics-volume-1-and-2-class-12-6-052": "/pages/corpus-quality/source-review-59639/",
  "/cisce/class-10/mathematics/frank-mathematics-part-2-class-10/problems-based-on-quadratic-equations/questions/q-cisce-frank-mathematics-part-2-class-10-6-042": "/pages/corpus-quality/source-review-127683/",
  "/cbse/class-1/mathematics/ncert-math-magic-class-1/money/questions/q-cbse-ncert-math-magic-class-1-12-001": "/pages/corpus-quality/source-review-998/",
  "/cbse/class-12/chemistry/ncert-exemplar-chemistry-exemplar-class-12/solid-states": "/pages/corpus-quality/chapter-solid-states/",
  "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/electric-field-and-potential": "/pages/corpus-quality/chapter-electric-field-and-potential/",
  "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/friction": "/pages/corpus-quality/chapter-friction/",
  "/cbse/class-12/physics/hc-verma-concepts-of-physics-volume-1-and-2-class-12/gausss-law": "/pages/corpus-quality/chapter-gausss-law/",
});
const STATIC_STUDY_CLUSTER_SUFFIXES = new Set([
  "study",
  "revision",
  "important-questions",
  "practice",
  "answer-writing",
  "concepts/coulombs-law",
  "concepts/electric-potential",
  "concepts/gauss-law",
  "concepts/parallel-plate-capacitance",
  "concepts/capacitors-in-series",
  "concepts/capacitors-in-parallel",
  "concepts/dielectric-slab-in-capacitor",
  "concepts/energy-stored-in-capacitor",
  "previous-year-questions",
]);
const MAX_BOOK_COMPRESSED_BYTES = 4 * 1024 * 1024;
const MAX_BOOK_JSON_CHARACTERS = 20 * 1024 * 1024;
const MAX_QUESTION_INDEX_BYTES = 4 * 1024 * 1024;
const MAX_QUESTION_COMPRESSED_BYTES = 512 * 1024;
const MAX_QUESTION_JSON_CHARACTERS = 4 * 1024 * 1024;
const INFLIGHT_BOOK_PAYLOADS = new Map();
const INFLIGHT_CHAPTER_PAYLOADS = new Map();
const QUESTION_PAYLOAD_ASSET_BOOK_IDS = new Set(QUESTION_PAYLOAD_ASSET_MANIFEST.bookIds);
const BOARD_METADATA_LABELS = Object.freeze({
  "maharashtra-board": "Maharashtra State Board",
  cbse: "CBSE",
  cisce: "CISCE",
  "tamil-nadu-board": "Tamil Nadu",
});
const BOARD_BADGE_LABELS = Object.freeze({
  "maharashtra-board": Object.freeze({ region: "Maharashtra", badge: "Maharashtra" }),
  cbse: Object.freeze({ region: "India", badge: "CBSE" }),
  cisce: Object.freeze({ region: "India", badge: "ICSE / ISC" }),
  "tamil-nadu-board": Object.freeze({ region: "Tamil Nadu", badge: "Tamil Nadu" }),
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
// Browsers must revalidate transformed HTML on every navigation. The Worker's
// versioned Cache API key still supplies the one-hour shared edge cache.
const EDGE_HTML_CACHE = PUBLIC_HTML_CACHE_CONTROL;
const DECORATIVE_TEXT_STYLES = '<style data-studywudy-decorative-text="pseudo-v3">.brand-mark::before{content:"S"}.board-card-meta [data-label]::before{content:attr(data-label)}</style>';
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
  const normalizedType = normalizedQuestionType(row);
  const type = subjectAwareQuestionTypeLabel(
    normalizedType,
    row.subject_slug,
    QUESTION_TYPE_LABELS[normalizedType] || "Answer",
  );
  const tags = decodeConceptTags(row.concept_tags)
    .map((tag) => repairKnownText(row.book_id, tag.replaceAll("-", " ")))
    .slice(0, 4);
  const context = [
    reviewedBookTitle(row.book_id, repairKnownText(row.book_id, row.book_title)),
    reviewedChapterTitle(row.book_id, row.chapter_slug, repairKnownText(row.book_id, row.chapter_title)),
    ...tags,
  ].filter(Boolean).join(" · ");
  const plainPrompt = createPlainSearchText(repairKnownText(row.book_id, row.prompt_text));
  const prompt = truncateSearchExcerpt(plainPrompt);
  const anchorVerb = normalizedType === "numerical" ? "Calculate"
    : /derive|prove|show that/iu.test(prompt) ? "Derive"
      : normalizedType === "mcq_single" ? "Test your understanding of"
        : "Explain";
  const anchorSubject = truncateSearchExcerpt(
    plainPrompt.replace(/^(?:choose the correct(?: option)?|calculate|derive|explain|find)\s*:?\s*/iu, ""),
    110,
  );
  const descriptiveAnchor = `${anchorVerb} ${anchorSubject.charAt(0).toLocaleLowerCase("en-IN")}${anchorSubject.slice(1)}`;
  const priority = Number.isFinite(Number(row.search_priority)) ? Number(row.search_priority) : 9;
  const showcase = row.showcase || null;
  const language = showcase?.language || languageForBookId(row.book_id) || "en";
  const hasDiagram = Boolean(row.has_rendered_diagram ?? showcase?.hasDiagram);
  const verification = showcase
    ? ` data-showcase-quality-screened="true" data-internal-mapping-consistent="${showcase.internalMappingConsistent}" data-authoritative-textbook-mapping-verified="${showcase.authoritativeTextbookMappingVerified}" data-known-authoritative-mapping-mismatch="${showcase.knownAuthoritativeMappingMismatch}" data-native-script-validation-passed="${showcase.nativeScriptValidationPassed}" data-search-excerpt-clean="${showcase.searchExcerptClean}" data-automated-gate-passed="${showcase.automatedGatePassed}" data-final-publishing-gate-passed="${showcase.finalPublishingGatePassed !== false}" data-unresolved-content="${showcase.unresolvedContent}" data-broken-media="${showcase.brokenMedia}" data-duplicate-options="${showcase.duplicateOptions}" data-runtime-payload-safe="${showcase.runtimePayloadSafe}" data-content-quality-passed="${showcase.contentQualityPassed}"`
    : "";
  return `<a href="${escapeHtmlAttribute(href)}" data-question-row-id="${Number(row.row_id)}" data-question-id="${escapeHtmlAttribute(row.question_id)}" data-question-type="${escapeHtmlAttribute(normalizedType)}" data-question-board="${escapeHtmlAttribute(row.board_slug)}" data-question-class="${escapeHtmlAttribute(row.grade_slug)}" data-question-subject="${escapeHtmlAttribute(row.subject_slug)}" data-question-book="${escapeHtmlAttribute(row.book_id)}" data-question-language="${escapeHtmlAttribute(language)}" data-has-diagram="${hasDiagram ? "true" : "false"}" data-public-search-eligible="true" data-search-priority="${priority}" data-search-match="${escapeHtmlAttribute(row.search_match || "sample")}"${verification}><div><span>Question ${escapeHtmlAttribute(row.display_label)}</span><i>${escapeHtmlAttribute(type)}</i></div><h2 data-search-excerpt="plain-v2">${escapeHtmlAttribute(prompt)}</h2><p>${escapeHtmlAttribute(context)}</p><b data-search-description="plain-v2">${escapeHtmlAttribute(descriptiveAnchor)} →</b></a>`;
}

async function searchQuestionRows(env, criteria) {
  const projection = `SELECT q.row_id, q.question_id, q.display_label, q.type, q.prompt_text, q.concept_tags,
    b.id AS book_id,
    b.board_slug, b.grade_slug, b.subject_slug, b.slug AS book_slug, b.title AS book_title,
    q.chapter_slug, c.title AS chapter_title`;
  if (criteria.hasCriteria) {
    const plan = buildQuestionSearchPlan(criteria, projection);
    return env.DB.prepare(plan.sql).bind(...plan.bindings).all();
  }
  for (const entry of QUESTION_SHOWCASE_ENTRIES) {
    if (!isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, entry.rowId, {
      authoritativeMappingConflict: entry.knownAuthoritativeMappingMismatch,
      unresolvedContent: entry.unresolvedContent,
    })) throw new Error(`Verified showcase record failed the final publishing gate: ${entry.questionId}`);
  }
  const statements = QUESTION_SHOWCASE_ENTRIES.map((entry) => env.DB.prepare(`${projection}
      FROM catalog_questions q
      JOIN catalog_books b ON b.id = q.book_id
      JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
      WHERE q.row_id = ?
      LIMIT 1`).bind(entry.rowId));
  const batches = await env.DB.batch(statements);
  const results = batches.map((batch, index) => {
    const entry = QUESTION_SHOWCASE_ENTRIES[index];
    const rows = batch.results || [];
    if (rows.length !== 1 || Number(rows[0].row_id) !== entry.rowId || rows[0].question_id !== entry.questionId) {
      throw new Error(`Verified showcase record is missing or stale: ${entry.questionId}`);
    }
    return {
      ...rows[0],
      has_diagram: entry.hasDiagram ? 1 : 0,
      has_rendered_diagram: isQuestionRenderedDiagramAvailable(PHASE4_GATE_MANIFEST, entry.rowId),
      search_priority: 9,
      text_priority: 9,
      search_match: "quality-screened-showcase",
      showcase: entry,
    };
  });
  return { results };
}

async function searchQuestionBankResponse(request, env, ctx, url) {
  if (request.method !== "GET" || url.pathname.replace(/\/+$/u, "") !== "/search") return null;
  const criteria = parseQuestionSearchCriteria(url.searchParams);
  if (criteria.errors.length) {
    return new Response(`Unsupported search filter: ${criteria.errors.join(", ")}`, {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  let response;
  let result;
  try {
    const shellUrl = new URL("/pages/search/", url);
    [response, result] = await Promise.all([
      env.ASSETS.fetch(new Request(shellUrl, request)),
      searchQuestionRows(env, criteria),
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
  const rows = (result.results || []).map((row) => ({
    ...row,
    has_rendered_diagram: isQuestionRenderedDiagramAvailable(PHASE4_GATE_MANIFEST, Number(row.row_id)),
  })).filter((row) => !isBookQuarantined(row.book_id)
    && isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, Number(row.row_id), {
      requiresDiagram: criteria.hasDiagram === true,
      hasRenderedDiagram: Boolean(row.has_rendered_diagram),
    })
    && corpusQuestionSearchEligible(row, CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS)
    && evaluateSearchExcerptSource(row.prompt_text).pass
    && (criteria.type !== "numerical" || questionHasNumericalEvidence(row))
    && (criteria.hasDiagram == null || Boolean(row.has_rendered_diagram) === criteria.hasDiagram))
    .slice(0, 50);
  const cards = rows.length
    ? rows.map(searchQuestionCardMarkup).join("")
    : '<div class="empty-state"><span>⌕</span><div><h2>No exact match yet.</h2><p>Try a shorter concept name, question type or chapter topic.</p><a href="/search">Clear search →</a></div></div>';
  const classifiedDefectQuery = /^(?:positvely|rfrom|bye\s+the|I\s+mm|4_\{0\}|k_\{0\})$/iu.test(criteria.query.trim());
  const heading = classifiedDefectQuery
    ? (rows.length ? "Eligible results for this search" : "No eligible results for these filters")
    : rows.length || !criteria.hasCriteria
      ? questionSearchHeading(criteria)
      : "No eligible results for these filters";
  const transformed = new HTMLRewriter()
    .on(".search-form input[name='q']", {
      element(element) {
        element.setAttribute("value", criteria.query);
      },
    })
    .on(".search-form", {
      element(element) {
        const inputs = renderActiveSearchFilterInputs(criteria);
        if (inputs) element.append(inputs, { html: true });
      },
    })
    .on(".search-suggestions", {
      element(element) {
        element.setInnerContent(renderPopularQuestionFilters(criteria), { html: true });
      },
    })
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
    .on(".section-mini-heading > p", {
      element(element) {
        if (!criteria.hasCriteria) element.setInnerContent("16 quality-screened questions across boards, classes, subjects, languages and formats.");
        else element.setInnerContent(`${rows.length} eligible ${rows.length === 1 ? "match is" : "matches are"} rendered below.`);
      },
    })
    .on(".search-result-list", {
      element(element) {
        element.setAttribute("data-search-result-count", String(rows.length));
        element.setInnerContent(cards, { html: true });
      },
    })
    .transform(withTransformableHeaders(response, criteria.hasCriteria ? "no-store" : EDGE_HTML_CACHE));
  const headers = new Headers(transformed.headers);
  headers.set("x-studywudy-search-excerpt", SEARCH_EXCERPT_RELEASE);
  headers.set("x-studywudy-search-filter", SEARCH_FILTER_RELEASE);
  headers.set("x-studywudy-corpus-quality", CORPUS_QUALITY_POLICY_VERSION);
  if (!criteria.hasCriteria) headers.set("x-studywudy-question-showcase", QUESTION_SHOWCASE_SOURCE_GATE.policyVersion);
  return new Response(transformed.body, {
    status: transformed.status,
    statusText: transformed.statusText,
    headers,
  });
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

async function questionRouteRowId(env, route) {
  if (!env.DB || !route) return null;
  return env.DB.prepare(`SELECT q.row_id FROM catalog_questions q
    JOIN catalog_books b ON b.id = q.book_id
    WHERE b.board_slug = ? AND b.grade_slug = ? AND b.subject_slug = ? AND b.slug = ?
      AND q.chapter_slug = ? AND q.question_id = ? LIMIT 1`)
    .bind(route.board, route.grade, route.subject, route.book, route.chapter, route.question)
    .first();
}

async function questionEligibilityHeadResponse(request, env, route) {
  if (request.method !== "HEAD" || !route) return null;
  let row = null;
  try {
    row = await questionRouteRowId(env, route);
  } catch (error) {
    console.error(JSON.stringify({
      message: "question HEAD eligibility unavailable",
      path: new URL(request.url).pathname,
      error: error instanceof Error ? error.message : String(error),
    }));
    return new Response(null, {
      status: 503,
      headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (!row) return null;
  const rowId = Number(row.row_id);
  const indexable = isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, rowId)
    && corpusQuestionIndexEligible({
      questionId: route.question,
      rowId,
      duplicateRowIds: CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS,
    });
  const headers = new Headers({
    "cache-control": indexable ? EDGE_HTML_CACHE : "no-store",
    "content-type": "text/html; charset=utf-8",
    "x-robots-tag": indexable
      ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
      : "noindex, follow",
    "x-studywudy-breadcrumbs": "canonical-v1",
    "x-studywudy-corpus-quality": CORPUS_QUALITY_POLICY_VERSION,
    "x-studywudy-public-eligibility": PUBLIC_QUESTION_ELIGIBILITY_POLICY_VERSION,
    "x-studywudy-publish-gate": `${PHASE4_GATE_MANIFEST.policyVersion}; ${indexable ? "complete" : "review-required"}`,
    "x-studywudy-question-experience": indexable ? "question-specific-trust-v2" : "review-required",
    "x-studywudy-search-metadata": "catalog-data-v1",
    "x-studywudy-semantic-math": "ast-mathml-authoritative-v7-geometry-symbols",
  });
  return new Response(null, { status: 200, headers });
}

function catalogBlobBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Uint8Array) return value;
  return Uint8Array.from(value || []);
}

async function loadCatalogBookPayload(env, bookId) {
  if (!env.DB) return null;
  const existing = INFLIGHT_BOOK_PAYLOADS.get(bookId);
  if (existing) return existing;
  const pending = (async () => {
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
    const decompressed = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    const json = await new Response(decompressed).text();
    if (json.length > MAX_BOOK_JSON_CHARACTERS) throw new Error("Textbook payload exceeds the bounded decoded size");
    return applyKnownPayloadRepairs(bookId, JSON.parse(json));
  })();
  INFLIGHT_BOOK_PAYLOADS.set(bookId, pending);
  try {
    return await pending;
  } finally {
    if (INFLIGHT_BOOK_PAYLOADS.get(bookId) === pending) INFLIGHT_BOOK_PAYLOADS.delete(bookId);
  }
}

function packedQuestionRange(indexBytes, rowId) {
  if (indexBytes.byteLength < 12 || indexBytes.byteLength > MAX_QUESTION_INDEX_BYTES) {
    throw new Error("Question payload index exceeds the size bound");
  }
  const bytes = new Uint8Array(indexBytes);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== "SWQP") throw new Error("Question payload index has an invalid signature");
  const view = new DataView(indexBytes);
  if (view.getUint32(4, true) !== 1) throw new Error("Question payload index has an unsupported version");
  const count = view.getUint32(8, true);
  if (indexBytes.byteLength !== 12 + count * 12) throw new Error("Question payload index has an invalid length");
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const recordOffset = 12 + middle * 12;
    const candidate = view.getUint32(recordOffset, true);
    if (candidate === rowId) {
      return {
        offset: view.getUint32(recordOffset + 4, true),
        length: view.getUint32(recordOffset + 8, true),
      };
    }
    if (candidate < rowId) low = middle + 1;
    else high = middle - 1;
  }
  return null;
}

async function loadCatalogQuestionPayload(env, bookId, chapterSlug, rowId) {
  if (!QUESTION_PAYLOAD_ASSET_BOOK_IDS.has(bookId)) return loadCatalogBookPayload(env, bookId);
  if (!env.ASSETS) throw new Error("Bounded question payload assets binding is unavailable");
  const key = `${bookId}:${chapterSlug}:${rowId}`;
  const existing = INFLIGHT_CHAPTER_PAYLOADS.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const bookRoute = String(bookId).split("::");
    if (bookRoute.length !== 4) throw new Error("Invalid textbook identifier for bounded question payload");
    const basePath = `/__studywudy_payloads/${[...bookRoute, chapterSlug].map(encodeURIComponent).join("/")}`;
    const indexAsset = await env.ASSETS.fetch(new URL(`${basePath}.idx`, "https://assets.local"));
    if (!indexAsset.ok) throw new Error(`Bounded question payload index returned ${indexAsset.status}`);
    const range = packedQuestionRange(await indexAsset.arrayBuffer(), Number(rowId));
    if (!range?.length || range.length > MAX_QUESTION_COMPRESSED_BYTES) {
      throw new Error("Bounded question payload is missing or exceeds the compressed size limit");
    }
    const packRequest = new Request(new URL(`${basePath}.pack`, "https://assets.local"), {
      headers: { range: `bytes=${range.offset}-${range.offset + range.length - 1}` },
    });
    const packAsset = await env.ASSETS.fetch(packRequest);
    if (!packAsset.ok) throw new Error(`Bounded question payload pack returned ${packAsset.status}`);
    const packed = new Uint8Array(await packAsset.arrayBuffer());
    const compressed = packAsset.status === 206
      ? packed
      : packed.subarray(range.offset, range.offset + range.length);
    if (compressed.byteLength !== range.length) throw new Error("Bounded question payload range is incomplete");
    const decompressed = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    const json = await new Response(decompressed).text();
    if (json.length > MAX_QUESTION_JSON_CHARACTERS) {
      throw new Error("Bounded question payload exceeds the decoded size limit");
    }
    return applyKnownPayloadRepairs(bookId, JSON.parse(json));
  })();
  INFLIGHT_CHAPTER_PAYLOADS.set(key, pending);
  try {
    return await pending;
  } finally {
    if (INFLIGHT_CHAPTER_PAYLOADS.get(key) === pending) INFLIGHT_CHAPTER_PAYLOADS.delete(key);
  }
}

async function questionPageCatalogRecord(env, route) {
  if (!env.DB) return null;
  const row = await env.DB.prepare(`SELECT q.row_id, q.book_id, q.question_id, q.display_label, q.type,
    q.prompt_text, q.concept_tags, q.chapter_slug,
    b.title AS book_title, bo.name AS board_name, bo.short_name AS board_short_name,
    b.slug AS book_slug, b.board_slug, b.grade_slug, b.subject_slug,
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
  row.prompt_text = repairKnownText(row.book_id, row.prompt_text);
  return row;
}

function standaloneQuestionInline(value, bookId) {
  const source = repairKnownText(bookId, String(value ?? ""))
    .replace(/<br\s*\/?\s*>/giu, "\n");
  return renderMathText(source)
    .replace(/\*\*([\s\S]+?)\*\*/gu, "<strong>$1</strong>")
    .replace(/__([\s\S]+?)__/gu, "<strong>$1</strong>")
    .replace(/\n/gu, "<br>");
}

function standaloneQuestionContent(value, bookId) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return `<p>${standaloneQuestionInline(value, bookId)}</p>`;
  }
  if (Array.isArray(value)) return value.map((item) => standaloneQuestionContent(item, bookId)).join("");
  if (value.kind === "blocks" || Array.isArray(value.blocks)) {
    return (value.blocks || []).map((block) => standaloneQuestionContent(block, bookId)).join("");
  }
  if (value.kind === "paragraph" || typeof value.text === "string") {
    return `<p>${standaloneQuestionInline(value.text, bookId)}</p>`;
  }
  if (value.kind === "list" || Array.isArray(value.items)) {
    const tag = value.style === "ordered" ? "ol" : "ul";
    return `<${tag}>${(value.items || []).map((item) => `<li>${typeof item === "object" ? standaloneQuestionContent(item, bookId) : standaloneQuestionInline(item, bookId)}</li>`).join("")}</${tag}>`;
  }
  if (value.kind === "table" || Array.isArray(value.rows)) {
    const headers = (value.headers || []).map((cell) => `<th scope="col">${standaloneQuestionInline(cell, bookId)}</th>`).join("");
    const rows = (value.rows || []).map((row) => `<tr>${(Array.isArray(row) ? row : Object.values(row || {})).map((cell) => `<td>${standaloneQuestionInline(cell, bookId)}</td>`).join("")}</tr>`).join("");
    return `<div class="question-table-scroll"><table>${headers ? `<thead><tr>${headers}</tr></thead>` : ""}<tbody>${rows}</tbody></table></div>`;
  }
  if (value.kind === "code" && typeof value.code === "string") {
    return `<p class="question-source-note">${standaloneQuestionInline(value.code, bookId)}</p>`;
  }
  return `<p>${standaloneQuestionInline(JSON.stringify(value), bookId)}</p>`;
}

function standaloneMediaUrl(value) {
  const source = rewritePublicAssetPath(String(value || ""));
  const prefix = "/api/generated-preview/media/";
  return source.startsWith(prefix) ? `/studywudy-media/${source.slice(prefix.length)}.webp` : source;
}

function standaloneQuestionMedia(items, label, bookId) {
  const media = (items || []).map((item, index) => {
    const alt = String(item?.alt || "").trim().toLocaleLowerCase("en-IN") === "image"
      ? `${label} illustration`
      : String(item?.alt || `${label} illustration`);
    const caption = String(item?.caption || "").trim();
    return `<figure><img alt="${escapeHtmlAttribute(alt)}" decoding="async" height="${Number(item?.height) || 640}" loading="lazy" src="${escapeHtmlAttribute(standaloneMediaUrl(item?.url || item?.fallbackUrl))}" width="${Number(item?.width) || 960}">${caption ? `<figcaption>${standaloneQuestionInline(caption, bookId)}</figcaption>` : ""}</figure>`;
  }).join("");
  return media ? `<div class="question-media-gallery">${media}</div>` : "";
}

function standaloneQuestionChoices(question, bookId) {
  if (!question?.choices?.length) return "";
  const correctIds = new Set(question.correctChoiceIds || (question.correctChoiceId ? [question.correctChoiceId] : []));
  return `<ol class="question-choice-list choice-list">${question.choices.map((choice) => `<li${correctIds.has(choice.id) ? ' class="is-correct"' : ""}><b class="choice-marker">${escapeHtmlAttribute(String(choice.id || "").toUpperCase())}</b><span class="choice-copy">${standaloneQuestionInline(choice.content, bookId)}</span>${correctIds.has(choice.id) ? '<small class="choice-correct-label">Correct option</small>' : ""}</li>`).join("")}</ol>`;
}

function standaloneQuestionSolution(question, bookId) {
  const parts = [];
  if (question.answer != null) parts.push(`<section><h3>Answer</h3>${standaloneQuestionContent(question.answer, bookId)}</section>`);
  if (question.answers?.length) parts.push(`<section><h3>Answers</h3>${standaloneQuestionContent({ kind: "list", items: question.answers }, bookId)}</section>`);
  if (question.explanation != null) parts.push(`<section><h3>Explanation</h3>${standaloneQuestionContent(question.explanation, bookId)}</section>`);
  if (question.steps?.length) {
    parts.push(`<section><h3>Step-by-step solution</h3><ol class="question-step-list solution-steps">${question.steps.map((step, index) => `<li><span class="sr-only">Step ${index + 1}</span>${standaloneQuestionContent(step.content, bookId)}</li>`).join("")}</ol></section>`);
  }
  if (question.comparison != null) parts.push(`<section><h3>Comparison</h3>${standaloneQuestionContent(question.comparison, bookId)}</section>`);
  if (question.matches?.length) parts.push(`<section><h3>Matches</h3>${standaloneQuestionContent(question.matches, bookId)}</section>`);
  if (question.blanks?.length) parts.push(`<section><h3>Completed blanks</h3>${standaloneQuestionContent(question.blanks.map((blank) => blank.answer ?? blank), bookId)}</section>`);
  const finalAnswer = questionAnswerOverride({ question_id: question.id }) || question.finalAnswer;
  if (finalAnswer != null) parts.push(`<section class="final-answer"><h3>Final answer</h3>${standaloneQuestionContent(finalAnswer, bookId)}</section>`);
  if (!parts.length) parts.push(`<section><h3>Direct answer</h3><p>${standaloneQuestionInline(conciseDirectAnswer(question), bookId)}</p></section>`);
  return parts.join("");
}

const STUDYWUDY_QUESTION_THEME_ASSETS = `<link rel="preload" href="/_next/static/media/a343f882a40d2cc9-s.p.1sj6eobyi31rd.woff2" as="font" crossorigin type="font/woff2"><link rel="stylesheet" href="/_next/static/chunks/1j8ahw0e9ui5v.css"><link rel="stylesheet" href="/_next/static/chunks/3c4-ozf1dxam2.css"><link rel="stylesheet" href="/_next/static/chunks/3utpp1hmg6_bb.css"><link rel="stylesheet" href="/_next/static/chunks/0u6271lmf-stj.css">`;

const STANDALONE_QUESTION_STYLES = `<style data-studywudy-question-render="canonical-single-pass-v2-themed">
.standalone-question-page .answer-page-main{min-width:0}.standalone-question-page .question-card{overflow:visible}.standalone-question-page .question-prompt>.rich-copy{display:grid;gap:.6rem}.standalone-question-page .question-prompt>.rich-copy>p{margin:0}.standalone-question-page .question-media-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:18px}.standalone-question-page .question-media-gallery figure{margin:0}.standalone-question-page .question-media-gallery img{display:block;width:100%;height:auto;border:2px solid var(--ink);border-radius:4px;background:#fff;box-shadow:4px 5px 0 var(--ink)}.standalone-question-page .question-media-gallery figcaption{margin-top:9px;color:var(--ink-soft);font-size:.75rem;font-weight:700}.standalone-question-page .question-choice-list{margin:18px 0 0;padding:0}.standalone-question-page .question-choice-list li{list-style:none}.standalone-question-page .solution-body>section{padding:18px 0;border-top:1px dashed #10131661}.standalone-question-page .solution-body>section:first-of-type{border-top:0}.standalone-question-page .solution-body>section>h3{margin:0 0 10px;font-size:1rem;font-weight:950}.standalone-question-page .solution-body>section>p,.standalone-question-page .solution-body>section>.rich-copy p{margin:.45rem 0}.standalone-question-page .solution-steps>li>span.sr-only{position:absolute}.standalone-question-page .question-table-scroll{max-width:100%;overflow-x:auto;border:2px solid var(--ink);box-shadow:4px 5px 0 var(--ink)}.standalone-question-page .question-table-scroll table{width:100%;min-width:560px;border-collapse:collapse;background:var(--white)}.standalone-question-page .question-table-scroll th,.standalone-question-page .question-table-scroll td{padding:11px 13px;border:1px solid var(--ink);text-align:left}.standalone-question-page .question-table-scroll th{background:var(--violet);color:#fff}.standalone-question-page .phase4-review-signal{margin:22px 0;border:3px solid var(--ink);border-left:9px solid var(--mint);border-radius:5px;background:var(--white);box-shadow:5px 6px 0 var(--ink)}.standalone-question-page .phase4-review-signal.is-pending{border-left-color:var(--gold)}.standalone-question-page .question-source-note{padding:12px;border:2px solid var(--ink);background:var(--gold-soft)}.standalone-question-page .question-trust-panel,.standalone-question-page .question-answer-summary,.standalone-question-page .question-specific-panel,.standalone-question-page .question-exercise-card{border-color:var(--ink);border-radius:5px;box-shadow:4px 5px 0 var(--ink)}.standalone-question-page .question-answer-summary{background:var(--white)}.standalone-question-page .question-answer-summary ol li{border-color:var(--ink);border-radius:3px;background:var(--gold-soft)}.standalone-question-page .question-answer-label,.standalone-question-page .question-specific-panel>span,.standalone-question-page .question-exercise-related header>span,.standalone-question-page .question-solution-overview>span{color:var(--violet)}.standalone-question-page .question-solution-overview{border:2px solid var(--ink);border-radius:4px;background:var(--paper-deep)}.standalone-question-page .question-solution-overview li{border:1px solid var(--ink);border-radius:3px}.standalone-question-page .question-specific-panel{background:var(--white)}.standalone-question-page .question-trust-panel{border-left-width:9px;background:var(--paper-deep)}.standalone-question-page .question-trust-row,.standalone-question-page .question-human-review,.standalone-question-page .question-report-error{border-color:var(--ink);border-radius:3px}.standalone-question-page .question-exercise-card{transition:transform .16s,box-shadow .16s}.standalone-question-page .question-exercise-card:hover{box-shadow:2px 3px 0 var(--ink);transform:translate(2px,2px)}.standalone-question-page .answer-page-chapter span{margin-right:10px}.standalone-question-page .answer-context dl{margin:0}.standalone-question-page .answer-context dl div{padding:9px 0}.standalone-question-page .answer-context dt{color:var(--ink-soft);font-size:.65rem;font-weight:800;text-transform:uppercase}.standalone-question-page .answer-context dd{margin:2px 0 0;font-weight:850}.standalone-question-page .footer-nav{grid-template-columns:repeat(3,minmax(0,1fr))}.standalone-question-page .phase5-native-links{display:grid;align-content:start;gap:8px}.standalone-question-page .footer-intro h2{color:#fff}.standalone-question-page .footer-banner strong{color:var(--ink)}
@media(max-width:780px){.standalone-question-page .question-media-gallery{grid-template-columns:1fr}.standalone-question-page .answer-page-layout{display:block}.standalone-question-page .question-chapter-rail,.standalone-question-page .answer-context{display:none}.standalone-question-page .footer-nav{grid-template-columns:1fr 1fr}}
@media(max-width:540px){.standalone-question-page .question-answer-summary{box-shadow:3px 4px 0 var(--ink);padding:14px 12px}.standalone-question-page .question-trust-panel{box-shadow:3px 4px 0 var(--ink);padding:14px 12px}.standalone-question-page .footer-nav{grid-template-columns:1fr}}
</style>${QUESTION_PAGE_THEME_ALIGNMENT_STYLES}`;

function standaloneQuestionBreadcrumbs(row, route) {
  const items = [
    ["Home", "/"],
    [row.board_short_name || row.board_name, `/${route.board}`],
    [row.grade_label, `/${route.board}/${route.grade}`],
    [row.subject_name, `/${route.board}/${route.grade}/${route.subject}`],
    [row.book_title, `/${route.board}/${route.grade}/${route.subject}/${route.book}`],
    [row.chapter_title, `/${route.board}/${route.grade}/${route.subject}/${route.book}/${route.chapter}`],
    [`Question ${row.display_label}`, null],
  ];
  return `<nav class="breadcrumb-bar" aria-label="Breadcrumb"><ol class="shell breadcrumb-list">${items.map(([label, href]) => `<li>${href ? `<a href="${escapeHtmlAttribute(href)}">${escapeHtmlAttribute(label)}</a>` : `<span aria-current="page">${escapeHtmlAttribute(label)}</span>`}</li>`).join("")}</ol></nav>`;
}

function standaloneQuestionTitleClass(value) {
  const length = createPlainSearchText(value).length;
  if (length > 260) return "question-title-ultra-long";
  if (length > 190) return "question-title-extra-long";
  if (length > 130) return "question-title-long";
  if (length > 80) return "question-title-medium";
  return "question-title-short";
}

function standaloneQuestionHeader(row, route) {
  return `<a class="skip-link" href="#main-content">Skip to content</a><header class="site-header"><div class="shell header-inner"><a class="brand" href="/" aria-label="StudyWudy home"><span aria-hidden="true" class="brand-mark" data-nosnippet></span><span>Study<span>Wudy</span></span></a><nav aria-label="Primary navigation" class="desktop-nav"><a href="/boards">Boards</a><a href="/${escapeHtmlAttribute(route.board)}/${escapeHtmlAttribute(route.grade)}">Classes</a><a href="/${escapeHtmlAttribute(route.board)}/${escapeHtmlAttribute(route.grade)}/${escapeHtmlAttribute(route.subject)}">Subjects</a><a href="/search">Question bank</a></nav><div class="header-actions"><a aria-label="Search StudyWudy" class="icon-button" href="/search"><span aria-hidden="true">⌕</span></a><a class="small-button" href="/boards">Start studying</a><a aria-label="Browse study sections" class="menu-button" href="/boards"><span aria-hidden="true">☰</span></a></div></div></header>`;
}

function standaloneQuestionChapterRail(row, route) {
  const chapterHref = `/${route.board}/${route.grade}/${route.subject}/${route.book}/${route.chapter}`;
  const chapterNumber = String(Number(row.chapter_number) || "").padStart(2, "0");
  return `<aside aria-label="Chapter question navigation" class="question-chapter-rail"><span>Chapter ${chapterNumber}</span><strong>${escapeHtmlAttribute(row.chapter_title)}</strong><nav aria-label="Current question"><b aria-current="page">Question ${escapeHtmlAttribute(row.display_label)}</b></nav><a href="${escapeHtmlAttribute(chapterHref)}">← All chapter questions</a></aside>`;
}

function standaloneQuestionContext(row, route) {
  const chapterHref = `/${route.board}/${route.grade}/${route.subject}/${route.book}/${route.chapter}`;
  const chapterNumber = String(Number(row.chapter_number) || "").padStart(2, "0");
  return `<aside aria-label="Study context" class="answer-context"><span>Study context</span><dl><div><dt>Board</dt><dd>${escapeHtmlAttribute(row.board_short_name || row.board_name)}</dd></div><div><dt>Class</dt><dd>${escapeHtmlAttribute(row.grade_label)}</dd></div><div><dt>Subject</dt><dd>${escapeHtmlAttribute(row.subject_name)}</dd></div><div><dt>Chapter</dt><dd>${chapterNumber} · ${escapeHtmlAttribute(row.chapter_title)}</dd></div></dl><a href="${escapeHtmlAttribute(chapterHref)}">View full chapter →</a></aside>`;
}

function standaloneQuestionFooter() {
  return `<footer class="site-footer"><div class="footer-banner"><div class="shell"><strong><span aria-hidden="true">★</span> Learn in textbook order. Understand every answer.</strong><div aria-label="StudyWudy benefits" role="list"><span role="listitem">Free to study</span><span role="listitem">17 question types</span><span role="listitem">Made for mobile</span></div></div></div><div class="shell footer-grid"><div class="footer-intro"><a class="brand brand-footer" href="/" aria-label="StudyWudy home"><span aria-hidden="true" class="brand-mark" data-nosnippet></span><span>Study<span>Wudy</span></span></a><p class="footer-eyebrow">Clear answers for curious students</p><h2>One clear answer away from understanding it.</h2><p class="footer-note">Board-wise textbook solutions, kept in the same order as your classroom and your book.</p><a class="footer-cta" href="/boards">Find my textbook <span aria-hidden="true">→</span></a></div><nav aria-label="Footer navigation" class="footer-nav"><div><h2>Explore</h2><a href="/boards">Browse all boards <span aria-hidden="true">→</span></a><a href="/search">Question bank <span aria-hidden="true">→</span></a></div><div><h2>Study promise</h2><p><span aria-hidden="true">✓</span> Free to study</p><p><span aria-hidden="true">✓</span> Textbook order</p><p><span aria-hidden="true">✓</span> Mobile friendly</p></div><div class="phase5-native-links"><h2>About</h2><a href="/about/methodology">About &amp; Methodology <span aria-hidden="true">→</span></a><a href="/reviewers">Reviewer registry <span aria-hidden="true">→</span></a><a href="/corrections">Corrections history <span aria-hidden="true">→</span></a><a href="/privacy">Privacy Policy <span aria-hidden="true">→</span></a><a href="/terms">Terms of Service <span aria-hidden="true">→</span></a><a href="/contact">Contact Us <span aria-hidden="true">→</span></a></div></nav></div><div class="shell footer-bottom"><span>© 2026 StudyWudy · Built for curious students.</span><span class="footer-made"><i aria-hidden="true">★</i> Made for students across India</span><a href="#main-content">Back to top <span aria-hidden="true">↑</span></a></div></footer>`;
}

function standaloneRelatedQuestionHref(row, route) {
  return `/${route.board}/${route.grade}/${route.subject}/${route.book}/${row.chapter_slug}/questions/${row.question_id}`;
}

function standaloneRelatedQuestionModel(row, catalog, route) {
  const type = normalizedQuestionType(row);
  return Object.freeze({
    rowId: Number(row.row_id),
    href: standaloneRelatedQuestionHref(row, route),
    label: String(row.display_label || ""),
    typeLabel: subjectAwareQuestionTypeLabel(
      type,
      route.subject,
      QUESTION_TYPE_LABELS[type] || "Textbook answer",
    ),
    chapter: reviewedChapterTitle(
      catalog.book_id,
      row.chapter_slug,
      repairKnownText(catalog.book_id, row.chapter_title),
    ),
    prompt: truncateSearchExcerpt(createPlainSearchText(repairKnownText(catalog.book_id, row.prompt_text)), 170),
  });
}

async function standaloneEligibleRelatedQuestions(env, catalog, route, rowId) {
  if (!env.DB?.batch) return Object.freeze({ sameChapter: Object.freeze([]), sameTextbook: Object.freeze([]) });
  const projection = `SELECT q.row_id, q.question_id, q.display_label, q.type, q.prompt_text,
    q.chapter_slug, c.title AS chapter_title
    FROM catalog_questions q JOIN catalog_chapters c
      ON c.book_id = q.book_id AND c.slug = q.chapter_slug`;
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`${projection}
        WHERE q.book_id = ? AND q.chapter_slug = ? AND q.row_id != ?
        ORDER BY ABS(q.row_id - ?) LIMIT 64`).bind(catalog.book_id, route.chapter, rowId, rowId),
      env.DB.prepare(`${projection}
        WHERE q.book_id = ? AND q.chapter_slug != ? AND q.row_id != ?
        ORDER BY ABS(q.row_id - ?) LIMIT 96`).bind(catalog.book_id, route.chapter, rowId, rowId),
    ]);
    const eligible = (row) => isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, Number(row.row_id))
      && corpusQuestionIndexEligible({
        questionId: row.question_id,
        rowId: Number(row.row_id),
        duplicateRowIds: CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS,
      });
    const sameChapter = (results[0]?.results || []).filter(eligible).slice(0, 4)
      .map((row) => standaloneRelatedQuestionModel(row, catalog, route));
    const used = new Set(sameChapter.map(({ rowId: relatedRowId }) => relatedRowId));
    const sameTextbook = (results[1]?.results || []).filter((row) => eligible(row) && !used.has(Number(row.row_id))).slice(0, 8)
      .map((row) => standaloneRelatedQuestionModel(row, catalog, route));
    return Object.freeze({ sameChapter: Object.freeze(sameChapter), sameTextbook: Object.freeze(sameTextbook) });
  } catch (error) {
    console.error(JSON.stringify({ event: "standalone_related_questions_failed", questionId: route.question, error: String(error) }));
    return Object.freeze({ sameChapter: Object.freeze([]), sameTextbook: Object.freeze([]) });
  }
}

function standaloneRelatedQuestionSections(recommendations, catalog, route) {
  const sameChapter = recommendations.sameChapter.length
    ? `<section class="question-exercise-related" aria-labelledby="same-chapter-heading"><header><span>Same chapter</span><h2 id="same-chapter-heading">More questions from ${escapeHtmlAttribute(catalog.chapter_title)}</h2></header><div>${recommendations.sameChapter.map((card) => `<a class="question-exercise-card" href="${escapeHtmlAttribute(card.href)}" data-related-question-row-id="${card.rowId}"><span>${escapeHtmlAttribute(card.typeLabel)}</span><strong>Question ${escapeHtmlAttribute(card.label)}</strong><p>${escapeHtmlAttribute(card.prompt)}</p><b>View answer →</b></a>`).join("")}</div></section>`
    : "";
  const sameTextbook = recommendations.sameTextbook.length
    ? `<section class="related-questions" aria-labelledby="related-questions-heading"><header class="related-questions-heading"><div><span aria-hidden="true">+</span><div><small>Keep learning</small><h2 id="related-questions-heading">Related questions</h2></div></div><p>${recommendations.sameTextbook.length} questions from this textbook.</p></header><div class="related-question-grid">${recommendations.sameTextbook.map((card) => `<a class="related-question-link" href="${escapeHtmlAttribute(card.href)}" data-related-question-row-id="${card.rowId}"><span class="related-question-number">Q ${escapeHtmlAttribute(card.label)}</span><div class="related-question-preview"><div class="related-question-copy">${escapeHtmlAttribute(card.prompt)}</div><small>${escapeHtmlAttribute(card.chapter)}</small></div><b><span>Open</span> →</b></a>`).join("")}</div></section>`
    : "";
  return Object.freeze({ sameChapter, sameTextbook });
}

function standaloneQuestionExperiencePayload(payload) {
  return {
    catalog: payload?.catalog,
    textbookEdition: payload?.textbookEdition,
    sourceEdition: payload?.sourceEdition,
    academicYear: payload?.academicYear,
    sourceAcademicYear: payload?.sourceAcademicYear,
    sourceChecksum: payload?.sourceChecksum,
    sourceVersion: payload?.sourceVersion,
  };
}

async function standaloneQuestionResponse(request, env, url, route) {
  if (request.method !== "GET" || !route) return null;
  let catalog;
  try {
    catalog = await questionPageCatalogRecord(env, route);
  } catch (error) {
    console.error(JSON.stringify({ event: "standalone_question_catalog_failed", path: url.pathname, error: String(error) }));
    return new Response("Question service is temporarily unavailable.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  if (!catalog) {
    return new Response("<!doctype html><html lang=\"en-IN\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex, follow\"><title>Question not found | StudyWudy</title></head><body><main><h1>Question not found</h1><p>The requested textbook question does not exist.</p><a href=\"/search\">Search the question bank</a></main></body></html>", {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, follow", "x-studywudy-render-path": "early-question-404-v1" },
    });
  }

  let payload;
  try {
    payload = await loadCatalogQuestionPayload(env, catalog.book_id, route.chapter, Number(catalog.row_id));
  } catch (error) {
    console.error(JSON.stringify({ event: "standalone_question_payload_failed", path: url.pathname, error: String(error) }));
    return new Response("Question service is temporarily unavailable.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  const context = findQuestionPageContext(payload, route.chapter, route.question);
  if (!context?.question) {
    return new Response("Question source is unavailable.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, follow" } });
  }
  // Keep only the current chapter (through `context`) and the small provenance
  // fields needed below. Releasing the full decoded book before the next async
  // boundary prevents concurrent question GETs from retaining several books.
  payload = standaloneQuestionExperiencePayload(payload);

  const question = context.question;
  const formulaEvaluation = evaluateQuestionFormulaAccessibility(question);
  const promptMarkup = standaloneQuestionContent(question.prompt, catalog.book_id);
  const choiceMarkup = standaloneQuestionChoices(question, catalog.book_id);
  const promptMedia = standaloneQuestionMedia(question.promptMedia, `Question ${catalog.display_label}`, catalog.book_id);
  const solutionMedia = standaloneQuestionMedia(question.solutionMedia, `Solution for question ${catalog.display_label}`, catalog.book_id);
  const solutionMarkup = standaloneQuestionSolution(question, catalog.book_id);
  let model = buildQuestionPageExperience({
    payload,
    context,
    route,
    catalog,
    reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
    semanticGraph: null,
  });
  if (model) model = await filterPublicQuestionRecommendations(env, model);
  let experience = renderQuestionPageExperience(model);
  const renderedMathSurface = `${promptMarkup}${choiceMarkup}${solutionMarkup}${experience?.aboveFold || ""}${experience?.solutionSupplement || ""}`;
  const renderedMathFailures = invalidRenderedMathFound(renderedMathSurface);
  const renderedEquationPass = formulaEvaluation.complete
    && renderedMathFailures.length === 0
    && !/Equation review pending|data-studywudy-equation-review=["']pending/iu.test(renderedMathSurface);
  const rowId = Number(catalog.row_id);
  const indexable = Boolean(
    renderedEquationPass
    && isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, rowId)
    && corpusQuestionIndexEligible({
      questionId: route.question,
      rowId,
      duplicateRowIds: CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS,
    })
  );
  if (!indexable && model?.trust?.automatedAnswerGatePassed) {
    model = { ...model, trust: { ...model.trust, automatedAnswerGatePassed: false } };
    experience = renderQuestionPageExperience(model);
  }
  const relatedQuestionSections = standaloneRelatedQuestionSections(
    await standaloneEligibleRelatedQuestions(env, catalog, route, rowId),
    catalog,
    route,
  );
  const sameExerciseOrChapter = experience?.sameExercise || relatedQuestionSections.sameChapter;

  const directive = indexable
    ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
    : "noindex, follow";
  const disambiguate = QUESTION_SEO_DISAMBIGUATED_ROWS.has(rowId);
  const title = repairKnownText(catalog.book_id, questionDocumentTitle(catalog, disambiguate));
  const socialTitle = repairKnownText(catalog.book_id, questionSocialTitle(catalog, disambiguate));
  const description = repairKnownText(catalog.book_id, questionDescription(catalog, disambiguate));
  const canonical = publicDocumentUrl(url);
  const directAnswer = conciseDirectAnswer(question);
  const publicDirectAnswer = createPlainSearchText(directAnswer);
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: socialTitle,
    inLanguage: languageForBookId(catalog.book_id) || "en-IN",
    isAccessibleForFree: true,
    mainEntity: {
      "@type": "Question",
      "@id": `${canonical}#question`,
      name: repairKnownText(catalog.book_id, questionPrompt(catalog)),
      text: repairKnownText(catalog.book_id, questionPrompt(catalog)),
      eduQuestionType: String(catalog.type || "answer").replaceAll("_", " "),
      educationalLevel: catalog.grade_label,
      acceptedAnswer: { "@type": "Answer", text: publicDirectAnswer },
    },
  }).replaceAll("<", "\\u003c");
  const reviewed = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
    .format(Number(PHASE4_GATE_MANIFEST.reviewedAt) * 1_000);
  const reviewPanel = `<section class="phase4-review-signal${indexable ? "" : " is-pending"}" aria-label="Automated solution publishing check"><a href="/about/methodology">${indexable ? "✓ Automated completeness gate passed" : formulaEvaluation.formulaCount && !renderedEquationPass ? "Equation review pending" : "Automated answer checks incomplete"}</a><small>Automated publishing gate run: ${escapeHtmlAttribute(reviewed)}</small><span>${indexable ? "The rendered answer passed type-specific structure, semantic-equation, canonical and duplicate-intent checks. This is not a human academic-review claim." : "This page is noindex and excluded from sitemaps, search results and quality-screened samples until every publishing check passes."}</span></section>`;
  const snippetExclusion = experience?.snippetEligible === false ? " data-nosnippet" : "";
  const questionType = normalizedQuestionType(question);
  const questionTypeLabel = subjectAwareQuestionTypeLabel(
    questionType,
    route.subject,
    QUESTION_TYPE_LABELS[questionType] || "Textbook answer",
  );
  const chapterNumber = String(Number(catalog.chapter_number) || "").padStart(2, "0");
  const solutionHeadingId = `${route.question}-solution-heading`;
  const promptTitle = questionPrompt(catalog);
  const body = `<!doctype html><html data-scroll-behavior="smooth" lang="${escapeHtmlAttribute(languageForBookId(catalog.book_id) || "en-IN")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0757d8"><title>${escapeHtmlAttribute(title)}</title><meta name="description" content="${escapeHtmlAttribute(description)}"><meta name="robots" content="${directive}"><link rel="canonical" href="${escapeHtmlAttribute(canonical)}"><meta property="og:title" content="${escapeHtmlAttribute(socialTitle)}"><meta property="og:description" content="${escapeHtmlAttribute(description)}"><meta property="og:url" content="${escapeHtmlAttribute(canonical)}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtmlAttribute(socialTitle)}">${STUDYWUDY_QUESTION_THEME_ASSETS}${DECORATIVE_TEXT_STYLES}${SEMANTIC_MATH_STYLES}${QUESTION_PAGE_EXPERIENCE_STYLES}${STANDALONE_QUESTION_STYLES}<script type="application/ld+json">${schema}</script></head><body class="manrope_6fd7433c-module__Zz-jia__variable antialiased standalone-question-page" data-studywudy-question-template="original-theme-v1">${standaloneQuestionHeader(catalog, route)}<main id="main-content" tabindex="-1">${standaloneQuestionBreadcrumbs(catalog, route)}<section class="answer-page-hero shell"><div><p class="eyebrow">${escapeHtmlAttribute(catalog.board_name)} · ${escapeHtmlAttribute(catalog.grade_label)} ${escapeHtmlAttribute(catalog.subject_name)}</p><h1 class="${standaloneQuestionTitleClass(promptTitle)}"${snippetExclusion}>${standaloneQuestionInline(promptTitle, catalog.book_id)} — Question ${escapeHtmlAttribute(catalog.display_label)}</h1></div><p class="answer-page-chapter"><span>Chapter ${chapterNumber}</span>${escapeHtmlAttribute(catalog.chapter_title)}</p>${experience?.aboveFold || ""}</section><div class="shell answer-page-layout">${standaloneQuestionChapterRail(catalog, route)}<div class="answer-page-main"><article aria-label="Question ${escapeHtmlAttribute(catalog.display_label)}" class="question-card" id="${escapeHtmlAttribute(route.question)}" data-question-row-id="${rowId}" data-question-id="${escapeHtmlAttribute(route.question)}" data-question-type="${escapeHtmlAttribute(questionType)}" data-question-book="${escapeHtmlAttribute(catalog.book_id)}"${snippetExclusion}><header class="question-meta"><div class="question-number"><span>${escapeHtmlAttribute(catalog.display_label)}</span><small>${escapeHtmlAttribute(questionTypeLabel)}</small></div><div class="question-badges"><span class="pattern-code" title="StudyWudy question">SW</span></div></header><div class="question-prompt"><div class="rich-copy">${promptMarkup}</div>${promptMedia}${choiceMarkup}</div><section aria-labelledby="${escapeHtmlAttribute(solutionHeadingId)}" class="solution-body">${experience?.solutionOverview || ""}<h2 class="solution-kicker solution-kicker-green" id="${escapeHtmlAttribute(solutionHeadingId)}">Step-by-step solution</h2><div>${solutionMarkup}</div>${solutionMedia}${experience?.solutionSupplement || ""}</section></article>${reviewPanel}${experience?.trust || ""}${experience?.semanticLinks || ""}${sameExerciseOrChapter}${experience?.previousYear || ""}${relatedQuestionSections.sameTextbook}</div>${standaloneQuestionContext(catalog, route)}</div></main>${standaloneQuestionFooter()}</body></html>`;
  const headers = launchStaticSecurityHeaders(new Headers({
    "content-type": "text/html; charset=utf-8",
    "cache-control": indexable ? EDGE_HTML_CACHE : "no-store",
    "x-robots-tag": directive,
    "x-studywudy-accessibility-text": ACCESSIBILITY_TEXT_RELEASE,
    "x-studywudy-brand-hygiene": PUBLIC_BRAND_HYGIENE_RELEASE,
    "x-studywudy-breadcrumbs": "canonical-v1",
    "x-studywudy-corpus-quality": CORPUS_QUALITY_POLICY_VERSION,
    "x-studywudy-public-eligibility": PUBLIC_QUESTION_ELIGIBILITY_POLICY_VERSION,
    "x-studywudy-public-title": PUBLIC_TITLE_QUALITY_RELEASE,
    "x-studywudy-publish-gate": `${PHASE4_GATE_MANIFEST.policyVersion}; ${indexable ? "complete" : "review-required"}`,
    "x-studywudy-question-payload": QUESTION_PAYLOAD_ASSET_BOOK_IDS.has(catalog.book_id)
      ? QUESTION_PAYLOAD_ASSET_MANIFEST.policyVersion
      : "bounded-book-fallback-v1",
    "x-studywudy-question-experience": "question-specific-trust-v2",
    "x-studywudy-render-consistency": RENDER_CONSISTENCY_RELEASE,
    "x-studywudy-search-metadata": "catalog-data-v1",
    "x-studywudy-semantic-math": "ast-mathml-authoritative-v7-geometry-symbols",
    "x-studywudy-render-path": "canonical-single-pass-v1",
  }));
  return new Response(body, { status: 200, headers });
}

async function filterPublicQuestionRecommendations(env, model) {
  if (!model || !env.DB) return model;
  const questionIds = new Set([
    ...(model.sameExerciseQuestions || []).map((card) => card.id),
    ...(model.previousYearQuestions || []).map((card) => card.id),
    ...(model.semanticGraph?.links || []).map((link) => link.questionId),
  ].filter(Boolean));
  if (!questionIds.size) return model;
  const statements = [...questionIds].map((questionId) => env.DB.prepare(
    "SELECT row_id, question_id FROM catalog_questions WHERE question_id = ? LIMIT 1",
  ).bind(questionId));
  const results = await env.DB.batch(statements);
  const eligibleQuestionIds = new Set();
  results.forEach((result) => {
    const row = result.results?.[0];
    if (!row) return;
    if (!isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, Number(row.row_id))) return;
    if (!corpusQuestionIndexEligible({
      questionId: row.question_id,
      rowId: Number(row.row_id),
      duplicateRowIds: CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS,
    })) return;
    eligibleQuestionIds.add(row.question_id);
  });
  model.sameExerciseQuestions = (model.sameExerciseQuestions || []).filter((card) => eligibleQuestionIds.has(card.id));
  model.previousYearQuestions = (model.previousYearQuestions || []).filter((card) => eligibleQuestionIds.has(card.id));
  if (model.semanticGraph) {
    model.semanticGraph = Object.freeze({
      ...model.semanticGraph,
      links: Object.freeze(model.semanticGraph.links.filter((link) => !link.questionId || eligibleQuestionIds.has(link.questionId))),
    });
  }
  return model;
}

async function questionPageExperienceResponse(response, env, url, requestMethod, route = questionRoute(url.pathname)) {
  const contentType = response.headers.get("content-type") || "";
  if (!route || !response.ok || !contentType.includes("text/html")) return { response, ready: !route };
  let experience = null;
  let canonicalFormulaLookup = null;
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
    canonicalFormulaLookup = buildCanonicalFormulaLookup(context?.question);
    const semanticGraph = semanticGraphEligible
      ? buildQuestionSemanticGraph({ primaryPayload: payload, questionBankPayload: null, questionId: route.question })
      : null;
    const model = await filterPublicQuestionRecommendations(env, buildQuestionPageExperience({
      payload,
      context,
      route,
      catalog,
      reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
      semanticGraph,
    }));
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
  const questionExperienceStyles = `${QUESTION_PAGE_EXPERIENCE_STYLES}${QUESTION_PAGE_THEME_ALIGNMENT_STYLES}${experience.semanticLinks ? SEMANTIC_LINK_GRAPH_STYLES : ""}`;
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
    .on(".math[aria-label]", {
      element(element) {
        const canonical = canonicalFormulaForLegacyLabel(canonicalFormulaLookup, element.getAttribute("aria-label") || "");
        if (canonical) element.replace(renderSemanticMath(canonical, { visiblePlain: true }), { html: true });
      },
    })
    .on(".solution-body > .solution-kicker", {
      element(element) {
        element.setInnerContent(solutionHeading);
      },
    })
    .on(".solution-body > .direct-answer", {
      element(element) {
        if (route.question === "q-tn-samacheer-kalvi-science-term-1-class-4-1-001" && experience.canonicalExplanation) {
          element.replace(experience.canonicalExplanation, { html: true });
        }
      },
    })
    .on(".question-pagination", {
      element(element) {
        element.before(`${experience.semanticLinks || ""}${experience.trust}`, { html: true });
      },
    })
    .on(".question-card, .answer-page-hero h1", {
      element(element) {
        if (!experience.snippetEligible) element.setAttribute("data-nosnippet", "");
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
  headers.set("X-StudyWudy-Corpus-Quality", CORPUS_QUALITY_POLICY_VERSION);
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
  rewriter = rewriter.on("head", {
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
    });
  for (const questionId of experience.snippetExcludedQuestionIds || []) {
    rewriter = rewriter.on(`.question-card[id="${escapeCssAttribute(questionId)}"]`, {
      element(element) {
        element.setAttribute("data-nosnippet", "");
      },
    });
  }
  return rewriter.transform(response);
}

function chapterSolutionLinksResponse(response, url) {
  const chapter = chapterRoute(url.pathname);
  const contentType = response.headers.get("content-type") || "";
  if (!chapter || !response.ok || !contentType.includes("text/html") || typeof HTMLRewriter !== "function") return response;
  const questionUrlStack = [];
  const usesMathematicsProblemLabels = chapter.subjectSlug === "mathematics";
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
    .on('.question-card[data-question-type="brief"] .question-number small', {
      element(element) {
        if (usesMathematicsProblemLabels) element.setInnerContent("Problem");
      },
    })
    .on(".chapter-rail nav a small", {
      text(text) {
        if (usesMathematicsProblemLabels && text.text.trim().toLocaleLowerCase("en-IN") === "brief") {
          text.replace("Problem");
        }
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
    row = await questionRouteRowId(env, route);
  } catch {
    row = null;
  }
  const indexable = Boolean(experienceReady
    && row
    && isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, Number(row.row_id))
    && corpusQuestionIndexEligible({
      questionId: route.question,
      rowId: Number(row.row_id),
      duplicateRowIds: CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS,
    }));
  const equationReviewPending = Boolean(row && isQuestionEquationReviewPending(PHASE4_GATE_MANIFEST, Number(row.row_id)));
  const directive = indexable
    ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
    : "noindex, follow";
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  headers.set("X-Robots-Tag", directive);
  headers.set("X-StudyWudy-Publish-Gate", `${PHASE4_GATE_MANIFEST.policyVersion}; ${indexable ? "complete" : "review-required"}`);
  headers.set("X-StudyWudy-Corpus-Quality", CORPUS_QUALITY_POLICY_VERSION);
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
  const pendingLabel = equationReviewPending ? "Equation review pending" : "Automated answer checks incomplete";
  const pendingDetail = equationReviewPending
    ? "This page is noindex and excluded from sitemaps, search results and quality-screened samples because at least one equation failed strict structure or semantic-token preservation."
    : "This page stays available to students but is not indexable until its type-specific automated requirements are complete.";
  const panel = `<section class="shell phase4-review-signal" aria-label="Automated solution publishing check"><a class="phase4-review-badge ${indexable ? "is-passed" : "is-queued"}" href="/about/methodology">${indexable ? "✓ Automated completeness gate passed" : pendingLabel}</a><small>Automated publishing gate run: ${escapeHtmlAttribute(reviewed)}</small><span>${indexable ? "The answer passed type-specific structure, prompt-output, mapping, semantic-equation, canonical and duplicate-intent checks. This is not a human academic-review claim." : pendingDetail}</span></section>`;
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
  if (url.pathname === "/search" && ["q", "type", "hasDiagram", "board"].some((key) => url.searchParams.has(key))) return null;
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
  if (isLocalLaunchHotPathBuildRequest(request)) return null;
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
  headers.set("X-StudyWudy-Semantic-Math", "ast-mathml-authoritative-v7-geometry-symbols");
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
        if (!validateFormulaStructure(source).complete) {
          element.replace('<span data-nosnippet="" data-studywudy-equation-review="pending">Equation review pending</span>', { html: true });
          return;
        }
        const representation = formulaRepresentations(source);
        element.replace(renderSemanticMath(representation, { visiblePlain: true }), { html: true });
      },
    })
    .on(".math[data-math-source]", {
      element(element) {
        const original = element.getAttribute("data-math-source") || "";
        const source = repairCrawlerFormulaSource(original);
        if (!source) return;
        if (!validateFormulaStructure(source).complete) {
          element.replace('<span data-nosnippet="" data-studywudy-equation-review="pending">Equation review pending</span>', { html: true });
          return;
        }
        const representation = formulaRepresentations(source);
        element.replace(renderSemanticMath(representation, { visiblePlain: true }), { html: true });
      },
    })
    .on(".math > .katex, .math > .katex-display", {
      element(element) {
        element.remove();
      },
    })
    .on(".katex-mathml, annotation", {
      element(element) {
        element.remove();
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
    .on(".math-plain-text[data-math-plain]", {
      element(element) {
        element.setInnerContent(element.getAttribute("data-math-plain") || "");
      },
    })
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
  for (const [slug, labels] of Object.entries(BOARD_BADGE_LABELS)) {
    rewriter.on(`.board-card-${slug} .board-card-meta`, {
      element(element) {
        element.setAttribute("aria-hidden", "true");
        element.setAttribute("data-nosnippet", "");
        element.setInnerContent(`<small data-label="${escapeHtmlAttribute(labels.region)}"></small><span data-label="${escapeHtmlAttribute(labels.badge)}"></span>`, { html: true });
      },
    });
  }
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

function publicAssetAttributeHandler(attribute) {
  return {
    element(element) {
      const value = element.getAttribute(attribute);
      if (value === null) return;
      const repaired = rewritePublicAssetPath(value);
      if (repaired !== value) element.setAttribute(attribute, repaired);
    },
  };
}

function publicBrandTextHandler() {
  return {
    text(textChunk) {
      const repaired = repairPublicBrandCopy(textChunk.text);
      if (repaired !== textChunk.text) textChunk.replace(repaired);
    },
  };
}

function publicJsonLdHandler(requestUrl) {
  let buffered = "";
  return {
    text(textChunk) {
      buffered += textChunk.text;
      if (!textChunk.lastInTextNode) {
        textChunk.remove();
        return;
      }
      textChunk.replace(rewritePublicMetadataValue(repairMalformedFormulaText(buffered), requestUrl));
      buffered = "";
    },
  };
}

function publicInfrastructureOriginResponse(request, response) {
  const url = new URL(request.url);
  const isPublicDiscoveryText = url.pathname === "/robots.txt" || url.pathname === "/sitemap.xml";
  if (!isPublicDiscoveryText || request.method === "HEAD" || !response.body) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  headers.set("X-StudyWudy-Brand-Hygiene", PUBLIC_BRAND_HYGIENE_RELEASE);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  const rewriteStream = new TransformStream({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true });
      const newline = pending.lastIndexOf("\n");
      if (newline < 0) return;
      controller.enqueue(encoder.encode(rewritePublicInfrastructureOrigin(pending.slice(0, newline + 1), request.url)));
      pending = pending.slice(newline + 1);
    },
    flush(controller) {
      pending += decoder.decode();
      if (pending) controller.enqueue(encoder.encode(rewritePublicInfrastructureOrigin(pending, request.url)));
    },
  });
  return new Response(response.body.pipeThrough(rewriteStream), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function publicBrandHygieneResponse(request, response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return publicInfrastructureOriginResponse(request, response);
  const headers = new Headers(response.headers);
  const cacheControl = headers.get("cache-control") || "";
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  // The recovered Next shell can emit a one-year shared-cache lifetime. Any
  // cacheable transformed HTML must leave the final layer with one policy.
  if (/s-maxage=/iu.test(cacheControl) && !/(?:private|no-store)/iu.test(cacheControl)) {
    headers.set("Cache-Control", EDGE_HTML_CACHE);
  }
  headers.set("X-StudyWudy-Brand-Hygiene", PUBLIC_BRAND_HYGIENE_RELEASE);
  headers.set("X-StudyWudy-Accessibility-Text", ACCESSIBILITY_TEXT_RELEASE);
  headers.set("X-StudyWudy-Public-Title", PUBLIC_TITLE_QUALITY_RELEASE);
  headers.set("X-StudyWudy-Render-Consistency", RENDER_CONSISTENCY_RELEASE);
  response = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
  return response;
}

function withTheme(request, response, addEdgeCacheFallback = false) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return publicBrandHygieneResponse(request, response);
  const pathname = new URL(request.url).pathname.replace(/\/$/, "") || "/";
  const pathParts = pathname.split("/").filter(Boolean);
  const isHomepage = pathname === "/";
  const canonical = publicDocumentUrl(request.url);
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
    .on("title", {
      element(element) {
        if (isHomepage) element.setInnerContent(HOMEPAGE_DOCUMENT_TITLE);
      },
    })
    .on('meta[property="og:title"], meta[name="twitter:title"]', {
      element(element) {
        if (isHomepage) element.setAttribute("content", HOMEPAGE_DOCUMENT_TITLE);
      },
    })
    .on("a.brand", {
      element(element) {
        element.setAttribute("aria-label", "StudyWudy");
      },
    })
    .on(".brand-mark", {
      element(element) {
        element.setAttribute("aria-hidden", "true");
        element.setAttribute("data-nosnippet", "");
        element.setInnerContent("");
      },
    })
    .on(".board-card-meta, .study-field-art", {
      element(element) {
        element.setAttribute("aria-hidden", "true");
        element.setAttribute("data-nosnippet", "");
      },
    })
    .on(".study-field-art > *", {
      element(element) {
        element.setAttribute("aria-hidden", "true");
      },
    })
    .on('link[rel="canonical"]', {
      element(element) {
        element.setAttribute("href", canonical);
      },
    })
    .on("meta[content]", {
      element(element) {
        const value = element.getAttribute("content") || "";
        element.setAttribute("content", rewritePublicMetadataValue(value, request.url));
      },
    })
    .on('meta[property="og:url"]', {
      element(element) {
        element.setAttribute("content", canonical);
      },
    })
    .on('script[type="application/ld+json"]', publicJsonLdHandler(request.url))
    .on('[href^="/boardly-media/"]', publicAssetAttributeHandler("href"))
    .on('[src^="/boardly-media/"]', publicAssetAttributeHandler("src"))
    .on(".section-heading.centered-heading > p:not(.eyebrow)", {
      element(element) {
        if (isHomepage) element.setInnerContent(PUBLIC_BRAND_REPLACEMENT);
      },
    })
    .on(".pattern-code[title]", {
      element(element) {
        const title = element.getAttribute("title") || "";
        element.setAttribute("title", repairPublicBrandCopy(title));
      },
    })
    .on(".empty-state p", publicBrandTextHandler())
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
          endTag.before(DECORATIVE_TEXT_STYLES, { html: true });
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
  return publicBrandHygieneResponse(
    request,
    multilingualTextResponse(request, semanticMathResponse(themed, request.method)),
  );
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
  const isCbse = board === "cbse";
  const rewriter = addCanonicalBreadcrumbHandlers(new HTMLRewriter(), academicBreadcrumbItems({
    board_slug: board,
  }))
    .on("head", {
      element(element) {
        element.append(`${artworkHeadMarkup()}${isCbse ? CBSE_SERVER_RENDERED_STYLES : ""}`, { html: true });
      },
    })
    .on(".course-finder-header", {
      element(element) {
        if (isCbse) element.after(CBSE_SERVER_CLASS_NAVIGATION, { html: true });
      },
    })
    .on('nav[aria-label="CBSE classes"]', {
      element(element) {
        if (isCbse) element.setAttribute("aria-label", "Browse CBSE classes");
      },
    })
    .on('input[aria-label="Selected education board"]', {
      element(element) {
        if (isCbse) element.replace(CBSE_SERVER_BOARD_VALUE, { html: true });
      },
    })
    .on(".catalog-stat-artwork img", {
      element(element) {
        setBoardLogoAttributes(element, board, 180, true);
      },
    });
  const transformed = markCanonicalBreadcrumbResponse(
    rewriter.transform(withTransformableHeaders(response, EDGE_HTML_CACHE)),
  );
  const headers = new Headers(transformed.headers);
  headers.set("X-StudyWudy-Board-SSR", BOARD_HUB_SSR_RELEASE);
  return new Response(transformed.body, {
    status: transformed.status,
    statusText: transformed.statusText,
    headers,
  });
}

async function staticCorpusPageResponse(request, env, url) {
  const normalizedPath = url.pathname.replace(/\/+$/u, "");
  const assetPath = STATIC_CORPUS_PAGE_ASSETS[normalizedPath];
  if (!["GET", "HEAD"].includes(request.method) || !assetPath) return null;
  const assetUrl = new URL(assetPath, url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
  if (!asset.ok || !(asset.headers.get("content-type") || "").includes("text/html")) return null;
  const headers = new Headers(asset.headers);
  headers.set("cache-control", EDGE_HTML_CACHE);
  headers.set("X-StudyWudy-Chapter-Experience", "static-corpus-v1");
  headers.set("X-StudyWudy-Corpus-Quality", CORPUS_QUALITY_POLICY_VERSION);
  if (assetPath.includes("source-review-")) headers.set("X-Robots-Tag", "noindex, follow");
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
}

async function staticStudyClusterPageResponse(request, env, url) {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const normalizedPath = url.pathname.replace(/\/+$/u, "");
  const suffix = normalizedPath === STUDY_CLUSTER_BASE
    ? "chapter"
    : normalizedPath.startsWith(`${STUDY_CLUSTER_BASE}/`)
      ? normalizedPath.slice(STUDY_CLUSTER_BASE.length + 1)
      : "";
  if (suffix !== "chapter" && !STATIC_STUDY_CLUSTER_SUFFIXES.has(suffix)) return null;
  const assetUrl = new URL(`/pages/study-cluster/${suffix}/`, url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
  if (!asset.ok || !(asset.headers.get("content-type") || "").includes("text/html")) return null;
  const noindex = suffix === "previous-year-questions";
  const headers = new Headers(asset.headers);
  headers.set("cache-control", noindex ? "no-store" : EDGE_HTML_CACHE);
  headers.set("X-StudyWudy-Chapter-Experience", "static-study-cluster-v1");
  headers.set("X-StudyWudy-Study-Cluster", "electrostatics-v1");
  headers.set("X-StudyWudy-Study-Evidence", "textbook-and-question-bank-no-pyq-inference");
  headers.set("X-StudyWudy-Corpus-Quality", CORPUS_QUALITY_POLICY_VERSION);
  if (noindex) headers.set("X-Robots-Tag", "noindex, follow");
  return new Response(request.method === "HEAD" ? null : asset.body, {
    status: asset.status,
    statusText: asset.statusText,
    headers,
  });
}

const LAUNCH_STATIC_HTML_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "img-src 'self' data: blob: https://googlesyndication.com https://*.googlesyndication.com https://doubleclick.net https://*.doubleclick.net https://googleadservices.com https://*.googleadservices.com",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://googlesyndication.com https://*.googlesyndication.com https://doubleclick.net https://*.doubleclick.net https://googleadservices.com https://*.googleadservices.com",
  "connect-src 'self' https://googlesyndication.com https://*.googlesyndication.com https://doubleclick.net https://*.doubleclick.net https://googleadservices.com https://*.googleadservices.com",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "frame-src 'self' https://googlesyndication.com https://*.googlesyndication.com https://doubleclick.net https://*.doubleclick.net https://googleadservices.com https://*.googleadservices.com",
].join("; ");

function launchStaticSecurityHeaders(headers) {
  headers.set("content-security-policy", LAUNCH_STATIC_HTML_CSP);
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "SAMEORIGIN");
  headers.set("x-permitted-cross-domain-policies", "none");
  return headers;
}

async function launchHotPathStaticResponse(request, env, url) {
  if (!env.ASSETS || !["GET", "HEAD"].includes(request.method)) return null;
  if (isLocalLaunchHotPathBuildRequest(request)) return null;
  const document = launchHotPathDocument(url);
  if (!document) return null;
  const assetUrl = new URL(document.assetPath, url);
  assetUrl.search = "";
  const assetRequest = document.kind === "question-search"
    ? new Request(assetUrl, { method: "GET", headers: request.headers })
    : new Request(assetUrl, request);
  const asset = await env.ASSETS.fetch(assetRequest);
  if (!asset.ok || !(asset.headers.get("content-type") || "").includes("text/html")) {
    return new Response("Launch-critical static document is unavailable.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const headers = launchStaticSecurityHeaders(new Headers(asset.headers));
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  headers.set("X-StudyWudy-Launch-Hot-Path", `${LAUNCH_HOT_PATH_RELEASE}; ${document.kind}`);
  headers.set("X-StudyWudy-Accessibility-Text", ACCESSIBILITY_TEXT_RELEASE);
  headers.set("X-StudyWudy-Brand-Hygiene", PUBLIC_BRAND_HYGIENE_RELEASE);
  headers.set("X-StudyWudy-Corpus-Quality", CORPUS_QUALITY_POLICY_VERSION);
  headers.set("X-StudyWudy-Public-Title", PUBLIC_TITLE_QUALITY_RELEASE);
  headers.set("X-StudyWudy-Render-Consistency", RENDER_CONSISTENCY_RELEASE);
  headers.set("X-StudyWudy-Semantic-Math", "ast-mathml-authoritative-v7-geometry-symbols");
  let body = asset.body;
  if (document.kind === "question-search") {
    const filtered = filterStaticSearchEligibility(await asset.text(), PHASE4_GATE_MANIFEST);
    body = request.method === "HEAD" ? null : filtered.html;
    headers.set("cache-control", document.search ? "no-store" : EDGE_HTML_CACHE);
    headers.set("X-Robots-Tag", "noindex, follow");
    headers.set("X-StudyWudy-Search-Excerpt", SEARCH_EXCERPT_RELEASE);
    headers.set("X-StudyWudy-Search-Filter", SEARCH_FILTER_RELEASE);
    if (!document.search) headers.set("X-StudyWudy-Question-Showcase", QUESTION_SHOWCASE_SOURCE_GATE.policyVersion);
  } else {
    const indexable = isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, document.rowId);
    headers.set("cache-control", indexable ? EDGE_HTML_CACHE : "no-store");
    headers.set("X-Robots-Tag", indexable
      ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
      : "noindex, follow");
    headers.set("X-StudyWudy-Breadcrumbs", "canonical-v1");
    headers.set("X-StudyWudy-Publish-Gate", `${PHASE4_GATE_MANIFEST.policyVersion}; ${indexable ? "complete" : "incomplete"}`);
    headers.set("X-StudyWudy-Public-Eligibility", PUBLIC_QUESTION_ELIGIBILITY_POLICY_VERSION);
    headers.set("X-StudyWudy-Question-Experience", "question-specific-trust-v2");
    headers.set("X-StudyWudy-Search-Metadata", "catalog-data-v1");
  }
  return new Response(request.method === "HEAD" ? null : body, {
    status: asset.status,
    statusText: asset.statusText,
    headers,
  });
}

function crawlableRobotsResponse(request, url) {
  if (!["GET", "HEAD"].includes(request.method) || url.pathname !== "/robots.txt") return null;
  const origin = new URL(publicDocumentUrl(url)).origin;
  const body = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\nDisallow: /preview/\nDisallow: /*?*preview=\nDisallow: /*?*draft=\nSitemap: ${origin}/sitemap.xml\nHost: ${origin}\n`;
  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": EDGE_HTML_CACHE,
      "x-studywudy-brand-hygiene": PUBLIC_BRAND_HYGIENE_RELEASE,
      "x-studywudy-robots-policy": "crawlable-search-noindex-v1",
    },
  });
}

const PUBLIC_ROUTE_ROOTS = new Set([
  "about", "ads.txt", "api", "boardly-media", "boards", "cdn-cgi", "cbse", "cisce",
  "contact", "corrections", "favicon.ico", "manifest.webmanifest", "maharashtra-board",
  "privacy", "reviewers", "robots.txt", "search", "sitemap.xml", "sitemaps", "studywudy-media",
  "tamil-nadu-board", "terms", "_next",
]);

function obviousNotFoundResponse(request, url) {
  if (!["GET", "HEAD"].includes(request.method)) return null;
  const root = url.pathname.split("/").filter(Boolean)[0] || "";
  const malformedQuestionPath = /\/questions(?:\/|$)/u.test(url.pathname) && !questionRoute(url.pathname);
  if ((!root || PUBLIC_ROUTE_ROOTS.has(root)) && !malformedQuestionPath) return null;
  const body = "<!doctype html><html lang=\"en-IN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex, follow\"><title>Page not found | StudyWudy</title></head><body><main><h1>Page not found</h1><p>The requested page does not exist.</p><a href=\"/\">Return to StudyWudy</a></main></body></html>";
  return new Response(request.method === "HEAD" ? null : body, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, follow",
      "x-studywudy-render-path": "early-public-404-v1",
    },
  });
}

const afterWorker = {
  async fetch(request, env, ctx) {
    request = withoutConditionalHtmlValidators(request);
    const url = new URL(request.url);
    if (["GET", "HEAD"].includes(request.method) && url.pathname.startsWith("/studywudy-media/")) {
      const internalUrl = new URL(url);
      internalUrl.pathname = `/boardly-media/${url.pathname.slice("/studywudy-media/".length)}`;
      return baseWorker.fetch(new Request(internalUrl, request), env, ctx);
    }
    const quarantinedLanguagePage = multilingualQuarantineResponse(request, url);
    if (quarantinedLanguagePage) {
      return enhanceResponse(request, withTheme(request, quarantinedLanguagePage), env);
    }
    const robots = crawlableRobotsResponse(request, url);
    if (robots) return robots;
    const launchHotPath = await launchHotPathStaticResponse(request, env, url);
    if (launchHotPath) return launchHotPath;
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
    const questionHead = await questionEligibilityHeadResponse(request, env, routedQuestion);
    if (questionHead) return enhanceResponse(request, questionHead, env);
    const staticCorpusPage = await staticCorpusPageResponse(request, env, url);
    if (staticCorpusPage) {
      return edgeHtmlCacheStore(
        request,
        enhanceResponse(request, withTheme(request, staticCorpusPage), env),
        ctx,
      );
    }
    const standaloneQuestion = await standaloneQuestionResponse(request, env, url, routedQuestion);
    if (standaloneQuestion) {
      return edgeHtmlCacheStore(request, standaloneQuestion, ctx, { allowNoindex: true });
    }
    const staticStudyClusterPage = await staticStudyClusterPageResponse(request, env, url);
    if (staticStudyClusterPage) {
      return edgeHtmlCacheStore(
        request,
        enhanceResponse(request, withTheme(request, staticStudyClusterPage, staticStudyClusterPage.headers.get("cache-control") !== "no-store"), env),
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
    const notFound = obviousNotFoundResponse(request, url);
    if (notFound) return notFound;
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
