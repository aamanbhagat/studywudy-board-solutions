import { readFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(process.argv[2] || 'report-after.json', 'utf8'));
for (const b of r.buckets.slice(0, 4)) {
  console.log(`\n######## ${b.message.slice(0, 80)}  (${b.count}) ########`);
  for (const s of b.samples.slice(0, 4)) {
    console.log('  q:', s.question);
    console.log('  tex:', JSON.stringify(s.tex).slice(0, 240));
  }
}
