import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

// This repository is public. It must not say where Differ keeps its secrets
// or what they are called: no secret-manager paths, no production secret names.
const root = resolve(import.meta.dirname, '..');
const bundled = /(^|\/)(differ\.cjs|package-lock\.json|THIRD_PARTY_NOTICES\.txt)$|\.(png|jpe?g|gif|webp|ico|zip|woff2?)$/;
const forbidden = [
  [/op:\/\//, 'a 1Password reference'],
  [/Production Secrets/i, 'a secret vault item'],
  [/\b[A-Z][A-Z0-9]*_[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY)\b/, 'a secret name'],
];
// GitHub Actions' own token is the only secret name the repo may say.
const allowed = new Set(['GH_TOKEN', 'GITHUB_TOKEN']);

test('the public repository names no secrets and no place they are kept', () => {
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(file => file && !bundled.test(file) && file !== 'test/public.test.mjs');
  const found = [];
  for (const file of files) {
    let text;
    try { text = readFileSync(resolve(root, file), 'utf8'); } catch { continue; }
    text.split('\n').forEach((line, index) => {
      for (const [pattern, what] of forbidden) {
        const match = line.match(pattern);
        if (match && !allowed.has(match[0])) found.push(`${file}:${index + 1} has ${what}: ${match[0]}`);
      }
    });
  }
  assert.deepEqual(found, []);
});
