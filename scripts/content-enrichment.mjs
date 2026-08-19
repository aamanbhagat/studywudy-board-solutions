#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";

const ROOT = resolve(import.meta.dirname, "..");
const DEFAULT_SOURCE = "cloudflare-backup-2026-08-17/d1/studywudy-content.sqlite3";
const DEFAULT_STATE = "enrichment-data/studywudy-enrichment.sqlite3";
const DEFAULT_ENDPOINT = "https://jforxcea-7695-resource.services.ai.azure.com/api/projects/jforxcea-7695";
const DEPTH_FLOOR = 150;
// Sending every atomic exercise to an LLM would be expensive and would reward
// filler. Below this evidence floor, the honest remediation is deterministic
// consolidation into the chapter page rather than a synthetic standalone URL.
const MIN_SOURCE_WORDS_FOR_AI = 80;
const MAX_SOURCE_CHARS = 18_000;
const MAX_ATTEMPTS = 3;

const LUNA_FORMATS = new Set([
  "one_word", "one_sentence", "brief", "define", "name_list", "mcq_single",
  "mcq_multi", "true_false", "fill_blank",
]);
const TERRA_FORMATS = new Set([
  "give_reason", "numerical", "match_column", "distinguish", "assertion_reason",
]);

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    publish_mode: { type: "string", enum: ["standalone", "consolidate"] },
    concept_explanation: { type: "string" },
    reasoning_steps: { type: "array", items: { type: "string" } },
    choice_explanations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          choice: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["choice", "explanation"],
        additionalProperties: false,
      },
    },
    common_mistake: { type: "string" },
    exam_tip: { type: "string" },
    evidence_quotes: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
  required: [
    "publish_mode", "concept_explanation", "reasoning_steps", "choice_explanations",
    "common_mistake", "exam_tip", "evidence_quotes", "confidence",
  ],
  additionalProperties: false,
};

const VERIFICATION_SCHEMA = {
  type: "object",
  properties: {
    pass: { type: "boolean" },
    question_preserved: { type: "boolean" },
    unsupported_claims: { type: "array", items: { type: "string" } },
    contradictions: { type: "array", items: { type: "string" } },
    evidence_coverage_score: { type: "number" },
    confidence: { type: "number" },
  },
  required: [
    "pass", "question_preserved", "unsupported_claims", "contradictions",
    "evidence_coverage_score", "confidence",
  ],
  additionalProperties: false,
};

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      options.set(argument, next);
      index += 1;
    } else {
      options.set(argument, true);
    }
  }
  return { command, options };
}

function numberOption(options, name, fallback, minimum = 0) {
  if (!options.has(name)) return fallback;
  const value = Number(options.get(name));
  if (!Number.isFinite(value) || value < minimum) throw new Error(`${name} must be at least ${minimum}`);
  return value;
}

function hash(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return createHash("sha256").update(value).digest("hex");
  }
  return createHash("sha256").update(String(value || "").normalize("NFKC")).digest("hex");
}

function contentToText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(contentToText).join(" ");
  if (typeof value !== "object") return String(value);
  if (value.kind === "rich") return (value.segments || []).map((segment) => segment.text || "").join(" ");
  if (value.kind === "paragraphs") return (value.paragraphs || []).join(" ");
  if (value.kind === "blocks") {
    return (value.blocks || []).map((block) => {
      if (block.kind === "paragraph") return block.text || "";
      if (block.kind === "list") return (block.items || []).join(" ");
      if (block.kind === "table") return [...(block.headers || []), ...(block.rows || []).flat()].join(" ");
      return block.code || "";
    }).join(" ");
  }
  return Object.values(value).map(contentToText).join(" ");
}

function renderedAnswerText(question) {
  if (["mcq_single", "mcq_multi", "assertion_reason"].includes(question.type)) {
    const correctIds = new Set(question.correctChoiceIds || (question.correctChoiceId ? [question.correctChoiceId] : []));
    const selected = (question.choices || [])
      .filter((choice) => correctIds.has(choice.id))
      .map((choice) => contentToText(choice.content))
      .join(" ");
    return `${selected} ${contentToText(question.explanation)}`.trim();
  }
  if (question.type === "numerical") {
    return `${(question.steps || []).map((step) => contentToText(step.content)).join(" ")} ${contentToText(question.finalAnswer)}`.trim();
  }
  if (question.result) {
    return `${question.result.value ? "True" : "False"} ${contentToText(question.result.correction)} ${contentToText(question.explanation)}`.trim();
  }
  if (question.blanks) {
    return `${question.blanks.map((blank) => contentToText(blank.answer)).join(" ")} ${contentToText(question.explanation)}`.trim();
  }
  if (question.comparison) {
    return `${question.comparison.rows.map((row) => `${contentToText(row.left)} ${contentToText(row.right)}`).join(" ")} ${contentToText(question.explanation)}`.trim();
  }
  if (question.matches) {
    const matches = question.matches.map((match) => {
      const left = question.left?.find((item) => item.id === match.leftId);
      const right = question.right?.find((item) => item.id === match.rightId);
      return `${contentToText(left?.content || match.leftId)} ${contentToText(right?.content || match.rightId)}`;
    }).join(" ");
    return `${matches} ${contentToText(question.explanation)}`.trim();
  }
  if (question.type === "passage" && question.subQuestions) return question.subQuestions.map(renderedAnswerText).join(" ");
  return `${contentToText(question.answer)} ${contentToText(question.answers)} ${contentToText(question.finalAnswer)} ${contentToText(question.explanation)}`.trim();
}

