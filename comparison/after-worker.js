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
  questionMainHeading,
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
import { questionHasRepeatedProofPresentation, questionSolutionLabel } from "../question-solution-label.mjs";
import { placeQuestionSolutionMedia } from "../question-solution-media.mjs";
import { relatedQuestionTargetCount } from "../related-question-count.mjs";
import { buildCompletedFillBlank } from "../fill-blank-completion.mjs";
import { parseColumnTablePrompt } from "../question-column-table.mjs";
import { normalizeQuestionMathLayout } from "../question-math-layout.mjs";
import { contentToText, isQuestionEquationReviewPending, isQuestionRenderedDiagramAvailable } from "../answer-completeness.mjs";
import { PHASE4_GATE_MANIFEST } from "../phase4-publish-manifest.mjs";
import {
  normalizeQuestionEnrichment,
  QUESTION_ENRICHMENT_POLICY_VERSION,
} from "../question-enrichment.mjs";
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
const PHASE_2_VERSION = "20260825-search-solution-action-v104";
const PRIORITY_QUESTION_PILOT_PATH = "/maharashtra-board/class-12/biology/balbharati-biology-standard-12/reproduction-in-lower-and-higher-plants/questions/q-msb-balbharati-biology-standard-12-1-001";
const PRIORITY_QUESTION_PILOT_ROW_ID = 212031;
const PRIORITY_QUESTION_SOURCE_REVIEW = Object.freeze({
  policyVersion: "priority-question-official-source-review-v2",
  bookId: "maharashtra-board::class-12::biology::balbharati-biology-standard-12",
  chapterSlug: "reproduction-in-lower-and-higher-plants",
  questionId: "q-msb-balbharati-biology-standard-12-1-001",
  sourcePayloadChecksum: "706f0ec44ddfc7209ce5b812f8a20916e9091013a8f4eec6073e821539dd1ec0",
  sourceUrl: "https://books.ebalbharati.in/pdfs/1203030421.pdf",
  sourcePdfSha256: "3b8c6215b968acbab0cde678daf8bbdbc6cd5cffac230f3aeac1f23fba8c37f5",
  edition: "First Edition 2020; Reprint 2022",
  academicYear: "2020–21",
  questionPages: "Textbook page 16 · PDF page 26",
  conceptPages: "Textbook pages 6–8 · PDF pages 16–18",
  reviewedOn: "24 August 2026",
  distractorReasoning: Object.freeze([
    Object.freeze({
      choiceId: "B",
      choiceText: "Large quantities of pollens",
      explanation: "Producing pollen in large numbers is an adaptation of wind-pollinated flowers, where many grains are lost during transfer through air. It is not the defining insect-pollination trait asked here.",
    }),
    Object.freeze({
      choiceId: "C",
      choiceText: "Dry pollens with smooth surface",
      explanation: "Dry pollen is associated with wind pollination. Insect-pollinated pollen is sticky and spiny or rough, helping it attach to the body of a visiting insect.",
    }),
    Object.freeze({
      choiceId: "D",
      choiceText: "Light coloured pollens",
      explanation: "The textbook describes insect-pollinated flowers as often brightly coloured. Colour attracts insects at the flower level; light-coloured pollen is not the relevant adaptation.",
    }),
  ]),
});
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
const MAX_RELATED_MEDIA_INDEX_CHARACTERS = 2 * 1024 * 1024;
const INFLIGHT_BOOK_PAYLOADS = new Map();
const INFLIGHT_CHAPTER_PAYLOADS = new Map();
const INFLIGHT_RELATED_MEDIA = new Map();
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
const HORIZONTAL_SCROLL_CUE_RELEASE = "horizontal-scroll-cue-v1";
const HORIZONTAL_SCROLL_CUE_RUNTIME = `<script src="/horizontal-scroll-cue.js?v=${HORIZONTAL_SCROLL_CUE_RELEASE}" defer data-studywudy-horizontal-scroll="runtime"></script>`;
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
  const priority = Number.isFinite(Number(row.search_priority)) ? Number(row.search_priority) : 9;
  const showcase = row.showcase || null;
  const language = showcase?.language || languageForBookId(row.book_id) || "en";
  const hasDiagram = Boolean(row.has_rendered_diagram ?? showcase?.hasDiagram);
  const verification = showcase
    ? ` data-showcase-quality-screened="true" data-internal-mapping-consistent="${showcase.internalMappingConsistent}" data-authoritative-textbook-mapping-verified="${showcase.authoritativeTextbookMappingVerified}" data-known-authoritative-mapping-mismatch="${showcase.knownAuthoritativeMappingMismatch}" data-native-script-validation-passed="${showcase.nativeScriptValidationPassed}" data-search-excerpt-clean="${showcase.searchExcerptClean}" data-automated-gate-passed="${showcase.automatedGatePassed}" data-final-publishing-gate-passed="${showcase.finalPublishingGatePassed !== false}" data-unresolved-content="${showcase.unresolvedContent}" data-broken-media="${showcase.brokenMedia}" data-duplicate-options="${showcase.duplicateOptions}" data-runtime-payload-safe="${showcase.runtimePayloadSafe}" data-content-quality-passed="${showcase.contentQualityPassed}"`
    : "";
  return `<a href="${escapeHtmlAttribute(href)}" data-question-row-id="${Number(row.row_id)}" data-question-id="${escapeHtmlAttribute(row.question_id)}" data-question-type="${escapeHtmlAttribute(normalizedType)}" data-question-board="${escapeHtmlAttribute(row.board_slug)}" data-question-class="${escapeHtmlAttribute(row.grade_slug)}" data-question-subject="${escapeHtmlAttribute(row.subject_slug)}" data-question-book="${escapeHtmlAttribute(row.book_id)}" data-question-language="${escapeHtmlAttribute(language)}" data-has-diagram="${hasDiagram ? "true" : "false"}" data-public-search-eligible="true" data-search-priority="${priority}" data-search-match="${escapeHtmlAttribute(row.search_match || "sample")}"${verification}><div><span>Question ${escapeHtmlAttribute(row.display_label)}</span><i>${escapeHtmlAttribute(type)}</i></div><h2 data-search-excerpt="plain-v2">${escapeHtmlAttribute(prompt)}</h2><p>${escapeHtmlAttribute(context)}</p><b class="search-solution-button" data-search-description="plain-v2">View solution <span aria-hidden="true">→</span></b></a>`;
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
  const priorityQuestionPilot = priorityQuestionPilotRouteMatches(route, rowId);
  const indexable = (isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, rowId) || priorityQuestionPilot)
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
    "x-studywudy-publish-gate": `${PHASE4_GATE_MANIFEST.policyVersion}; ${priorityQuestionPilot && indexable ? "source-verified-pilot-complete" : indexable ? "complete" : "review-required"}`,
    "x-studywudy-question-experience": indexable ? "question-specific-trust-v2" : "review-required",
    "x-studywudy-search-metadata": "catalog-data-v1",
    "x-studywudy-semantic-math": "ast-mathml-authoritative-v7-geometry-symbols",
  });
  if (priorityQuestionPilot) headers.set("x-studywudy-source-review", PRIORITY_QUESTION_SOURCE_REVIEW.policyVersion);
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

