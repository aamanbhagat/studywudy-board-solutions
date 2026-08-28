// Spot-checks repairString against the real corruption shapes found in the DB.
import { repairString } from './lib/repair.mjs';

const E = '\x1b';
const cases = [
  `Substance X is lead nitrate solution, ${E}[1m$\\ce{Pb(NO3)2(aq)}$${E}[0m.`,
  `Quicklime (${E}[0m$\\ce{CaO}$${E}[0m) and slaked lime (${E}[0m$\\ce{Ca(OH)2}$${E}[0m) can be added.`,
  `higher concentration of ${E}[H+${E}[0m ions and is more acidic.`,
  `Plaster of Paris is calcium sulphate hemihydrate, ${E}[chem]{CaSO4.1/2H2O}.`,
  'XSO4 is copper(II) sulphate, \x00ce{CuSO4}; it is blue in colour.',
  '**Strong bases:** \x0bce{Ca(OH)2}, \x0bce{NaOH}, \x0bce{KOH}',
  'Magnesium oxide (\x1ce{MgO}) is formed by ionic bonding.',
  'One isomer of heptane, \x0ce{C7H16}, is 2-methylhexane.',
  'Hydrochloric acid (\x11$\\ce{HCl}$) and sulphuric acid (\x11$\\ce{H2SO4}$) are strong.',
  'Chlorine is treated with dry slaked lime, \x14\x14\x14 \b$\\ce{Ca(OH)2}$, to obtain bleaching powder.',
  'they do not ionise in water to produce \x0e\\textrm{H}^{+}\x0e ions.',
  'acids, which increase the \x01\\ce{H+} ion concentration.',
  '400, 400, 400, \x02ldots',
  // Must be left completely alone:
  'The project cost US$ 1085 crore in total.',
  'A hall is $12\\text{ m}$ long and the area is $\\frac{1}{2}bh$.',
  'Write $\\ce{H2SO4}$ correctly.',
  // Glyph + parse-error repairs inside math only:
  'Value is $\\frac{1}{2} + ½$ here.',
  'Cube root: $∛27 = 3$.',
  'Distance is $Door to window = ___ steps$ long.',
  'Half of it is ½ in plain prose.',
];

for (const c of cases) {
  const r = repairString(c);
  const show = (s) => JSON.stringify(s).replace(/\\u001b/g, 'ESC');
  console.log(r === c ? 'SAME ' : 'FIXED', show(c));
  if (r !== c) console.log('   ->', show(r));
}