function sourceEvidenceText(question) {
  const parts = [
    contentToText(question.answer),
    contentToText(question.answers),
    contentToText(question.finalAnswer),
    contentToText(question.explanation),
    contentToText(question.steps),
    contentToText(question.result),
    contentToText(question.blanks),
    contentToText(question.comparison),
    contentToText(question.matches),
    contentToText(question.subQuestions),
  ];
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_SOURCE_CHARS);
}

function lexicalTokens(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-IN")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\\(?:begin|end)\{[^}]+\}|\\[a-z]+/giu, " ")
    .replace(/\{\{blank-\d+\}\}/giu, " ");
  return (normalized.match(/[\p{L}\p{M}]+/gu) || []).filter((token) => [...token].length > 1);
}

function genuineUniqueWords(answer, promptAndChoices) {
  const prompt = new Set(lexicalTokens(promptAndChoices));
  return new Set(lexicalTokens(answer).filter((token) => !prompt.has(token))).size;
}

function normalizeEvidence(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("en-IN")
    .replace(/[\p{P}\p{S}\s]+/gu, " ").trim();
}

function enrichmentText(output) {
  return [
    output.concept_explanation,
    ...(output.reasoning_steps || []),
    ...(output.choice_explanations || []).map((entry) => `${entry.choice} ${entry.explanation}`),
    output.common_mistake,
    output.exam_tip,
  ].join(" ").replace(/\s+/g, " ").trim();
}

function chooseBaseModel(format, context) {
  if (LUNA_FORMATS.has(format)) return "gpt-5.6-luna";
  if (TERRA_FORMATS.has(format)) return "gpt-5.6-terra";
  if (/\\(?:frac|sqrt|begin)|\b(?:prove|derive|diagram|passage)\b/iu.test(`${context.prompt_text} ${context.source_evidence}`)) return "gpt-5.6-sol";
  return "gpt-5.6-sol";
}

function modelForAttempt(baseModel, attempt) {
  if (attempt <= 1 || baseModel === "gpt-5.6-sol") return baseModel;
  if (attempt === 2 && baseModel === "gpt-5.6-luna") return "gpt-5.6-terra";
  return "gpt-5.6-sol";
}

function reasoningEffort(model) {
  if (model.endsWith("-luna")) return "low";
  if (model.endsWith("-terra")) return "medium";
  return "high";
}

function maxOutputTokens(model) {
  if (model.endsWith("-luna")) return 1_100;
  if (model.endsWith("-terra")) return 1_700;
  return 2_400;
}

function verifierModel(generatorModel) {
  if (generatorModel.endsWith("-luna")) return "gpt-5.6-terra";
  if (generatorModel.endsWith("-terra")) return "gpt-5.6-sol";
  return "gpt-5.6-terra";
}