async function loadRelatedQuestionMediaIndex(env, bookId) {
  if (!QUESTION_PAYLOAD_ASSET_BOOK_IDS.has(bookId) || !env.ASSETS) return Object.freeze({});
  const existing = INFLIGHT_RELATED_MEDIA.get(bookId);
  if (existing) return existing;
  const pending = (async () => {
    const bookRoute = String(bookId).split("::");
    if (bookRoute.length !== 4) return Object.freeze({});
    const pathname = `/__studywudy_payloads/${bookRoute.map(encodeURIComponent).join("/")}/related-media.json`;
    const response = await env.ASSETS.fetch(new URL(pathname, "https://assets.local"));
    if (!response.ok) return Object.freeze({});
    const json = await response.text();
    if (json.length > MAX_RELATED_MEDIA_INDEX_CHARACTERS) throw new Error("Related-question media index exceeds the size bound");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : Object.freeze({});
  })();
  INFLIGHT_RELATED_MEDIA.set(bookId, pending);
  try {
    return await pending;
  } catch (error) {
    if (INFLIGHT_RELATED_MEDIA.get(bookId) === pending) INFLIGHT_RELATED_MEDIA.delete(bookId);
    throw error;
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

async function standaloneQuestionEnrichment(env, catalog) {
  if (!env.DB || !catalog) return null;
  try {
    const row = await env.DB.prepare(`SELECT content_gzip, confidence, factual_pass, quality_pass
      FROM question_enrichments
      WHERE book_id = ? AND chapter_slug = ? AND question_id = ? LIMIT 1`)
      .bind(catalog.book_id, catalog.chapter_slug, catalog.question_id)
      .first();
    if (!row || Number(row.factual_pass) !== 1 || Number(row.quality_pass) !== 1 || Number(row.confidence) < 0.88) return null;
    const compressed = catalogBlobBytes(row.content_gzip);
    if (!compressed.byteLength || compressed.byteLength > 512_000) return null;
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    const json = await new Response(stream).text();
    if (json.length > 96_000) return null;
    return normalizeQuestionEnrichment({ ...JSON.parse(json), confidence: Number(row.confidence) });
  } catch (error) {
    console.error(JSON.stringify({ event: "standalone_question_enrichment_failed", questionId: catalog.question_id, error: String(error) }));
    return null;
  }
}

function standaloneQuestionInline(value, bookId) {
  const source = repairKnownText(bookId, String(value ?? ""))
    .replace(/<br\s*\/?\s*>/giu, "\n");
  return renderMathText(source)
    .replace(/\n/gu, "<br>");
}

function standaloneQuestionUsesFillBlanks(question) {
  if (normalizedQuestionType(question) === "fill_blank" || question?.blanks?.length) return true;
  const prompt = contentToText(question?.prompt ?? question?.prompt_text)
    .normalize("NFKC")
    .replace(/[*_`]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return /\bfill\s+in\s+the\s+blanks?\b/iu.test(prompt);
}

function standaloneColumnTable(value, bookId) {
  const model = parseColumnTablePrompt(value);
  if (!model) return "";
  const before = model.before ? `<p>${standaloneQuestionInline(model.before, bookId)}</p>` : "";
  const after = model.after ? `<p>${standaloneQuestionInline(model.after, bookId)}</p>` : "";
  const headers = model.headers.map((header, index) => {
    const span = model.headerSpans[index];
    return `<th${span > 1 ? ` colspan="${span}" scope="colgroup"` : ' scope="col"'}>${standaloneQuestionInline(header, bookId)}</th>`;
  }).join("");
  const rows = model.rows.map((row) => `<tr>${row.map((cell, index) => {
    const labelClass = model.pairedLabels && index % 2 === 0 ? ' class="question-column-index"' : "";
    return `<td${labelClass}>${standaloneQuestionInline(cell, bookId)}</td>`;
  }).join("")}</tr>`).join("");
  return `${before}<div aria-label="Match-the-column table" class="question-table-scroll question-column-table-scroll" role="region" tabindex="0"><table class="question-column-table"><caption class="sr-only">Items to match between textbook columns</caption>${headers ? `<thead><tr>${headers}</tr></thead>` : ""}<tbody>${rows}</tbody></table></div>${after}`;
}

function standaloneQuestionBlocks(blocks, bookId) {
  const output = [];
  let paragraphRun = [];
  const flushParagraphRun = () => {
    if (!paragraphRun.length) return;
    const combined = paragraphRun.map((block) => block.text).join("\n");
    const columnTable = standaloneColumnTable(combined, bookId);
    output.push(columnTable || paragraphRun.map((block) => standaloneQuestionContent(block, bookId)).join(""));
    paragraphRun = [];
  };
  for (const block of blocks || []) {
    if (block?.kind === "paragraph" && typeof block.text === "string") {
      paragraphRun.push(block);
      continue;
    }
    flushParagraphRun();
    output.push(standaloneQuestionContent(block, bookId));
  }
  flushParagraphRun();
  return output.join("");
}

function standaloneQuestionContent(value, bookId) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const columnTable = standaloneColumnTable(value, bookId);
    if (columnTable) return columnTable;
    return `<p>${standaloneQuestionInline(value, bookId)}</p>`;
  }
  if (Array.isArray(value)) return value.map((item) => standaloneQuestionContent(item, bookId)).join("");
  if (value.kind === "blocks" || Array.isArray(value.blocks)) {
    return standaloneQuestionBlocks(value.blocks || [], bookId);
  }
  if (value.kind === "paragraph" || typeof value.text === "string") {
    const columnTable = standaloneColumnTable(value.text, bookId);
    if (columnTable) return columnTable;
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

function standaloneQuestionMedia(items, label, bookId, placement = "") {
  const media = (items || []).map((item, index) => {
    const alt = String(item?.alt || "").trim().toLocaleLowerCase("en-IN") === "image"
      ? `${label} illustration`
      : String(item?.alt || `${label} illustration`);
    const caption = String(item?.caption || "").trim();
    return `<figure><img alt="${escapeHtmlAttribute(alt)}" decoding="async" height="${Number(item?.height) || 640}" loading="lazy" src="${escapeHtmlAttribute(standaloneMediaUrl(item?.url || item?.fallbackUrl))}" width="${Number(item?.width) || 960}">${caption ? `<figcaption>${standaloneQuestionInline(caption, bookId)}</figcaption>` : ""}</figure>`;
  }).join("");
  const placementAttribute = placement ? ` data-solution-media-placement="${escapeHtmlAttribute(placement)}"` : "";
  return media ? `<div class="question-media-gallery"${placementAttribute}>${media}</div>` : "";
}

function standaloneQuestionChoices(question, bookId) {
  if (!question?.choices?.length) return "";
  const correctIds = new Set(
    (question.correctChoiceIds || (question.correctChoiceId ? [question.correctChoiceId] : []))
      .map((choiceId) => String(choiceId).toLocaleLowerCase("en-IN")),
  );
  return `<ol class="question-choice-list choice-list">${question.choices.map((choice) => `<li${correctIds.has(choice.id) ? ' class="is-correct"' : ""}><b class="choice-marker">${escapeHtmlAttribute(String(choice.id || "").toUpperCase())}</b><span class="choice-copy">${standaloneQuestionInline(choice.content, bookId)}</span>${correctIds.has(choice.id) ? '<small class="choice-correct-label">Correct option</small>' : ""}</li>`).join("")}</ol>`;
}

function standaloneCompletedFillBlank(model, bookId) {
  if (!model) return "";
  const content = model.answers.map((answer, index) => `${standaloneQuestionInline(model.parts[index], bookId)}<strong class="fill-blank-answer">${standaloneQuestionInline(answer, bookId)}</strong>`).join("");
  return `<p class="fill-blank-completed-sentence">${content}${standaloneQuestionInline(model.parts.at(-1), bookId)}</p>`;
}

function standaloneAnswerSectionLabels(markup) {
  return String(markup || "").replace(
    /<p><strong>([^<]{1,80}:)<\/strong><\/p>/giu,
    '<p class="answer-section-label"><strong>$1</strong></p>',
  );
}

function standaloneQuestionSolution(question, bookId) {
  const parts = [];
  const completedFillBlank = standaloneQuestionUsesFillBlanks(question) ? buildCompletedFillBlank(question) : null;
  const finalAnswer = questionAnswerOverride({ question_id: question.id }) || question.finalAnswer;
  if (completedFillBlank) parts.push(`<section aria-label="Answer">${standaloneCompletedFillBlank(completedFillBlank, bookId)}</section>`);
  else if (question.answer != null) parts.push(`<section aria-label="Answer">${standaloneAnswerSectionLabels(standaloneQuestionContent(question.answer, bookId))}</section>`);
  if (!completedFillBlank && question.answers?.length) parts.push(`<section aria-label="Answers">${standaloneQuestionContent({ kind: "list", items: question.answers }, bookId)}</section>`);
  if (question.explanation != null) parts.push(`<section aria-label="Explanation">${standaloneQuestionContent(question.explanation, bookId)}</section>`);
  if (question.steps?.length) {
    const repeatsEarlierSolution = questionHasRepeatedProofPresentation(question, finalAnswer);
    const clearerViewHeading = repeatsEarlierSolution
      ? `<header class="same-solution-divider"><span>Same solution · clearer view</span><strong>Organised step by step</strong><small>The method and answer are unchanged. The steps below present the explanation above in an easier-to-follow format.</small></header>`
      : "";
    parts.push(`<section aria-label="Solution steps">${clearerViewHeading}<ol class="question-step-list solution-steps">${question.steps.map((step, index) => `<li><span class="sr-only">Step ${index + 1}</span>${standaloneQuestionContent(step.content, bookId)}</li>`).join("")}</ol></section>`);
  }
  if (question.comparison != null) parts.push(`<section><h3>Comparison</h3>${standaloneQuestionContent(question.comparison, bookId)}</section>`);
  if (question.matches?.length) parts.push(`<section><h3>Matches</h3>${standaloneQuestionContent(question.matches, bookId)}</section>`);
  if (!completedFillBlank && question.blanks?.length) {
    const blankAnswers = question.blanks.map((blank) => blank.answer ?? blank);
    parts.push(`<section><h3>Completed blanks</h3><ul>${blankAnswers.map((answer) => `<li><strong class="fill-blank-answer">${standaloneQuestionInline(answer, bookId)}</strong></li>`).join("")}</ul></section>`);
  }
  if (!completedFillBlank && finalAnswer != null) parts.push(`<section class="final-answer"><h3>Final answer</h3>${standaloneQuestionContent(finalAnswer, bookId)}</section>`);
  if (!parts.length) parts.push(`<section><h3>Direct answer</h3><p>${standaloneQuestionInline(conciseDirectAnswer(question), bookId)}</p></section>`);
  return parts.join("");
}

const STUDYWUDY_QUESTION_THEME_ASSETS = `<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2212%22%20fill%3D%22%230757d8%22%2F%3E%3Ctext%20x%3D%2232%22%20y%3D%2245%22%20text-anchor%3D%22middle%22%20font-family%3D%22Arial%2Csans-serif%22%20font-size%3D%2240%22%20font-weight%3D%22700%22%20fill%3D%22white%22%3ES%3C%2Ftext%3E%3C%2Fsvg%3E"><link rel="preload" href="/_next/static/media/a343f882a40d2cc9-s.p.1sj6eobyi31rd.woff2" as="font" crossorigin type="font/woff2"><link rel="stylesheet" href="/_next/static/chunks/1j8ahw0e9ui5v.css"><link rel="stylesheet" href="/_next/static/chunks/3c4-ozf1dxam2.css"><link rel="stylesheet" href="/_next/static/chunks/3utpp1hmg6_bb.css"><link rel="stylesheet" href="/_next/static/chunks/0u6271lmf-stj.css">`;

const STANDALONE_QUESTION_STYLES = `<style data-studywudy-question-render="canonical-single-pass-v2-themed">
.standalone-question-page .answer-page-main{min-width:0}.standalone-question-page .question-card{overflow:visible}.standalone-question-page .question-prompt>.rich-copy{display:grid;gap:.6rem}.standalone-question-page .question-prompt>.rich-copy>p{margin:0}.standalone-question-page .question-media-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:18px}.standalone-question-page .question-media-gallery figure{margin:0}.standalone-question-page .question-media-gallery img{display:block;width:100%;height:auto;border:2px solid var(--ink);border-radius:4px;background:#fff;box-shadow:4px 5px 0 var(--ink)}.standalone-question-page .question-media-gallery figcaption{margin-top:9px;color:var(--ink-soft);font-size:.75rem;font-weight:700}.standalone-question-page .question-choice-list{margin:18px 0 0;padding:0}.standalone-question-page .question-choice-list li{list-style:none}.standalone-question-page .solution-body>section{padding:18px 0;border-top:1px dashed #10131661}.standalone-question-page .solution-body>section:first-of-type{border-top:0}.standalone-question-page .solution-body>section>h3{margin:0 0 10px;font-size:1rem;font-weight:950}.standalone-question-page .solution-body>section>p,.standalone-question-page .solution-body>section>.rich-copy p{margin:.45rem 0}.standalone-question-page .solution-steps>li>span.sr-only{position:absolute}.standalone-question-page .question-table-scroll{max-width:100%;margin:12px 0 20px;overflow-x:auto;border:2px solid var(--ink);box-shadow:4px 5px 0 var(--ink)}.standalone-question-page .question-table-scroll table{width:100%;min-width:560px;border-collapse:collapse;background:var(--white)}.standalone-question-page .question-table-scroll th,.standalone-question-page .question-table-scroll td{padding:11px 13px;border:1px solid var(--ink);text-align:left}.standalone-question-page .question-table-scroll th{background:var(--violet);color:#fff}.standalone-question-page .phase4-review-signal{margin:22px 0;border:3px solid var(--ink);border-left:9px solid var(--mint);border-radius:5px;background:var(--white);box-shadow:5px 6px 0 var(--ink)}.standalone-question-page .phase4-review-signal.is-pending{border-left-color:var(--gold)}.standalone-question-page .question-source-note{padding:12px;border:2px solid var(--ink);background:var(--gold-soft)}.standalone-question-page .question-trust-panel,.standalone-question-page .question-answer-summary,.standalone-question-page .question-specific-panel,.standalone-question-page .question-exercise-card{border-color:var(--ink);border-radius:5px;box-shadow:4px 5px 0 var(--ink)}.standalone-question-page .question-answer-summary{background:var(--white)}.standalone-question-page .question-answer-summary ol li{border-color:var(--ink);border-radius:3px;background:var(--gold-soft)}.standalone-question-page .question-answer-label,.standalone-question-page .question-specific-panel>span,.standalone-question-page .question-exercise-related header>span,.standalone-question-page .question-solution-overview>span{color:var(--violet)}.standalone-question-page .question-solution-overview{border:2px solid var(--ink);border-radius:4px;background:var(--paper-deep)}.standalone-question-page .question-solution-overview li{border:1px solid var(--ink);border-radius:3px}.standalone-question-page .question-specific-panel{background:var(--white)}.standalone-question-page .question-trust-panel{border-left-width:9px;background:var(--paper-deep)}.standalone-question-page .question-trust-row,.standalone-question-page .question-human-review,.standalone-question-page .question-report-error{border-color:var(--ink);border-radius:3px}.standalone-question-page .question-exercise-card{transition:transform .16s,box-shadow .16s}.standalone-question-page .question-exercise-card:hover{box-shadow:2px 3px 0 var(--ink);transform:translate(2px,2px)}.standalone-question-page .answer-page-chapter span{margin-right:10px}.standalone-question-page .answer-context dl{margin:0}.standalone-question-page .answer-context dl div{padding:9px 0}.standalone-question-page .answer-context dt{color:var(--ink-soft);font-size:.65rem;font-weight:800;text-transform:uppercase}.standalone-question-page .answer-context dd{margin:2px 0 0;font-weight:850}.standalone-question-page .footer-nav{grid-template-columns:repeat(3,minmax(0,1fr))}.standalone-question-page .phase5-native-links{display:grid;align-content:start;gap:8px}.standalone-question-page .footer-intro h2{color:#fff}.standalone-question-page .footer-banner strong{color:var(--ink)}
.standalone-question-page .question-prompt>.rich-copy.rich-copy-math-layout .math-inline:has(mtable){vertical-align:middle;margin-inline:.1em}
.standalone-question-page .solution-body>div>section[aria-label="Answer"]{display:flow-root}
.standalone-question-page .solution-body>div>section[aria-label="Answer"]>p,.standalone-question-page .solution-body>div>section[aria-label="Answer"]>ul,.standalone-question-page .solution-body>div>section[aria-label="Answer"]>ol{margin:0 0 .9rem}
.standalone-question-page .solution-body>div>section[aria-label="Answer"]>p:last-child,.standalone-question-page .solution-body>div>section[aria-label="Answer"]>ul:last-child,.standalone-question-page .solution-body>div>section[aria-label="Answer"]>ol:last-child{margin-bottom:0}
.standalone-question-page .solution-body>div>section[aria-label="Answer"]>p.answer-section-label{margin-top:1.15rem;margin-bottom:.35rem}
.standalone-question-page .solution-body>div>section[aria-label="Answer"]>ul,.standalone-question-page .solution-body>div>section[aria-label="Answer"]>ol{padding-inline-start:1.35rem}
.standalone-question-page .solution-body>div>section[aria-label="Answer"]>ul{list-style:disc}
.standalone-question-page .solution-body>div>section[aria-label="Answer"]>ol{list-style:decimal}
.standalone-question-page .solution-body>div>section[aria-label="Answer"]>ul>li,.standalone-question-page .solution-body>div>section[aria-label="Answer"]>ol>li{padding-inline-start:.15rem}
.standalone-question-page .solution-body>div>section[aria-label="Answer"]>ul>li+li,.standalone-question-page .solution-body>div>section[aria-label="Answer"]>ol>li+li{margin-top:.65rem}
.standalone-question-page .question-card[data-question-answer-format="fill-blank"] .solution-body>div strong{font-weight:950;text-decoration-line:underline;text-decoration-thickness:2px;text-underline-offset:3px;text-decoration-skip-ink:auto}
.standalone-question-page .solution-body section:has(>.same-solution-divider){margin-top:10px;padding-top:22px!important;border-top:3px solid var(--ink)!important}
.standalone-question-page .same-solution-divider{display:grid;grid-template-columns:auto minmax(0,1fr);gap:5px 12px;align-items:center;margin:0 0 6px;padding:0 0 16px}
.standalone-question-page .same-solution-divider>span{grid-row:1/3;align-self:stretch;display:grid;place-items:center;max-width:132px;padding:9px 11px;border:2px solid var(--ink);border-radius:4px;background:var(--violet);box-shadow:3px 4px 0 var(--ink);color:var(--white);font-family:var(--font-geist-mono,ui-monospace,monospace);font-size:.62rem;font-weight:900;letter-spacing:.075em;line-height:1.45;text-align:center;text-transform:uppercase}
.standalone-question-page .same-solution-divider>strong{color:var(--ink);font-size:1rem;font-weight:950;line-height:1.3}
.standalone-question-page .same-solution-divider>small{color:var(--ink-soft);font-size:.78rem;font-weight:650;line-height:1.5}
.standalone-question-page .solution-body [data-solution-media-placement="contextual-v1"]{margin:18px 0 24px}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-pagination{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:26px 0 32px}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-pagination-item{display:flex;min-height:70px;padding:15px 14px 13px;border:3px solid var(--ink);border-radius:6px;background:var(--white);box-shadow:6px 7px 0 var(--ink);color:var(--ink);text-decoration:none;transition:transform .16s,box-shadow .16s}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-pagination-item.is-previous{grid-column:1;align-items:flex-start;text-align:left}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-pagination-item.is-next{grid-column:2;align-items:flex-end;background:#0757d8;color:var(--white);text-align:right}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-pagination-copy{display:flex;flex:1;flex-direction:column;gap:8px;justify-content:center}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-pagination-item span{color:var(--ink-soft);font-size:.63rem;font-weight:650;line-height:1;text-transform:uppercase}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-pagination-item strong{color:var(--coral);font-size:.78rem;font-weight:900;line-height:1.2}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-pagination-item.is-next span,.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-pagination-item.is-next strong{color:var(--white)}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] a.priority-question-pagination-item:hover{box-shadow:2px 3px 0 var(--ink);transform:translate(2px,2px)}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] a.priority-question-pagination-item:focus-visible{outline:4px solid var(--gold);outline-offset:4px}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-study-details{display:grid;gap:22px;margin:32px 0}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-study-details>.question-solution-overview,.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-study-details>.question-specific-grid{margin:0}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .pattern-code{color:#064fc5}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-analysis{display:grid;gap:14px;margin:32px 0;padding:20px;border:3px solid var(--ink);border-top:8px solid var(--mint);border-radius:6px;background:var(--white);box-shadow:6px 7px 0 var(--ink)}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-analysis>span{color:#17614f;font-family:var(--font-geist-mono,ui-monospace,monospace);font-size:.72rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-analysis>h2,.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-analysis>p{margin:0}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-analysis>p{color:var(--ink-soft);line-height:1.65}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-analysis ul{display:grid;gap:10px;margin:0;padding:0;list-style:none}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-analysis li{display:grid;grid-template-columns:38px minmax(0,1fr);gap:12px;min-width:0;padding:13px;border:2px solid var(--ink);border-radius:4px;background:var(--paper-deep)}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-analysis li:nth-child(1){background:var(--coral-soft)}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-analysis li:nth-child(2){background:var(--violet-soft)}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-analysis li:nth-child(3){background:var(--gold-soft)}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-analysis li>b{display:grid;place-items:center;width:34px;height:34px;border:2px solid var(--ink);border-radius:50%;background:var(--white);color:var(--ink);font-size:.75rem;font-weight:950}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-analysis li>div{min-width:0}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-analysis h3{margin:0;font-size:.86rem;font-weight:950;line-height:1.35}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-analysis li p{margin:5px 0 0;color:var(--ink-soft);font-size:.78rem;font-weight:600;line-height:1.6}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-source{padding-top:2px;color:var(--ink-soft);font-size:.7rem;font-weight:750}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-official-source{display:grid;gap:12px;margin:32px 0;padding:20px;border:3px solid var(--ink);border-top:8px solid var(--violet);border-radius:6px;background:var(--white);box-shadow:6px 7px 0 var(--ink)}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-official-source>span{color:var(--violet);font-family:var(--font-geist-mono,ui-monospace,monospace);font-size:.72rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-official-source h2,.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-official-source p{margin:0}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-official-source dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px;margin:0}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-official-source dl div{min-width:0;padding:9px 0;border-top:1px solid #10131640}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-official-source dt{color:var(--ink-soft);font-size:.72rem;font-weight:800;text-transform:uppercase}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-official-source dd{min-width:0;margin:3px 0 0;font-weight:800}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-official-source dd code{display:block;max-width:100%;overflow-wrap:anywhere;word-break:break-word;font-size:.78rem;line-height:1.45}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-official-source a{justify-self:start;min-height:44px;padding:11px 14px;border:2px solid var(--ink);border-radius:4px;background:var(--gold);color:var(--ink);font-weight:900;text-decoration:none;box-shadow:3px 4px 0 var(--ink)}
.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-official-source a:focus-visible{outline:4px solid var(--violet);outline-offset:4px}
.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-panel{display:grid;gap:14px;margin:32px 0;padding:20px;border:3px solid var(--ink);border-top:8px solid var(--mint);border-radius:6px;background:var(--white);box-shadow:6px 7px 0 var(--ink)}
.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-panel>span{color:#17614f;font-family:var(--font-geist-mono,ui-monospace,monospace);font-size:.72rem;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-panel>h2,.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-panel h3,.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-panel p{margin:0}
.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-panel>section{display:grid;gap:10px;padding-top:14px;border-top:1px dashed #10131661}
.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-panel>section>ol{display:grid;gap:8px;margin:0;padding-left:1.3rem}
.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-concept{display:grid;gap:8px;color:var(--ink-soft);line-height:1.7}
.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-concept>p{margin:0}
.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-choices{display:grid;gap:10px;margin:0;padding:0;list-style:none}
.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-choices li{display:grid;grid-template-columns:38px minmax(0,1fr);gap:12px;padding:13px;border:2px solid var(--ink);border-radius:4px;background:var(--violet-soft)}
.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-choices li:nth-child(3n+1){background:var(--coral-soft)}
.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-choices li:nth-child(3n){background:var(--gold-soft)}
.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-choices li>b{display:grid;place-items:center;width:34px;height:34px;border:2px solid var(--ink);border-radius:50%;background:var(--white);font-size:.75rem;font-weight:950}
.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-choices li p{margin-top:5px;color:var(--ink-soft);font-size:.78rem;font-weight:600;line-height:1.6}
.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-checks:empty{display:none}
.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-checks aside{display:grid;gap:7px;padding:13px;border:2px solid var(--ink);border-radius:4px;background:var(--paper-deep)}
.standalone-question-page .related-media{overflow:hidden;background:var(--white)}
.standalone-question-page .related-media img{display:block;width:100%;height:100%;object-fit:contain}
.standalone-question-page .question-exercise-card .related-media{display:grid;width:100%;height:140px;margin:12px 0 14px;border:2px solid var(--ink);border-radius:4px;background:var(--white)}
@media(max-width:780px){.standalone-question-page .question-media-gallery{grid-template-columns:1fr}.standalone-question-page .answer-page-layout{display:block}.standalone-question-page .question-chapter-rail,.standalone-question-page .answer-context{display:none}.standalone-question-page .footer-nav{grid-template-columns:1fr 1fr}}
@media(max-width:540px){.standalone-question-page .question-prompt>.rich-copy.rich-copy-math-layout>p br{content:"";display:block;margin-top:.35rem}.standalone-question-page .question-answer-summary{box-shadow:3px 4px 0 var(--ink);padding:14px 12px}.standalone-question-page .question-trust-panel{box-shadow:3px 4px 0 var(--ink);padding:14px 12px}.standalone-question-page .footer-nav{grid-template-columns:1fr}.standalone-question-page .same-solution-divider{grid-template-columns:1fr;gap:8px}.standalone-question-page .same-solution-divider>span{grid-row:auto;justify-self:start;max-width:none;padding:6px 9px}.standalone-question-page .same-solution-divider>strong{font-size:.92rem}.standalone-question-page .same-solution-divider>small{font-size:.74rem}.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-analysis,.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-official-source,.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-panel{padding:14px}.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-option-analysis li,.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-choices li{grid-template-columns:34px minmax(0,1fr);gap:10px;padding:11px}.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-official-source dl,.standalone-question-page[data-studywudy-question-structure="sitewide-v1"] .question-enrichment-checks{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.standalone-question-page[data-studywudy-question-priority="pilot-v1"] .priority-question-pagination-item{transition:none}.standalone-question-page[data-studywudy-question-priority="pilot-v1"] a.priority-question-pagination-item:hover{transform:none}}
</style>${QUESTION_PAGE_THEME_ALIGNMENT_STYLES}`;

const QUESTION_COLUMN_TABLE_STYLES = `<style data-studywudy-column-table="sitewide-v1">
.standalone-question-page .question-column-table-scroll{margin:12px 0 20px;border:3px solid var(--ink);border-top:8px solid #0757d8;border-radius:6px;background:var(--white);box-shadow:6px 7px 0 var(--ink);scrollbar-color:#0757d8 var(--paper-deep);scrollbar-width:thin}
.standalone-question-page .question-column-table-scroll:focus-visible{outline:4px solid var(--gold);outline-offset:4px}
.standalone-question-page .question-column-table{table-layout:fixed}
.standalone-question-page .question-column-table thead th{padding:13px 14px;border:2px solid var(--ink);background:#0757d8;color:var(--white);font-family:var(--font-geist-mono,ui-monospace,monospace);font-size:.73rem;font-weight:900;letter-spacing:.06em;line-height:1.45;text-transform:uppercase}
.standalone-question-page .question-column-table tbody td{padding:12px 14px;border:2px solid var(--ink);font-weight:650;line-height:1.5;vertical-align:top}
.standalone-question-page .question-column-table tbody tr:nth-child(4n+1) td{background:var(--violet-soft)}
.standalone-question-page .question-column-table tbody tr:nth-child(4n+2) td{background:var(--coral-soft)}
.standalone-question-page .question-column-table tbody tr:nth-child(4n+3) td{background:var(--mint-soft)}
.standalone-question-page .question-column-table tbody tr:nth-child(4n) td{background:var(--gold-soft)}
.standalone-question-page .question-column-table td.question-column-index{width:58px;background:var(--paper-deep);font-family:var(--font-geist-mono,ui-monospace,monospace);font-size:.78rem;font-weight:950;text-align:center;white-space:nowrap}
@media(max-width:540px){.standalone-question-page .question-column-table-scroll{box-shadow:4px 5px 0 var(--ink)}.standalone-question-page .question-column-table thead th,.standalone-question-page .question-column-table tbody td{padding:10px 11px}}
</style>`;

const HORIZONTAL_SCROLL_CUE_STYLES = `<style data-studywudy-horizontal-scroll="${HORIZONTAL_SCROLL_CUE_RELEASE}">
.standalone-question-page .question-table-scroll.has-horizontal-scroll-cue{margin-bottom:0;scrollbar-width:none}
.standalone-question-page .question-table-scroll.has-horizontal-scroll-cue::-webkit-scrollbar{height:0}
.standalone-question-page .question-horizontal-scroll-cue{position:relative;height:7px;margin:4px 8px 9px;overflow:hidden;border:2px solid var(--ink);border-radius:999px;background:var(--paper-deep);box-shadow:2px 2px 0 var(--ink);opacity:0;pointer-events:none;transition:opacity .18s ease}
.standalone-question-page .question-horizontal-scroll-cue.is-visible{opacity:1}
.standalone-question-page .question-horizontal-scroll-cue[hidden]{display:none}
.standalone-question-page .question-horizontal-scroll-cue>span{position:absolute;inset-block:0;left:0;min-width:28px;border-radius:999px;background:#0757d8;transition:left .08s linear}
@media(prefers-reduced-motion:reduce){.standalone-question-page .question-horizontal-scroll-cue,.standalone-question-page .question-horizontal-scroll-cue>span{transition:none}}
</style>`;

function standaloneQuestionBreadcrumbItems(row, route) {
  return Object.freeze([
    { name: "Home", href: "/" },
    { name: row.board_short_name || row.board_name, href: `/${route.board}` },
    { name: row.grade_label, href: `/${route.board}/${route.grade}` },
    { name: row.subject_name, href: `/${route.board}/${route.grade}/${route.subject}` },
    { name: row.book_title, href: `/${route.board}/${route.grade}/${route.subject}/${route.book}` },
    { name: row.chapter_title, href: `/${route.board}/${route.grade}/${route.subject}/${route.book}/${route.chapter}` },
    { name: `Question ${row.display_label}`, href: `/${route.board}/${route.grade}/${route.subject}/${route.book}/${route.chapter}/questions/${route.question}` },
  ].map((item) => Object.freeze(item)));
}

function standaloneQuestionBreadcrumbs(row, route) {
  const items = standaloneQuestionBreadcrumbItems(row, route);
  return `<nav class="breadcrumb-bar" aria-label="Breadcrumb"><ol class="shell breadcrumb-list">${items.map((item, index) => `<li>${index < items.length - 1 ? `<a href="${escapeHtmlAttribute(item.href)}">${escapeHtmlAttribute(item.name)}</a>` : `<span aria-current="page">${escapeHtmlAttribute(item.name)}</span>`}</li>`).join("")}</ol></nav>`;
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

// The rail carries the previous and next questions either side of the current
// one. It is the same pair `standalonePriorityQuestionPagination` renders in the
// main column, so the rail follows textbook order rather than publishing
// eligibility for the same reason that does: eligibility governs recommendations
// and indexing, not whether a student can step to the adjacent source question.
function standaloneQuestionChapterRail(row, route, navigation = null) {
  const chapterHref = `/${route.board}/${route.grade}/${route.subject}/${route.book}/${route.chapter}`;
  const chapterNumber = String(Number(row.chapter_number) || "").padStart(2, "0");
  const previous = navigation?.previous
    ? `<a href="${escapeHtmlAttribute(navigation.previous.href)}">← Question ${escapeHtmlAttribute(navigation.previous.label)}</a>`
    : "";
  const next = navigation?.next
    ? `<a href="${escapeHtmlAttribute(navigation.next.href)}">Question ${escapeHtmlAttribute(navigation.next.label)} →</a>`
    : "";
  return `<aside aria-label="Chapter question navigation" class="question-chapter-rail"><span>Chapter ${chapterNumber}</span><strong>${escapeHtmlAttribute(row.chapter_title)}</strong><nav aria-label="Nearby questions">${previous}<b aria-current="page">Question ${escapeHtmlAttribute(row.display_label)}</b>${next}</nav><a href="${escapeHtmlAttribute(chapterHref)}">← All chapter questions</a></aside>`;
}

function standaloneQuestionContext(row, route) {
  const chapterHref = `/${route.board}/${route.grade}/${route.subject}/${route.book}/${route.chapter}`;
  const chapterNumber = String(Number(row.chapter_number) || "").padStart(2, "0");
  return `<aside aria-label="Study context" class="answer-context"><span>Study context</span><dl><div><dt>Board</dt><dd>${escapeHtmlAttribute(row.board_short_name || row.board_name)}</dd></div><div><dt>Class</dt><dd>${escapeHtmlAttribute(row.grade_label)}</dd></div><div><dt>Subject</dt><dd>${escapeHtmlAttribute(row.subject_name)}</dd></div><div><dt>Chapter</dt><dd>${chapterNumber} · ${escapeHtmlAttribute(row.chapter_title)}</dd></div></dl><a href="${escapeHtmlAttribute(chapterHref)}">View full chapter →</a></aside>`;
}

function standaloneQuestionFooter() {
  return `<footer class="site-footer"><div class="footer-banner"><div class="shell"><strong><span aria-hidden="true">★</span> Learn in textbook order. Understand every answer.</strong><div aria-label="StudyWudy benefits" role="list"><span role="listitem">Free to study</span><span role="listitem">17 question types</span><span role="listitem">Made for mobile</span></div></div></div><div class="shell footer-grid"><div class="footer-intro"><a class="brand brand-footer" href="/" aria-label="StudyWudy home"><span aria-hidden="true" class="brand-mark" data-nosnippet></span><span>Study<span>Wudy</span></span></a><p class="footer-eyebrow">Clear answers for curious students</p><h2>One clear answer away from understanding it.</h2><p class="footer-note">Board-wise textbook solutions, kept in the same order as your classroom and your book.</p><a class="footer-cta" href="/boards">Find my textbook <span aria-hidden="true">→</span></a></div><nav aria-label="Footer navigation" class="footer-nav"><div><h2>Explore</h2><a href="/boards">Browse all boards <span aria-hidden="true">→</span></a><a href="/search">Question bank <span aria-hidden="true">→</span></a></div><div><h2>Study promise</h2><p><span aria-hidden="true">✓</span> Free to study</p><p><span aria-hidden="true">✓</span> Textbook order</p><p><span aria-hidden="true">✓</span> Mobile friendly</p></div><div class="phase5-native-links"><h2>About</h2><a href="/about/methodology">About &amp; Methodology <span aria-hidden="true">→</span></a><a href="/reviewers">Reviewer registry <span aria-hidden="true">→</span></a><a href="/corrections">Corrections history <span aria-hidden="true">→</span></a><a href="/privacy">Privacy Policy <span aria-hidden="true">→</span></a><a href="/terms">Terms of Service <span aria-hidden="true">→</span></a><a href="/contact">Contact Us <span aria-hidden="true">→</span></a></div></nav></div><div class="shell footer-bottom"><span>© 2026 StudyWudy · Built for curious students.</span><span class="footer-made"><i aria-hidden="true">★</i> Made for students across India</span><a href="#main-content">Back to top <span aria-hidden="true">↑</span></a></div></footer>`;
}

// `row.book_slug` and `row.book_id` are only set on the same-subject fallback
// rows, which come from a different textbook than the page being rendered. Every
// other caller passes rows from `catalog.book_id`, so the route stays the source
// of truth there and these hrefs are unchanged.
function standaloneRelatedQuestionHref(row, route) {
  return `/${route.board}/${route.grade}/${route.subject}/${row.book_slug || route.book}/${row.chapter_slug}/questions/${row.question_id}`;
}

function standaloneRelatedQuestionModel(row, catalog, route, mediaIndex = {}) {
  const type = normalizedQuestionType(row);
  const bookId = row.book_id || catalog.book_id;
  const prompt = truncateSearchExcerpt(createPlainSearchText(repairKnownText(bookId, row.prompt_text)), 170);
  const mediaItem = mediaIndex[String(row.row_id)];
  const mediaSource = mediaItem?.url || mediaItem?.fallbackUrl || "";
  const mediaAlt = String(mediaItem?.alt || "").trim();
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
      bookId,
      row.chapter_slug,
      repairKnownText(bookId, row.chapter_title),
    ),
    fromAnotherBook: Boolean(row.book_slug) && row.book_slug !== route.book,
    prompt,
    media: mediaSource ? Object.freeze({
      src: standaloneMediaUrl(mediaSource),
      alt: mediaAlt && mediaAlt.toLocaleLowerCase("en-IN") !== "image"
        ? mediaAlt
        : `${prompt} — textbook figure`,
      height: Number(mediaItem.height) || 112,
      width: Number(mediaItem.width) || 152,
    }) : null,
  });
}

// Both windows used to be narrow enough that a chapter or textbook with a low
// publish rate could hand back candidates that were entirely ineligible: 51
// published pages rendered no related-question section at all and 1,956 came in
// under the target from `relatedQuestionTargetCount`. Widening to 128/192 covers
// all but 87 of them; past that the extra prompt text costs more per request than
// the remaining pages are worth, so the tail is served by the same-subject
// fallback below instead.
const STANDALONE_SAME_CHAPTER_WINDOW = 128;
const STANDALONE_SAME_TEXTBOOK_WINDOW = 192;
async function standaloneEligibleRelatedQuestions(env, catalog, route, rowId) {
  if (!env.DB?.batch) return Object.freeze({
    sameChapter: Object.freeze([]),
    sameTextbook: Object.freeze([]),
    navigation: Object.freeze({ previous: null, next: null }),
  });
  const projection = `SELECT q.row_id, q.question_id, q.display_label, q.type, q.prompt_text,
    q.chapter_slug, c.title AS chapter_title
    FROM catalog_questions q JOIN catalog_chapters c
      ON c.book_id = q.book_id AND c.slug = q.chapter_slug`;
  try {
    const [results, mediaIndex] = await Promise.all([
      env.DB.batch([
        env.DB.prepare(`${projection}
        WHERE q.book_id = ? AND q.chapter_slug = ? AND q.row_id != ?
        ORDER BY ABS(q.row_id - ?) LIMIT ${STANDALONE_SAME_CHAPTER_WINDOW}`).bind(catalog.book_id, route.chapter, rowId, rowId),
        env.DB.prepare(`${projection}
        WHERE q.book_id = ? AND q.chapter_slug != ? AND q.row_id != ?
        ORDER BY ABS(q.row_id - ?) LIMIT ${STANDALONE_SAME_TEXTBOOK_WINDOW}`).bind(catalog.book_id, route.chapter, rowId, rowId),
      ]),
      loadRelatedQuestionMediaIndex(env, catalog.book_id),
    ]);
    const eligible = (row) => isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, Number(row.row_id))
      && corpusQuestionIndexEligible({
        questionId: row.question_id,
        rowId: Number(row.row_id),
        duplicateRowIds: CORPUS_QUALITY_DUPLICATE_CHOICE_ROW_IDS,
      });
    const sameChapterRows = results[0]?.results || [];
    const eligibleSameChapterRows = sameChapterRows.filter(eligible);
    const sameChapter = eligibleSameChapterRows.slice(0, 4)
      .map((row) => standaloneRelatedQuestionModel(row, catalog, route, mediaIndex));
    const used = new Set(sameChapter.map(({ rowId: relatedRowId }) => relatedRowId));
    const relatedTargetCount = relatedQuestionTargetCount({ rowId, questionId: route.question });
    const relatedRows = [
      ...(results[1]?.results || []).filter(eligible),
      ...eligibleSameChapterRows.filter((row) => !used.has(Number(row.row_id))),
    ].filter((row, index, rows) => rows.findIndex((candidate) => Number(candidate.row_id) === Number(row.row_id)) === index)
      .slice(0, relatedTargetCount);
    // A textbook can be too sparsely published to reach its own target — worst
    // case a single eligible question in the whole book. Those pages borrow from
    // the rest of the subject at the same class level, which is the nearest
    // genuinely related material. This second round trip fires on roughly 0.35%
    // of pages; the primary path is unchanged.
    let borrowedFromSubject = 0;
    if (relatedRows.length < relatedTargetCount) {
      const seen = new Set(relatedRows.map((row) => Number(row.row_id)));
      const fallback = await env.DB.prepare(`SELECT q.row_id, q.question_id, q.display_label, q.type,
        q.prompt_text, q.chapter_slug, q.book_id, c.title AS chapter_title, b.slug AS book_slug
        FROM catalog_questions q
        JOIN catalog_chapters c ON c.book_id = q.book_id AND c.slug = q.chapter_slug
        JOIN catalog_books b ON b.id = q.book_id
        WHERE b.board_slug = ? AND b.grade_slug = ? AND b.subject_slug = ? AND q.book_id != ?
        ORDER BY ABS(q.row_id - ?) LIMIT ?`)
        .bind(route.board, route.grade, route.subject, catalog.book_id, rowId, relatedTargetCount * 6)
        .all();
      for (const row of (fallback?.results || []).filter(eligible)) {
        if (relatedRows.length >= relatedTargetCount) break;
        if (seen.has(Number(row.row_id))) continue;
        seen.add(Number(row.row_id));
        relatedRows.push(row);
        borrowedFromSubject += 1;
      }
    }
    if (relatedRows.length < relatedTargetCount) {
      // Distinct from `standalone_related_questions_failed`: nothing threw, the
      // subject simply does not publish enough questions yet. Both used to be
      // invisible, which is why the shortfall went unnoticed.
      console.warn(JSON.stringify({
        event: "standalone_related_questions_short",
        questionId: route.question,
        bookId: catalog.book_id,
        found: relatedRows.length,
        target: relatedTargetCount,
        borrowedFromSubject,
      }));
    }
    const sameTextbook = relatedRows.map((row) => standaloneRelatedQuestionModel(row, catalog, route, mediaIndex));
    const relatedIncludesSameChapter = relatedRows.some((row) => row.chapter_slug === route.chapter && !row.book_slug);
    // Pagination follows the actual textbook order, including review-held
    // pages. Publishing eligibility controls recommendations and indexing,
    // not whether a student can move to the adjacent source question.
    const previousRow = sameChapterRows
      .filter((row) => Number(row.row_id) < rowId)
      .sort((left, right) => Number(right.row_id) - Number(left.row_id))[0];
    const nextRow = sameChapterRows
      .filter((row) => Number(row.row_id) > rowId)
      .sort((left, right) => Number(left.row_id) - Number(right.row_id))[0];
    const navigation = Object.freeze({
      previous: previousRow ? standaloneRelatedQuestionModel(previousRow, catalog, route, mediaIndex) : null,
      next: nextRow ? standaloneRelatedQuestionModel(nextRow, catalog, route, mediaIndex) : null,
    });
    return Object.freeze({
      sameChapter: Object.freeze(sameChapter),
      sameTextbook: Object.freeze(sameTextbook),
      relatedTargetCount,
      relatedIncludesSameChapter,
      navigation,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "standalone_related_questions_failed", questionId: route.question, error: String(error) }));
    return Object.freeze({
      sameChapter: Object.freeze([]),
      sameTextbook: Object.freeze([]),
      navigation: Object.freeze({ previous: null, next: null }),
    });
  }
}

function standaloneRelatedQuestionMedia(card) {
  if (!card.media) return "";
  return `<span class="related-media"><img alt="${escapeHtmlAttribute(card.media.alt)}" decoding="async" height="${card.media.height}" loading="lazy" src="${escapeHtmlAttribute(card.media.src)}" width="${card.media.width}"></span>`;
}

function standaloneRelatedQuestionSections(recommendations, catalog, route) {
  // Sparsely published textbooks top the list up from the rest of the subject, so
  // the count line cannot claim every card comes from this book.
  const borrowedCount = recommendations.sameTextbook.filter((card) => card.fromAnotherBook).length;
  const relatedSummary = borrowedCount
    ? `${recommendations.sameTextbook.length} questions from this textbook and other ${escapeHtmlAttribute(catalog.subject_name)} books for ${escapeHtmlAttribute(catalog.grade_label)}.`
    : `${recommendations.sameTextbook.length} questions from this textbook.`;
  const sameChapter = recommendations.sameChapter.length
    ? `<section class="question-exercise-related" aria-labelledby="same-chapter-heading"><header><span>Same chapter</span><h2 id="same-chapter-heading">More questions from ${escapeHtmlAttribute(catalog.chapter_title)}</h2></header><div>${recommendations.sameChapter.map((card) => `<a class="question-exercise-card${card.media ? " has-related-media" : ""}" href="${escapeHtmlAttribute(card.href)}" data-related-question-row-id="${card.rowId}"><span>${escapeHtmlAttribute(card.typeLabel)}</span><strong>Question ${escapeHtmlAttribute(card.label)}</strong><p>${escapeHtmlAttribute(card.prompt)}</p>${standaloneRelatedQuestionMedia(card)}<b>View answer →</b></a>`).join("")}</div></section>`
    : "";
  const sameTextbook = recommendations.sameTextbook.length
    ? `<section class="related-questions" aria-labelledby="related-questions-heading" data-related-question-count="${recommendations.sameTextbook.length}" data-related-question-target="${Number(recommendations.relatedTargetCount) || recommendations.sameTextbook.length}"><header class="related-questions-heading"><div><span aria-hidden="true">+</span><div><small>Keep learning</small><h2 id="related-questions-heading">Related questions</h2></div></div><p>${relatedSummary}</p></header><div class="related-question-grid">${recommendations.sameTextbook.map((card) => `<a class="related-question-link${card.media ? " has-related-media" : ""}" href="${escapeHtmlAttribute(card.href)}" data-related-question-row-id="${card.rowId}"><span class="related-question-number">Q ${escapeHtmlAttribute(card.label)}</span>${standaloneRelatedQuestionMedia(card)}<div class="related-question-preview"><div class="related-question-copy">${escapeHtmlAttribute(card.prompt)}</div><small>${escapeHtmlAttribute(card.chapter)}</small></div><b><span>Open</span> →</b></a>`).join("")}</div></section>`
    : "";
  return Object.freeze({ sameChapter, sameTextbook, relatedIncludesSameChapter: Boolean(recommendations.relatedIncludesSameChapter) });
}

function standalonePriorityQuestionPagination(navigation, catalog, route) {
  const chapterHref = `/${route.board}/${route.grade}/${route.subject}/${route.book}/${route.chapter}`;
  const item = (card, direction) => {
    if (!card) return "";
    const isPrevious = direction === "previous";
    const directionLabel = isPrevious ? "Previous" : "Next";
    const directionClass = isPrevious ? "is-previous" : "is-next";
    const questionLink = isPrevious
      ? `← Question ${escapeHtmlAttribute(card.label)}`
      : `Question ${escapeHtmlAttribute(card.label)} →`;
    return `<a class="priority-question-pagination-item ${directionClass}" href="${escapeHtmlAttribute(card.href)}"><span class="priority-question-pagination-copy"><span>${directionLabel}</span><strong>${questionLink}</strong></span></a>`;
  };
  const paginationItems = [item(navigation?.previous, "previous"), item(navigation?.next, "next")].filter(Boolean);
  if (!paginationItems.length) return "";
  const itemCountClass = paginationItems.length === 1 ? "has-single-item" : "has-two-items";
  return `<nav class="question-pagination priority-question-pagination ${itemCountClass}" aria-label="Previous and next questions">${paginationItems.join("")}<a class="sr-only" href="${escapeHtmlAttribute(chapterHref)}">View all questions in this chapter</a></nav>`;
}

function priorityQuestionPilotRouteMatches(route, rowId) {
  return Number(rowId) === PRIORITY_QUESTION_PILOT_ROW_ID
    && route?.board === "maharashtra-board"
    && route?.grade === "class-12"
    && route?.subject === "biology"
    && route?.book === "balbharati-biology-standard-12"
    && route?.chapter === PRIORITY_QUESTION_SOURCE_REVIEW.chapterSlug
    && route?.question === PRIORITY_QUESTION_SOURCE_REVIEW.questionId;
}

function priorityQuestionPilotSourceMatches({ payload, catalog, question, route }) {
  return priorityQuestionPilotRouteMatches(route, catalog?.row_id)
    && catalog?.book_id === PRIORITY_QUESTION_SOURCE_REVIEW.bookId
    && String(payload?.sourceChecksum || "") === PRIORITY_QUESTION_SOURCE_REVIEW.sourcePayloadChecksum
    && question?.id === PRIORITY_QUESTION_SOURCE_REVIEW.questionId
    && question?.correctChoiceId === "a"
    && Array.isArray(question?.choices)
    && question.choices.length === 4;
}

function applyPriorityQuestionSourceReview(model) {
  const evidenceUrl = `${PRIORITY_QUESTION_SOURCE_REVIEW.sourceUrl}#page=26`;
  return {
    ...model,
    edition: PRIORITY_QUESTION_SOURCE_REVIEW.edition,
    academicYear: PRIORITY_QUESTION_SOURCE_REVIEW.academicYear,
    editionStatus: `Authoritative textbook mapping verified against the official Balbharati Biology Standard XII PDF, ${PRIORITY_QUESTION_SOURCE_REVIEW.edition}.`,
    trust: {
      ...model.trust,
      sourceMappingVerified: true,
      authoritativeSourceMapping: Object.freeze({
        status: "verified",
        verified: true,
        detail: `The exact question and options were checked on ${PRIORITY_QUESTION_SOURCE_REVIEW.questionPages}; the supporting entomophily concept was checked on ${PRIORITY_QUESTION_SOURCE_REVIEW.conceptPages}.`,
        evidenceUrl,
        evidenceLabel: "Official Balbharati Biology Standard XII PDF",
      }),
      sourcePages: `${PRIORITY_QUESTION_SOURCE_REVIEW.questionPages}; ${PRIORITY_QUESTION_SOURCE_REVIEW.conceptPages}`,
      edition: PRIORITY_QUESTION_SOURCE_REVIEW.edition,
      academicYear: PRIORITY_QUESTION_SOURCE_REVIEW.academicYear,
    },
  };
}

function priorityQuestionOptionReasoningPanel() {
  const source = PRIORITY_QUESTION_SOURCE_REVIEW;
  const reasoning = source.distractorReasoning.map((item) => `<li data-choice-id="${escapeHtmlAttribute(item.choiceId)}"><b aria-hidden="true">${escapeHtmlAttribute(item.choiceId)}</b><div><h3>${escapeHtmlAttribute(item.choiceText)}</h3><p>${escapeHtmlAttribute(item.explanation)}</p></div></li>`).join("");
  return `<section class="priority-question-option-analysis" aria-labelledby="priority-question-option-analysis-heading"><span>Option check</span><h2 id="priority-question-option-analysis-heading">Why the other options do not fit</h2><p>The textbook separates insect-pollination traits from wind-pollination traits. That distinction rules out the remaining choices.</p><ul>${reasoning}</ul><small class="priority-question-option-source">Source basis: ${escapeHtmlAttribute(source.conceptPages)}, official Balbharati Biology Standard XII.</small></section>`;
}

function priorityQuestionOfficialSourcePanel() {
  const source = PRIORITY_QUESTION_SOURCE_REVIEW;
  return `<section class="priority-question-official-source" aria-labelledby="priority-question-official-source-heading"><span>Official source check</span><h2 id="priority-question-official-source-heading">Verified against Balbharati</h2><p>The original question, all four options and the supporting textbook concept were cross-checked without rewriting the question or answer.</p><dl><div><dt>Textbook</dt><dd>Biology Standard XII</dd></div><div><dt>Edition</dt><dd>${escapeHtmlAttribute(source.edition)}</dd></div><div><dt>Question</dt><dd>${escapeHtmlAttribute(source.questionPages)}</dd></div><div><dt>Supporting concept</dt><dd>${escapeHtmlAttribute(source.conceptPages)}</dd></div><div><dt>Checked on</dt><dd>${escapeHtmlAttribute(source.reviewedOn)}</dd></div><div><dt>Official PDF SHA-256</dt><dd><code>${escapeHtmlAttribute(source.sourcePdfSha256)}</code></dd></div></dl><a href="${escapeHtmlAttribute(`${source.sourceUrl}#page=26`)}" rel="external">Open official Balbharati source →</a></section>`;
}

function standaloneQuestionEnrichmentPanel(enrichment, question, catalog) {
  if (!enrichment) return "";
  const correctIds = new Set(
    (question.correctChoiceIds || (question.correctChoiceId ? [question.correctChoiceId] : []))
      .map((choiceId) => String(choiceId).toLocaleLowerCase("en-IN")),
  );
  const choiceById = new Map((question.choices || []).map((choice) => [String(choice.id || "").toLocaleLowerCase("en-IN"), choice]));
  const choiceRows = enrichment.choiceExplanations
    .filter((item) => !correctIds.has(item.choiceId) && choiceById.has(item.choiceId))
    .map((item) => {
      const choice = choiceById.get(item.choiceId);
      return `<li><b aria-hidden="true">${escapeHtmlAttribute(item.choiceId.toUpperCase())}</b><div><h3>${standaloneQuestionInline(choice.content, catalog.book_id)}</h3><p>${standaloneQuestionInline(item.explanation, catalog.book_id)}</p></div></li>`;
    })
    .join("");
  const concept = enrichment.conceptExplanation
    ? `<div class="question-enrichment-concept">${standaloneQuestionContent(enrichment.conceptExplanation, catalog.book_id)}</div>`
    : "";
  const reasoning = enrichment.reasoningSteps.length
    ? `<section><h3>Reasoning path</h3><ol>${enrichment.reasoningSteps.map((step) => `<li>${standaloneQuestionInline(step, catalog.book_id)}</li>`).join("")}</ol></section>`
    : "";
  const choices = choiceRows
    ? `<section><h3>Why the other options do not fit</h3><ul class="question-enrichment-choices">${choiceRows}</ul></section>`
    : "";
  const mistake = enrichment.commonMistake
    ? `<aside><h3>Common mistake</h3><p>${standaloneQuestionInline(enrichment.commonMistake, catalog.book_id)}</p></aside>`
    : "";
  const examTip = enrichment.examTip
    ? `<aside><h3>Exam tip</h3><p>${standaloneQuestionInline(enrichment.examTip, catalog.book_id)}</p></aside>`
    : "";
  const headingId = `${catalog.question_id}-study-notes`;
  return `<section class="question-enrichment-panel" aria-labelledby="${escapeHtmlAttribute(headingId)}" data-enrichment-policy="${QUESTION_ENRICHMENT_POLICY_VERSION}"><span>Additional study notes</span><h2 id="${escapeHtmlAttribute(headingId)}">Understand the answer</h2>${concept}${reasoning}${choices}<div class="question-enrichment-checks">${mistake}${examTip}</div></section>`;
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
  // `catalog.prompt_text` is a second, flattened copy of the prompt, written
  // before the content repair and never rewritten by it. On a repaired question
  // the body renders `$F_{2}$` as maths while the heading, title, description
  // and JSON-LD above it still read `F_(2)`, because those are cut from the
  // column. The chunk is the source of truth and the column is a cache of
  // `contentToText` over it, so reconcile the two before anything reads them.
  const repairedPromptText = contentToText(question.prompt);
  if (repairedPromptText.trim() && repairedPromptText !== catalog.prompt_text) {
    catalog = { ...catalog, prompt_text: repairedPromptText };
  }
  const priorityQuestionPilot = url.pathname.replace(/\/$/u, "") === PRIORITY_QUESTION_PILOT_PATH;
  const priorityQuestionSourceVerified = priorityQuestionPilotSourceMatches({ payload, catalog, question, route });
  const formulaEvaluation = evaluateQuestionFormulaAccessibility(question);
  const promptLayout = normalizeQuestionMathLayout(question.prompt);
  const promptMarkup = standaloneQuestionContent(promptLayout.content, catalog.book_id);
  const promptLayoutClass = promptLayout.enhanced ? " rich-copy-math-layout" : "";
  const choiceMarkup = standaloneQuestionChoices(question, catalog.book_id);
  const promptMedia = standaloneQuestionMedia(question.promptMedia, `Question ${catalog.display_label}`, catalog.book_id);
  const solutionMedia = standaloneQuestionMedia(question.solutionMedia, `Solution for question ${catalog.display_label}`, catalog.book_id, "contextual-v1");
  const solutionMarkup = placeQuestionSolutionMedia({
    solutionMarkup: standaloneQuestionSolution(question, catalog.book_id),
    mediaMarkup: solutionMedia,
    question,
  });
  let model = buildQuestionPageExperience({
    payload,
    context,
    route,
    catalog,
    reviewedAt: PHASE4_GATE_MANIFEST.reviewedAt,
    semanticGraph: null,
  });
  if (model && priorityQuestionSourceVerified) model = applyPriorityQuestionSourceReview(model);
  if (model) model = await filterPublicQuestionRecommendations(env, model);
  let experience = renderQuestionPageExperience(model);
  const renderedMathSurface = `${promptMarkup}${choiceMarkup}${solutionMarkup}${experience?.aboveFold || ""}${experience?.solutionSupplement || ""}`;
  const renderedMathFailures = invalidRenderedMathFound(renderedMathSurface);
  const renderedEquationPass = formulaEvaluation.complete
    && renderedMathFailures.length === 0
    && !/Equation review pending|data-studywudy-equation-review=["']pending/iu.test(renderedMathSurface);
  const rowId = Number(catalog.row_id);
  const publishingManifestEligible = isQuestionPubliclyEligible(PHASE4_GATE_MANIFEST, rowId);
  const priorityQuestionScopedRelease = priorityQuestionSourceVerified && !publishingManifestEligible;
  const indexable = Boolean(
    renderedEquationPass
    && (publishingManifestEligible || priorityQuestionSourceVerified)
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
  const [relatedQuestions, questionEnrichment] = await Promise.all([
    standaloneEligibleRelatedQuestions(env, catalog, route, rowId),
    standaloneQuestionEnrichment(env, catalog),
  ]);
  const relatedQuestionSections = standaloneRelatedQuestionSections(relatedQuestions, catalog, route);
  const sameExerciseOrChapter = relatedQuestionSections.relatedIncludesSameChapter
    ? ""
    : experience?.sameExercise || relatedQuestionSections.sameChapter;

  const directive = indexable
    ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
    : "noindex, follow";
  const disambiguate = QUESTION_SEO_DISAMBIGUATED_ROWS.has(rowId);
  const title = repairKnownText(catalog.book_id, questionDocumentTitle(catalog, disambiguate));
  const socialTitle = repairKnownText(catalog.book_id, questionSocialTitle(catalog, disambiguate));
  const description = priorityQuestionPilot
    ? `Find the correct option, explanation and why the other choices do not fit for ${repairKnownText(catalog.book_id, questionPrompt(catalog))}. Official Balbharati source checked.`
    : repairKnownText(catalog.book_id, questionDescription(catalog, disambiguate));
  const canonical = publicDocumentUrl(url);
  const breadcrumbSchema = renderBreadcrumbStructuredData(standaloneQuestionBreadcrumbItems(catalog, route), new URL(canonical).origin);
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
  const reviewPanel = `<section class="phase4-review-signal${indexable ? "" : " is-pending"}" aria-label="Automated solution publishing check"><a href="/about/methodology">${priorityQuestionScopedRelease ? "✓ Source-verified pilot completeness gate passed" : indexable ? "✓ Automated completeness gate passed" : formulaEvaluation.formulaCount && !renderedEquationPass ? "Equation review pending" : "Automated answer checks incomplete"}</a><small>Automated publishing gate run: ${escapeHtmlAttribute(reviewed)}</small><span>${priorityQuestionScopedRelease ? "The original question, options and answer passed source-integrity, semantic, formula-accessibility, canonical and duplicate-intent checks. Each incorrect option now has textbook-backed reasoning checked against the official Balbharati concept pages. This exact pilot is released through the scoped source-review policy rather than the corpus-wide manifest. This is not a human academic-review claim." : indexable ? "The rendered answer passed type-specific structure, semantic-equation, canonical and duplicate-intent checks. This is not a human academic-review claim." : "This page is noindex and excluded from sitemaps, search results and quality-screened samples until every publishing check passes."}</span></section>`;
  const snippetExclusion = experience?.snippetEligible === false ? " data-nosnippet" : "";
  const questionType = normalizedQuestionType(question);
  const questionAnswerFormat = standaloneQuestionUsesFillBlanks(question) ? ' data-question-answer-format="fill-blank"' : "";
  const questionTypeLabel = subjectAwareQuestionTypeLabel(
    questionType,
    route.subject,
    QUESTION_TYPE_LABELS[questionType] || "Textbook answer",
  );
  const chapterNumber = String(Number(catalog.chapter_number) || "").padStart(2, "0");
  const solutionHeadingId = `${route.question}-solution-heading`;
  const solutionLabel = questionSolutionLabel(question, route);
  const mainHeading = questionMainHeading(catalog);
  // Sitewide information order: protected question and answer first, then
  // previous/next navigation, then the primary related-question module, and
  // only then supplemental study, trust and source material.
  const inlineSolutionOverview = "";
  const inlineSolutionSupplement = "";
  const relocatedSolutionDetails = experience?.solutionOverview || experience?.solutionSupplement
    ? `<section class="priority-question-study-details" aria-label="Additional solution details">${experience?.solutionOverview || ""}${experience?.solutionSupplement || ""}</section>`
    : "";
  const questionArticle = `<article aria-label="Question ${escapeHtmlAttribute(catalog.display_label)}" class="question-card" id="${escapeHtmlAttribute(route.question)}" data-question-row-id="${rowId}" data-question-id="${escapeHtmlAttribute(route.question)}" data-question-type="${escapeHtmlAttribute(questionType)}" data-question-book="${escapeHtmlAttribute(catalog.book_id)}"${questionAnswerFormat}${snippetExclusion}><header class="question-meta"><div class="question-number"><span>${escapeHtmlAttribute(catalog.display_label)}</span><small>${escapeHtmlAttribute(questionTypeLabel)}</small></div><div class="question-badges"><span class="pattern-code" title="StudyWudy question">SW</span></div></header><div class="question-prompt"><div class="rich-copy${promptLayoutClass}">${promptMarkup}</div>${promptMedia}${choiceMarkup}</div><section aria-labelledby="${escapeHtmlAttribute(solutionHeadingId)}" class="solution-body">${inlineSolutionOverview}<h2 class="solution-kicker solution-kicker-green" id="${escapeHtmlAttribute(solutionHeadingId)}">${escapeHtmlAttribute(solutionLabel)}</h2><div>${solutionMarkup}</div>${inlineSolutionSupplement}</section></article>`;
  const priorityPrimaryRelated = relatedQuestionSections.sameTextbook || sameExerciseOrChapter || experience?.previousYear || "";
  const sourceVerifiedPanels = priorityQuestionSourceVerified
    ? `${priorityQuestionOptionReasoningPanel()}${priorityQuestionOfficialSourcePanel()}`
    : "";
  const enrichmentPanel = standaloneQuestionEnrichmentPanel(questionEnrichment, question, catalog);
  const priorityFollowOn = `${relocatedSolutionDetails}${enrichmentPanel}${sourceVerifiedPanels}${reviewPanel}${experience?.trust || ""}${experience?.semanticLinks || ""}${priorityPrimaryRelated === sameExerciseOrChapter ? "" : sameExerciseOrChapter}${priorityPrimaryRelated === experience?.previousYear ? "" : experience?.previousYear || ""}`;
  const sitewideFlow = `${questionArticle}${standalonePriorityQuestionPagination(relatedQuestions.navigation, catalog, route)}${priorityPrimaryRelated}${priorityFollowOn}`;
  const priorityAttribute = ' data-studywudy-question-priority="pilot-v1" data-studywudy-question-structure="sitewide-v1"';
  const heroSummary = "";
  const layoutSidebars = standaloneQuestionChapterRail(catalog, route, relatedQuestions.navigation);
  const contextSidebar = standaloneQuestionContext(catalog, route);
  const mainFlow = sitewideFlow;
  const body = `<!doctype html><html data-scroll-behavior="smooth" lang="${escapeHtmlAttribute(languageForBookId(catalog.book_id) || "en-IN")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0757d8"><title>${escapeHtmlAttribute(title)}</title><meta name="description" content="${escapeHtmlAttribute(description)}"><meta name="robots" content="${directive}"><link rel="canonical" href="${escapeHtmlAttribute(canonical)}"><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtmlAttribute(socialTitle)}"><meta property="og:description" content="${escapeHtmlAttribute(description)}"><meta property="og:url" content="${escapeHtmlAttribute(canonical)}"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escapeHtmlAttribute(socialTitle)}"><meta name="twitter:description" content="${escapeHtmlAttribute(description)}">${STUDYWUDY_QUESTION_THEME_ASSETS}${DECORATIVE_TEXT_STYLES}${SEMANTIC_MATH_STYLES}${QUESTION_PAGE_EXPERIENCE_STYLES}${STANDALONE_QUESTION_STYLES}${QUESTION_COLUMN_TABLE_STYLES}${HORIZONTAL_SCROLL_CUE_STYLES}<script type="application/ld+json">${breadcrumbSchema}</script><script type="application/ld+json">${schema}</script></head><body class="manrope_6fd7433c-module__Zz-jia__variable antialiased standalone-question-page" data-studywudy-question-template="original-theme-v1"${priorityAttribute}>${standaloneQuestionHeader(catalog, route)}<main id="main-content" tabindex="-1">${standaloneQuestionBreadcrumbs(catalog, route)}<section class="answer-page-hero shell"><div><p class="eyebrow">${escapeHtmlAttribute(catalog.board_name)} · ${escapeHtmlAttribute(catalog.grade_label)} ${escapeHtmlAttribute(catalog.subject_name)}</p><h1 class="${standaloneQuestionTitleClass(mainHeading)}"${snippetExclusion}>${standaloneQuestionInline(mainHeading, catalog.book_id)} — Question ${escapeHtmlAttribute(catalog.display_label)}</h1></div><p class="answer-page-chapter"><span>Chapter ${chapterNumber}</span>${escapeHtmlAttribute(catalog.chapter_title)}</p>${heroSummary}</section><div class="shell answer-page-layout">${layoutSidebars}<div class="answer-page-main">${mainFlow}</div>${contextSidebar}</div></main>${standaloneQuestionFooter()}${HORIZONTAL_SCROLL_CUE_RUNTIME}</body></html>`;
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
    "x-studywudy-publish-gate": `${PHASE4_GATE_MANIFEST.policyVersion}; ${priorityQuestionScopedRelease ? "source-verified-pilot-complete" : indexable ? "complete" : "review-required"}`,
    "x-studywudy-question-payload": QUESTION_PAYLOAD_ASSET_BOOK_IDS.has(catalog.book_id)
      ? QUESTION_PAYLOAD_ASSET_MANIFEST.policyVersion
      : "bounded-book-fallback-v1",
    "x-studywudy-question-experience": "sitewide-question-first-v1",
    "x-studywudy-question-enrichment": questionEnrichment ? QUESTION_ENRICHMENT_POLICY_VERSION : "none",
    "x-studywudy-render-consistency": RENDER_CONSISTENCY_RELEASE,
    "x-studywudy-search-metadata": "catalog-data-v1",
    "x-studywudy-semantic-math": "ast-mathml-authoritative-v7-geometry-symbols",
    "x-studywudy-render-path": "canonical-single-pass-v1",
  }));
  if (priorityQuestionSourceVerified) headers.set("x-studywudy-source-review", PRIORITY_QUESTION_SOURCE_REVIEW.policyVersion);
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
  let renderedQuestion = null;
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
    renderedQuestion = context?.question || null;
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

  const solutionHeading = questionSolutionLabel(renderedQuestion, route);
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

function unpaginatedChapterRedirect(request, url) {
  if (!["GET", "HEAD"].includes(request.method)
    || !chapterRoute(url.pathname)
    || !url.searchParams.has("page")) return null;
  const canonical = new URL(url);
  canonical.searchParams.delete("page");
  canonical.hash = "";
  return Response.redirect(canonical.toString(), 308);
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
        element.after(`${experience.hub}${experience.directory}`, { html: true });
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
  headers.set("X-StudyWudy-Publish-Gate", `${PHASE4_GATE_MANIFEST.policyVersion}; indexable=${PHASE4_GATE_MANIFEST.indexableCount}; source-verified-pilot=1`);
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

function priorityQuestionPilotSitemapResponse(request, url) {
  if (!["GET", "HEAD"].includes(request.method) || url.pathname !== "/sitemaps/priority-question-pilot.xml") return null;
  const canonical = new URL(PRIORITY_QUESTION_PILOT_PATH, `${new URL(publicDocumentUrl(url)).origin}/`).toString();
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${escapeHtmlAttribute(canonical)}</loc><lastmod>2026-08-23T18:30:00Z</lastmod></url>\n</urlset>\n`;
  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": EDGE_HTML_CACHE,
      "x-content-type-options": "nosniff",
      "x-studywudy-publish-gate": `${PHASE4_GATE_MANIFEST.policyVersion}; source-verified-pilot=1`,
      "x-studywudy-source-review": PRIORITY_QUESTION_SOURCE_REVIEW.policyVersion,
    },
  });
}

function publicFaviconResponse(request, url) {
  if (!["GET", "HEAD"].includes(request.method) || url.pathname !== "/favicon.ico") return null;
  const body = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0757d8"/><text x="32" y="45" text-anchor="middle" font-family="Arial,sans-serif" font-size="40" font-weight="700" fill="white">S</text></svg>`;
  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400, s-maxage=604800",
      "x-content-type-options": "nosniff",
    },
  });
}

