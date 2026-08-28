// Regression: one big LaTeX expression must be wrapped once, not shredded into
// separately-wrapped inner fragments.
import { wrapBareCommands, repairString } from './lib/repair.mjs';

const cases = [
  String.raw`\boxed{\text{Hawks get more energy}1\ \text{J}}\newline\text{Justification}`,
  String.raw`\ce{2H2(g) + O2(g) -> 2H2O(l)} is an example of a reaction.`,
  String.raw`\text{X is zinc, }\ce{Zn}\text{, and Y is hydrogen gas, }\ce{H2}.`,
  String.raw`Car batteries use dilute sulphuric acid (\ce{H2SO4}) as the electrolyte.`,
  String.raw`\frac{a}{b} + \sqrt{c^{2}+d_{1}} equals something.`,
  // Must stay untouched:
  String.raw`Already fine: $\ce{H2SO4}$ and $\frac{1}{2}$.`,
  // wrapBareCommands leaves this alone, which is what the line above tests.
  // repairString does turn the `\n` of `\name` into a newline — that pass reads
  // a lone backslash-n as the escape the generator failed to unescape. It is
  // harmless here because fix.mjs never calls repairString bare: it scores the
  // candidate against the original and keeps it only if the count of KaTeX
  // failures did not rise. No path in the catalogue survives that comparison,
  // and none was rewritten in the applied run.
  'Windows path C:\\Users\\name is not math.',
];

for (const c of cases) {
  const w = wrapBareCommands(c);
  const full = repairString(c);
  console.log(w === c ? 'SAME ' : 'WRAP ', JSON.stringify(c));
  if (w !== c) console.log('   ->', JSON.stringify(w));
  if (full !== w) console.log('   full pipeline ->', JSON.stringify(full));
}
