import { contentToText } from "./answer-completeness.mjs";

const VISUAL_REFERENCE = /\b(?:diagram|figure|graph|chart|illustration|image|sketch|labelled|labeled|shown\s+(?:above|below)|two\s+views?)\b/iu;
const PARAGRAPH = /<p(?:\s[^>]*)?>[\s\S]*?<\/p>/gu;

function visibleMarkupText(value) {
  return String(value || "")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&(?:amp|quot|#39|lt|gt|nbsp);/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function afterMatch(source, match, insertion) {
  const index = Number(match.index) + match[0].length;
  return `${source.slice(0, index)}${insertion}${source.slice(index)}`;
}

export function placeQuestionSolutionMedia({ solutionMarkup, mediaMarkup, question }) {
  const solution = String(solutionMarkup || "");
  const media = String(mediaMarkup || "");
  if (!media) return solution;
  if (!solution) return media;

  const paragraphs = [...solution.matchAll(PARAGRAPH)];
  const referenced = paragraphs.find((paragraph) => VISUAL_REFERENCE.test(visibleMarkupText(paragraph[0])));
  if (referenced) return afterMatch(solution, referenced, media);

  const prompt = contentToText(question?.prompt ?? question?.prompt_text);
  if (VISUAL_REFERENCE.test(prompt)) {
    const section = solution.match(/<section\b[^>]*>/u);
    return section ? afterMatch(solution, section, media) : `${media}${solution}`;
  }

  // When the source has no explicit placement metadata, keep the visual close
  // to the first real explanation rather than appending it after the answer.
  // Short title-only paragraphs are skipped so a definition remains attached
  // to its heading, as on long Biology process answers.
  const substantive = paragraphs.find((paragraph) => {
    const text = visibleMarkupText(paragraph[0]);
    return text.length >= 64 || text.split(/\s+/u).length >= 10;
  });
  if (substantive) return afterMatch(solution, substantive, media);
  if (paragraphs[0]) return afterMatch(solution, paragraphs[0], media);

  const section = solution.match(/<section\b[^>]*>/u);
  return section ? afterMatch(solution, section, media) : `${media}${solution}`;
}
