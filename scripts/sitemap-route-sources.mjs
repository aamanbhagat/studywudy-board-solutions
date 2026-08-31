// Route sources the sitemap builder and the content revision log both need.
//
// Both scripts have to agree on exactly which stream URLs are submitted - one
// of them emitting a URL the other has no revision row for is a build failure -
// so the two rules live here rather than in a copy each.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { streamsFor, subjectsFor } from "../comparison/stream-taxonomy.js";

// The stream route list is a module-private array in the legacy bundle. Read it
// out of the source rather than duplicating it: a third copy would drift.
export function streamPathsFromWorker(root) {
  const worker = readFileSync(resolve(root, "worker.js"), "utf8");
  const match = worker.match(/var PHASE3_STREAM_PATHS = (\[[\s\S]*?\n\]);/);
  if (!match) throw new Error("PHASE3_STREAM_PATHS was not found in worker.js");
  return JSON.parse(match[1]);
}

// The full-depth stream route resolves whether or not the taxonomy lists that
// subject under that stream, but the stream navigation is generated from the
// taxonomy, so a pair the taxonomy does not know is unreachable by clicking.
// Submitting an unlinkable URL is the orphan pattern in its smallest form, so
// the taxonomy decides what is submitted and the route stays reachable directly.
export function streamPathMatchesTaxonomy(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 4 || segments[2] !== "streams") return true;
  const [board, grade, , streamId] = segments;
  if (!streamsFor(board, grade).some((stream) => stream.id === streamId)) return true;
  if (segments.length < 6) return true;
  return subjectsFor(board, grade, streamId).includes(segments[5]);
}

// comparison/after-worker.js serves /sitemaps/priority-question-pilot.xml
// itself (wrangler.production.jsonc puts /sitemaps/* under run_worker_first),
// so the Worker's copy is the one Google reads and the static asset only has to
// agree with it. Read the review date out of the source so there is one value,
// not two literals of the same instant in two files.
export function priorityQuestionPilotReviewedAt(root) {
  const source = readFileSync(resolve(root, "comparison/after-worker.js"), "utf8");
  const match = source.match(/^\s*reviewedAt: "([^"]+)",$/mu);
  if (!match) throw new Error("PRIORITY_QUESTION_SOURCE_REVIEW.reviewedAt not found in comparison/after-worker.js");
  const epoch = Math.floor(Date.parse(match[1]) / 1_000);
  if (!Number.isFinite(epoch) || epoch <= 0) throw new Error(`Unparseable priority question review date: ${match[1]}`);
  return epoch;
}
