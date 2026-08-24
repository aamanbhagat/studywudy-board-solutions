#!/usr/bin/env node

import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createGzip, gunzipSync, gzipSync } from "node:zlib";
import { DatabaseSync } from "node:sqlite";
import {
  contentToText,
  lexicalTokens,
  renderedAnswerText,
} from "../answer-completeness.mjs";
import { applyKnownPayloadRepairs } from "../multilingual-text-quality.mjs";
import {
  normalizeQuestionEnrichment,
  questionEnrichmentHasPublishableContent,
  QUESTION_ENRICHMENT_POLICY_VERSION,
} from "../question-enrichment.mjs";

const root = resolve(import.meta.dirname, "..");
const defaults = Object.freeze({
  inventory: resolve(root, "audits/sitewide/sitewide-remediation.sqlite3"),
  source: resolve(root, "../data/d1/studywudy-content.sqlite3"),
  export: resolve(root, "audits/sitewide/problem-pages.ndjson.gz"),
  batchSize: 6,
  interval: 2_000,
  maxAttempts: 3,
  maxBatchAttempts: 6,
  models: Object.freeze({
    draft: "gpt-5.6-luna",
    validate: "gpt-5.6-terra",
    adjudicate: "gpt-5.6-sol",
  }),
});

function parseArgs(argv) {
  const command = argv[2] || "status";
  const options = new Map();
  for (let index = 3; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options.set(argument, next);
      index += 1;
    } else options.set(argument, true);
  }
  return { command, options };
}

const { command, options } = parseArgs(process.argv);
const inventoryPath = resolve(root, options.get("--inventory") || defaults.inventory);
const sourcePath = resolve(root, options.get("--source-db") || defaults.source);

function requireInventory() {
  if (!existsSync(inventoryPath)) {
    throw new Error(`Sitewide inventory is missing: ${inventoryPath}\nRun: pnpm run audit:sitewide`);
  }
}

