import { isQuestionPubliclyEligible } from "./public-question-eligibility.mjs";

const SEARCH_CARD = /<a\b(?=[^>]*\bdata-question-row-id=["'](\d+)["'])[^>]*>[\s\S]*?<\/a>/giu;

function filterStaticSearchEligibility(html, manifest) {
  let removedCount = 0;
  let resultCount = 0;
  let output = String(html || "").replace(SEARCH_CARD, (card, rowId) => {
    if (!isQuestionPubliclyEligible(manifest, Number(rowId))) {
      removedCount += 1;
      return "";
    }
    resultCount += 1;
    return card;
  });

  output = output
    .replace(/\bdata-search-result-count=(["'])\d+\1/iu, `data-search-result-count="${resultCount}"`)
    .replace(/(<div\b[^>]*\bclass=["'][^"']*\bsection-mini-heading\b[^"']*["'][^>]*>\s*<div>\s*<span>)\d+(<\/span>)/iu, `$1${resultCount}$2`)
    .replace(/(?:All )?\d+ eligible (?:match is|matches are) rendered below\./iu, `${resultCount} eligible ${resultCount === 1 ? "match is" : "matches are"} rendered below.`)
    .replace(/\b\d+ quality-screened questions across\b/iu, `${resultCount} quality-screened questions across`)
    .replace(/\sdata-search-final-gate=(["'])[^"']*\1/iu, "")
    .replace(/\bclass=(["'])search-result-list\1/iu, `class="search-result-list" data-search-final-gate="${manifest.policyVersion}"`);

  return Object.freeze({ html: output, removedCount, resultCount });
}

function staticSearchEligibilityFailures(html, manifest) {
  const failures = [];
  const source = String(html || "");
  for (const match of source.matchAll(SEARCH_CARD)) {
    const rowId = Number(match[1]);
    if (!isQuestionPubliclyEligible(manifest, rowId)) failures.push(`row ${rowId} failed the final publishing gate`);
  }
  if (!source.includes(`data-search-final-gate="${manifest.policyVersion}"`)) {
    failures.push("final publishing-gate marker is missing");
  }
  return Object.freeze(failures);
}

export { filterStaticSearchEligibility, staticSearchEligibilityFailures };
