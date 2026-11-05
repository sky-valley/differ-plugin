// Build both distributions from one version, helper source, and skills snapshot.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readLock, readSnapshot } from '../helper/skills.mjs';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);
const local = 'plugins/differ';
const remote = 'directory/differ';
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
assert.deepEqual(readSnapshot(local), readLock(local), 'Sync the skills from Control before building.');
const result = await build({ entryPoints: ['helper/main.mjs'], bundle: true, platform: 'node', target: 'node24', format: 'cjs', outfile: `${local}/scripts/differ.cjs`, metafile: true });

// Distribute the licenses of the dependencies whose code enters the bundle.
const packages = new Set();
for (const input of Object.keys(result.metafile.inputs).filter(p => p.startsWith('node_modules/'))) {
  let directory = dirname(resolve(input));
  while (!existsSync(join(directory, 'package.json'))) directory = dirname(directory);
  // Package subdirectories may have a package.json containing only module type.
  while (!JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).name) {
    directory = dirname(directory);
    while (!existsSync(join(directory, 'package.json'))) directory = dirname(directory);
  }
  packages.add(directory);
}
const notices = [...packages].sort().map(directory => {
  const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const license = readdirSync(directory).find(name => /^licen[sc]e(?:\.|$)/i.test(name));
  if (!license) throw new Error(`Missing license for bundled dependency ${pkg.name}`);
  return `${pkg.name}@${pkg.version} (${pkg.license})\n\n${readFileSync(join(directory, license), 'utf8')}`;
});
writeFileSync(`${local}/THIRD_PARTY_NOTICES.txt`, notices.join('\n\n---\n\n') + '\n');

const identity = {
  name: 'differ', version,
  description: 'Make, publish and diff interactive bits on Differ.',
  author: { name: 'Sky Valley', url: 'https://skyvalley.ac' },
  homepage: 'https://github.com/sky-valley/differ-plugin',
  repository: 'https://github.com/sky-valley/differ-plugin',
  license: 'MIT', keywords: ['differ', 'interactive', 'bits', 'publishing', 'diff'],
};
const interfaceFields = {
  displayName: 'Differ', shortDescription: 'Make, publish and diff bits',
  longDescription: "Differ helps you make bits: small interactive pieces people open, join in on and diff. Describe an idea and your assistant builds it, previews it and publishes it to Differ. You can revise it later or diff someone else's bit into your own version. Publish as a guest with no account, or connect your Differ account to publish as you.",
  developerName: 'Sky Valley', category: 'Creativity',
  capabilities: ['Make bits', 'Publish bits', 'Diff bits'],
  websiteURL: 'https://app.getdiffer.com',
  supportURL: 'https://github.com/sky-valley/differ-plugin/issues',
  privacyPolicyURL: 'https://www.getdiffer.com/privacy',
  termsOfServiceURL: 'https://www.getdiffer.com/terms',
  defaultPrompt: ['Make an interactive bit with Differ.'],
  brandColor: '#1A1A1A', composerIcon: './assets/icon.svg', logo: './assets/icon.svg',
};
const cases = JSON.parse(readFileSync('submission/review-cases.json', 'utf8'));
assert.equal(cases.positive.length, 5, 'OpenAI review needs exactly five positive cases.');
assert.equal(cases.negative.length, 3, 'OpenAI review needs exactly three negative cases.');
const review = {
  test_cases: { positive: cases.positive, negative: cases.negative },
  commerce: false,
  commerce_description: 'Differ does not sell anything or take payments.',
};
const publication = { release_notes: `Differ ${version}: make, publish and diff bits; publish as a guest or connect a Differ account.` };
const json = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, JSON.stringify(value, null, 2) + '\n'); };

rmSync(remote, { recursive: true, force: true });
mkdirSync(remote, { recursive: true });
cpSync(`${local}/skills`, `${remote}/skills`, { recursive: true });
cpSync(`${local}/skills.lock.json`, `${remote}/skills.lock.json`);
cpSync('docs/directory-readme.md', `${remote}/README.md`);
for (const plugin of [local, remote]) {
  mkdirSync(`${plugin}/assets`, { recursive: true });
  cpSync('assets/icon.svg', `${plugin}/assets/icon.svg`);
  cpSync('LICENSE', `${plugin}/LICENSE`);
  // The directory package carries the OpenAI review cases, which the dashboard
  // imports from the ZIP and shows read-only.
  const openai = plugin === remote ? { interface: interfaceFields, review, publication } : { interface: interfaceFields };
  json(`${plugin}/plugin.json`, { $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', ...identity, extensions: { 'com.openai': openai } });
  // The older compatibility validator predates the support, privacy and terms
  // links; current hosts read the complete inline extension above.
  const { supportURL, privacyPolicyURL, termsOfServiceURL, ...legacyInterface } = interfaceFields;
  // OpenAI's portal imports the review prompts only from this file (2026-11-05),
  // although its docs say the root plugin.json takes precedence.
  const codexOpenai = plugin === remote ? { extensions: { 'com.openai': { review, publication } } } : {};
  json(`${plugin}/.codex-plugin/plugin.json`, { ...identity, skills: './skills/', mcpServers: './.mcp.json', interface: legacyInterface, ...codexOpenai });
  json(`${plugin}/.claude-plugin/plugin.json`, { ...identity, displayName: 'Differ', privacyPolicyUrl: interfaceFields.privacyPolicyURL });
}
json(`${local}/mcp.json`, { $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { differ: { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/scripts/differ.cjs', 'mcp'] } } });
json(`${local}/.mcp.json`, { mcpServers: { differ: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/differ.cjs', 'mcp'] } } });
// Guest tools need no sign-in and account tools use OAuth, so the server is
// "mixed"; Control registers clients dynamically (/oauth/register).
const auth = { type: 'mixed', client: { mode: 'dcr' }, baseScopes: ['profile', 'bits:write'] };
json(`${remote}/mcp.json`, { $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { differ: { type: 'streamable-http', url: 'https://publish.getdiffer.com/mcp', extensions: { 'com.openai': { auth } } } } });
json(`${remote}/.mcp.json`, { mcpServers: { differ: { type: 'http', url: 'https://publish.getdiffer.com/mcp' } } });
console.log(`Built Differ ${version}: local helper and remote directory package.`);