function seconds(value) {
  if (!Number.isFinite(value) || value < 0) return "calculating after the first completed batch";
  const whole = Math.ceil(value);
  const days = Math.floor(whole / 86_400);
  const hours = Math.floor((whole % 86_400) / 3_600);
  const minutes = Math.floor((whole % 3_600) / 60);
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

function statusSnapshot(database) {
  const statuses = Object.fromEntries(database.prepare(
    "SELECT status, COUNT(*) AS count FROM remediation_pages GROUP BY status ORDER BY status",
  ).all().map((row) => [row.status, Number(row.count)]));
  const totals = database.prepare(`SELECT
    COUNT(*) AS total,
    SUM(baseline_gate_passed) AS already_passed,
    SUM(current_gate_passed) AS currently_passing,
    SUM(CASE WHEN baseline_gate_passed = 0 THEN 1 ELSE 0 END) AS initial_problem_pages,
    SUM(thin_content_risk) AS thin_content_risk,
    SUM(technical_seo_risk) AS technical_seo_risk,
    SUM(source_review_required) AS source_review_required,
    SUM(enrichment_available) AS enrichment_available
    FROM remediation_pages`).get();
  const event = database.prepare(`SELECT
    MIN(recorded_at) AS started_at,
    MAX(recorded_at) AS last_event_at,
    SUM(row_count) AS processed_rows,
    SUM(input_tokens) AS input_tokens,
    SUM(output_tokens) AS output_tokens,
    SUM(duration_ms) AS duration_ms,
    SUM(duration_ms / COALESCE(NULLIF(CAST(json_extract(detail_json, '$.concurrency') AS INTEGER), 0), 1)) AS effective_duration_ms
    FROM remediation_events WHERE event = 'batch_completed'`).get();
  const latestBatch = database.prepare(`SELECT
    COALESCE(NULLIF(CAST(json_extract(detail_json, '$.concurrency') AS INTEGER), 0), 1) AS concurrency,
    row_count AS batch_size,
    recorded_at
    FROM remediation_events WHERE event = 'batch_completed' ORDER BY id DESC LIMIT 1`).get();
  const queue = database.prepare(`SELECT
    SUM(CASE WHEN status IN ('drafting', 'validating', 'adjudicating') THEN 1 ELSE 0 END) AS active_rows,
    SUM(CASE WHEN status = 'pending' AND source_review_required = 0
      AND (thin_content_risk = 1 OR issue_family = 'content' OR issue_family = 'math') THEN 1 ELSE 0 END) AS eligible_pending
    FROM remediation_pages`).get();
  const recentFailureCount = Number(database.prepare(`SELECT COUNT(*) AS count
    FROM remediation_events
    WHERE event = 'batch_failed' AND recorded_at >= ?`).get(Math.floor(Date.now() / 1_000) - 900)?.count || 0);
  const activeConcurrency = Number(latestBatch?.concurrency || 1);
  const rateWindow = database.prepare(`SELECT
    SUM(row_count) AS processed_rows,
    SUM(duration_ms / COALESCE(NULLIF(CAST(json_extract(detail_json, '$.concurrency') AS INTEGER), 0), 1)) AS effective_duration_ms
    FROM remediation_events
    WHERE event = 'batch_completed'
      AND COALESCE(NULLIF(CAST(json_extract(detail_json, '$.concurrency') AS INTEGER), 0), 1) = ?`).get(activeConcurrency);
  const verifiedFixed = Number(statuses.verified_fixed || 0);
  const approvedPendingApply = Number(statuses.approved || 0);
  const appliedPendingAudit = Number(statuses.applied_pending_audit || 0);
  const seoConsolidated = Number(statuses.seo_consolidated || 0);
  const initialProblems = Number(totals.initial_problem_pages || 0);
  const terminal = verifiedFixed + approvedPendingApply + appliedPendingAudit + seoConsolidated
    + Number(statuses.blocked || 0) + Number(statuses.failed || 0);
  const remainingQueue = Math.max(0, initialProblems - terminal - Number(statuses.source_review_required || 0));
  const now = Math.floor(Date.now() / 1_000);
  const activeRows = Number(queue.active_rows || 0);
  const eligiblePending = Number(queue.eligible_pending || 0);
  const lastCompletedAt = Number(latestBatch?.recorded_at || 0);
  const secondsSinceLastCompletedBatch = lastCompletedAt ? Math.max(0, now - lastCompletedAt) : null;
  const workerState = activeRows > 0 ? "RUNNING" : eligiblePending > 0 ? "PAUSED" : "COMPLETE";
  const elapsed = event.started_at ? Math.max(1, now - Number(event.started_at)) : 0;
  const processedRows = Number(event.processed_rows || 0);
  const rateWindowRows = Number(rateWindow.processed_rows || processedRows);
  const measuredProcessingSeconds = Math.max(0, Number(rateWindow.effective_duration_ms || event.effective_duration_ms || event.duration_ms || 0) / 1_000);
  // Model-call duration is the meaningful throughput clock. The first event's
  // recorded_at timestamp is written only after that batch completes, so wall
  // time since MIN(recorded_at) would dramatically overstate early throughput.
  const throughputSeconds = measuredProcessingSeconds || elapsed;
  const ratePerSecond = rateWindowRows > 0 && throughputSeconds > 0 ? rateWindowRows / throughputSeconds : 0;
  const etaSeconds = ratePerSecond > 0 ? remainingQueue / ratePerSecond : Number.NaN;
  const fixedOrPassing = Number(totals.already_passed || 0) + verifiedFixed + seoConsolidated;
  return {
    generatedAt: new Date().toISOString(),
    inventoryPath,
    corpus: {
      totalPages: Number(totals.total || 0),
      alreadyPassing: Number(totals.already_passed || 0),
      currentlyPassing: Number(totals.currently_passing || 0),
      initialProblemPages: initialProblems,
      verifiedFixed,
      approvedPendingApply,
      appliedPendingAudit,
      seoConsolidated,
      passingOrFixed: fixedOrPassing,
      unresolved: Math.max(0, Number(totals.total || 0) - fixedOrPassing),
    },
    risks: {
      thinContent: Number(totals.thin_content_risk || 0),
      technicalSeo: Number(totals.technical_seo_risk || 0),
      sourceReviewRequired: Number(totals.source_review_required || 0),
      preexistingEnrichment: Number(totals.enrichment_available || 0),
    },
    statuses,
    health: {
      workerState,
      activeRows,
      eligiblePending,
      recentFailureCount,
      lastCompletedAt: lastCompletedAt || null,
      secondsSinceLastCompletedBatch,
    },
    throughput: {
      processedRows,
      rowsPerMinute: Number((ratePerSecond * 60).toFixed(2)),
      inputTokens: Number(event.input_tokens || 0),
      outputTokens: Number(event.output_tokens || 0),
      processingDurationMs: Number(event.duration_ms || 0),
      effectiveProcessingDurationMs: Number(event.effective_duration_ms || event.duration_ms || 0),
      concurrency: activeConcurrency,
      batchSize: Number(latestBatch?.batch_size || 0),
      rateWindowRows,
      etaSeconds: Number.isFinite(etaSeconds) ? Math.ceil(etaSeconds) : null,
      eta: seconds(etaSeconds),
    },
  };
}

function printStatus(snapshot, json = false) {
  if (json) {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    return;
  }
  const line = (label, value) => `${label.padEnd(31)} ${String(value).padStart(12)}`;
  process.stdout.write([
    `StudyWudy sitewide remediation · ${snapshot.generatedAt}`,
    line("Total question pages", snapshot.corpus.totalPages.toLocaleString("en-IN")),
    line("Already passing", snapshot.corpus.alreadyPassing.toLocaleString("en-IN")),
    line("Problem pages at baseline", snapshot.corpus.initialProblemPages.toLocaleString("en-IN")),
    line("Verified fixed after re-audit", snapshot.corpus.verifiedFixed.toLocaleString("en-IN")),
    line("AI-approved, pending apply", snapshot.corpus.approvedPendingApply.toLocaleString("en-IN")),
    line("Applied, pending re-audit", snapshot.corpus.appliedPendingAudit.toLocaleString("en-IN")),
    line("Duplicate pages consolidated", snapshot.corpus.seoConsolidated.toLocaleString("en-IN")),
    line("Still unresolved", snapshot.corpus.unresolved.toLocaleString("en-IN")),
    line("Thin-content risk", snapshot.risks.thinContent.toLocaleString("en-IN")),
    line("Technical SEO risk", snapshot.risks.technicalSeo.toLocaleString("en-IN")),
    line("Source-review blockers", snapshot.risks.sourceReviewRequired.toLocaleString("en-IN")),
    line("Worker activity", snapshot.health.workerState),
    line("Active rows", snapshot.health.activeRows.toLocaleString("en-IN")),
    line("Eligible rows waiting", snapshot.health.eligiblePending.toLocaleString("en-IN")),
    line("Last completed batch age", snapshot.health.secondsSinceLastCompletedBatch == null ? "never" : seconds(snapshot.health.secondsSinceLastCompletedBatch)),
    line("Batch failures (15 min)", snapshot.health.recentFailureCount.toLocaleString("en-IN")),
    line("Rows processed", snapshot.throughput.processedRows.toLocaleString("en-IN")),
    line("Parallel workers", snapshot.throughput.concurrency.toLocaleString("en-IN")),
    line("Last completed batch", snapshot.throughput.batchSize.toLocaleString("en-IN")),
    line("Current throughput", `${snapshot.throughput.rowsPerMinute}/min`),
    line("Estimated queue time", snapshot.throughput.eta),
    `Statuses: ${Object.entries(snapshot.statuses).map(([status, count]) => `${status}=${Number(count).toLocaleString("en-IN")}`).join(" · ")}`,
    "",
  ].join("\n"));
}

async function statusCommand() {
  requireInventory();
  const database = new DatabaseSync(inventoryPath, { readOnly: true });
  const json = Boolean(options.get("--json"));
  const watch = Boolean(options.get("--watch"));
  const interval = Math.max(500, Number(options.get("--interval") || defaults.interval));
  try {
    do {
      if (watch && !json) process.stdout.write("\x1bc");
      printStatus(statusSnapshot(database), json);
      if (watch) await delay(interval);
    } while (watch);
  } finally {
    database.close();
  }
}

async function exportCommand() {
  requireInventory();
  const outputPath = resolve(root, options.get("--output") || defaults.export);
  mkdirSync(dirname(outputPath), { recursive: true });
  const database = new DatabaseSync(inventoryPath, { readOnly: true });
  const gzip = createGzip({ level: 9 });
  const destination = createWriteStream(outputPath);
  gzip.pipe(destination);
  let count = 0;
  for (const row of database.prepare(`SELECT row_id, pathname, question_type, issue_family,
    risk_level, thin_content_risk, technical_seo_risk, source_review_required,
    enrichment_available, status, issues_json
    FROM remediation_pages WHERE current_gate_passed = 0 ORDER BY row_id`).iterate()) {
    gzip.write(`${JSON.stringify({
      rowId: Number(row.row_id),
      pathname: row.pathname,
      questionType: row.question_type,
      issueFamily: row.issue_family,
      riskLevel: row.risk_level,
      thinContentRisk: Boolean(row.thin_content_risk),
      technicalSeoRisk: Boolean(row.technical_seo_risk),
      sourceReviewRequired: Boolean(row.source_review_required),
      enrichmentAvailable: Boolean(row.enrichment_available),
      status: row.status,
      issues: JSON.parse(row.issues_json),
    })}\n`);
    count += 1;
  }
  gzip.end();
  await new Promise((accept, reject) => {
    destination.once("finish", accept);
    destination.once("error", reject);
    gzip.once("error", reject);
  });
  database.close();
  process.stdout.write(`${JSON.stringify({ pass: true, problemPages: count, output: outputPath }, null, 2)}\n`);
}

function responseText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text;
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("Responses API result did not contain output_text");
}

