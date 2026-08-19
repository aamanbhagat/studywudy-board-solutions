#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const args = new Set(process.argv.slice(2));
const remote = args.has("--remote");
const sqlDirectory = resolve(root, "enrichment-data/d1-sync");
const generatedRoot = resolve(root, "enrichment-data");

if (!remote) throw new Error("Refusing to mutate D1 without the explicit --remote flag");
if (sqlDirectory !== generatedRoot && !sqlDirectory.startsWith(`${generatedRoot}${sep}`)) {
  throw new Error("The generated SQL directory must remain inside enrichment-data");
}
if (!existsSync(resolve(sqlDirectory, "manifest.json"))) {
  throw new Error("Missing D1 sync manifest; run pnpm build:phase4-d1-sync first");
}

const manifest = JSON.parse(readFileSync(resolve(sqlDirectory, "manifest.json"), "utf8"));
const sqlFiles = readdirSync(sqlDirectory).filter((name) => name.endsWith(".sql")).sort();
if (sqlFiles[0] !== "000-schema.sql" || sqlFiles.at(-1) !== "999-gate-ready.sql") {
  throw new Error("Invalid D1 sync order: schema must be first and gate-ready must be last");
}

const wrangler = resolve(root, "node_modules/.bin/wrangler");
const base = ["d1", "execute", "studywudy-content", "--remote", "--config", "wrangler.production.jsonc", "--yes"];
console.log(`Applying ${sqlFiles.length} ordered SQL files for ${manifest.corpusCount.toLocaleString("en-IN")} questions.`);
for (let index = 0; index < sqlFiles.length; index += 1) {
  const file = sqlFiles[index];
  console.log(`[${index + 1}/${sqlFiles.length}] ${file}`);
  const result = spawnSync(wrangler, [...base, "--file", resolve(sqlDirectory, file)], {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`D1 import stopped at ${file} with exit code ${result.status}`);
}

const verificationSql = `SELECT s.policy_version,s.fail_open,s.gate_ready,s.corpus_count,s.gate_passed_count,
  (SELECT COUNT(*) FROM content_publish_gate) AS persisted_count,
  (SELECT COUNT(*) FROM content_publish_gate WHERE gate_passed=1) AS persisted_passed,
  (SELECT COUNT(*) FROM content_publish_gate g LEFT JOIN question_enrichments e
    ON e.book_id=g.book_id AND e.chapter_slug=g.chapter_slug AND e.question_id=g.question_id
    WHERE g.enrichment_required=1 AND g.gate_passed=1
      AND (e.quality_pass IS NULL OR e.quality_pass<>1 OR e.factual_pass<>1 OR e.decision<>'standalone')) AS invalid_enrichments
  FROM content_publish_gate_state s WHERE s.gate_name='question-publish';`;
const verify = spawnSync(wrangler, [...base, "--command", verificationSql, "--json"], {
  cwd: root,
  encoding: "utf8",
});
if (verify.status !== 0) {
  process.stderr.write(verify.stderr || verify.stdout || "D1 verification failed\n");
  process.exit(verify.status || 1);
}
process.stdout.write(verify.stdout);