function catalogArtworkFallbackSource(pathname) {
  const cardMatch = pathname.match(/^\/catalog-artwork\/books\/cards\/(?:mobile-108x150\/)?([^/]+)\.webp$/u);
  if (cardMatch) {
    const artwork = BOOK_ARTWORK[cardMatch[1].replaceAll("--", "::")];
    if (artwork?.src) return String(artwork.src).replace(/\.(?:jpe?g|png|webp)$/iu, ".webp");
  }
  const subjectMatch = pathname.match(/^\/catalog-artwork\/subjects\/(?:heroes-96x96|cards-128x128)\/([^/]+)\.webp$/u);
  if (subjectMatch) {
    const subject = subjectMatch[1];
    const artwork = Object.entries(BOOK_ARTWORK)
      .find(([bookId]) => bookId.split("::")[2] === subject)?.[1];
    if (artwork?.src) return String(artwork.src).replace(/\.(?:jpe?g|png|webp)$/iu, ".webp");
  }
  return null;
}

async function catalogArtworkAssetResponse(request, env, url) {
  if (!["GET", "HEAD"].includes(request.method) || !url.pathname.startsWith("/catalog-artwork/")) return null;
  const original = await env.ASSETS.fetch(request);
  if (original.ok) return original;
  const fallbackSource = catalogArtworkFallbackSource(url.pathname);
  if (!fallbackSource) return original;
  const fallbackUrl = new URL(fallbackSource, request.url);
  const fallback = await env.ASSETS.fetch(new Request(fallbackUrl, { method: "GET", headers: request.headers }));
  if (!fallback.ok) return original;
  const headers = new Headers(fallback.headers);
  headers.set("cache-control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");
  headers.set("content-type", "image/webp");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-studywudy-artwork-fallback", "source-textbook-cover-v1");
  return new Response(request.method === "HEAD" ? null : fallback.body, {
    status: 200,
    headers,
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
    const pilotSitemap = priorityQuestionPilotSitemapResponse(request, url);
    if (pilotSitemap) return pilotSitemap;
    const favicon = publicFaviconResponse(request, url);
    if (favicon) return favicon;
    const chapterPaginationRedirect = unpaginatedChapterRedirect(request, url);
    if (chapterPaginationRedirect) return chapterPaginationRedirect;
    const catalogArtworkAsset = await catalogArtworkAssetResponse(request, env, url);
    if (catalogArtworkAsset) return catalogArtworkAsset;
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