function batchSchema(batchLength, stage) {
  const enrichment = {
    type: "object",
    additionalProperties: false,
    required: ["row_id", "concept_explanation", "reasoning_steps", "choice_explanations", "common_mistake", "exam_tip", "confidence", "blocked_reason"],
    properties: {
      row_id: { type: "integer" },
      concept_explanation: { type: "string", maxLength: 8_000 },
      reasoning_steps: { type: "array", maxItems: 10, items: { type: "string", maxLength: 1_200 } },
      choice_explanations: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["choice_id", "explanation"],
          properties: {
            choice_id: { type: "string", maxLength: 48 },
            explanation: { type: "string", maxLength: 1_200 },
          },
        },
      },
      common_mistake: { type: "string", maxLength: 1_500 },
      exam_tip: { type: "string", maxLength: 1_500 },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      blocked_reason: { type: "string", maxLength: 800 },
    },
  };
  if (stage !== "draft") {
    enrichment.required.push("approved");
    enrichment.properties.approved = { type: "boolean" };
    enrichment.required.push("review_notes");
    enrichment.properties.review_notes = { type: "array", maxItems: 8, items: { type: "string", maxLength: 600 } };
  }
  return {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        minItems: batchLength,
        maxItems: batchLength,
        items: enrichment,
      },
    },
  };
}

