#!/usr/bin/env node

import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";

const root = resolve(import.meta.dirname, "..");
const runtimeDirectory = resolve(root, "audits/sitewide");
const inventoryPath = resolve(root, process.env.STUDYWUDY_REMEDIATION_INVENTORY || "audits/sitewide/sitewide-remediation.sqlite3");
const sourcePath = resolve(root, process.env.STUDYWUDY_REMEDIATION_SOURCE_DB || "../data/d1/studywudy-content.sqlite3");
const lockPath = resolve(runtimeDirectory, "sitewide-remediation-supervisor.lock");
const statePath = resolve(runtimeDirectory, "sitewide-remediation-supervisor.json");
const workerScript = resolve(root, "scripts/sitewide-remediation.mjs");
const concurrency = Math.max(1, Math.min(32, Number(process.env.STUDYWUDY_REMEDIATION_CONCURRENCY || 32)));
const batchSize = Math.max(1, Math.min(12, Number(process.env.STUDYWUDY_REMEDIATION_BATCH_SIZE || 12)));
const maxBatchAttempts = Math.max(2, Math.min(20, Number(process.env.STUDYWUDY_REMEDIATION_MAX_BATCH_ATTEMPTS || 6)));
const keychainAccount = process.env.STUDYWUDY_KEYCHAIN_ACCOUNT || "studywudy-sitewide-remediation";
const keychainService = process.env.STUDYWUDY_KEYCHAIN_SERVICE || "studywudy-azure-foundry";

mkdirSync(runtimeDirectory, { recursive: true });

