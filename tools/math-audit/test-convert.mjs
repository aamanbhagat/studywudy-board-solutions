import { convertStringToBlocks } from './lib/array-table.mjs';

const cases = [
  '$$\\begin{array}{c|ccc}x&0&1&2\\\\ \\hline y&0&1&2\\end{array}\\quad\\Rightarrow\\quad (0,0),(1,1),(2,2)$$',
  '$$\\begin{array}{c|ccccc}x_{i}&15&25&35&45&55\\\\ \\hline f_{i} x_{i}&2\\times15=30&4\\times25=100&7\\times35=245&6\\times45=270&1\\times55=55\\end{array}$$',
  '$$\\begin{array}{c|c|c|c}\n\\text{आय-वर्ग} & f_{i} & x_{i} & f_{i} x_{i}\\\\ \\hline\n1\\text{-}200 & 14 & 100.5 & 1407\\\\\n201\\text{-}400 & 15 & 300.5 & 4507.5\n\\end{array}$$',
  '$$\n\\begin{array}{|c|c|}\n\\hline\n\\text{आयु} & \\text{बारंबारता}\\\\\n\\hline\n20 & 60\\\\\n30 & 102\\\\\n\\hline\n\\end{array}\n$$',
  // The switching table from the reported screenshot.
  'Switching table:\n$$\\begin{array}{c|c||c}\nS_{1} & S_{2} & S_{1} \\lor S_{2}\'\\\\\\hline\n0 & 0 & 1\\\\\n0 & 1 & 1\\\\\n1 & 0 & 1\\\\\n1 & 1 & 1\\\\\n\\end{array}$$',
  // Must NOT convert: Lewis structure / layout math.
  '$$\\begin{array}{c}\\!\\!\\ddot{\\text{H}}\\!\\!\\end{array}$$',
  '$$\\begin{array}{cc}\\ce{H}\\\\|\\\\\\ce{CH3 - C - CH3}\\end{array}$$',
];

for (const [i, c] of cases.entries()) {
  const r = convertStringToBlocks(c);
  console.log(`\n=== case ${i + 1} ===`);
  console.log('input :', JSON.stringify(c).slice(0, 130));
  if (!r) {
    console.log('result: UNCHANGED (skipped)');
    continue;
  }
  for (const b of r) {
    if (b.kind === 'table') {
      console.log('  TABLE headers:', JSON.stringify(b.headers));
      b.rows.forEach((row) => console.log('        row    :', JSON.stringify(row)));
    } else {
      console.log(`  ${b.kind.toUpperCase()}:`, JSON.stringify(b.text).slice(0, 120));
    }
  }
}