async function callResponsesApi({ endpoint, apiKey, model, effort, stage, instructions, payload, batchLength }) {
  const started = Date.now();
  const requestBody = {
    model,
    store: false,
    reasoning: { effort },
    max_output_tokens: 32_000,
    instructions,
    input: JSON.stringify(payload),
    text: {
      verbosity: "medium",
      format: {
        type: "json_schema",
        name: `studywudy_${stage}_v1`,
        strict: true,
        schema: batchSchema(batchLength, stage),
      },
    },
    metadata: {
      workflow: "studywudy-sitewide-remediation",
      stage,
      policy: QUESTION_ENRICHMENT_POLICY_VERSION,
    },
  };
  let lastError;
  for (let attempt = 1; attempt <= defaults.maxAttempts; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(180_000),
      });
      const body = await response.json();
      if (!response.ok) {
        const message = body?.error?.message || `${response.status} ${response.statusText}`;
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable || attempt === defaults.maxAttempts) {
          const apiError = new Error(message);
          apiError.status = response.status;
          apiError.retryable = retryable;
          throw apiError;
        }
        const retryAfter = Math.min(30, Math.max(1, Number(response.headers.get("retry-after") || 2 ** attempt)));
        await delay(retryAfter * 1_000);
        continue;
      }
      const parsed = JSON.parse(responseText(body));
      return {
        parsed,
        responseId: body.id || null,
        inputTokens: Number(body.usage?.input_tokens || 0),
        outputTokens: Number(body.usage?.output_tokens || 0),
        durationMs: Date.now() - started,
      };
    } catch (error) {
      lastError = error;
      if (error?.retryable === false) throw error;
      if (attempt < defaults.maxAttempts) await delay(2 ** attempt * 1_000);
    }
  }
  throw lastError || new Error(`${model} ${stage} request failed`);
}

function isTransientGenerationError(error) {
  if (error?.retryable === true) return true;
  if (error?.retryable === false) return false;
  const message = String(error?.message || error || "").toLowerCase();
  return error?.name === "TypeError"
    || error?.name === "TimeoutError"
    || message.includes("fetch failed")
    || message.includes("network")
    || message.includes("timed out")
    || message.includes("timeout")
    || message.includes("socket")
    || message.includes("connection");
}

function isSystemicRunnerError(error) {
  const status = Number(error?.status || 0);
  if ([401, 403, 404].includes(status)) return true;
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("invalid api key")
    || message.includes("incorrect api key")
    || message.includes("unauthorized")
    || message.includes("permission denied")
    || message.includes("database disk image is malformed")
    || message.includes("database or disk is full")
    || message.includes("source database is missing")
    || message.includes("sitewide inventory is missing");
}

