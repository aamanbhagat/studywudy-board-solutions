// Feed the repository's own converter the exact shapes the screenshots show
// and print the MathML it returns. This is the baseline the layout fixes are
// measured against.
//
//   node render-probe.mjs

import { formulaRepresentations } from '../../studywudy-board-solutions/semantic-math.mjs';

const CASES = [
  ['img1 augmented array', String.raw`\left[\begin{array}{cc|c}3&2&35000\\2&1&19000\end{array}\right]`],
  ['img3 bmatrix', String.raw`\begin{bmatrix}1&0&1\\0&2&3\\1&2&1\end{bmatrix}`],
  ['img3 tfrac in matrix', String.raw`X=\begin{bmatrix}\tfrac{2}{3}&\tfrac{2}{3}\\\tfrac{11}{6}&\tfrac{4}{3}\end{bmatrix}`],
  ['dfrac standalone', String.raw`A^{-1}=\dfrac{1}{-6}`],
  ['tfrac standalone', String.raw`A^{-1}=\tfrac{1}{-6}`],
  ['img4 aligned', String.raw`\begin{aligned}L&=(S_{1}+S_{2}'+S_{3}')(S_{1}+S_2S_3)\\&=S_1+S_2S_3\end{aligned}`],
  ['img4 array with hline', String.raw`\begin{array}{|c|c|c|}\hline S_1&S_2&L\\\hline 1&1&1\\\hline\end{array}`],
  ['img5 pmatrix', String.raw`\left(\begin{array}{ccc|c}1&1&1&3\\0&-11&-1&-13\end{array}\right)`],
];

for (const [label, source] of CASES) {
  const rep = formulaRepresentations(source);
  console.log(`\n${'='.repeat(78)}\n${label}\n  src: ${source}`);
  console.log(`  mathml: ${(rep.mathml || '').replace(/></g, '>\n          <')}`);
  if (rep.errors?.length) console.log(`  errors: ${JSON.stringify(rep.errors)}`);
}
