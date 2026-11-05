import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bundle = fileURLToPath(new URL('../plugins/differ/scripts/differ.cjs', import.meta.url));
export const task = { id: `agt_${'a'.repeat(64)}`, version: 1 };
export async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'differ-tasks-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const state = { reply: () => ({ status: 200, body: { tasks: [task], next: 0 } }) };
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const call = { method: req.method, path: req.url, headers: req.headers, body }; calls.push(call);
    const response = state.reply(call);
    res.writeHead(response.status, { 'content-type': 'application/json', ...response.headers });
    res.end(response.raw ?? JSON.stringify(response.body));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const config = join(root, 'publisher.json');
  const save = value => writeFileSync(config, JSON.stringify(value), { mode: 0o600 });
  const connected = { mode: 'connected', url, accessToken: 'dfa_test_access', refreshToken: 'dfr_test_refresh', expiresAt: Date.now() + 300_000, accountHandle: 'maker' };
  save(connected);
  const run = (args = ['tasks'], env = {}) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bundle, ...args], { env: { ...process.env, DIFFER_CONFIG: config, DIFFER_PUBLISH_URL: url, ...env } });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', status => {
      try { resolve({ status, data: JSON.parse(stdout), stdout, stderr }); } catch (e) { reject(e); }
    });
  });
  return { root, calls, state, run, save, connected, config, url };
}