function questionMapForBook(source, bookId) {
  const chunks = source.prepare(
    "SELECT content_chunk FROM catalog_book_chunks WHERE book_id = ? ORDER BY chunk_index",
  ).all(bookId);
  if (!chunks.length) throw new Error(`No source payload chunks found for ${bookId}`);
  const payload = applyKnownPayloadRepairs(
    bookId,
    JSON.parse(gunzipSync(Buffer.concat(chunks.map((row) => Buffer.from(row.content_chunk)))).toString("utf8")),
  );
  const map = new Map();
  for (const chapter of payload.chapters || []) {
    for (const exercise of chapter.exercises || []) {
      for (const question of exercise.questions || []) {
        map.set(`${chapter.slug}:${question.id}`, { question, chapter, exercise });
      }
    }
  }
  return map;
}

function sourceItem(row, resolved) {
  const { question } = resolved;
  const correctChoiceIds = question.correctChoiceIds || (question.correctChoiceId ? [question.correctChoiceId] : []);
  return {
    row_id: Number(row.row_id),
    question_type: row.question_type,
    issue_codes: JSON.parse(row.issues_json),
    protected_content: {
      prompt: contentToText(question.prompt),
      choices: (question.choices || []).map((choice) => ({ id: String(choice.id || ""), text: contentToText(choice.content) })),
      correct_choice_ids: correctChoiceIds.map(String),
      existing_answer: renderedAnswerText(question),
    },
    source_context: {
      chapter: contentToText(resolved.chapter?.title),
      exercise: contentToText(resolved.exercise?.title || resolved.exercise?.label),
      concept_tags: Array.isArray(question.conceptTags) ? question.conceptTags.map(String).slice(0, 12) : [],
    },
  };
}

function verifyBatchItems(items, rows, stage) {
  if (!Array.isArray(items) || items.length !== rows.length) throw new Error(`${stage} returned the wrong item count`);
  const expected = new Set(rows.map((row) => Number(row.row_id)));
  const seen = new Set();
  for (const item of items) {
    const rowId = Number(item.row_id);
    if (!expected.has(rowId) || seen.has(rowId)) throw new Error(`${stage} returned an unexpected or duplicate row_id ${rowId}`);
    seen.add(rowId);
  }
  return new Map(items.map((item) => [Number(item.row_id), item]));
}

function stageInstructions(stage) {
  const invariant = `Protected content is immutable: never rewrite the question prompt, choices, selected answer, existing answer, numerical values, units, source labels or identifiers. Produce only supplemental study content grounded in the supplied protected content. Do not claim human, textbook or official verification. If the evidence is insufficient, use blocked_reason instead of guessing.`;
  if (stage === "draft") return `${invariant}\nYou are the high-volume drafting stage. Address the supplied issue codes with concise, question-specific additions. For MCQs, explain each incorrect option separately and never explain the correct option as a distractor. Avoid repeated templates and generic filler.`;
  if (stage === "validate") return `${invariant}\nYou are the independent quality validator. Inspect every Luna draft against the protected content. Correct grammar, unsupported claims, answer inconsistency, missing option-specific reasoning and duplicated clauses. Set approved only when the corrected supplement is faithful, useful and question-specific.`;
  return `${invariant}\nYou are the final quality adjudicator. Independently compare the Terra candidate with the protected content and the issue codes. Return the final corrected supplement. Approve only if it is factually faithful, non-duplicative, accessible, and safe to publish without changing protected content.`;
}

function normalizedFinalItem(item) {
  const enrichment = normalizeQuestionEnrichment({
    concept_explanation: item.concept_explanation,
    reasoning_steps: item.reasoning_steps,
    choice_explanations: item.choice_explanations,
    common_mistake: item.common_mistake,
    exam_tip: item.exam_tip,
    confidence: item.confidence,
    provenance: "azure-foundry-gpt-5.6-luna-terra-sol",
  });
  return {
    approved: item.approved === true
      && !String(item.blocked_reason || "").trim()
      && questionEnrichmentHasPublishableContent(enrichment),
    enrichment,
    blockedReason: String(item.blocked_reason || "").trim(),
    reviewNotes: Array.isArray(item.review_notes) ? item.review_notes.map(String).slice(0, 8) : [],
  };
}