function openState(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS enrichment_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS enrichment_jobs (
      row_id INTEGER PRIMARY KEY,
      book_id TEXT NOT NULL,
      chapter_slug TEXT NOT NULL,
      question_id TEXT NOT NULL,
      question_type TEXT NOT NULL,
      question_text TEXT NOT NULL,
      question_hash TEXT NOT NULL,
      choices_text TEXT NOT NULL,
      existing_answer TEXT NOT NULL,
      existing_genuine_words INTEGER NOT NULL,
      source_evidence TEXT NOT NULL,
      source_genuine_words INTEGER NOT NULL DEFAULT 0,
      source_hash TEXT NOT NULL,
      context_json TEXT NOT NULL,
      base_model TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('existing_pass','pending','running','retry','passed','consolidated','needs_source','failed')),
      decision TEXT,
      model TEXT,
      verifier_model TEXT,
      output_json TEXT,
      verification_json TEXT,
      enrichment_text TEXT,
      combined_genuine_words INTEGER,
      evidence_pass INTEGER,
      factual_pass INTEGER NOT NULL DEFAULT 0 CHECK(factual_pass IN (0,1)),
      confidence REAL,
      quality_pass INTEGER NOT NULL DEFAULT 0 CHECK(quality_pass IN (0,1)),
      attempts INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      updated_at INTEGER NOT NULL,
      UNIQUE(book_id, chapter_slug, question_id)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS enrichment_jobs_status_idx ON enrichment_jobs(status, row_id);
    CREATE INDEX IF NOT EXISTS enrichment_jobs_model_idx ON enrichment_jobs(model, status);
    CREATE TABLE IF NOT EXISTS enrichment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at INTEGER NOT NULL,
      row_id INTEGER,
      event TEXT NOT NULL,
      detail TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS enrichment_events_time_idx ON enrichment_events(recorded_at DESC);`);
  const columns = new Set(db.prepare("PRAGMA table_info(enrichment_jobs)").all().map((row) => row.name));
  if (!columns.has("source_genuine_words")) {
    db.exec("ALTER TABLE enrichment_jobs ADD COLUMN source_genuine_words INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns.has("verifier_model")) db.exec("ALTER TABLE enrichment_jobs ADD COLUMN verifier_model TEXT");
  if (!columns.has("verification_json")) db.exec("ALTER TABLE enrichment_jobs ADD COLUMN verification_json TEXT");
  if (!columns.has("factual_pass")) db.exec("ALTER TABLE enrichment_jobs ADD COLUMN factual_pass INTEGER NOT NULL DEFAULT 0 CHECK(factual_pass IN (0,1))");
  return db;
}

function setMeta(db, key, value) {
  db.prepare("INSERT INTO enrichment_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(key, String(value));
}

function getMeta(db, key) {
  return db.prepare("SELECT value FROM enrichment_meta WHERE key=?").get(key)?.value ?? null;
}

function initQueue(options) {
  const sourcePath = resolve(ROOT, options.get("--source") || DEFAULT_SOURCE);
  const statePath = resolve(ROOT, options.get("--state") || DEFAULT_STATE);
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const state = openState(statePath);
  const now = Math.floor(Date.now() / 1_000);
  const books = source.prepare(`SELECT b.id, b.board_slug, b.grade_slug, b.subject_slug, b.slug, b.title,
    c.slug AS chapter_slug, c.title AS chapter_title, c.summary AS chapter_summary
    FROM catalog_books b JOIN catalog_chapters c ON c.book_id=b.id
    ORDER BY b.id, c.position`).all();
  const chapterByKey = new Map(books.map((row) => [`${row.id}:${row.chapter_slug}`, row]));
  const bookIds = [...new Set(books.map((row) => row.id))];
  const upsert = state.prepare(`INSERT INTO enrichment_jobs (
    row_id,book_id,chapter_slug,question_id,question_type,question_text,question_hash,
    choices_text,existing_answer,existing_genuine_words,source_evidence,source_genuine_words,
    source_hash,context_json,base_model,status,created_at,updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(row_id) DO UPDATE SET
    book_id=excluded.book_id,chapter_slug=excluded.chapter_slug,question_id=excluded.question_id,
    question_type=excluded.question_type,question_text=excluded.question_text,
    choices_text=excluded.choices_text,existing_answer=excluded.existing_answer,
    existing_genuine_words=excluded.existing_genuine_words,source_evidence=excluded.source_evidence,
    source_genuine_words=excluded.source_genuine_words,
    context_json=excluded.context_json,base_model=excluded.base_model,updated_at=excluded.updated_at,
    status=CASE WHEN enrichment_jobs.question_hash<>excluded.question_hash OR enrichment_jobs.source_hash<>excluded.source_hash
      THEN excluded.status ELSE enrichment_jobs.status END,
    question_hash=excluded.question_hash,source_hash=excluded.source_hash,
    decision=CASE WHEN enrichment_jobs.question_hash<>excluded.question_hash OR enrichment_jobs.source_hash<>excluded.source_hash THEN NULL ELSE enrichment_jobs.decision END,
    output_json=CASE WHEN enrichment_jobs.question_hash<>excluded.question_hash OR enrichment_jobs.source_hash<>excluded.source_hash THEN NULL ELSE enrichment_jobs.output_json END,
    enrichment_text=CASE WHEN enrichment_jobs.question_hash<>excluded.question_hash OR enrichment_jobs.source_hash<>excluded.source_hash THEN NULL ELSE enrichment_jobs.enrichment_text END,
    quality_pass=CASE WHEN enrichment_jobs.question_hash<>excluded.question_hash OR enrichment_jobs.source_hash<>excluded.source_hash THEN 0 ELSE enrichment_jobs.quality_pass END`);
  let decoded = 0;
  state.exec("BEGIN IMMEDIATE");
  try {
    for (let bookIndex = 0; bookIndex < bookIds.length; bookIndex += 1) {
      const bookId = bookIds[bookIndex];
      const chunks = source.prepare("SELECT content_chunk FROM catalog_book_chunks WHERE book_id=? ORDER BY chunk_index").all(bookId);
      const payload = JSON.parse(gunzipSync(Buffer.concat(chunks.map((row) => Buffer.from(row.content_chunk)))).toString("utf8"));
      for (const chapter of payload.chapters || []) {
        const metadata = chapterByKey.get(`${bookId}:${chapter.slug}`) || {};
        for (const exercise of chapter.exercises || []) {
          for (const question of exercise.questions || []) {
            const catalog = source.prepare("SELECT row_id,prompt_text FROM catalog_questions WHERE book_id=? AND chapter_slug=? AND question_id=?")
              .get(bookId, chapter.slug, question.id);
            if (!catalog) throw new Error(`Missing catalog question ${bookId}:${chapter.slug}:${question.id}`);
            const questionText = contentToText(question.prompt) || catalog.prompt_text || "";
            const choicesText = (question.choices || []).map((choice) => `${choice.id}: ${contentToText(choice.content)}`).join("\n");
            const existingAnswer = renderedAnswerText(question);
            const existingWords = genuineUniqueWords(existingAnswer, `${questionText} ${choicesText}`);
            const sourceEvidence = sourceEvidenceText(question);
            const sourceWords = genuineUniqueWords(sourceEvidence, `${questionText} ${choicesText}`);
            const context = {
              board: metadata.board_slug || "",
              grade: metadata.grade_slug || "",
              subject: metadata.subject_slug || "",
              book: metadata.title || "",
              chapter: metadata.chapter_title || chapter.title || chapter.slug,
              chapter_summary: metadata.chapter_summary || "",
              exercise: exercise.title || exercise.label || "",
              concepts: question.conceptTags || [],
            };
            const baseModel = chooseBaseModel(question.type, { prompt_text: questionText, source_evidence: sourceEvidence });
            const status = existingWords >= DEPTH_FLOOR ? "existing_pass" : sourceEvidence ? "pending" : "needs_source";
            const questionHash = hash(JSON.stringify(question.prompt));
            const sourceHash = hash(sourceEvidence);
            upsert.run(
              Number(catalog.row_id), bookId, chapter.slug, question.id, question.type,
              questionText, questionHash, choicesText, existingAnswer, existingWords,
              sourceEvidence, sourceWords, sourceHash, JSON.stringify(context), baseModel, status, now, now,
            );
            decoded += 1;
          }
        }
      }
      if ((bookIndex + 1) % 25 === 0 || bookIndex + 1 === bookIds.length) {
        process.stderr.write(`\rInitialized ${bookIndex + 1}/${bookIds.length} books; ${decoded.toLocaleString("en-IN")} questions`);
      }
    }
    setMeta(state, "source_path", sourcePath);
    setMeta(state, "source_sha256", hash(readFileSync(sourcePath)));
    setMeta(state, "initialized_at", now);
    setMeta(state, "corpus_count", decoded);
    setMeta(state, "minimum_source_words_for_ai", MIN_SOURCE_WORDS_FOR_AI);
    const deterministic = JSON.stringify({
      publish_mode: "consolidate",
      concept_explanation: "",
      reasoning_steps: [],
      choice_explanations: [],
      common_mistake: "",
      exam_tip: "",
      evidence_quotes: [],
      confidence: 1,
      strategy: "deterministic-thin-format-consolidation",
    });
    state.prepare(`UPDATE enrichment_jobs SET status='consolidated',decision='consolidate',
      model=COALESCE(model,'deterministic-consolidation'),output_json=COALESCE(output_json,?),
      enrichment_text=COALESCE(enrichment_text,existing_answer),
      combined_genuine_words=COALESCE(combined_genuine_words,existing_genuine_words),
      evidence_pass=COALESCE(evidence_pass,1),factual_pass=0,
      confidence=COALESCE(confidence,1),quality_pass=0,
      last_error=NULL,completed_at=COALESCE(completed_at,?),updated_at=?
      WHERE existing_genuine_words < ? AND source_genuine_words < ?
        AND status IN ('pending','retry','needs_source')`).run(
      deterministic, now, now, DEPTH_FLOOR, MIN_SOURCE_WORDS_FOR_AI,
    );
    state.exec("COMMIT");
  } catch (error) {
    state.exec("ROLLBACK");
    throw error;
  } finally {
    source.close();
  }
  process.stderr.write("\n");
  printStatus(state, false);
  state.close();
}

function buildPrompt(job, previousError) {
  const context = JSON.parse(job.context_json);
  return `QUESTION (immutable; never rewrite it):\n${job.question_text}\n\nCHOICES (if any):\n${job.choices_text || "None"}\n\nEXISTING ANSWER (authoritative; do not contradict or replace it):\n${job.existing_answer || "No answer text available"}\n\nSOURCE EVIDENCE (the only factual source you may use):\n${job.source_evidence}\n\nCONTEXT:\nBoard: ${context.board}\nClass: ${context.grade}\nSubject: ${context.subject}\nBook: ${context.book}\nChapter: ${context.chapter}\nQuestion format: ${job.question_type}\nConcepts: ${(context.concepts || []).join(", ") || "not supplied"}\nSource evidence has ${job.source_genuine_words} genuine unique words after prompt terms are removed.\n\nTASK:\nAdd only question-specific educational value grounded in the question, choices, existing answer and source evidence. This row was selected because its evidence is substantial enough to attempt a standalone solution. Prefer publish_mode standalone and write a natural 260–420 word teaching explanation with useful reasoning, distinctions, checks or examples that follow directly from the evidence. Do not add generic study advice merely to reach a count. For MCQ, explain the correct choice and each distractor only when the evidence supports it. For numerical work, show givens, formula, substitution, units and a reasonableness check. For definitions and short answers, add context, an example and a useful distinction only when natural. Never pad, invent a teacher review, fabricate a citation, or change the question. Evidence quotes must be short exact substrings copied character-for-character from SOURCE EVIDENCE. Choose consolidate only when a substantial standalone explanation would still be artificial or unsupported. A standalone result must contain at least ${DEPTH_FLOOR} genuine unique explanatory words after combining with the existing answer.${previousError ? `\n\nPREVIOUS VALIDATION FAILURE TO FIX:\n${previousError}` : ""}`;
}

function instructionsFor(job) {
  return `You are a careful K-12 textbook solution editor. Preserve the supplied question exactly. The existing answer is authoritative. Use only supplied question context and source evidence, write age-appropriate Indian English, and prefer an honest consolidate decision over filler. When the evidence supports standalone publication, make every section question-specific and sufficiently developed for the strict unique-word quality gate. Output only the required structured data. The response must not claim human or teacher verification.`;
}

async function foundryJson(endpoint, apiKey, request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/openai/v1/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: { "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        reasoning: { effort: request.effort },
        max_output_tokens: request.maxOutputTokens,
        store: false,
        instructions: request.instructions,
        input: request.input,
        text: { format: { type: "json_schema", name: request.schemaName, strict: true, schema: request.schema } },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error?.message || `Foundry returned HTTP ${response.status}`);
      error.status = response.status;
      error.retryAfter = Number(response.headers.get("retry-after") || 0);
      throw error;
    }
    const text = (payload.output || []).flatMap((item) => item.content || [])
      .find((item) => item.type === "output_text")?.text || payload.output_text;
    if (!text) throw new Error(`Foundry response ${payload.id || "unknown"} contained no output text`);
    return { output: JSON.parse(text), usage: payload.usage || {}, responseId: payload.id || null };
  } finally {
    clearTimeout(timeout);
  }
}

async function foundryResponse(endpoint, apiKey, job, model, previousError) {
  return foundryJson(endpoint, apiKey, {
    model,
    effort: reasoningEffort(model),
    maxOutputTokens: maxOutputTokens(model),
    instructions: instructionsFor(job),
    input: buildPrompt(job, previousError),
    schemaName: "studywudy_enrichment",
    schema: OUTPUT_SCHEMA,
  });
}

async function verifyFoundryOutput(endpoint, apiKey, job, output, generatorModel) {
  const model = verifierModel(generatorModel);
  const context = JSON.parse(job.context_json);
  const input = `IMMUTABLE QUESTION:\n${job.question_text}\n\nCHOICES:\n${job.choices_text || "None"}\n\nAUTHORITATIVE EXISTING ANSWER:\n${job.existing_answer}\n\nALLOWED SOURCE EVIDENCE:\n${job.source_evidence}\n\nGENERATED ENRICHMENT TO AUDIT:\n${JSON.stringify(output)}\n\nCONTEXT:\n${context.board}; ${context.grade}; ${context.subject}; ${context.book}; ${context.chapter}\n\nAudit every factual statement in the generated enrichment. Pass only when the question is untouched, the answer is not contradicted, and each factual claim is directly supported by the question, choices, existing answer, source evidence, or an unavoidable logical restatement of them. Flag plausible outside knowledge when it is not supplied; plausibility is not evidence. Generic connective wording is allowed but must not introduce new facts.`;
  const result = await foundryJson(endpoint, apiKey, {
    model,
    effort: model.endsWith("-sol") ? "high" : "medium",
    maxOutputTokens: 900,
    instructions: "You are an independent factual-grounding auditor for K-12 textbook solutions. Be strict, concise and evidence-bound. Do not repair the answer; report only the required structured verdict.",
    input,
    schemaName: "studywudy_grounding_verification",
    schema: VERIFICATION_SCHEMA,
  });
  return { ...result, model };
}

function validateOutput(job, output) {
  const text = enrichmentText(output);
  const combinedWords = genuineUniqueWords(`${job.existing_answer} ${text}`, `${job.question_text} ${job.choices_text}`);
  const evidence = normalizeEvidence(job.source_evidence);
  const quotes = output.evidence_quotes || [];
  const evidencePass = quotes.length > 0 && quotes.every((quote) => {
    const normalized = normalizeEvidence(quote);
    return normalized.length >= 8 && evidence.includes(normalized);
  });
  const confidence = Number(output.confidence || 0);
  const errors = [];
  if (!text) errors.push("empty enrichment");
  if (!evidencePass) errors.push("evidence quotes are missing or are not exact source substrings");
  if (confidence < 0.85) errors.push(`confidence ${confidence.toFixed(3)} is below 0.85`);
  if (/as an ai|teacher[- ]reviewed|human[- ]verified|according to the internet/iu.test(text)) errors.push("unsupported trust or provenance claim");
  if (output.publish_mode === "standalone" && combinedWords < DEPTH_FLOOR) {
    errors.push(`${combinedWords} genuine unique words is below the ${DEPTH_FLOOR}-word standalone floor`);
  }
  const qualityPass = output.publish_mode === "standalone" && errors.length === 0;
  return { text, combinedWords, evidencePass, confidence, errors, qualityPass };
}

function claimJob(db, formats) {
  const now = Math.floor(Date.now() / 1_000);
  const formatFilter = formats.length ? `AND question_type IN (${formats.map(() => "?").join(",")})` : "";
  const row = db.prepare(`SELECT * FROM enrichment_jobs
    WHERE status IN ('pending','retry') ${formatFilter}
    ORDER BY CASE base_model WHEN 'gpt-5.6-luna' THEN 1 WHEN 'gpt-5.6-terra' THEN 2 ELSE 3 END, row_id
    LIMIT 1`).get(...formats);
  if (!row) return null;
  const changed = db.prepare(`UPDATE enrichment_jobs SET status='running',started_at=?,updated_at=?,attempts=attempts+1
    WHERE row_id=? AND status IN ('pending','retry')`).run(now, now, row.row_id);
  return Number(changed.changes) === 1 ? db.prepare("SELECT * FROM enrichment_jobs WHERE row_id=?").get(row.row_id) : null;
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function processJob(db, endpoint, apiKey, job) {
  const model = modelForAttempt(job.base_model, Number(job.attempts));
  const previousError = job.last_error || "";
  try {
    const result = await foundryResponse(endpoint, apiKey, job, model, previousError);
    const validation = validateOutput(job, result.output);
    let verification = null;
    let factualPass = result.output.publish_mode === "consolidate";
    let verifierInputTokens = 0;
    let verifierOutputTokens = 0;
    if (validation.qualityPass) {
      verification = await verifyFoundryOutput(endpoint, apiKey, job, result.output, model);
      verifierInputTokens = Number(verification.usage.input_tokens || 0);
      verifierOutputTokens = Number(verification.usage.output_tokens || 0);
      const verdict = verification.output;
      factualPass = verdict.pass === true
        && verdict.question_preserved === true
        && (verdict.unsupported_claims || []).length === 0
        && (verdict.contradictions || []).length === 0
        && Number(verdict.evidence_coverage_score || 0) >= 0.95
        && Number(verdict.confidence || 0) >= 0.9;
      if (!factualPass) {
        validation.errors.push(`grounding verification failed: ${[
          ...(verdict.unsupported_claims || []),
          ...(verdict.contradictions || []),
        ].join(" | ") || "insufficient evidence coverage"}`);
      }
    }
    const now = Math.floor(Date.now() / 1_000);
    let status;
    if (result.output.publish_mode === "consolidate" && validation.evidencePass && validation.confidence >= 0.85) status = "consolidated";
    else if (validation.qualityPass && factualPass) status = "passed";
    else status = Number(job.attempts) >= MAX_ATTEMPTS ? "failed" : "retry";
    const error = validation.errors.join("; ") || null;
    db.prepare(`UPDATE enrichment_jobs SET status=?,decision=?,model=?,verifier_model=?,output_json=?,
      verification_json=?,enrichment_text=?,combined_genuine_words=?,evidence_pass=?,factual_pass=?,
      confidence=?,quality_pass=?,input_tokens=input_tokens+?,output_tokens=output_tokens+?,
      last_error=?,completed_at=?,updated_at=? WHERE row_id=?`).run(
      status, result.output.publish_mode, model, verification?.model || null, JSON.stringify(result.output),
      verification ? JSON.stringify(verification.output) : null, validation.text,
      validation.combinedWords, validation.evidencePass ? 1 : 0, factualPass ? 1 : 0,
      validation.confidence, validation.qualityPass && factualPass ? 1 : 0,
      Number(result.usage.input_tokens || 0) + verifierInputTokens,
      Number(result.usage.output_tokens || 0) + verifierOutputTokens,
      error, status === "retry" ? null : now, now, job.row_id,
    );
    db.prepare("INSERT INTO enrichment_events(recorded_at,row_id,event,detail) VALUES(?,?,?,?)")
      .run(now, job.row_id, status, JSON.stringify({ model, verifier_model: verification?.model || null, response_id: result.responseId, verifier_response_id: verification?.responseId || null, errors: validation.errors }));
    return Number(result.usage.input_tokens || 0) + verifierInputTokens
      + Number(result.usage.output_tokens || 0) + verifierOutputTokens;
  } catch (error) {
    const now = Math.floor(Date.now() / 1_000);
    const retryable = [408, 409, 429, 500, 502, 503, 504].includes(Number(error.status || 0)) || error.name === "AbortError";
    const status = retryable || Number(job.attempts) < MAX_ATTEMPTS ? "retry" : "failed";
    db.prepare("UPDATE enrichment_jobs SET status=?,model=?,last_error=?,completed_at=?,updated_at=? WHERE row_id=?")
      .run(status, model, String(error.message || error).slice(0, 1_000), status === "failed" ? now : null, now, job.row_id);
    db.prepare("INSERT INTO enrichment_events(recorded_at,row_id,event,detail) VALUES(?,?,?,?)")
      .run(now, job.row_id, status, JSON.stringify({ model, error: String(error.message || error).slice(0, 500) }));
    if (error.retryAfter) await sleep(Math.min(60_000, error.retryAfter * 1_000));
    return 0;
  }
}

function acquireRunner(db) {
  const priorPid = Number(getMeta(db, "runner_pid") || 0);
  const heartbeat = Number(getMeta(db, "runner_heartbeat") || 0);
  if (priorPid && Date.now() / 1_000 - heartbeat < 180) {
    try {
      process.kill(priorPid, 0);
      throw new Error(`Another enrichment runner is active with PID ${priorPid}`);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  setMeta(db, "runner_pid", process.pid);
  setMeta(db, "runner_started_at", Math.floor(Date.now() / 1_000));
  setMeta(db, "runner_heartbeat", Math.floor(Date.now() / 1_000));
}

function releaseRunner(db) {
  setMeta(db, "runner_pid", "");
  setMeta(db, "runner_heartbeat", "0");
}

async function runQueue(options) {
  const statePath = resolve(ROOT, options.get("--state") || DEFAULT_STATE);
  const state = openState(statePath);
  if (!getMeta(state, "corpus_count")) throw new Error("Queue is not initialized; run the init command first");
  const apiKey = process.env.AZURE_FOUNDRY_API_KEY;
  if (!apiKey) throw new Error("AZURE_FOUNDRY_API_KEY is required and must not be committed to the repository");
  const endpoint = process.env.AZURE_FOUNDRY_PROJECT_ENDPOINT || DEFAULT_ENDPOINT;
  const concurrency = Math.floor(numberOption(options, "--concurrency", 4, 1));
  const limit = Math.floor(numberOption(options, "--limit", Number.MAX_SAFE_INTEGER, 1));
  const tokenBudget = Math.floor(numberOption(options, "--token-budget", Number.MAX_SAFE_INTEGER, 1));
  const formats = String(options.get("--formats") || "").split(",").map((value) => value.trim()).filter(Boolean);
  acquireRunner(state);
  state.prepare("UPDATE enrichment_jobs SET status='retry',last_error=COALESCE(last_error,'stale runner recovery'),updated_at=? WHERE status='running' AND started_at<?")
    .run(Math.floor(Date.now() / 1_000), Math.floor(Date.now() / 1_000) - 900);
  let claimed = 0;
  let runTokens = 0;
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  const heartbeat = setInterval(() => setMeta(state, "runner_heartbeat", Math.floor(Date.now() / 1_000)), 30_000);
  const ticker = setInterval(() => printStatus(state, false), 30_000);
  async function worker() {
    while (!stopping && claimed < limit && runTokens < tokenBudget) {
      const job = claimJob(state, formats);
      if (!job) break;
      claimed += 1;
      const jobTokens = await processJob(state, endpoint, apiKey, job);
      runTokens += jobTokens;
      if (runTokens >= tokenBudget) stopping = true;
    }
  }
  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
  } finally {
    clearInterval(heartbeat);
    clearInterval(ticker);
    setMeta(state, "last_run_claimed", claimed);
    setMeta(state, "last_run_tokens", runTokens);
    setMeta(state, "last_run_stopped_at_token_budget", runTokens >= tokenBudget ? 1 : 0);
    releaseRunner(state);
    printStatus(state, false);
    state.close();
  }
}

function statusObject(db) {
  const counts = Object.fromEntries(db.prepare("SELECT status,COUNT(*) AS count FROM enrichment_jobs GROUP BY status").all()
    .map((row) => [row.status, Number(row.count)]));
  const corpus = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const queued = Number(counts.pending || 0) + Number(counts.retry || 0);
  const active = Number(counts.running || 0);
  const handled = Number(counts.passed || 0) + Number(counts.consolidated || 0);
  const complete = Number(counts.existing_pass || 0) + handled;
  const unresolved = queued + active + Number(counts.needs_source || 0) + Number(counts.failed || 0);
  const now = Math.floor(Date.now() / 1_000);
  const firstRecent = db.prepare("SELECT MIN(recorded_at) AS first_at,COUNT(*) AS completed FROM enrichment_events WHERE recorded_at >= ? AND event IN ('passed','consolidated','failed')").get(now - 3600);
  const recentCompleted = Number(firstRecent?.completed || 0);
  const recentWindowHours = recentCompleted ? Math.max((now - Number(firstRecent.first_at || now)) / 3600, 1 / 60) : 0;
  const ratePerHour = recentWindowHours ? recentCompleted / recentWindowHours : 0;
  const etaHours = ratePerHour ? queued / ratePerHour : null;
  const models = db.prepare(`SELECT COALESCE(model,base_model) AS model,
    SUM(CASE WHEN status IN ('passed','consolidated','failed') THEN 1 ELSE 0 END) AS completed,
    SUM(input_tokens) AS input_tokens,SUM(output_tokens) AS output_tokens
    FROM enrichment_jobs GROUP BY COALESCE(model,base_model) ORDER BY model`).all().map((row) => ({
      model: row.model,
      completed: Number(row.completed || 0),
      input_tokens: Number(row.input_tokens || 0),
      output_tokens: Number(row.output_tokens || 0),
    }));
  return {
    generated_at: new Date().toISOString(),
    corpus,
    counts,
    complete,
    handled,
    remaining: unresolved,
    queued,
    active,
    percent_complete: corpus ? Number((complete * 100 / corpus).toFixed(4)) : 0,
    rate_per_hour: Number(ratePerHour.toFixed(2)),
    eta_hours: etaHours == null ? null : Number(etaHours.toFixed(2)),
    runner: {
      pid: Number(getMeta(db, "runner_pid") || 0) || null,
      heartbeat: Number(getMeta(db, "runner_heartbeat") || 0) || null,
    },
    models,
    verification: {
      passed: Number(db.prepare("SELECT COUNT(*) AS count FROM enrichment_jobs WHERE factual_pass=1 AND quality_pass=1").get().count),
      pendingOrRetry: Number(counts.pending || 0) + Number(counts.retry || 0),
    },
  };
}

function printStatus(db, json) {
  const status = statusObject(db);
  if (json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  const eta = status.eta_hours == null ? "calculating" : `${status.eta_hours.toLocaleString("en-IN")} h`;
  console.log(`[${status.generated_at}] ${status.complete.toLocaleString("en-IN")}/${status.corpus.toLocaleString("en-IN")} resolved (${status.percent_complete}%) | ${status.queued.toLocaleString("en-IN")} queued | ${status.active} active | ${status.remaining.toLocaleString("en-IN")} unresolved | ${status.rate_per_hour.toLocaleString("en-IN")}/h | ETA ${eta}`);
  console.log(`  existing=${Number(status.counts.existing_pass || 0).toLocaleString("en-IN")} passed=${Number(status.counts.passed || 0).toLocaleString("en-IN")} consolidated=${Number(status.counts.consolidated || 0).toLocaleString("en-IN")} retry=${Number(status.counts.retry || 0).toLocaleString("en-IN")} needs-source=${Number(status.counts.needs_source || 0).toLocaleString("en-IN")} failed=${Number(status.counts.failed || 0).toLocaleString("en-IN")}`);
  console.log(`  cross-model verified standalone=${status.verification.passed.toLocaleString("en-IN")}`);
  for (const model of status.models) console.log(`  ${model.model}: ${model.completed.toLocaleString("en-IN")} completed, ${model.input_tokens.toLocaleString("en-IN")} input tokens, ${model.output_tokens.toLocaleString("en-IN")} output tokens`);
}

async function watchStatus(options) {
  const statePath = resolve(ROOT, options.get("--state") || DEFAULT_STATE);
  const state = openState(statePath);
  const interval = Math.floor(numberOption(options, "--watch", 0, 0));
  const json = options.has("--json");
  do {
    printStatus(state, json);
    if (!interval) break;
    await sleep(interval * 1_000);
  } while (true);
  state.close();
}

function exportSql(options) {
  const statePath = resolve(ROOT, options.get("--state") || DEFAULT_STATE);
  const outputPath = resolve(ROOT, options.get("--output") || "enrichment-data/question-enrichments.sql");
  const state = openState(statePath);
  const rows = state.prepare(`SELECT book_id,chapter_slug,question_id,question_hash,source_hash,model,verifier_model,
    decision,output_json,verification_json,enrichment_text,combined_genuine_words,confidence,quality_pass,factual_pass,completed_at
    FROM enrichment_jobs WHERE status='passed' ORDER BY row_id`).all();
  const quote = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;
  const sqlValue = (value) => value == null ? "NULL" : quote(value);
  const statements = ["BEGIN TRANSACTION;"];
  for (const row of rows) {
    statements.push(`INSERT INTO question_enrichments (book_id,chapter_slug,question_id,question_hash,source_hash,model,verifier_model,decision,content_json,verification_json,rendered_text,genuine_unique_words,confidence,factual_pass,quality_pass,generated_at,reviewed_at) VALUES (${[
      row.book_id,row.chapter_slug,row.question_id,row.question_hash,row.source_hash,row.model,row.verifier_model,row.decision,row.output_json,row.verification_json,row.enrichment_text,
    ].map(sqlValue).join(",")},${Number(row.combined_genuine_words || 0)},${Number(row.confidence || 0)},${Number(row.factual_pass || 0)},${Number(row.quality_pass || 0)},${Number(row.completed_at || 0)},${Number(row.completed_at || 0)}) ON CONFLICT(book_id,chapter_slug,question_id) DO UPDATE SET question_hash=excluded.question_hash,source_hash=excluded.source_hash,model=excluded.model,verifier_model=excluded.verifier_model,decision=excluded.decision,content_json=excluded.content_json,verification_json=excluded.verification_json,rendered_text=excluded.rendered_text,genuine_unique_words=excluded.genuine_unique_words,confidence=excluded.confidence,factual_pass=excluded.factual_pass,quality_pass=excluded.quality_pass,generated_at=excluded.generated_at,reviewed_at=excluded.reviewed_at;`);
  }
  statements.push("COMMIT;");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${statements.join("\n")}\n`);
  console.log(JSON.stringify({ output: outputPath, rows: rows.length }, null, 2));
  state.close();
}

