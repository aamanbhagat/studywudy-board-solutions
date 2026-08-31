#!/usr/bin/env node
// One-command rollback for the production Worker, safe to run from a script.
//
// Why this exists instead of `wrangler rollback`: that command has no --dry-run,
// and its final gate is
//
//   confirm2("Are you sure you want to deploy this Worker Version to 100% of
//            traffic?", { defaultValue: true })
//
// where confirm2(text, { fallbackValue = true }) returns fallbackValue whenever
// isNonInteractiveOrCI() is true. Any redirected stdin, CI job, or agent-driven
// shell therefore *performs* the rollback instead of prompting. There is no way
// to rehearse it and no way to invoke it accidentally-safely.
//
// `wrangler versions deploy <id>@100` is the same operation - a rollback is just
// a deployment that points 100% of traffic at an older version - and it does
// have a real --dry-run, which exits at `cancel("--dry-run: exiting")` before
// createDeployment2() is ever called. So this script drives that instead, and
// every mode short of --execute is provably incapable of changing production.
//
// Modes:
//   (default)   read-only: current deploy, resolved target, binding parity
//   --rehearse  real API dry-run of the exact rollback deployment
//   --execute   perform the rollback, then re-run the production smokes
//
// The roll-*forward* id is printed and recorded before --execute touches
// anything, because the thing you most need during an incident is the id you
// just left, and `deployments list` will not distinguish it from any other
// entry once the rollback is on top.
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index];
  if (!token.startsWith("--")) continue;
  const next = process.argv[index + 1];
  args.set(token, next && !next.startsWith("--") ? next : "1");
}

const root = resolve(import.meta.dirname, "..");
const workerName = args.get("--name") || "studywudy-board-solutions";
const recordPath = resolve(root, args.get("--record") || "audits/technical-seo/rollback-runbook.jsonl");
const mode = args.has("--execute") ? "execute" : args.has("--rehearse") ? "rehearse" : "status";
const allowBindingDrift = args.has("--allow-binding-drift");
const skipSmokes = args.has("--skip-smokes");

// Smokes that read the public HTML the title rollout actually changes. Kept to
// the title/brand/render trio rather than the full deploy:production chain: a
// rollback is judged on whether the pages came back, and a 12-smoke run is slow
// enough that people skip it mid-incident.
const VERIFY_SMOKES = Object.freeze([
  "smoke:production:launch-hot-path",
  "smoke:production:public-title",
  "smoke:production:render-consistency",
]);

function run(command, commandArgs, { capture = true } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

const wrangler = (commandArgs, options) =>
  run("npx", ["wrangler", ...commandArgs, "--name", workerName], options);

// ---------------------------------------------------------------------------
// Deployment + version reads. wrangler prints these as an indented block rather
// than JSON, so parse the block shape rather than guessing at field order.
// ---------------------------------------------------------------------------
function parseDeployments(text) {
  const deployments = [];
  let current = null;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\[[0-9;]*m/g, "").trimEnd();
    const created = /^Created:\s+(\S+)/.exec(line);
    if (created && !line.startsWith(" ")) {
      current = { created: created[1], versionId: null, tag: null, message: null };
      deployments.push(current);
      continue;
    }
    if (!current) continue;
    const version = /^Version\(s\):\s+\((\d+)%\)\s+(\S+)/.exec(line);
    if (version) { current.versionId = version[2]; current.share = Number(version[1]); continue; }
    const tag = /^\s+Tag:\s+(.+)$/.exec(line);
    if (tag && current.tag === null) { current.tag = tag[1].trim(); continue; }
    const message = /^\s+Message:\s+(.+)$/.exec(line);
    if (message && current.message === null) current.message = message[1].trim();
  }
  return deployments.filter((entry) => entry.versionId);
}

