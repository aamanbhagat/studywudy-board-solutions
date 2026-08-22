export const QUESTION_CLASSIFICATION_POLICY_VERSION = "evidence-normalized-v1";

export const QUESTION_TYPE_OVERRIDES = Object.freeze({
  "q-cbse-ncert-exemplar-chemistry-exemplar-class-11-7-036": "brief",
  "q-cbse-ncert-chemistry-class-12-4-004": "give_reason",
  "q-cbse-ncert-computer-science-class-12-9-017": "detailed",
  "q-cbse-ncert-computer-science-class-12-9-021": "detailed",
  "q-cbse-ncert-computer-science-class-12-9-022": "detailed",
});

export const NORMALIZED_QUESTION_TYPE_SQL = `CASE q.question_id
${Object.entries(QUESTION_TYPE_OVERRIDES).map(([questionId, type]) => `  WHEN '${questionId}' THEN '${type}'`).join("\n")}
  ELSE q.type
END`;

export function normalizedQuestionType(value) {
  const questionId = String(value?.question_id ?? value?.questionId ?? value?.id ?? "");
  return QUESTION_TYPE_OVERRIDES[questionId] || String(value?.type || "");
}

function contentText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(contentText).join(" ");
  if (typeof value !== "object") return String(value);
  return Object.values(value).map(contentText).join(" ");
}

function hasRenderedMediaAsset(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasRenderedMediaAsset);
  if (value.kind === "image" || value.src || value.imageUrl || value.diagramUrl) return true;
  if (value.url && (value.alt || value.caption || value.width || value.height || value.fallbackUrl)) return true;
  return Object.values(value).some(hasRenderedMediaAsset);
}

export function questionHasRenderedDiagram(value) {
  if (!value || typeof value !== "object") return false;
  const isQuestionRecord = ["prompt", "promptMedia", "steps", "answer", "finalAnswer"].some((key) => Object.hasOwn(value, key));
  if (isQuestionRecord) {
    return hasRenderedMediaAsset(value.solutionMedia) || hasRenderedMediaAsset(value.diagram);
  }
  return hasRenderedMediaAsset(value);
}

export function explicitlyRequiresStudentDiagram(value) {
  const prompt = contentText(value?.prompt_text ?? value?.prompt ?? value ?? "")
    .normalize("NFKC")
    .replace(/<[^>]*>/gu, " ")
    .replace(/[*_`]/gu, " ")
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-IN");
  if (!prompt) return false;
  if (/\b(?:figure of speech|graphic details?|draw conclusions?|paragraph|photograph)\b/u.test(prompt)) return false;
  if (/\b(?:draw|sketch|plot|construct)\b[^.!?]{0,180}\b(?:diagram|figure|graph|curve|circle|triangle|ray|field[ -]lines?|structure|motion|shape|path|trajectory|spectrum)\b/u.test(prompt)) return true;
  if (/\b(?:labelled|labeled|schematic|ray|circuit|floral)\s+diagram\b/u.test(prompt)) return true;
  return /\bdiagram\b[^.!?]{0,100}\b(?:draw|sketch|plot|construct|label)\b/u.test(prompt);
}

export function questionHasVerifiedDiagramEvidence(question, metadata = {}) {
  void metadata;
  return questionHasRenderedDiagram(question);
}
