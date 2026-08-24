const MATHEMATICS_SUBJECTS = new Set(["math", "maths", "mathematics"]);

export function subjectAwareQuestionTypeLabel(type, subject, fallbackLabel) {
  const normalizedType = String(type || "").trim().toLocaleLowerCase("en-IN").replaceAll("-", "_");
  const normalizedSubject = String(subject || "").trim().toLocaleLowerCase("en-IN").replaceAll("_", "-");
  if (normalizedType === "brief" && MATHEMATICS_SUBJECTS.has(normalizedSubject)) return "Problem";
  return fallbackLabel;
}