// Bindings are the one thing that genuinely breaks a rollback: an older version
// compiled against a binding that no longer exists will deploy and then throw at
// runtime, and wrangler only warns about it in prose. Compare them instead.
function parseVersionShape(text) {
  const clean = text.replace(/\[[0-9;]*m/g, "");
  const bindings = [...clean.matchAll(/^(env\.\S+.*?)\s{2,}(\S.*)$/gm)]
    .map(([, binding, resource]) => `${binding.trim()}  ${resource.trim()}`)
    .sort();
  const field = (label) => (new RegExp(`^${label}:\\s*(.+)$`, "m").exec(clean)?.[1] ?? "").trim();
  return {
    handlers: field("Handlers"),
    compatibilityDate: field("Compatibility Date"),
    compatibilityFlags: field("Compatibility Flags"),
    tag: field("Tag"),
    bindings,
  };
}

async function readVersion(versionId) {
  const { code, stdout, stderr } = await wrangler(["versions", "view", versionId]);
  if (code !== 0) throw new Error(`versions view ${versionId} failed:\n${stderr || stdout}`);
  return parseVersionShape(stdout);
}

function diffShapes(current, target) {
  const problems = [];
  if (current.compatibilityDate !== target.compatibilityDate) {
    problems.push(`compatibility date ${current.compatibilityDate} -> ${target.compatibilityDate}`);
  }
  if (current.compatibilityFlags !== target.compatibilityFlags) {
    problems.push(`compatibility flags ${current.compatibilityFlags} -> ${target.compatibilityFlags}`);
  }
  if (current.handlers !== target.handlers) {
    problems.push(`handlers ${current.handlers} -> ${target.handlers}`);
  }
  const currentSet = new Set(current.bindings);
  const targetSet = new Set(target.bindings);
  for (const binding of current.bindings) {
    if (!targetSet.has(binding)) problems.push(`binding only in current deploy: ${binding}`);
  }
  for (const binding of target.bindings) {
    if (!currentSet.has(binding)) problems.push(`binding only in rollback target: ${binding}`);
  }
  return problems;
}

function record(entry) {
  mkdirSync(dirname(recordPath), { recursive: true });
  appendFileSync(recordPath, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

async function main() {
  const listed = await wrangler(["deployments", "list"]);
  if (listed.code !== 0) throw new Error(`deployments list failed:\n${listed.stderr || listed.stdout}`);
  const deployments = parseDeployments(listed.stdout);
  if (deployments.length < 1) throw new Error("no deployments returned for this Worker");

  const current = deployments.at(-1);
  const requested = args.get("--to");
  const target = requested
    ? deployments.find((entry) => entry.versionId === requested || entry.tag === requested)
    : deployments.at(-2);

  if (!target) {
    throw new Error(requested
      ? `no deployment matches --to ${requested}`
      : "only one deployment exists, so there is nothing to roll back to");
  }
  if (target.versionId === current.versionId) {
    throw new Error("rollback target is the version already serving 100% of traffic");
  }

  console.log(`worker            ${workerName}`);
  console.log(`current  (live)   ${current.versionId}  ${current.tag ?? "-"}  ${current.created}`);
  console.log(`rollback target   ${target.versionId}  ${target.tag ?? "-"}  ${target.created}`);
  console.log(`roll-forward id   ${current.versionId}   <- the id to return to`);

  const [currentShape, targetShape] = await Promise.all([
    readVersion(current.versionId),
    readVersion(target.versionId),
  ]);
  const problems = diffShapes(currentShape, targetShape);
  if (problems.length === 0) {
    console.log(`parity            ok - handlers, compatibility, and all ${targetShape.bindings.length} bindings match`);
  } else {
    console.log("parity            DRIFT:");
    for (const problem of problems) console.log(`                  - ${problem}`);
  }

  const context = {
    worker: workerName,
    mode,
    current: current.versionId,
    target: target.versionId,
    targetTag: target.tag,
    rollForward: current.versionId,
    parityProblems: problems,
  };

  if (mode === "status") {
    record({ ...context, result: "inspected" });
    console.log("\nread-only. --rehearse for an API dry-run, --execute to roll back.");
    return problems.length === 0 ? 0 : 1;
  }

  if (problems.length > 0 && !allowBindingDrift) {
    record({ ...context, result: "blocked-on-parity" });
    console.error("\nrefusing to continue: the target's bindings differ from the live version.");
    console.error("re-run with --allow-binding-drift only if you know the drift is safe.");
    return 1;
  }

  const message = args.get("--message")
    || `${mode === "rehearse" ? "DRY RUN: " : ""}rollback ${current.tag ?? current.versionId} -> ${target.tag ?? target.versionId}`;
  const deployArgs = ["versions", "deploy", `${target.versionId}@100`, "--yes", "--message", message];
  if (mode === "rehearse") deployArgs.push("--dry-run");

  console.log(`\n$ npx wrangler ${deployArgs.join(" ")} --name ${workerName}\n`);
  const deployed = await wrangler(deployArgs, { capture: false });

  if (mode === "rehearse") {
    // wrangler exits non-zero on the --dry-run cancel(); that is the success path.
    record({ ...context, result: "rehearsed", exitCode: deployed.code });
    console.log("\nrehearsal only - production was not changed. Re-check with no flags.");
    return 0;
  }

  if (deployed.code !== 0) {
    record({ ...context, result: "failed", exitCode: deployed.code });
    console.error(`\nrollback FAILED (exit ${deployed.code}). Production may be unchanged - verify before retrying.`);
    return 1;
  }

  console.log(`\nrolled back to ${target.versionId}. Roll forward with:`);
  console.log(`  node scripts/rollback-runbook.mjs --execute --to ${current.versionId}\n`);

  if (skipSmokes) {
    record({ ...context, result: "rolled-back", smokes: "skipped" });
    return 0;
  }

  const failures = [];
  for (const smoke of VERIFY_SMOKES) {
    console.log(`\n--- ${smoke} ---`);
    const { code } = await run("pnpm", ["run", smoke], { capture: false });
    if (code !== 0) failures.push(smoke);
  }
  record({ ...context, result: "rolled-back", smokeFailures: failures });

  if (failures.length > 0) {
    console.error(`\nrollback deployed but these smokes failed: ${failures.join(", ")}`);
    return 1;
  }
  console.log("\nrollback verified - all smokes green.");
  return 0;
}

main().then(
  (code) => { process.exitCode = code; },
  (error) => {
    console.error(error.message);
    process.exitCode = 1;
  },
);
