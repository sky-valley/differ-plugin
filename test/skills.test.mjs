import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readLock, readSnapshot } from '../helper/skills.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(repo, 'plugins/differ');
const run = promisify(execFile);
const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

test('the shipped skills are exactly the snapshot synced from Control', () => {
  const lock = readLock(root);
  assert.ok(lock.length > 0);
  assert.deepEqual(readSnapshot(root), lock,
    'skills/ differs from skills.lock.json: edit skills in Control, then run npm run sync-skills');
});

// The helper's procedure is written in Control's skill tree, away from this
// code, so every helper tool and command it names must exist here.
test('the skills name only tools and commands the helper has', async () => {
  const text = ['publish-content/references/helper.md', 'interactive-content/references/recording.md']
    .map(file => readFileSync(join(root, 'skills', file), 'utf8')).join('\n');
  const client = new Client({ name: 'skills-test', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(root, 'scripts/differ.cjs'), 'mcp'] }));
  const listed = (await client.listTools()).tools;
  await client.close();
  const tools = listed.map(tool => tool.name);
  for (const tool of listed) {
    for (const field of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) assert.equal(typeof tool.annotations[field], 'boolean', `${tool.name}: ${field}`);
    if (tool.name === 'publish_directory') {
      assert.equal(tool.annotations.destructiveHint, true, 'publication can replace the current public post');
      assert.equal(tool.annotations.openWorldHint, true, 'publication exposes content to the public');
    }
  }
  const named = [...text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map(match => match[1]);
  assert.ok(named.length > 0);
  for (const name of named) assert.ok(tools.includes(name), `the skills name ${name}, which the helper does not offer`);

  const usage = JSON.parse((await run(process.execPath, [join(root, 'scripts/differ.cjs'), '--help'])).stdout).commands;
  const commands = [...text.matchAll(/`[a-z_]+` \/ `([a-z][a-z-]*)[^`]*`|`([a-z][a-z-]*)(?: [A-Z]+| --[a-z]+)+`/g)].map(match => match[1] ?? match[2]);
  assert.ok(commands.length > 0);
  for (const command of commands) assert.ok(usage.some(line => line.split(' ')[0] === command), `the skills name the command ${command}, which the helper does not have`);
  for (const [flag] of text.matchAll(/--[a-z]+/g)) assert.ok(usage.some(line => line.includes(flag)), `the skills name ${flag}, which no helper command takes`);
});

// A stand-in for Control's skills endpoint: just enough MCP over JSON to serve
// SEP-2640 entries and their files.
function fakeControl({ files, advertise = true, lie = false, escape = false }) {
  if (escape) files = { ...files, 'tidy/../../escape.md': 'x' };
  const skills = () => {
    const bySkill = new Map();
    for (const [path, text] of Object.entries(files)) {
      const name = path.split('/')[0];
      const resources = bySkill.get(name) ?? [];
      const bytes = Buffer.from(text);
      resources.push({ uri: `skill://${path}`, digest: digest(lie ? Buffer.from(text + '!') : bytes), size: bytes.length });
      bySkill.set(name, resources);
    }
    return [...bySkill].map(([name, resources]) => ({ uri: `skill://${name}/SKILL.md`, frontmatter: { name, description: `${name} things` }, resources }));
  };
  const answer = message => {
    switch (message.method) {
      case 'initialize': return { protocolVersion: message.params.protocolVersion, serverInfo: { name: 'fake-control', version: '1' },
        capabilities: { resources: {}, ...(advertise ? { extensions: { 'io.modelcontextprotocol/skills': {} } } : {}) } };
      case 'skills/list': return { resultType: 'complete', skills: skills(), ttlMs: 1000, cacheScope: 'public' };
      case 'resources/read': return { contents: [{ uri: message.params.uri, mimeType: 'text/markdown', text: files[message.params.uri.slice('skill://'.length)] }] };
    }
  };
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST') { response.writeHead(405).end(); return; }
    let body = '';
    for await (const chunk of request) body += chunk;
    const message = JSON.parse(body);
    if (message.id === undefined) { response.writeHead(202).end(); return; }
    const result = answer(message);
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result
      ? { jsonrpc: '2.0', id: message.id, result }
      : { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } }));
  });
  return new Promise(ready => server.listen(0, '127.0.0.1', () => ready({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

async function sync(url, plugin, ...args) {
  try {
    const { stdout } = await run(process.execPath, [join(repo, 'scripts/sync-skills.mjs'), '--plugin', plugin, ...args], { env: { ...process.env, DIFFER_PUBLISH_URL: url } });
    return { ok: true, output: stdout };
  } catch (error) {
    return { ok: false, output: error.stdout + error.stderr };
  }
}

test('syncing replaces the snapshot with exactly what Control serves, and refuses what does not verify', async () => {
  const plugin = mkdtempSync(join(tmpdir(), 'differ-skills-sync-'));
  try {
    mkdirSync(join(plugin, 'skills/retired'), { recursive: true });
    writeFileSync(join(plugin, 'skills/retired/SKILL.md'), 'old');
    const files = { 'tidy/SKILL.md': '---\nname: tidy\n---\n', 'tidy/references/how.md': 'how' };
    const control = await fakeControl({ files });
    try {
      assert.equal((await sync(control.url, plugin)).ok, true);
      assert.equal(existsSync(join(plugin, 'skills/retired')), false);
      assert.equal(readFileSync(join(plugin, 'skills/tidy/references/how.md'), 'utf8'), 'how');
      assert.deepEqual(readLock(plugin).map(file => file.uri), ['skill://tidy/SKILL.md', 'skill://tidy/references/how.md']);
      assert.deepEqual(readSnapshot(plugin), readLock(plugin));
      assert.deepEqual(readdirSync(plugin).sort(), ['skills', 'skills.lock.json']);
      assert.equal((await sync(control.url, plugin, '--check')).ok, true);

      files['tidy/references/how.md'] = 'how, revised';
      const drift = await sync(control.url, plugin, '--check');
      assert.equal(drift.ok, false);
      assert.match(drift.output, /skill:\/\/tidy\/references\/how\.md/);
      writeFileSync(join(plugin, 'skills/tidy/references/how.md'), 'edited by hand');
      assert.match((await sync(control.url, plugin, '--check')).output, /differs from skills\.lock\.json/);
    } finally {
      control.close();
    }

    const before = readFileSync(join(plugin, 'skills/tidy/references/how.md'), 'utf8');
    for (const options of [{ lie: true }, { advertise: false }, { escape: true }, { files: {} }]) {
      const bad = await fakeControl({ files: { 'tidy/SKILL.md': 'changed' }, ...options });
      try {
        const refused = await sync(bad.url, plugin);
        assert.equal(refused.ok, false, JSON.stringify(options));
        assert.equal(readFileSync(join(plugin, 'skills/tidy/references/how.md'), 'utf8'), before, 'a refused sync leaves the snapshot alone');
        assert.deepEqual(readdirSync(plugin).sort(), ['skills', 'skills.lock.json'], 'nothing is written outside the snapshot');
      } finally {
        bad.close();
      }
    }
  } finally {
    rmSync(plugin, { recursive: true });
  }
});
