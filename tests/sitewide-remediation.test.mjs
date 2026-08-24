import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scriptUrl = new URL("../scripts/sitewide-remediation.mjs", import.meta.url);

test("sitewide remediation uses Luna, Terra and Sol with a protected-content invariant", async () => {
  const source = await readFile(scriptUrl, "utf8");
  assert.match(source, /draft: "gpt-5\.6-luna"/u);
  assert.match(source, /validate: "gpt-5\.6-terra"/u);
  assert.match(source, /adjudicate: "gpt-5\.6-sol"/u);
  assert.match(source, /Protected content is immutable/u);
  assert.match(source, /never rewrite the question prompt, choices, selected answer, existing answer, numerical values, units/u);
  assert.match(source, /source_review_required = 0/u);
});

test("sitewide remediation loads secrets only from environment variables", async () => {
  const source = await readFile(scriptUrl, "utf8");
  assert.match(source, /process\.env\.AZURE_FOUNDRY_RESPONSES_ENDPOINT/u);
  assert.match(source, /process\.env\.AZURE_FOUNDRY_API_KEY/u);
  assert.doesNotMatch(source, /Authorization:\s*["'`]Bearer/iu);
  assert.doesNotMatch(source, /\.dev\.vars/u);
});

test("status does not call an AI-approved row fixed before re-audit", async () => {
  const source = await readFile(scriptUrl, "utf8");
  assert.match(source, /Verified fixed after re-audit/u);
  assert.match(source, /AI-approved, pending apply/u);
  assert.match(source, /Applied, pending re-audit/u);
  assert.match(source, /status = 'applied_pending_audit'/u);
  assert.match(source, /const measuredProcessingSeconds = Math\.max\(0, Number\(rateWindow\.effective_duration_ms \|\| event\.effective_duration_ms/u);
  assert.match(source, /const throughputSeconds = measuredProcessingSeconds \|\| elapsed/u);
  assert.match(source, /const concurrency = Math\.max\(1, Math\.min\(32/u);
  assert.match(source, /Promise\.all\(Array\.from\(\{ length: concurrency \}/u);
  assert.match(source, /workerId,[\s\S]*?concurrency,[\s\S]*?batchSize: rows\.length/u);
  assert.match(source, /const rateWindow = database\.prepare/u);
  assert.match(source, /const rateWindowRows = Number\(rateWindow\.processed_rows/u);
});
