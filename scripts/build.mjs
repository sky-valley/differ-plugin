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
  description: 'Create, preview, publish and revise interactive social posts.',
  author: { name: 'Sky Valley', url: 'https://skyvalley.ac' },
  homepage: 'https://github.com/sky-valley/differ-plugin',
  repository: 'https://github.com/sky-valley/differ-plugin',
  license: 'MIT', keywords: ['differ', 'interactive', 'publishing', 'participation'],
};
const interfaceFields = {
  displayName: 'Differ', shortDescription: 'Make interactive social posts',
  longDescription: 'Create interactive posts and publish them to Differ. Start as a guest, claim a post later, or connect your account for future publications. Shared participation requires a claimed post and runtime verification. Local file and browser capabilities depend on the host.',
  developerName: 'Sky Valley', category: 'Productivity',
  capabilities: ['Create posts', 'Publish posts'],
  websiteURL: 'https://player.getdiffer.com',
  supportURL: 'https://github.com/sky-valley/differ-plugin/issues',
  defaultPrompt: ['Create an interactive social post with Differ.'],
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
  // The older compatibility validator predates supportURL; current hosts read
  // the complete inline extension above, including the required support link.
  const { supportURL, ...legacyInterface } = interfaceFields;
  json(`${plugin}/.codex-plugin/plugin.json`, { ...identity, skills: './skills/', mcpServers: './.mcp.json', interface: legacyInterface });
  json(`${plugin}/.claude-plugin/plugin.json`, { ...identity, displayName: 'Differ' });
}
json(`${local}/mcp.json`, { $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { differ: { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/scripts/differ.cjs', 'mcp'] } } });
json(`${local}/.mcp.json`, { mcpServers: { differ: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/scripts/differ.cjs', 'mcp'] } } });
json(`${remote}/mcp.json`, { $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { differ: { type: 'streamable-http', url: 'https://publish.getdiffer.com/mcp' } } });
json(`${remote}/.mcp.json`, { mcpServers: { differ: { type: 'http', url: 'https://publish.getdiffer.com/mcp' } } });
console.log(`Built Differ ${version}: local helper and remote directory package.`);
