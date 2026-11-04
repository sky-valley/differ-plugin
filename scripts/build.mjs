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
  developerName: 'Sky Valley', category: 'Productivity',
  capabilities: ['Make bits', 'Publish bits', 'Diff bits'],
  websiteURL: 'https://app.getdiffer.com',
  supportURL: 'https://github.com/sky-valley/differ-plugin/issues',
  privacyPolicyURL: 'https://www.getdiffer.com/privacy',
  termsOfServiceURL: 'https://www.getdiffer.com/terms',
  defaultPrompt: ['Make an interactive bit with Differ.'],
  brandColor: '#1A1A1A', composerIcon: './assets/icon.svg', logo: './assets/icon.svg',
};
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
  json(`${plugin}/plugin.json`, { $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', ...identity, extensions: { 'com.openai': { interface: interfaceFields } } });
  // The older compatibility validator predates the support, privacy and terms
  // links; current hosts read the complete inline extension above.
  const { supportURL, privacyPolicyURL, termsOfServiceURL, ...legacyInterface } = interfaceFields;
  // The remote package gives Codex its own copy of the connector: Claude's,
  // in .mcp.json, uses the URL that asks for sign-in on connect.
  const codexServers = plugin === remote ? './.codex-mcp.json' : './.mcp.json';
  json(`${plugin}/.codex-plugin/plugin.json`, { ...identity, skills: './skills/', mcpServers: codexServers, interface: legacyInterface });
  json(`${plugin}/.claude-plugin/plugin.json`, { ...identity, displayName: 'Differ' });
}
json(`${local}/mcp.json`, { $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { differ: { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/scripts/differ.cjs', 'mcp'] } } });
json(`${local}/.mcp.json`, { mcpServers: { differ: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/differ.cjs', 'mcp'] } } });
json(`${remote}/mcp.json`, { $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { differ: { type: 'streamable-http', url: 'https://publish.getdiffer.com/mcp' } } });
// Claude signs in only when a server refuses it while connecting, so its
// connector uses /mcp/account, which refuses a call without a token. ChatGPT
// and Codex read the challenge inside a tool result and keep guest tools.
json(`${remote}/.mcp.json`, { mcpServers: { differ: { type: 'http', url: 'https://publish.getdiffer.com/mcp/account' } } });
json(`${remote}/.codex-mcp.json`, { mcpServers: { differ: { type: 'http', url: 'https://publish.getdiffer.com/mcp' } } });
console.log(`Built Differ ${version}: local helper and remote directory package.`);
