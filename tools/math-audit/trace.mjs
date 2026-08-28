// Step-by-step trace of the repair pipeline over one string, so a defect can be
// pinned to the pass that creates it rather than the pass that reports it.
//
//   node trace.mjs '<literal text,  for ESC>'
//
// Reads the argument with JSON escapes honoured, then prints every exported
// stage that changes the value.

import * as R from './lib/repair.mjs';

const raw = process.argv[2] ?? '';
const s = JSON.parse(`"${raw.replace(/"/g, '\\"')}"`);

const STAGES = [
  'stripControl',
  'dropReplacementChar',
  'normalizeEscapedDollars',
  'dropNestedDollars',
  'splitCodeFenceOutOfMath',
  'repairAnsi',
  'stripShortcodeMarkers',
  'repairChem',
  'repairMath',
  'dropOrphanSpacing',
  'wrapBareExpressions',
  'repairAsciiScripts',
  'absorbScriptTail',
  'dropEmptySpans',
  'wrapBareMathRuns',
  'wrapBareCommands',
];

let t = s;
console.log(`in    ${JSON.stringify(t)}`);
for (const name of STAGES) {
  const fn = R[name];
  if (typeof fn !== 'function') {
    console.log(`skip  ${name} (not exported)`);
    continue;
  }
  let next;
  try {
    next = fn(t);
  } catch (err) {
    console.log(`ERR   ${name}: ${err.message}`);
    continue;
  }
  if (typeof next === 'string' && next !== t) {
    console.log(`${name.padEnd(24)}${JSON.stringify(next)}`);
    t = next;
  }
}
console.log(`\nreal  ${JSON.stringify(R.repairString(s))}`);