function help() {
  console.log(`StudyWudy content enrichment\n\nCommands:\n  init                 Build/resume the 299K-question queue from the read-only catalog\n  run                  Process queued questions through Azure Foundry\n  status               Print current counts, token usage, throughput and ETA\n  export-sql            Export validated enrichment rows for D1\n\nExamples:\n  pnpm enrichment:init\n  AZURE_FOUNDRY_API_KEY=... pnpm enrichment:run -- --concurrency 8 --token-budget 1000000\n  pnpm enrichment:status -- --watch 5\n  pnpm enrichment:status -- --json\n\nOptions:\n  --state <path>        Queue database (default: ${DEFAULT_STATE})\n  --source <path>       Read-only catalog database (init only)\n  --limit <n>           Maximum jobs claimed by this run\n  --concurrency <n>     Parallel Foundry requests (default: 4)\n  --token-budget <n>    Stop after approximately this many input + output tokens\n  --formats <csv>       Restrict a run to selected question formats\n  --watch <seconds>     Repeat status output\n  --output <path>       SQL export destination`);
}

const { command, options } = parseArgs(process.argv.slice(2));
if (command === "init") initQueue(options);
else if (command === "run") await runQueue(options);
else if (command === "status") await watchStatus(options);
else if (command === "export-sql") exportSql(options);
else help();
