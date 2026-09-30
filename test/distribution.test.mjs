import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync, readdirSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { readSnapshot, readLock } from '../helper/skills.mjs';

const root = resolve(import.meta.dirname, '..');
const json = file => JSON.parse(readFileSync(file, 'utf8'));

test('directory package connects remotely and preserves every verified skill', () => {
  const directory = join(root, 'directory/differ');
  assert.ok(existsSync(directory), 'build must produce the directory submission folder');
  assert.deepEqual(json(join(directory, '.mcp.json')).mcpServers, {
    differ: { type: 'http', url: 'https://publish.getdiffer.com/mcp' },
  });
  assert.deepEqual(json(join(directory, 'mcp.json')).mcpServers, {
    differ: { type: 'streamable-http', url: 'https://publish.getdiffer.com/mcp' },
  });
  assert.deepEqual(readSnapshot(directory), readLock(join(root, 'plugins/differ')));
  assert.ok(!existsSync(join(directory, 'scripts/differ.cjs')), 'remote package must not imply a local helper');
  for (const name of ['package.json', 'package-lock.json', 'node_modules', '.app.json', 'hooks']) {
    assert.ok(!existsSync(join(directory, name)), `${name} must not ship in the directory package`);
  }
});

test('release ZIPs are reproducible, contain only runtime files and work after extraction', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'differ-release-'));
  const version = json(join(root, 'package.json')).version;
  const pack = () => execFileSync('python3', [join(root, 'scripts/package-release.py'), '--output', temporary], { cwd: root });
  try {
    pack();
    const checksums = readFileSync(join(temporary, 'SHA256SUMS'), 'utf8');
    pack();
    assert.equal(readFileSync(join(temporary, 'SHA256SUMS'), 'utf8'), checksums);
    for (const variant of ['local', 'directory']) {
      const archive = join(temporary, `differ-${variant}-${version}.zip`);
      const destination = join(temporary, variant);
      execFileSync('python3', ['-m', 'zipfile', '-e', archive, destination]);
      const plugin = join(destination, 'differ');
      assert.equal(json(join(plugin, '.claude-plugin/plugin.json')).version, version);
      assert.deepEqual(readSnapshot(plugin), readLock(join(root, 'plugins/differ')));
      const visit = directory => {
        for (const name of readdirSync(directory)) {
          const file = join(directory, name);
          assert.ok(!lstatSync(file).isSymbolicLink());
          assert.ok(!['node_modules', 'test', '.git', '.env', 'package-lock.json'].includes(name), file);
          if (lstatSync(file).isDirectory()) visit(file);
        }
      };
      visit(plugin);
      if (variant === 'local') {
        const output = execFileSync(process.execPath, [join(plugin, 'scripts/differ.cjs'), 'check', join(plugin, 'skills/publish-content/examples/vote/content')], { encoding: 'utf8', cwd: temporary });
        assert.equal(JSON.parse(output).participation.state, 'unverified');
      }
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
