// Disposable local rehearsal using the real pagelike executable. This identity
// authority is a fixture, not Player login. No production credentials are used.
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

const listen = async server => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
};
export async function readBundle(directory) {
  const files = {};
  let bytes = 0;
  async function walk(at, prefix = '') {
    for (const entry of await readdir(at, { withFileTypes: true })) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(entry.name) || entry.isSymbolicLink()) throw Error(`Unsafe bundle entry: ${prefix}${entry.name}`);
      const name = prefix + entry.name;
      if (entry.isDirectory()) await walk(join(at, entry.name), name + '/');
      else if (entry.isFile()) {
        const body = await readFile(join(at, entry.name));
        bytes += body.length;
        if (bytes > 20 * 1024 * 1024 || Object.keys(files).length >= 256) throw Error('Bundle exceeds 20 MiB or 256 files.');
        files[name] = body.toString('base64');
      } else throw Error(`Not a file: ${name}`);
    }
  }
  await walk(resolve(directory));
  if (!files['index.html'] || !files['rules.html']) throw Error('Select a content directory with index.html and rules.html.');
  return files;
}

export async function runtime() {
  if (!process.env.PAGELIKE_BINARY) throw Error('Set PAGELIKE_BINARY to a built pagelike executable. No runtime checks were run.');
  const scratch = await mkdtemp(join(tmpdir(), 'differ-rehearsal-'));
  const admin = randomBytes(24).toString('hex'), edge = randomBytes(24).toString('hex'), identity = randomBytes(24).toString('hex');
  const tickets = new Map(), sessions = new Map(), streams = new Set(), browsers = new Set();
  let child, issuer;
  const close = async () => {
    for (const server of browsers) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    for (const controller of streams) controller.abort();
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const done = once(child, 'exit');
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      try { await done; } finally { clearTimeout(timer); }
    }
    if (issuer) { issuer.closeAllConnections(); await new Promise(done => issuer.close(done)); }
    await rm(scratch, { recursive: true, force: true });
  };
  try {
    issuer = http.createServer(async (req, res) => {
      try {
        if (req.headers.authorization !== `Bearer ${identity}`) return res.writeHead(401).end();
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4096) return res.writeHead(413).end(); }
        const input = JSON.parse(body);
        if (req.url === '/redeem') {
          const ticket = tickets.get(input.ticket); tickets.delete(input.ticket);
          if (!ticket || ticket.site !== input.site) return res.writeHead(401).end();
          const session = randomUUID(); sessions.set(session, ticket.site);
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ subject: ticket.subject, moderator: ticket.moderator, session, expiresAt: Date.now() + 600_000 }));
        }
        res.writeHead(req.url === '/validate' && sessions.get(input.session) === input.site ? 204 : 401).end();
      } catch { res.writeHead(400).end(); }
    });
    const issuerPort = await listen(issuer);
    const reservation = http.createServer(); const port = await listen(reservation);
    await new Promise(done => reservation.close(done));
    const origin = `http://127.0.0.1:${port}`;
    child = spawn(resolve(process.env.PAGELIKE_BINARY), ['host', '--data', scratch, '--listen', `127.0.0.1:${port}`], {
      env: { PATH: process.env.PATH, PAGELIKE_DOMAIN: 'rehearsal.test', PAGELIKE_ADMIN_TOKEN: admin,
        PAGELIKE_EDGE_TOKEN: edge, PAGELIKE_IDENTITY_TOKEN: identity,
        PAGELIKE_IDENTITY_URL: `http://127.0.0.1:${issuerPort}`, PAGELIKE_FRAME_ORIGINS: 'https://player.test' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let failed, log = ''; child.on('error', error => { failed = error; });
    child.stderr.on('data', data => { log = (log + data).slice(-2048); });
    for (let attempt = 0; ; attempt++) {
      if (failed) throw failed;
      if (attempt === 150 || child.exitCode !== null) throw Error(`Rehearsal runtime did not start: ${log}`);
      try { if ((await fetch(origin, { signal: AbortSignal.timeout(200) })).status === 401) break; } catch {}
      await new Promise(done => setTimeout(done, 50));
    }
    async function site(files) {
      const id = randomUUID();
      async function install(next, generation = 1, extra = {}) {
        const response = await fetch(`${origin}/v1/sites/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ generation, version: `v${generation}`, files: next, participation: true, temporary: false, expiresAt: Date.now() + 600_000, ...extra }), signal: AbortSignal.timeout(15_000) });
        const detail = await response.text();
        if (response.status !== 204) throw Error(`Runtime rejected bundle (${response.status}): ${detail.slice(0, 1000)}`);
      }
      await install(files);
      async function request(path, options = {}, cookie) {
        const headers = new Headers(options.headers);
        headers.set('Authorization', `Bearer ${edge}`);
        headers.set('X-Pagelike-Host', `${id}.rehearsal.test`);
        headers.set('Origin', `https://${id}.rehearsal.test`);
        if (cookie) headers.set('Cookie', cookie);
        if (!path.startsWith('/') || path.startsWith('//')) throw Error('Use a same-site absolute path.');
        return fetch(origin + path, { ...options, headers, redirect: 'error', signal: options.signal ?? AbortSignal.timeout(10_000) });
      }
      async function participate(subject, moderator = false) {
        const ticket = randomUUID(); tickets.set(ticket, { site: id, subject, moderator });
        const response = await request('/-/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket }) });
        const body = await response.json();
        if (response.status !== 200 || body.participant !== subject) throw Error('Fixture identity exchange failed.');
        return response.headers.get('set-cookie').split(';')[0];
      }
      async function subscribe(path) {
        const controller = new AbortController(); streams.add(controller);
        const response = await request(path, { headers: { Accept: 'text/event-stream' }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (response.status !== 200 || !response.headers.get('content-type')?.startsWith('text/event-stream')) {
          const detail = await response.text(); controller.abort(); streams.delete(controller);
          throw Error(`Anonymous live subscription refused (${response.status}): ${detail.slice(0, 120)}`);
        }
        const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
        return { close() { controller.abort(); streams.delete(controller); }, async mutation() {
          for (;;) {
            const boundary = buffer.indexOf('\n\n');
            if (boundary >= 0) {
              const event = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
              if (/^event: ?mutation$/m.test(event)) return event;
              continue;
            }
            const { done, value } = await reader.read();
            if (done) throw Error('SSE ended without a mutation.');
            buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n');
          }
        } };
      }
      // A loopback transport for browser checks. The caller selects a fixture
      // session; it does not simulate Player's Google sign-in or consent.
      async function browserURL(cookie) {
        const server = http.createServer(async (req, res) => {
          const controller = new AbortController();
          res.on('close', () => controller.abort());
          try {
            const chunks = []; for await (const chunk of req) chunks.push(chunk);
            const headers = { ...req.headers }; delete headers.host; delete headers.connection; delete headers['content-length'];
            const response = await request(req.url, { method: req.method, headers,
              ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks) } : {}), signal: controller.signal }, cookie);
            const output = Object.fromEntries(response.headers); delete output['content-length']; delete output['content-encoding']; delete output['transfer-encoding'];
            res.writeHead(response.status, output);
            if (response.body) Readable.fromWeb(response.body).on('error', () => res.destroy()).pipe(res);
            else res.end();
          } catch { if (!res.headersSent) res.writeHead(502); res.end(); }
        });
        browsers.add(server);
        return `http://127.0.0.1:${await listen(server)}/v/v1/`;
      }
      return { request, participate, subscribe, install, browserURL };
    }
    return { site, close };
  } catch (error) { await close(); throw error; }
}
