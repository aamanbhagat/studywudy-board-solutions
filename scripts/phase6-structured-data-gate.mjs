import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const origin = (process.argv.find((argument) => argument.startsWith("--origin="))?.slice(9) || process.env.PHASE6_GATE_ORIGIN || "http://127.0.0.1:8796").replace(/\/$/, "");
const output = resolve(root, "audits/phase-6/structured-data-gate.json");
const questionPath = "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/rotational-dynamics/questions/q-msb-balbharati-physics-standard-12-1-008";
const studyBase = "/maharashtra-board/class-12/physics/balbharati-physics-standard-12/electrostatics";
const diagramPath = "/maharashtra-board/class-12/biology/balbharati-biology-standard-12/reproduction-in-lower-and-higher-plants/questions/q-msb-balbharati-biology-standard-12-1-036";
const templates = [
  { name: "homepage", path: "/", required: ["Organization", "WebSite", "BreadcrumbList"], rootRequired: ["Organization", "WebSite"] },
  { name: "board-index", path: "/boards", required: ["BreadcrumbList"], rootForbidden: ["Organization", "WebSite"] },
  { name: "subject-index", path: "/cbse/class-10/english", required: ["BreadcrumbList"], rootForbidden: ["Organization", "WebSite"] },
  { name: "question", path: questionPath, required: ["BreadcrumbList", "Question", "Answer"], rootForbidden: ["Organization", "WebSite"] },
  { name: "revision-article", path: `${studyBase}/revision`, required: ["BreadcrumbList", "Article", "LearningResource"], rootForbidden: ["Organization", "WebSite"] },
  { name: "practice-quiz", path: `${studyBase}/practice`, required: ["BreadcrumbList", "Quiz", "Question", "Answer"], rootForbidden: ["Organization", "WebSite"] },
  { name: "original-diagram", path: diagramPath, required: ["BreadcrumbList", "ImageObject", "Question", "Answer"], rootForbidden: ["Organization", "WebSite"] },
  { name: "methodology", path: "/about/methodology", required: ["BreadcrumbList"], rootForbidden: ["Organization", "WebSite"] },
];

function typesOf(value) {
  const type = value?.["@type"];
  return Array.isArray(type) ? type : type ? [type] : [];
}

function collectObjects(value, result = []) {
  if (!value || typeof value !== "object") return result;
  if (typesOf(value).length) result.push(value);
  for (const nested of Array.isArray(value) ? value : Object.values(value)) collectObjects(nested, result);
  return result;
}

