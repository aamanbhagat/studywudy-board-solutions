import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync('fix-report.json', 'utf8'));
const esc = (s) => JSON.stringify(s).replace(/\\u001b/g, 'ESC');

console.log('######## TABLE CONVERSIONS ########');
for (const s of r.samples.tables.slice(0, 3)) {
  console.log('\n--- ' + s.question);
  console.log('BEFORE:', esc(s.before).slice(0, 300));
  console.log('AFTER :');
  for (const b of s.after) {
    if (b.kind === 'table') {
      console.log('   TABLE hdr', JSON.stringify(b.headers));
      b.rows.slice(0, 4).forEach((x) => console.log('         row', JSON.stringify(x)));
      if (b.rows.length > 4) console.log(`         ... +${b.rows.length - 4} more rows`);
    } else console.log(`   ${b.kind}:`, JSON.stringify(b.text).slice(0, 130));
  }
}

console.log('\n\n######## STRING REPAIRS ########');
for (const s of r.samples.repairs.slice(0, 16)) {
  console.log('\n- ' + s.question);
  console.log('  BEFORE:', esc(s.before).slice(0, 200));
  console.log('  AFTER :', esc(s.after).slice(0, 200));
}
