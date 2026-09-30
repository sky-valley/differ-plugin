import assert from 'node:assert/strict';
import { cpSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(repo, 'plugins/differ');
const names = [...new Set(JSON.parse(readFileSync(join(root, 'skills.lock.json'), 'utf8')).files.map(file => file.uri.split('/')[2]))].sort();
const json = path => JSON.parse(readFileSync(path, 'utf8'));

test('bundled checker accepts asset directories but rejects linked files', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'differ-assets-test-'));
  const check = () => spawnSync(process.execPath, [join(root, 'scripts/differ.cjs'), 'check', temporary], { encoding: 'utf8' });
  try {
    mkdirSync(join(temporary, 'assets'));
    writeFileSync(join(temporary, 'index.html'), '<!doctype html><link rel="stylesheet" href="./assets/style.css">');
    const asset = join(temporary, 'assets/style.css');
    writeFileSync(asset, 'body { color: black; }');
    const valid = check();
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(JSON.parse(valid.stdout).files, 2);
    const linked = join(temporary, 'assets/linked.css');
    for (const link of [linkSync, symlinkSync]) {
      link(asset, linked);
      const rejected = check();
      assert.notEqual(rejected.status, 0);
      assert.equal(JSON.parse(rejected.stdout).code, 'unsafe_input');
      rmSync(linked);
    }
  } finally {
    rmSync(temporary, { recursive: true });
  }
});

test('portable and compatibility manifests identify the same release', () => {
  const manifest = json(join(root, 'plugin.json'));
  assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.equal(manifest.name, 'differ');
  for (const client of ['.codex-plugin', '.claude-plugin']) {
    const overlay = json(join(root, client, 'plugin.json'));
    for (const key of ['name', 'version', 'description', 'author']) {
      assert.deepEqual(overlay[key], manifest[key], `${client}: ${key}`);
    }
    if (client === '.codex-plugin') assert.equal(overlay.mcpServers, './.mcp.json');
    assert.equal(overlay.apps, undefined);
    assert.equal(overlay.hooks, undefined);
  }
  assert.equal(json(join(root, 'mcp.json')).mcpServers.differ.type, 'stdio');
  assert.equal(json(join(root, '.mcp.json')).mcpServers.differ.command, 'node');
  assert.ok(existsSync(join(root, 'scripts/differ.cjs')));
});

test('both repo catalogs resolve this plugin', () => {
  const codex = json(join(repo, '.agents/plugins/marketplace.json'));
  const claude = json(join(repo, '.claude-plugin/marketplace.json'));
  assert.equal(codex.name, claude.name);
  for (const [catalog, source] of [[codex, p => p.source.path], [claude, p => p.source]]) {
    const entry = catalog.plugins.find(p => p.name === 'differ');
    assert.ok(entry);
    assert.equal(realpathSync(resolve(repo, source(entry))), realpathSync(root));
  }
});

test('package is self-contained and survives relocation without the repo', () => {
  function checkContained(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const path = join(directory, entry.name);
      const target = relative(realpathSync(root), realpathSync(path));
      assert.ok(target !== '..' && !target.startsWith(`..${sep}`), path);
      if (entry.isDirectory()) checkContained(path);
    }
  }
  checkContained(root);
  const temporary = mkdtempSync(join(tmpdir(), 'differ-plugin-test-'));
  try {
    const destination = join(temporary, 'differ');
    cpSync(root, destination, { recursive: true, filter: path => !path.split(sep).includes('node_modules') });
    assert.deepEqual(readdirSync(join(destination, 'skills')).sort(), names);
    for (const name of names) {
      const file = join('skills', name, 'SKILL.md');
      assert.ok(lstatSync(join(destination, file)).isFile());
      assert.equal(readFileSync(join(destination, file), 'utf8'), readFileSync(join(root, file), 'utf8'));
    }
  } finally {
    rmSync(temporary, { recursive: true });
  }
});
