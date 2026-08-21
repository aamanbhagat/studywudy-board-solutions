import {
  CANONICAL_ORIGIN,
  breadcrumbStructuredData,
} from "./breadcrumbs.mjs";

const SITE_NAME = "StudyWudy";
const SITE_DESCRIPTION = "Free board-wise textbook solutions, chapter answers and exam practice for students across India.";
const EDITORIAL_TEAM = "StudyWudy Editorial Team";
const ELECTROSTATICS_NAME = "Maharashtra Board Class 12 Physics Chapter 8 Electrostatics";
const ARTICLE_ROUTE_KINDS = new Set(["revision", "answer-writing", "concept"]);
const COLLECTION_ROUTE_KINDS = new Set(["study", "important-questions"]);

const ORIGINAL_DIAGRAMS = Object.freeze({
  "maharashtra-board/class-12/biology/balbharati-biology-standard-12/reproduction-in-lower-and-higher-plants/q-msb-balbharati-biology-standard-12-1-036": Object.freeze({
    path: "/images/solutions/dicot-seed-labelled-q36.png",
    name: "Labelled diagram of a dicot seed",
    caption: "Solved diagram of a dicot seed labelled with plumule, radicle, hilum, seed coat, cotyledon and embryo.",
    width: 1450,
    height: 1085,
    encodingFormat: "image/png",
  }),
});

function canonicalOrigin(origin = CANONICAL_ORIGIN) {
  const parsed = new URL(origin);
  if (/^(?:localhost|127\.0\.0\.1)$/u.test(parsed.hostname)) return CANONICAL_ORIGIN;
  return parsed.origin;
}

function absoluteUrl(pathname, origin = CANONICAL_ORIGIN) {
  return new URL(pathname, `${canonicalOrigin(origin)}/`).toString();
}

function editorialOrganization(origin = CANONICAL_ORIGIN) {
  const siteOrigin = canonicalOrigin(origin);
  return {
    "@type": "Organization",
    name: EDITORIAL_TEAM,
    url: `${siteOrigin}/about/methodology`,
  };
}

function siteReference(origin = CANONICAL_ORIGIN) {
  return { "@id": `${canonicalOrigin(origin)}/#website` };
}

function publisherReference(origin = CANONICAL_ORIGIN) {
  return { "@id": `${canonicalOrigin(origin)}/#organization` };
}

export function stringifyStructuredData(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export function homepageStructuredData(origin = CANONICAL_ORIGIN) {
  const siteOrigin = canonicalOrigin(origin);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteOrigin}/#organization`,
        name: SITE_NAME,
        url: `${siteOrigin}/`,
        description: SITE_DESCRIPTION,
        logo: {
          "@type": "ImageObject",
          "@id": `${siteOrigin}/#logo`,
          contentUrl: `${siteOrigin}/icon-512.png`,
          url: `${siteOrigin}/icon-512.png`,
          width: 512,
          height: 512,
        },
      },
      {
        "@type": "WebSite",
        "@id": `${siteOrigin}/#website`,
        name: SITE_NAME,
        url: `${siteOrigin}/`,
        description: SITE_DESCRIPTION,
        inLanguage: "en-IN",
        publisher: publisherReference(siteOrigin),
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${siteOrigin}/search?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

function studyResourceBase({ route, metadata, reviewedIso, origin = CANONICAL_ORIGIN }) {
  const canonical = absoluteUrl(route.pathname, origin);
  return {
    "@id": `${canonical}#resource`,
    name: metadata.title.replace(/ \| StudyWudy$/u, ""),
    description: metadata.description,
    url: canonical,
    inLanguage: "en-IN",
    isAccessibleForFree: true,
    educationalLevel: "Class 12",
    about: {
      "@type": "Thing",
      name: ELECTROSTATICS_NAME,
    },
    isPartOf: siteReference(origin),
    dateModified: reviewedIso,
  };
}

function correctPracticeAnswer(question) {
  const correct = question.choices.find((choice) => choice.id === question.correctChoiceId);
  return [correct?.content, question.explanation].filter(Boolean).join(" — ");
}

function quizNode({ route, metadata, reviewedIso, model, origin }) {
  const base = studyResourceBase({ route, metadata, reviewedIso, origin });
  return {
    "@type": "Quiz",
    ...base,
    learningResourceType: "Practice test",
    educationalUse: "Assessment",
    educationalAlignment: [
      {
        "@type": "AlignmentObject",
        alignmentType: "educationalSubject",
        targetName: "Physics",
      },
      {
        "@type": "AlignmentObject",
        alignmentType: "educationalLevel",
        targetName: "Maharashtra Board Class 12",
      },
    ],
    hasPart: model.practiceQuestions.map((question) => ({
      "@type": "Question",
      "@id": `${absoluteUrl(question.href, origin)}#practice-question`,
      text: question.prompt,
      eduQuestionType: "Multiple choice",
      acceptedAnswer: {
        "@type": "Answer",
        text: correctPracticeAnswer(question),
      },
    })),
  };
}

function articleNode({ route, metadata, reviewedIso, origin }) {
  const base = studyResourceBase({ route, metadata, reviewedIso, origin });
  const resourceType = route.kind === "revision"
    ? "Revision guide"
    : route.kind === "answer-writing"
      ? "Answer-writing guide"
      : "Concept guide";
  return {
    "@type": ["Article", "LearningResource"],
    ...base,
    headline: base.name,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${base.url}#webpage` },
    learningResourceType: resourceType,
    author: editorialOrganization(origin),
    publisher: publisherReference(origin),
  };
}

function collectionNode({ route, metadata, reviewedIso, model, origin }) {
  const base = studyResourceBase({ route, metadata, reviewedIso, origin });
  const items = route.kind === "important-questions"
    ? model.important.map((question) => ({ name: question.anchor, url: absoluteUrl(question.href, origin) }))
    : [
        { name: "Electrostatics revision notes and formula sheet", url: absoluteUrl(`${route.pathname.replace(/\/study$/u, "")}/revision`, origin) },
        { name: "Electrostatics important questions", url: absoluteUrl(`${route.pathname.replace(/\/study$/u, "")}/important-questions`, origin) },
        { name: "Electrostatics chapter test", url: absoluteUrl(`${route.pathname.replace(/\/study$/u, "")}/practice`, origin) },
        { name: "Electrostatics answer-writing guide", url: absoluteUrl(`${route.pathname.replace(/\/study$/u, "")}/answer-writing`, origin) },
      ];
  return {
    "@type": "CollectionPage",
    ...base,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        url: item.url,
      })),
    },
  };
}

