// Covers the tab/CR escape corruption and the bare-command wrapping.
import { repairString } from './lib/repair.mjs';

const T = '\t';
const R = '\r';
const E = '\u001b';
const N = '\u000e';

const cases = [
  N + T + 'extrm{H}^{+}' + N + ' ions.',
  'Baking soda (\n' + T + 'ext{sodium hydrogen carbonate}\n) is a mild base.',
  'By the cosine rule in $' + T + 'riangle ABC$,',
  'Cathode: Cu^{2+}+2e^- ' + R + 'ightarrow Cu',
  // Genuine newline before variable u - must NOT become \nu.
  'Energy gives\n$$\nu^2=\\frac{Mv^2}{M+m}\n$$\nHence.',
  // Tab used as plain whitespace before an English word.
  'Use a tab' + T + 'and then text.',
  // Markdown hard line break, not math.
  'A markdown break\\\\\nnext line.',
  'Normal prose with no latex at all.',
  'Already good: $\\triangle ABC$ and $\\text{x}$.',
  E + '[1mbold text' + E + '[0m stays bold.',
];

for (const c of cases) {
  const r = repairString(c);
  console.log(r === c ? 'SAME ' : 'FIXED', JSON.stringify(c));
  if (r !== c) console.log('   ->', JSON.stringify(r));
}