function processExists(pid) {
  if (!Number.isInteger(pid) || pid < 2) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  try {
    const descriptor = openSync(lockPath, "wx", 0o600);
    writeFileSync(descriptor, `${process.pid}\n`);
    closeSync(descriptor);
    return;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const existingPid = Number(readFileSync(lockPath, "utf8").trim());
  if (processExists(existingPid)) {
    throw new Error(`A sitewide remediation supervisor is already running with PID ${existingPid}.`);
  }
  unlinkSync(lockPath);
  const descriptor = openSync(lockPath, "wx", 0o600);
  writeFileSync(descriptor, `${process.pid}\n`);
  closeSync(descriptor);
}

function readApiKey() {
  const fromEnvironment = String(process.env.AZURE_FOUNDRY_API_KEY || "").trim();
  if (fromEnvironment) return fromEnvironment;
  if (process.platform !== "darwin") {
    throw new Error("AZURE_FOUNDRY_API_KEY is missing and Keychain lookup is only supported on macOS.");
  }
  return execFileSync("/usr/bin/security", [
    "find-generic-password",
    "-a", keychainAccount,
    "-s", keychainService,
    "-w",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function queueSnapshot() {
  if (!existsSync(inventoryPath)) return { activeRows: 0, eligiblePending: 0 };
  const database = new DatabaseSync(inventoryPath, { readOnly: true });
  try {
    const row = database.prepare(`SELECT
      SUM(CASE WHEN status IN ('drafting', 'validating', 'adjudicating') THEN 1 ELSE 0 END) AS active_rows,
      SUM(CASE WHEN status = 'pending' AND source_review_required = 0
        AND attempts < ?
        AND (thin_content_risk = 1 OR issue_family = 'content' OR issue_family = 'math') THEN 1 ELSE 0 END) AS eligible_pending
      FROM remediation_pages`).get(maxBatchAttempts);
    return {
      activeRows: Number(row.active_rows || 0),
      eligiblePending: Number(row.eligible_pending || 0),
    };
  } finally {
    database.close();
  }
}

function recoverOrphanedRows() {
  if (!existsSync(inventoryPath)) return 0;
  const database = new DatabaseSync(inventoryPath);
  try {
    const result = database.prepare(`UPDATE remediation_pages
      SET status = CASE WHEN attempts >= ? THEN 'failed' ELSE 'pending' END,
          locked_at = NULL,
          error = COALESCE(error, 'Worker process exited before completing this batch'),
          updated_at = ?
      WHERE status IN ('drafting', 'validating', 'adjudicating')`).run(maxBatchAttempts, Math.floor(Date.now() / 1_000));
    return Number(result.changes || 0);
  } finally {
    database.close();
  }
}

let child = null;
let stopping = false;
let restartCount = 0;
let lastExit = null;

function writeState(state, extra = {}) {
  const queue = queueSnapshot();
  writeFileSync(statePath, `${JSON.stringify({
    state,
    supervisorPid: process.pid,
    workerPid: child?.pid || null,
    updatedAt: new Date().toISOString(),
    restartCount,
    lastExit,
    concurrency,
    batchSize,
    ...queue,
    ...extra,
  }, null, 2)}\n`, { mode: 0o600 });
}

function releaseLock() {
  try {
    if (Number(readFileSync(lockPath, "utf8").trim()) === process.pid) unlinkSync(lockPath);
  } catch {
    // Another cleanup path may already have removed the lock.
  }
}

function requestStop(signal) {
  stopping = true;
  writeState("STOPPING", { signal });
  if (child && !child.killed) child.kill("SIGTERM");
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => requestStop(signal));
}

async function supervise() {
  acquireLock();
  process.on("exit", releaseLock);
  const endpoint = String(process.env.AZURE_FOUNDRY_RESPONSES_ENDPOINT || "").trim();
  if (!endpoint) throw new Error("AZURE_FOUNDRY_RESPONSES_ENDPOINT is missing from the supervisor environment.");
  const apiKey = readApiKey();
  if (!apiKey) throw new Error("Azure Foundry API key is empty.");
  if (!existsSync(sourcePath)) throw new Error(`Source database is missing: ${sourcePath}`);

  let backoffMs = 5_000;
  while (!stopping) {
    const queue = queueSnapshot();
    if (queue.activeRows === 0 && queue.eligiblePending === 0) {
      writeState("COMPLETE");
      return;
    }

    const startedAt = Date.now();
    child = spawn(process.execPath, [
      workerScript,
      "run",
      "--inventory", inventoryPath,
      "--source-db", sourcePath,
      "--concurrency", String(concurrency),
      "--batch-size", String(batchSize),
      "--max-batch-attempts", String(maxBatchAttempts),
    ], {
      cwd: root,
      env: {
        ...process.env,
        AZURE_FOUNDRY_RESPONSES_ENDPOINT: endpoint,
        AZURE_FOUNDRY_API_KEY: apiKey,
      },
      stdio: "inherit",
    });
    writeState(restartCount === 0 ? "RUNNING" : "RESTARTED");
    const heartbeat = setInterval(() => writeState("RUNNING"), 15_000);
    const exit = await new Promise((accept) => {
      child.once("error", (error) => accept({ code: null, signal: null, error: String(error) }));
      child.once("exit", (code, signal) => accept({ code, signal, error: null }));
    });
    clearInterval(heartbeat);
    const runtimeMs = Date.now() - startedAt;
    child = null;
    const recoveredRows = recoverOrphanedRows();
    lastExit = { ...exit, runtimeMs, recoveredRows, at: new Date().toISOString() };
    if (stopping) break;

    const afterExit = queueSnapshot();
    if (afterExit.activeRows === 0 && afterExit.eligiblePending === 0) {
      writeState("COMPLETE");
      return;
    }
    restartCount += 1;
    backoffMs = runtimeMs >= 300_000 ? 5_000 : Math.min(300_000, Math.max(5_000, backoffMs * 2));
    writeState("RESTARTING", { restartInSeconds: Math.ceil(backoffMs / 1_000) });
    await delay(backoffMs);
  }
  writeState("STOPPED");
}

try {
  await supervise();
} catch (error) {
  try {
    writeState("FATAL", { error: String(error) });
  } catch {
    // The original fatal error is the useful one.
  }
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
} finally {
  releaseLock();
}