export function studyResourceStructuredData({ route, metadata, reviewedIso, breadcrumbs, model, origin = CANONICAL_ORIGIN }) {
  const graph = [breadcrumbStructuredData(breadcrumbs, canonicalOrigin(origin))];
  if (route.kind === "practice") {
    graph.push(quizNode({ route, metadata, reviewedIso, model, origin }));
  } else if (ARTICLE_ROUTE_KINDS.has(route.kind)) {
    graph.push(articleNode({ route, metadata, reviewedIso, origin }));
  } else if (COLLECTION_ROUTE_KINDS.has(route.kind)) {
    graph.push(collectionNode({ route, metadata, reviewedIso, model, origin }));
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

function questionRouteKey(route) {
  return [route.board, route.grade, route.subject, route.book, route.chapter, route.question].join("/");
}

export function originalDiagramForQuestion(route) {
  return ORIGINAL_DIAGRAMS[questionRouteKey(route)] || null;
}

export function originalDiagramStructuredData(route, pageUrl, origin = CANONICAL_ORIGIN) {
  const diagram = originalDiagramForQuestion(route);
  if (!diagram) return null;
  const siteOrigin = canonicalOrigin(origin);
  const canonicalPage = absoluteUrl(pageUrl, siteOrigin);
  const contentUrl = absoluteUrl(diagram.path, siteOrigin);
  return {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    "@id": `${contentUrl}#image`,
    contentUrl,
    url: contentUrl,
    name: diagram.name,
    caption: diagram.caption,
    width: diagram.width,
    height: diagram.height,
    encodingFormat: diagram.encodingFormat,
    creator: editorialOrganization(siteOrigin),
    creditText: EDITORIAL_TEAM,
    copyrightNotice: "© 2026 StudyWudy",
    isPartOf: { "@id": `${canonicalPage}#webpage` },
  };
}

export function qAPageEligibility(page = {}) {
  const eligible = Boolean(page.singleQuestion && page.userSubmittedQuestion && page.acceptsAlternativeAnswers);
  return {
    eligible,
    reason: eligible
      ? "Single user-submitted question with alternative answer submission enabled."
      : "Static editorial textbook answers are not QAPage experiences.",
  };
}

export function mathSolverEligibility(page = {}) {
  const eligible = Boolean(
    page.interactiveSolver
    && page.acceptsMathExpression
    && page.returnsStepByStepSolution
    && page.publiclyAccessible,
  );
  return {
    eligible,
    reason: eligible
      ? "Interactive public solver accepts expressions and returns step-by-step solutions."
      : "Pages that merely contain mathematics are not MathSolver tools.",
  };
}

export const STRUCTURED_DATA_POLICY = Object.freeze({
  version: "selective-structured-data-v1",
  homepageTypes: Object.freeze(["Organization", "WebSite"]),
  articleKinds: Object.freeze([...ARTICLE_ROUTE_KINDS]),
  quizKinds: Object.freeze(["practice"]),
  qAPageEnabledForCurrentTemplates: false,
  mathSolverEnabledForCurrentTemplates: false,
  originalDiagramCount: Object.keys(ORIGINAL_DIAGRAMS).length,
});
