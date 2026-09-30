// Prevent changed installed bytes from reusing the same cached plugin version.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const base = process.env.RELEASE_BASE;
if (!base || /^0+$/.test(base)) process.exit(0); // First repository commit.
if (!/^[a-f0-9]{40}$/.test(base)) throw new Error('Expected a base commit SHA');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const changed = git('diff', '--name-only', base, 'HEAD', '--', 'plugins/differ', 'directory/differ');
if (changed) {
  const before = JSON.parse(git('show', `${base}:package.json`)).version.split('.').map(Number);
  const after = JSON.parse(readFileSync('package.json', 'utf8')).version.split('.').map(Number);
  const index = after.findIndex((n, i) => n !== before[i]);
  if (index < 0 || after[index] < before[index]) throw new Error('Installed package bytes changed: bump the plugin version before releasing.');
}
