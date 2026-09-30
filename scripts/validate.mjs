// Repository preflight, not a substitute for either directory's review.
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readLock, readSnapshot } from '../helper/skills.mjs';

const root = resolve(import.meta.dirname, '..');
const json = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const version = json('package.json').version;
for (const directory of ['plugins/differ', 'directory/differ']) {
  const manifest = json(`${directory}/plugin.json`);
  assert.equal(manifest.name, 'differ');
  assert.equal(manifest.version, version);
  assert.equal(manifest.license, 'MIT');
  for (const host of ['.claude-plugin', '.codex-plugin']) {
    const overlay = json(`${directory}/${host}/plugin.json`);
    for (const key of ['name', 'version', 'description', 'author', 'license', 'repository']) assert.deepEqual(overlay[key], manifest[key]);
  }
  const ui = manifest.extensions['com.openai'].interface;
  assert.ok(ui.shortDescription.length <= 30 && ui.displayName.length <= 30);
  for (const field of ['logo', 'composerIcon']) assert.ok(existsSync(join(root, directory, ui[field])));
  assert.ok(readFileSync(join(root, directory, 'README.md'), 'utf8').replace(/```[^]*?```/g, '').split(/\s+/).length >= 40);
  assert.deepEqual(readSnapshot(join(root, directory)), readLock(join(root, 'plugins/differ')));
  const visit = path => {
    for (const name of readdirSync(path)) {
      const file = join(path, name), stat = lstatSync(file);
      assert.ok(!stat.isSymbolicLink(), `Links cannot ship: ${file}`);
      assert.ok(!['package.json', 'package-lock.json', 'node_modules', '.DS_Store'].includes(name), `Development or system file: ${file}`);
      if (stat.isDirectory()) visit(file);
      else assert.ok(stat.size < 5 * 1024 * 1024, `Directory file size limit: ${file}`);
    }
  };
  visit(join(root, directory));
}
console.log(`Differ ${version}: package structure, release identity and skill snapshots verified. Portal requirements remain in docs/submission.md.`);
