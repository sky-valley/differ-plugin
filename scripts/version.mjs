// npm run version -- 0.5.1 (no Git mutations or implicit publish).
import { readFileSync, writeFileSync } from 'node:fs';
const version = process.argv[2];
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '')) throw new Error('Provide a release version, for example 0.5.1');
const current = JSON.parse(readFileSync('package.json', 'utf8')).version;
const before = current.split('.').map(Number), after = version.split('.').map(Number);
const difference = after.findIndex((number, index) => number !== before[index]);
if (difference < 0 || after[difference] < before[difference]) throw new Error(`Version must increase from ${current}`);
for (const path of ['package.json', 'package-lock.json']) {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  value.version = version;
  if (value.packages?.['']) value.packages[''].version = version;
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}
