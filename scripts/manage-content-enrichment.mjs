#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";

const ROOT = resolve(import.meta.dirname, "..");
const STATE_PATH = resolve(ROOT, "enrichment-data/studywudy-enrichment.sqlite3");
const ORIGIN = "https://studywudy-board-solutions.amanbhagat17089.workers.dev";
const CONCURRENCY = Math.max(3, Number(process.env.STUDYWUDY_ENRICHMENT_CONCURRENCY || 48));
// Validation feedback can legitimately contain words such as “permission” or
// “subscription”. Never mistake that editorial feedback for an Azure outage.
const INFRASTRUCTURE_ERROR = /^(?!grounding verification failed:)(?:Foundry returned HTTP\s+(?:400|401|403|404)\b|.*\b(?:invalid api.?key|unauthori[sz]ed|authentication failed|forbidden|quota (?:exceeded|exhausted)|billing (?:disabled|required)|subscription (?:disabled|not found)|deployment .{0,80}not found|model .{0,80}not found)\b)/iu;

if (!process.env.AZURE_FOUNDRY_API_KEY) throw new Error("AZURE_FOUNDRY_API_KEY is required");
if (!existsSync(STATE_PATH)) throw new Error("Enrichment queue is missing; run pnpm enrichment:init first");

const db = new DatabaseSync(STATE_PATH);
db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;");
const setMeta = db.prepare("INSERT INTO enrichment_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");

function stage(name, message) {
  const now = Math.floor(Date.now() / 1_000);
  setMeta.run("manager_pid", String(process.pid));
  setMeta.run("manager_stage", name);
  setMeta.run("manager_message", message || "");
  setMeta.run("manager_updated_at", String(now));
  console.log(`[manager] ${name}: ${message || ""}`);
}

function run(label, command, args, attempts = 1) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    stage(label, `${attempt}/${attempts}`);
    const result = spawnSync(command, args, {
      cwd: ROOT,
      env: process.env,
      encoding: "utf8",
      stdio: "inherit",
    });
    if (result.status === 0) return;
    if (attempt === attempts) throw new Error(`${label} failed with exit code ${result.status}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 30_000);
  }
}

function counts() {
  return Object.fromEntries(db.prepare("SELECT status,COUNT(*) AS count FROM enrichment_jobs GROUP BY status").all()
    .map((row) => [row.status, Number(row.count)]));
}

function consolidateEditorialFailures() {
  const infrastructureFailures = db.prepare("SELECT row_id,last_error FROM enrichment_jobs WHERE status='failed'").all()
    .filter((row) => INFRASTRUCTURE_ERROR.test(String(row.last_error || "")));
  if (infrastructureFailures.length) {
    throw new Error(`${infrastructureFailures.length} jobs failed because of credentials, quota, deployment or another infrastructure error; refusing editorial consolidation`);
  }
  const now = Math.floor(Date.now() / 1_000);
  const result = db.prepare(`UPDATE enrichment_jobs SET status='consolidated',decision='consolidate',
    quality_pass=0,factual_pass=0,completed_at=COALESCE(completed_at,?),updated_at=?,
    last_error='Standalone generation exhausted strict verification; consolidated into chapter. ' || COALESCE(last_error,'')
    WHERE status IN ('failed','needs_source')`).run(now, now);
  return Number(result.changes || 0);
}

async function verifyProduction(expectedQuestions) {
  stage("verifying-production", `expecting ${expectedQuestions.toLocaleString("en-IN")} question URLs`);
  const rootResponse = await fetch(`${ORIGIN}/sitemap.xml`, { headers: { "accept-encoding": "identity" } });
  if (!rootResponse.ok) throw new Error(`Production sitemap returned ${rootResponse.status}`);
  const rootXml = await rootResponse.text();
  const locations = [...rootXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  let questionCount = 0;
  for (const location of locations.filter((value) => value.includes("/questions-"))) {
    const response = await fetch(location, { headers: { "accept-encoding": "identity" } });
    if (!response.ok) throw new Error(`${location} returned ${response.status}`);
    let body = Buffer.from(await response.arrayBuffer());
    if (body[0] === 0x1f && body[1] === 0x8b) body = gunzipSync(body);
    questionCount += (body.toString("utf8").match(/<url>/g) || []).length;
  }
  if (questionCount !== expectedQuestions) {
    throw new Error(`Production sitemap has ${questionCount} question URLs; expected ${expectedQuestions}`);
  }
}

async function main() {
  stage("enriching", `${CONCURRENCY} parallel workers with cross-model verification`);
  run("enriching", process.execPath, ["scripts/content-enrichment.mjs", "run", "--concurrency", String(CONCURRENCY)]);

  let current = counts();
  if (Number(current.pending || 0) + Number(current.retry || 0) + Number(current.running || 0) > 0) {
    throw new Error("The Azure runner exited while work remained queued");
  }
  const consolidatedFailures = consolidateEditorialFailures();
  current = counts();
  const unresolved = Number(current.pending || 0) + Number(current.retry || 0) + Number(current.running || 0)
    + Number(current.failed || 0) + Number(current.needs_source || 0);
  if (unresolved !== 0) throw new Error(`${unresolved} jobs remain unresolved after final consolidation`);

  const indexable = Number(current.existing_pass || 0) + Number(current.passed || 0);
  stage("building-release", `${indexable.toLocaleString("en-IN")} standalone; ${consolidatedFailures.toLocaleString("en-IN")} final consolidations`);
  run("building-release", "pnpm", ["build:phase4-d1-sync"]);
  run("writing-release-manifest", "pnpm", ["release:manifest"]);
  run("checking-release", "pnpm", ["check:release"]);
  // Include newly-created sitemap shards as well as modifications and removals;
  // `git add -u` silently omitted new shards when corpus membership expanded.
  run("staging-release", "git", ["add", "-A", "--",
    "comparison/after-assets/sitemap.xml",
    "comparison/after-assets/sitemaps",
    "phase4-publish-manifest.mjs",
    "release/production-manifest.json",
  ]);
  const staged = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: ROOT });
  if (staged.status !== 0) {
    run("committing-release", "git", ["commit", "-m", `release: publish completed content remediation (${indexable} standalone)`]);
    run("pushing-release", "git", ["push", "origin", "main"], 5);
  }

  run("syncing-cloudflare-d1", "pnpm", ["sync:phase4:remote"], 5);
  run("deploying-cloudflare", "pnpm", ["deploy:production"], 5);
  await verifyProduction(indexable);
  stage("complete", `${indexable.toLocaleString("en-IN")} standalone; ${Number(current.consolidated || 0).toLocaleString("en-IN")} consolidated; zero unresolved`);
}

try {
  await main();
} catch (error) {
  stage("blocked", String(error?.message || error).slice(0, 500));
  process.exitCode = 1;
} finally {
  setMeta.run("manager_pid", "");
  setMeta.run("manager_updated_at", String(Math.floor(Date.now() / 1_000)));
  db.close();
}