async function runCommand() {
  requireInventory();
  if (!existsSync(sourcePath)) throw new Error(`Source database is missing: ${sourcePath}`);
  const endpoint = String(process.env.AZURE_FOUNDRY_RESPONSES_ENDPOINT || "").trim();
  const apiKey = String(process.env.AZURE_FOUNDRY_API_KEY || "").trim();
  if (!endpoint || !apiKey) {
    throw new Error("Set AZURE_FOUNDRY_RESPONSES_ENDPOINT and AZURE_FOUNDRY_API_KEY in the terminal environment. Secrets are never read from or written to repository files.");
  }
  const models = {
    draft: process.env.STUDYWUDY_DRAFT_MODEL || defaults.models.draft,
    validate: process.env.STUDYWUDY_VALIDATE_MODEL || defaults.models.validate,
    adjudicate: process.env.STUDYWUDY_ADJUDICATE_MODEL || defaults.models.adjudicate,
  };
  const batchSize = Math.max(1, Math.min(12, Number(options.get("--batch-size") || defaults.batchSize)));
  const concurrency = Math.max(1, Math.min(32, Number(options.get("--concurrency") || 1)));
  const maxBatchAttempts = Math.max(2, Math.min(20, Number(options.get("--max-batch-attempts") || defaults.maxBatchAttempts)));
  const limit = options.get("--limit") ? Math.max(1, Number(options.get("--limit"))) : Number.POSITIVE_INFINITY;
  const database = new DatabaseSync(inventoryPath);
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const updateStage = database.prepare("UPDATE remediation_pages SET status = ?, locked_at = ?, attempts = attempts + ?, error = NULL, updated_at = ? WHERE row_id = ?");
  const saveStage = database.prepare("UPDATE remediation_pages SET status = ?, draft_json = COALESCE(?, draft_json), validation_json = COALESCE(?, validation_json), final_json = COALESCE(?, final_json), model_history_json = ?, error = ?, locked_at = NULL, updated_at = ? WHERE row_id = ?");
  const event = database.prepare(`INSERT INTO remediation_events(
    recorded_at, event, model, row_count, input_tokens, output_tokens, duration_ms, detail_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const staleBefore = Math.floor(Date.now() / 1_000) - 3_600;
  database.prepare("UPDATE remediation_pages SET status = 'pending', locked_at = NULL WHERE status IN ('drafting','validating','adjudicating') AND COALESCE(locked_at, 0) < ?").run(staleBefore);
  database.prepare("UPDATE remediation_pages SET status = 'failed', locked_at = NULL, error = COALESCE(error, 'Maximum batch attempts exhausted') WHERE status = 'pending' AND attempts >= ?").run(maxBatchAttempts);
  event.run(Math.floor(Date.now() / 1_000), "runner_started", null, 0, 0, 0, 0, JSON.stringify({
    pid: process.pid,
    concurrency,
    batchSize,
    maxBatchAttempts,
  }));
  const questionMapCache = new Map();
  const maximumCachedBooks = Math.max(4, concurrency * 2);
  const questionMap = (bookId) => {
    if (questionMapCache.has(bookId)) {
      const cached = questionMapCache.get(bookId);
      questionMapCache.delete(bookId);
      questionMapCache.set(bookId, cached);
      return cached;
    }
    const created = questionMapForBook(source, bookId);
    questionMapCache.set(bookId, created);
    while (questionMapCache.size > maximumCachedBooks) questionMapCache.delete(questionMapCache.keys().next().value);
    return created;
  };
  let claimed = 0;
  let processed = 0;
  let fatalError = null;

  function claimBatch() {
    if (fatalError || claimed >= limit) return null;
    database.exec("BEGIN IMMEDIATE");
    try {
      const book = database.prepare(`SELECT book_id, COUNT(*) AS count FROM remediation_pages
        WHERE status = 'pending' AND source_review_required = 0
          AND attempts < ?
          AND (thin_content_risk = 1 OR issue_family = 'content' OR issue_family = 'math')
        GROUP BY book_id ORDER BY MIN(row_id) LIMIT 1`).get(maxBatchAttempts);
      if (!book) {
        database.exec("COMMIT");
        return null;
      }
      const rows = database.prepare(`SELECT * FROM remediation_pages
        WHERE status = 'pending' AND source_review_required = 0
          AND attempts < ?
          AND (thin_content_risk = 1 OR issue_family = 'content' OR issue_family = 'math')
          AND book_id = ?
        ORDER BY row_id LIMIT ?`).all(maxBatchAttempts, book.book_id, Math.min(batchSize, limit - claimed));
      if (!rows.length) {
        database.exec("COMMIT");
        return null;
      }
      const now = Math.floor(Date.now() / 1_000);
      for (const row of rows) updateStage.run("drafting", now, 1, now, row.row_id);
      database.exec("COMMIT");
      claimed += rows.length;
      return rows;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  function resetBatch(rows, error) {
    const failedAt = Math.floor(Date.now() / 1_000);
    const reset = database.prepare("UPDATE remediation_pages SET status = CASE WHEN attempts >= ? THEN 'failed' ELSE 'pending' END, locked_at = NULL, error = ?, updated_at = ? WHERE row_id = ?");
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const row of rows) reset.run(maxBatchAttempts, String(error), failedAt, row.row_id);
      event.run(failedAt, "batch_failed", null, rows.length, 0, 0, 0, JSON.stringify({
        rowIds: rows.map((row) => Number(row.row_id)),
        concurrency,
        systemic: isSystemicRunnerError(error),
        transient: isTransientGenerationError(error),
        maxBatchAttempts,
        error: String(error),
      }));
      database.exec("COMMIT");
    } catch (resetError) {
      database.exec("ROLLBACK");
      throw resetError;
    }
  }

  async function processBatch(rows, workerId) {
      const currentQuestionMap = questionMap(rows[0].book_id);
      const payloadItems = rows.map((row) => {
        const resolved = currentQuestionMap.get(`${row.chapter_slug}:${row.question_id}`);
        if (!resolved) throw new Error(`Question payload missing for row ${row.row_id}`);
        return sourceItem(row, resolved);
      });
      const history = [];
      const draft = await callResponsesApi({
        endpoint,
        apiKey,
        model: models.draft,
        effort: "low",
        stage: "draft",
        instructions: stageInstructions("draft"),
        payload: { items: payloadItems },
        batchLength: rows.length,
      });
      const draftByRow = verifyBatchItems(draft.parsed.items, rows, "draft");
      history.push({ stage: "draft", model: models.draft, responseId: draft.responseId });
      database.exec("BEGIN IMMEDIATE");
      for (const row of rows) saveStage.run("validating", JSON.stringify(draftByRow.get(Number(row.row_id))), null, null, JSON.stringify(history), null, Math.floor(Date.now() / 1_000), row.row_id);
      database.exec("COMMIT");
      const validation = await callResponsesApi({
        endpoint,
        apiKey,
        model: models.validate,
        effort: "medium",
        stage: "validate",
        instructions: stageInstructions("validate"),
        payload: { items: payloadItems.map((item) => ({ ...item, luna_draft: draftByRow.get(item.row_id) })) },
        batchLength: rows.length,
      });
      const validationByRow = verifyBatchItems(validation.parsed.items, rows, "validate");
      history.push({ stage: "validate", model: models.validate, responseId: validation.responseId });
      database.exec("BEGIN IMMEDIATE");
      for (const row of rows) saveStage.run("adjudicating", null, JSON.stringify(validationByRow.get(Number(row.row_id))), null, JSON.stringify(history), null, Math.floor(Date.now() / 1_000), row.row_id);
      database.exec("COMMIT");
      const final = await callResponsesApi({
        endpoint,
        apiKey,
        model: models.adjudicate,
        effort: "high",
        stage: "adjudicate",
        instructions: stageInstructions("adjudicate"),
        payload: { items: payloadItems.map((item) => ({ ...item, terra_candidate: validationByRow.get(item.row_id) })) },
        batchLength: rows.length,
      });
      const finalByRow = verifyBatchItems(final.parsed.items, rows, "adjudicate");
      history.push({ stage: "adjudicate", model: models.adjudicate, responseId: final.responseId });
      database.exec("BEGIN IMMEDIATE");
      try {
        for (const row of rows) {
          const finalItem = finalByRow.get(Number(row.row_id));
          const normalized = normalizedFinalItem(finalItem);
          saveStage.run(
            normalized.approved ? "approved" : "blocked",
            null,
            null,
            JSON.stringify(finalItem),
            JSON.stringify(history),
            normalized.approved ? null : normalized.blockedReason || normalized.reviewNotes.join("; ") || "Final review did not approve this supplement.",
            Math.floor(Date.now() / 1_000),
            row.row_id,
          );
        }
        const usage = [draft, validation, final].reduce((sum, value) => ({
          inputTokens: sum.inputTokens + value.inputTokens,
          outputTokens: sum.outputTokens + value.outputTokens,
          durationMs: sum.durationMs + value.durationMs,
        }), { inputTokens: 0, outputTokens: 0, durationMs: 0 });
        event.run(Math.floor(Date.now() / 1_000), "batch_completed", `${models.draft},${models.validate},${models.adjudicate}`, rows.length, usage.inputTokens, usage.outputTokens, usage.durationMs, JSON.stringify({
          rowIds: rows.map((row) => Number(row.row_id)),
          workerId,
          concurrency,
          batchSize: rows.length,
        }));
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      processed += rows.length;
      printStatus(statusSnapshot(database));
  }

  async function workerLoop(workerId) {
    while (!fatalError) {
      let rows;
      try {
        rows = claimBatch();
      } catch (error) {
        fatalError ||= error;
        return;
      }
      if (!rows) return;
      try {
        await processBatch(rows, workerId);
      } catch (error) {
        try {
          resetBatch(rows, error);
        } catch (resetError) {
          fatalError ||= resetError;
          return;
        }
        if (isSystemicRunnerError(error)) {
          fatalError ||= error;
          return;
        }
        if (isTransientGenerationError(error)) {
          await delay(15_000);
          continue;
        }
        // A malformed or batch-specific model response must not stop unrelated
        // workers. The affected rows are retried until maxBatchAttempts, then
        // isolated as failed so the rest of the corpus keeps progressing.
        await delay(2_000);
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: concurrency }, (_, index) => workerLoop(index + 1)));
    if (fatalError) throw fatalError;
  } finally {
    try {
      event.run(Math.floor(Date.now() / 1_000), "runner_stopped", null, processed, 0, 0, 0, JSON.stringify({
        pid: process.pid,
        fatal: Boolean(fatalError),
        error: fatalError ? String(fatalError) : null,
      }));
    } catch {
      // Preserve the original worker failure if the database itself is unavailable.
    }
    source.close();
    database.close();
  }
}

function enrichmentForStorage(finalJson) {
  const item = JSON.parse(finalJson);
  const normalized = normalizeQuestionEnrichment({
    concept_explanation: item.concept_explanation,
    reasoning_steps: item.reasoning_steps,
    choice_explanations: item.choice_explanations,
    common_mistake: item.common_mistake,
    exam_tip: item.exam_tip,
    confidence: item.confidence,
    provenance: "azure-foundry-gpt-5.6-luna-terra-sol",
  });
  if (!questionEnrichmentHasPublishableContent(normalized)) return null;
  return {
    concept_explanation: normalized.conceptExplanation,
    reasoning_steps: normalized.reasoningSteps,
    choice_explanations: normalized.choiceExplanations.map((entry) => ({ choice_id: entry.choiceId, explanation: entry.explanation })),
    common_mistake: normalized.commonMistake,
    exam_tip: normalized.examTip,
    provenance: normalized.provenance,
  };
}

async function applyCommand() {
  requireInventory();
  if (!existsSync(sourcePath)) throw new Error(`Source database is missing: ${sourcePath}`);
  const inventory = new DatabaseSync(inventoryPath);
  const source = new DatabaseSync(sourcePath);
  const approved = inventory.prepare("SELECT * FROM remediation_pages WHERE status = 'approved' ORDER BY row_id").all();
  const insert = source.prepare(`INSERT INTO question_enrichments(
    book_id, chapter_slug, question_id, content_gzip, genuine_unique_words,
    confidence, factual_pass, quality_pass, reviewed_at
  ) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)
  ON CONFLICT(book_id, chapter_slug, question_id) DO UPDATE SET
    content_gzip = excluded.content_gzip,
    genuine_unique_words = excluded.genuine_unique_words,
    confidence = excluded.confidence,
    factual_pass = 1,
    quality_pass = 1,
    reviewed_at = excluded.reviewed_at`);
  const markApplied = inventory.prepare("UPDATE remediation_pages SET status = 'applied_pending_audit', updated_at = ? WHERE row_id = ?");
  let applied = 0;
  const appliedRowIds = [];
  const reviewedAt = Math.floor(Date.now() / 1_000);
  source.exec("BEGIN IMMEDIATE");
  try {
    for (const row of approved) {
      const enrichment = enrichmentForStorage(row.final_json);
      if (!enrichment) continue;
      const tokens = lexicalTokens(JSON.stringify(enrichment));
      const uniqueWords = new Set(tokens).size;
      const finalItem = JSON.parse(row.final_json);
      insert.run(row.book_id, row.chapter_slug, row.question_id, gzipSync(Buffer.from(JSON.stringify(enrichment))), uniqueWords, Number(finalItem.confidence || 0.88), reviewedAt);
      appliedRowIds.push(row.row_id);
      applied += 1;
    }
    source.exec("COMMIT");
    inventory.exec("BEGIN IMMEDIATE");
    try {
      for (const rowId of appliedRowIds) markApplied.run(reviewedAt, rowId);
      inventory.exec("COMMIT");
    } catch (error) {
      inventory.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    source.exec("ROLLBACK");
    throw error;
  } finally {
    source.close();
    inventory.close();
  }
  process.stdout.write(`${JSON.stringify({ pass: true, approvedRows: approved.length, applied, sourceDatabase: sourcePath }, null, 2)}\n`);
}

if (command === "status") await statusCommand();
else if (command === "export") await exportCommand();
else if (command === "run") await runCommand();
else if (command === "apply") await applyCommand();
else throw new Error(`Unknown command: ${command}`);