function parseJsonLd(html, errors) {
  const documents = [];
  const matcher = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(matcher)) {
    try {
      documents.push(JSON.parse(match[1]));
    } catch (error) {
      errors.push(`Invalid JSON-LD: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!documents.length) errors.push("No JSON-LD documents found");
  const roots = documents.flatMap((document) => Array.isArray(document)
    ? document
    : Array.isArray(document?.["@graph"])
      ? document["@graph"]
      : [document]);
  return {
    objects: documents.flatMap((document) => collectObjects(document)),
    rootTypes: [...new Set(roots.flatMap(typesOf))].sort(),
  };
}

function validateBreadcrumb(object, errors) {
  const items = object.itemListElement;
  if (!Array.isArray(items) || !items.length) {
    errors.push("BreadcrumbList has no itemListElement entries");
    return;
  }
  items.forEach((item, index) => {
    if (!typesOf(item).includes("ListItem")) errors.push(`Breadcrumb ${index + 1} is not a ListItem`);
    if (item.position !== index + 1) errors.push(`Breadcrumb ${index + 1} has a non-contiguous position`);
    if (!String(item.name || "").trim()) errors.push(`Breadcrumb ${index + 1} has no name`);
    const target = typeof item.item === "string" ? item.item : item.item?.["@id"];
    // Google's BreadcrumbList guidance permits the final/current crumb to omit
    // `item`; preceding crumbs still need an absolute URL.
    if (index < items.length - 1 && !/^https?:\/\//.test(String(target || ""))) errors.push(`Breadcrumb ${index + 1} has no absolute item URL`);
  });
}

function validateHomepage(objects, errors) {
  const organization = objects.find((object) => typesOf(object).includes("Organization"));
  const website = objects.find((object) => typesOf(object).includes("WebSite"));
  if (organization && (!organization.name || !organization.url || !organization.logo)) {
    errors.push("Organization requires name, URL and logo");
  }
  if (website) {
    const action = website.potentialAction;
    const target = typeof action?.target === "string" ? action.target : action?.target?.urlTemplate;
    if (!typesOf(action).includes("SearchAction")) errors.push("WebSite potentialAction is not SearchAction");
    if (!String(target || "").includes("{search_term_string}")) errors.push("SearchAction target lacks search_term_string placeholder");
    if (!String(action?.["query-input"] || "").includes("search_term_string")) errors.push("SearchAction lacks query-input");
  }
}

function validateQuestion(objects, errors) {
  const question = objects.find((object) => typesOf(object).includes("Question"));
  const answer = objects.find((object) => typesOf(object).includes("Answer"));
  if (question && !String(question.name || question.text || "").trim()) errors.push("Question has no name or text");
  if (question && !question.acceptedAnswer) errors.push("Question has no acceptedAnswer");
  if (answer && !String(answer.text || "").trim()) errors.push("Answer has no text");
}

function validateQuiz(objects, errors) {
  const quiz = objects.find((object) => typesOf(object).includes("Quiz"));
  if (!Array.isArray(quiz?.hasPart) || !quiz.hasPart.length) {
    errors.push("Quiz has no visible question parts");
    return;
  }
  for (const question of quiz.hasPart) {
    if (!typesOf(question).includes("Question") || !question.text || !question.acceptedAnswer?.text) {
      errors.push("Quiz contains an incomplete Question/Answer pair");
    }
    if (question.eduQuestionType === "Flashcard") errors.push("MCQ practice is incorrectly labelled as Flashcard content");
  }
}

function validateOriginalDiagram(objects, errors) {
  const image = objects.find((object) => typesOf(object).includes("ImageObject") && /dicot-seed-labelled-q36\.png$/u.test(String(object.contentUrl || "")));
  if (!image) {
    errors.push("Reviewed original diagram has no matching ImageObject");
    return;
  }
  if (!image.creditText || !image.creator || !image.copyrightNotice || image.width !== 1450 || image.height !== 1085) {
    errors.push("Original diagram lacks creator, credit, copyright or intrinsic dimensions");
  }
}

const results = [];
let failed = false;
for (const template of templates) {
  const response = await fetch(`${origin}${template.path}`, { headers: { accept: "text/html" }, redirect: "manual" });
  const html = await response.text();
  const errors = [];
  if (response.status !== 200) errors.push(`Expected HTTP 200, received ${response.status}`);
  const parsed = parseJsonLd(html, errors);
  const objects = parsed.objects;
  const foundTypes = [...new Set(objects.flatMap(typesOf))].sort();
  for (const required of template.required) {
    if (!foundTypes.includes(required)) errors.push(`Missing required ${required} structured data`);
  }
  for (const required of template.rootRequired || []) {
    if (!parsed.rootTypes.includes(required)) errors.push(`Missing root ${required} structured data`);
  }
  for (const forbidden of template.rootForbidden || []) {
    if (parsed.rootTypes.includes(forbidden)) errors.push(`${forbidden} must not be a root entity on this non-home page`);
  }
  for (const forbidden of ["QAPage", "MathSolver"]) {
    if (foundTypes.includes(forbidden)) errors.push(`${forbidden} is not eligible for this template`);
  }
  for (const breadcrumb of objects.filter((object) => typesOf(object).includes("BreadcrumbList"))) validateBreadcrumb(breadcrumb, errors);
  if (template.name === "homepage") validateHomepage(objects, errors);
  if (template.name === "question") {
    validateQuestion(objects, errors);
    const robots = `${response.headers.get("x-robots-tag") || ""} ${html.match(/<meta\b[^>]*name=["']robots["'][^>]*content=["']([^"']*)/i)?.[1] || ""}`;
    if (/noindex/i.test(robots)) errors.push("Gate-passed question sample is noindex");
  }
  if (template.name === "practice-quiz") validateQuiz(objects, errors);
  if (template.name === "original-diagram") {
    validateQuestion(objects, errors);
    validateOriginalDiagram(objects, errors);
    if (!html.includes("Original solution diagram · StudyWudy Editorial Team")) errors.push("Original diagram credit is not visible on the page");
  }
  if (errors.length) failed = true;
  results.push({ template: template.name, path: template.path, status: response.status, rootTypes: parsed.rootTypes, foundTypes, errors, warnings: [] });
}

const audit = {
  generatedAt: new Date().toISOString(),
  origin,
  validator: "Selective structured-data and eligibility invariant gate",
  note: "Google does not provide a Rich Results Test API. This gate validates representative templates, keeps site identity on the homepage, and treats the MCQ Quiz as descriptive schema rather than falsely claiming Flashcard eligibility.",
  templates: results,
  errors: results.reduce((count, result) => count + result.errors.length, 0),
  warnings: 0,
  passed: !failed,
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(audit, null, 2)}\n`);
console.log(`${audit.passed ? "PASS" : "FAIL"}: structured-data gate checked ${results.length} templates with ${audit.errors} errors and 0 warnings.`);
if (failed) process.exitCode = 1;
