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
// What the directory portals enforced on the 0.7.x submissions (docs/submission.md).
const remote = 'directory/differ';
const openaiRoot = json(`${remote}/plugin.json`).extensions['com.openai'];
const codex = json(`${remote}/.codex-plugin/plugin.json`);
const claude = json(`${remote}/.claude-plugin/plugin.json`);
// OpenAI reads MCP sign-in only from mcp.json: guests need none, accounts use OAuth via DCR.
const auth = json(`${remote}/mcp.json`).mcpServers.differ.extensions?.['com.openai']?.auth;
assert.equal(auth?.type, 'mixed', 'directory mcp.json must declare extensions.com.openai.auth.type "mixed"');
assert.equal(auth?.client?.mode, 'dcr', 'directory mcp.json must register OAuth clients with DCR');
// Review cases: exactly 5 + 3, with prompts. The portal imports prompts only from
// .codex-plugin/plugin.json, so both manifests carry the same review block.
for (const [file, openai] of [['plugin.json', openaiRoot], ['.codex-plugin/plugin.json', codex.extensions?.['com.openai']]]) {
  const cases = openai?.review?.test_cases;
  assert.equal(cases?.positive?.length, 5, `${file}: five positive review cases`);
  assert.equal(cases?.negative?.length, 3, `${file}: three negative review cases`);
  for (const c of [...cases.positive, ...cases.negative]) assert.ok(c.description?.trim() && c.prompt?.trim(), `${file}: every case needs a description and prompt`);
  for (const c of cases.positive) assert.ok(c.tools_triggered?.trim() && c.expected_behavior?.trim(), `${file}: positive cases need tools_triggered and expected_behavior`);
  assert.ok(openai.publication?.release_notes?.trim(), `${file}: release notes`);
}
assert.deepEqual(codex.extensions['com.openai'].review, openaiRoot.review, '.codex-plugin review must match plugin.json');
// build.mjs asserts the category, URLs and case fields at their source; these
// check the generated package that is actually uploaded.
const listing = openaiRoot.interface;
const prompts = [].concat(listing.defaultPrompt ?? []);
assert.ok(prompts.length <= 3 && prompts.every(p => p.trim() && p.length <= 128 && !p.includes('@')), 'at most three starter prompts of 128 characters, no @mentions');
// Anthropic's validator asks for the privacy policy in the Claude manifest.
assert.equal(claude.privacyPolicyUrl, listing.privacyPolicyURL, 'Claude manifest needs privacyPolicyUrl');
console.log(`Differ ${version}: package structure, release identity and skill snapshots verified. Portal requirements remain in docs/submission.md.`);
