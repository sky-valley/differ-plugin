import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeControl } from './fake-control.mjs';

const bundle = fileURLToPath(new URL('../plugins/differ/scripts/differ.cjs', import.meta.url));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const b64 = text => Buffer.from(text).toString('base64');
const lines = requests => requests.map(r => `${r.method} ${r.path}`);

// Each test drives the bundled CLI, as agents and the MCP bridge do, against a
// fresh fake Control with a private configuration file.
async function harness(t) {
  const control = await fakeControl();
  const root = mkdtempSync(join(tmpdir(), 'differ-publishing-'));
  t.after(async () => { await control.close(); rmSync(root, { recursive: true }); });
  const env = { ...process.env, DIFFER_PUBLISH_URL: control.origin, DIFFER_CONFIG: join(root, 'publisher.json') };
  const cli = (...args) => new Promise((resolve, reject) => execFile(process.execPath, [bundle, ...args], { env, encoding: 'utf8', timeout: 30_000 }, (error, stdout, stderr) => {
    try { resolve(JSON.parse(stdout)); } catch { reject(new Error(`differ ${args.join(' ')} failed: ${stderr || stdout || error}`)); }
  }));
  const post = (name, files) => {
    const directory = join(root, name); mkdirSync(directory);
    for (const [path, text] of Object.entries(files)) writeFileSync(join(directory, path), text);
    return directory;
  };
  const config = () => json(env.DIFFER_CONFIG);
  const state = directory => json(join(directory, '.differ', 'state.json'));
  // Time passes locally: the next connection-status may poll immediately.
  const pollNow = () => writeFileSync(env.DIFFER_CONFIG, JSON.stringify({ ...config(), pendingConnection: { ...config().pendingConnection, nextPollAt: 0 } }));
  async function connectAs(username) {
    await cli('connect');
    control.approve(username);
    const connected = await cli('connection-status');
    assert.equal(connected.state, 'connected', JSON.stringify(connected));
  }
  return { control, cli, post, config, state, env, pollNow, connectAs };
}

test('guest publishing reserves once, sends the upload pass as a bearer and returns the reservation claim link', async t => {
  const h = await harness(t);
  const html = '<!doctype html><title>Guest piece</title><link rel="stylesheet" href="style.css"><h1>One</h1>';
  const css = 'h1{color:red}';
  const directory = h.post('guest', { 'index.html': html, 'style.css': css });

  const first = await h.cli('publish', directory);
  const id = first.postId;
  assert.match(id, uuid);
  const [reserve, upload, ...others] = h.control.calls();
  assert.deepEqual(others, [], 'no capabilities read to build a claim link');
  assert.deepEqual([reserve.method, reserve.path, reserve.authorization, reserve.contentType], ['POST', `/v1/publishing/posts/${id}/reservation`, undefined, 'application/json']);
  assert.deepEqual(Object.keys(reserve.body), ['ownerProof']);
  assert.match(reserve.body.ownerProof, /^[a-f0-9]{64}$/);
  const pass = h.control.post(id).uploadToken;
  assert.equal(reserve.response.uploadToken, pass);
  assert.deepEqual([upload.method, upload.path, upload.authorization, upload.contentType], ['POST', `/v1/publishing/posts/${id}/versions`, `Bearer ${pass}`, 'application/json']);
  assert.deepEqual(Object.keys(upload.body).sort(), ['expectedRevisionId', 'files', 'requestId', 'title']);
  assert.equal(upload.body.expectedRevisionId, null);
  assert.equal(upload.body.title, 'Guest piece');
  assert.match(upload.body.requestId, uuid);
  assert.deepEqual(upload.body.files, [{ path: 'index.html', content: b64(html) }, { path: 'style.css', content: b64(css) }]);

  assert.equal(first.state, 'succeeded');
  assert.equal(first.revisionId, h.control.post(id).versions[0].id);
  assert.equal(first.claimUrl, h.control.claimUrl(id, reserve.body.ownerProof));
  assert.equal(first.claimLinkPrivate, true);
  assert.equal(first.expiresAt, h.control.post(id).expiresAt);
  assert.equal(first.contentVerified, true);
  assert.deepEqual(h.state(directory).creation, { id, mode: 'guest', ownerProof: reserve.body.ownerProof, uploadToken: pass, claimUrl: first.claimUrl });
  assert.deepEqual(json(join(directory, 'differ-post.json')), { version: 1, publisher: h.control.origin, postId: id, revisionId: first.revisionId, title: 'Guest piece' });

  writeFileSync(join(directory, 'index.html'), html.replace('One', 'Two'));
  h.control.reset();
  const second = await h.cli('publish', directory);
  const [revision, ...extra] = h.control.calls();
  assert.deepEqual(extra, [], 'a revision reuses the reservation');
  assert.deepEqual([revision.method, revision.path, revision.authorization], ['POST', `/v1/publishing/posts/${id}/versions`, `Bearer ${pass}`]);
  assert.equal(revision.body.expectedRevisionId, first.revisionId);
  assert.notEqual(revision.body.requestId, upload.body.requestId);
  assert.equal(second.claimUrl, first.claimUrl);

  h.control.reset();
  const status = await h.cli('status', directory);
  assert.deepEqual(h.control.calls().map(({ method, path, authorization, contentType, body }) => ({ method, path, authorization, contentType, body })),
    [{ method: 'GET', path: `/v1/publishing/posts/${id}/operations/${revision.body.requestId}`, authorization: `Bearer ${pass}`, contentType: undefined, body: undefined }]);
  assert.equal(status.state, 'succeeded');
  assert.equal(status.revisionId, second.revisionId);
  assert.equal(status.claimUrl, first.claimUrl);

  h.control.reset();
  assert.equal((await h.cli('publish', directory)).revisionId, second.revisionId);
  assert.deepEqual(lines(h.control.calls()), [`GET /v1/publishing/posts/${id}/operations/${revision.body.requestId}`], 'unchanged content is not uploaded again');

  h.control.reset();
  const remote = await h.cli('get-post', id);
  assert.deepEqual(h.control.calls().map(r => [r.method, r.path, r.authorization]), [['GET', `/v1/publishing/posts/${id}`, undefined]]);
  assert.equal(remote.currentRevisionId, second.revisionId);
  assert.deepEqual(remote.revisions.map(r => r.id), [first.revisionId, second.revisionId]);
  assert.equal(remote.username, undefined);
});

test('an unknown outcome keeps the exact saved request; a 4xx rejection drops it', async t => {
  const h = await harness(t);
  const directory = h.post('retry', { 'index.html': '<title>Retry</title>v1' });
  const edit = text => writeFileSync(join(directory, 'index.html'), `<title>Retry</title>${text}`);
  const first = await h.cli('publish', directory);
  const id = first.postId;

  edit('v2');
  h.control.failNextVersion(503, 'content_unavailable');
  assert.equal((await h.cli('publish', directory)).code, 'content_unavailable');
  const pending = h.state(directory).pending;
  h.control.reset();
  const retried = await h.cli('publish', directory);
  const [check, resend] = h.control.calls();
  assert.deepEqual(lines([check, resend]), [`GET /v1/publishing/posts/${id}/operations/${pending.requestId}`, `POST /v1/publishing/posts/${id}/versions`]);
  assert.deepEqual(check.response, { state: 'unknown', requestId: pending.requestId });
  assert.equal(resend.body.requestId, pending.requestId);
  assert.equal(resend.body.expectedRevisionId, first.revisionId);
  assert.equal(retried.state, 'succeeded');
  assert.equal(h.state(directory).pending, undefined);

  edit('v3');
  h.control.failNextVersion(503, 'content_unavailable', { commit: true });
  assert.equal((await h.cli('publish', directory)).code, 'content_unavailable');
  h.control.reset();
  const recovered = await h.cli('publish', directory);
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.revisionId, h.control.post(id).versions.at(-1).id);
  assert.deepEqual(h.control.calls().map(r => r.method), ['GET'], 'a committed request is recovered, not uploaded again');

  h.control.advance(id);
  edit('v4');
  const conflict = await h.cli('publish', directory);
  assert.equal(conflict.code, 'revision_conflict');
  assert.equal(conflict.message, 'The post changed after this draft.');
  assert.match(conflict.recovery, /bind DIR --post ID/);
  const after = h.state(directory);
  assert.equal(after.pending, undefined);
  assert.equal(after.rejected.code, 'revision_conflict');
});

test('connecting uses the device grant, saves the account username and uploads drafts with the access token', async t => {
  const h = await harness(t);
  const started = await h.cli('connect');
  const [device] = h.control.calls();
  assert.deepEqual([device.method, device.path, device.authorization], ['POST', '/oauth/device', undefined]);
  assert.deepEqual(device.body, { client_id: 'differ-plugin', resource: `${h.control.origin}/mcp`, scope: 'profile posts:write' });
  assert.equal(started.state, 'awaiting_approval');
  assert.equal(started.url, device.response.verification_uri_complete);
  assert.equal(started.code, device.response.user_code);
  const grant = { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: 'differ-plugin', device_code: device.response.device_code, resource: `${h.control.origin}/mcp` };

  h.control.reset();
  assert.equal((await h.cli('connection-status')).state, 'awaiting_approval');
  const [poll] = h.control.calls();
  assert.deepEqual([poll.method, poll.path, poll.body, poll.response.error], ['POST', '/oauth/token', grant, 'authorization_pending']);

  h.control.approve('maker');
  h.pollNow();
  h.control.reset();
  const connected = await h.cli('connection-status');
  const [exchange, account] = h.control.calls();
  assert.deepEqual(exchange.body, grant);
  const tokens = exchange.response;
  assert.deepEqual([account.method, account.path, account.authorization], ['GET', '/v1/publishing/account', `Bearer ${tokens.access_token}`]);
  assert.equal(connected.state, 'connected');
  assert.equal(connected.username, 'maker');
  assert.equal(statSync(h.env.DIFFER_CONFIG).mode & 0o777, 0o600);
  const saved = h.config();
  assert.deepEqual({ ...saved, expiresAt: typeof saved.expiresAt },
    { url: h.control.origin, mode: 'connected', accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: 'number', accountUsername: 'maker' });

  h.control.reset();
  assert.deepEqual(await h.cli('connection-status'), { state: 'connected', username: 'maker' });
  assert.deepEqual(h.control.calls(), []);

  const directory = h.post('mine', { 'index.html': '<title>Mine</title>made by me' });
  const receipt = await h.cli('publish', directory);
  assert.match(receipt.postId, uuid);
  const [whoami, upload, ...rest] = h.control.calls();
  assert.deepEqual(rest, [], 'no guest reservation');
  assert.deepEqual([whoami.path, whoami.authorization], ['/v1/publishing/account', `Bearer ${tokens.access_token}`]);
  assert.deepEqual([upload.method, upload.path, upload.authorization], ['POST', `/v1/publishing/posts/${receipt.postId}/versions`, `Bearer ${tokens.access_token}`]);
  assert.deepEqual(Object.keys(upload.body).sort(), ['expectedRevisionId', 'files', 'requestId', 'title']);
  assert.equal(upload.body.expectedRevisionId, null);
  assert.equal(receipt.claimed, true);
  assert.equal(receipt.url, `https://player.test/@maker/post/${receipt.postId}/draft`);
  assert.equal(receipt.claimUrl, undefined);
  assert.deepEqual(h.state(directory).creation, { id: receipt.postId, mode: 'connected', accountUsername: 'maker' });
});

test('a claimed guest post refuses its upload pass and is revised as its connected owner; another owner stops before upload', async t => {
  const h = await harness(t);
  const mine = h.post('mine', { 'index.html': '<title>Mine</title>v1' });
  const theirs = h.post('theirs', { 'index.html': '<title>Theirs</title>v1' });
  const guest = await h.cli('publish', mine);
  const other = await h.cli('publish', theirs);
  h.control.claim(guest.postId, 'maker');
  h.control.claim(other.postId, 'someone-else');

  writeFileSync(join(mine, 'index.html'), '<title>Mine</title>v2');
  h.control.reset();
  const refused = await h.cli('publish', mine);
  assert.deepEqual(h.control.calls().map(r => [r.path, r.authorization, r.status]), [[`/v1/publishing/posts/${guest.postId}/versions`, `Bearer ${h.control.post(guest.postId).uploadToken}`, 403]]);
  assert.equal(refused.code, 'owner_conflict');
  assert.match(refused.recovery, /Connect the account that owns this post/);
  assert.equal(h.state(mine).pending, undefined);

  await h.connectAs('maker');
  const token = h.config().accessToken;
  h.control.reset();
  const revised = await h.cli('publish', mine);
  assert.deepEqual(h.control.calls().map(r => [r.method, r.path, r.authorization]), [
    ['GET', '/v1/publishing/account', `Bearer ${token}`],
    ['GET', `/v1/publishing/posts/${guest.postId}`, undefined],
    ['POST', `/v1/publishing/posts/${guest.postId}/versions`, `Bearer ${token}`],
  ]);
  assert.equal(revised.claimed, true);
  assert.equal(revised.url, `https://player.test/@maker/post/${guest.postId}/draft`);
  assert.equal(revised.claimUrl, undefined);
  assert.deepEqual([h.state(mine).creation.mode, h.state(mine).creation.accountUsername], ['connected', 'maker']);

  writeFileSync(join(theirs, 'index.html'), '<title>Theirs</title>v2');
  h.control.reset();
  const blocked = await h.cli('publish', theirs);
  assert.equal(blocked.code, 'owner_conflict');
  assert.deepEqual(lines(h.control.calls()), ['GET /v1/publishing/account', `GET /v1/publishing/posts/${other.postId}`]);
  assert.equal(h.state(theirs).pending, undefined);
});

test('refresh keeps the username, unclaimed guest drafts keep their pass, a refused token never falls back to guest, and disconnect revokes', async t => {
  const h = await harness(t);
  const draft = h.post('draft', { 'index.html': '<title>Draft</title>v1' });
  await h.cli('publish', draft);
  await h.connectAs('maker');
  const before = h.config();
  writeFileSync(h.env.DIFFER_CONFIG, JSON.stringify({ ...before, expiresAt: 0 }));
  h.control.reset();
  const doctor = await h.cli('doctor');
  const [refresh, capabilities, account] = h.control.calls();
  assert.deepEqual([refresh.method, refresh.path, refresh.authorization], ['POST', '/oauth/token', undefined]);
  assert.deepEqual(refresh.body, { grant_type: 'refresh_token', client_id: 'differ-plugin', refresh_token: before.refreshToken, resource: `${h.control.origin}/mcp` });
  assert.deepEqual([capabilities.path, capabilities.authorization], ['/v1/publishing/capabilities', undefined]);
  assert.deepEqual([account.path, account.authorization], ['/v1/publishing/account', `Bearer ${refresh.response.access_token}`]);
  assert.deepEqual([doctor.mode, doctor.username, doctor.url, doctor.limits.files], ['connected', 'maker', h.control.origin, 256]);
  const after = h.config();
  assert.deepEqual([after.accessToken, after.refreshToken, after.accountUsername], [refresh.response.access_token, refresh.response.refresh_token, 'maker']);

  // Connecting claims nothing: an unclaimed guest draft is still revised with its upload pass.
  writeFileSync(join(draft, 'index.html'), '<title>Draft</title>v2');
  h.control.reset();
  const postId = h.state(draft).creation.id;
  const guestRevision = await h.cli('publish', draft);
  assert.deepEqual(h.control.calls().map(r => [r.method, r.path, r.authorization]), [
    ['GET', '/v1/publishing/account', `Bearer ${after.accessToken}`],
    ['GET', `/v1/publishing/posts/${postId}`, undefined],
    ['POST', `/v1/publishing/posts/${postId}/versions`, `Bearer ${h.control.post(postId).uploadToken}`],
  ]);
  assert.equal(guestRevision.claimUrl, h.state(draft).creation.claimUrl);

  // Control revokes the connection, for example from the player's connections page.
  h.control.revokeAll();
  writeFileSync(join(draft, 'index.html'), '<title>Draft</title>v3');
  h.control.reset();
  const refused = await h.cli('publish', draft);
  assert.equal(refused.code, 'reconnect_required');
  assert.match(refused.recovery, /Run connect/);
  assert.deepEqual(lines(h.control.calls()), ['GET /v1/publishing/account'], 'the guest draft is not published with its upload pass');
  const fresh = h.post('fresh', { 'index.html': '<title>Fresh</title>new' });
  h.control.reset();
  assert.equal((await h.cli('publish', fresh)).code, 'reconnect_required');
  assert.deepEqual(lines(h.control.calls()), ['GET /v1/publishing/account'], 'no guest reservation');

  h.control.reset();
  const disconnected = await h.cli('disconnect');
  const [revoke] = h.control.calls();
  assert.deepEqual([revoke.method, revoke.path, revoke.authorization], ['POST', '/oauth/revoke', undefined]);
  assert.deepEqual(revoke.body, { client_id: 'differ-plugin', token: after.refreshToken });
  assert.equal(disconnected.state, 'guest');
  assert.deepEqual(h.config(), { mode: 'guest' });
});

test('OAuth errors surface as code and message', async t => {
  const h = await harness(t);
  await h.cli('connect');
  h.control.deny();
  const declined = await h.cli('connection-status');
  assert.deepEqual([declined.code, declined.message], ['access_denied', 'Connection declined.']);
});

test('a connected draft is reported as unpublished and revised using its pending revision', async t => {
  const h = await harness(t);
  await h.connectAs('maker');
  const directory = h.post('draft-receipt', { 'index.html': '<title>Draft</title>First' });
  h.control.reset();
  const first = await h.cli('publish', directory);
  assert.equal(first.draft, true);
  assert.equal(first.contentVerified, false);
  assert.equal(first.recovery, undefined, 'a successful draft is not a failed public-content verification');
  assert.match(first.notice, /not published yet/);
  assert.equal(first.runtimeUrl, undefined);
  assert.equal(h.control.post(first.postId).versions.length, 0);
  assert.equal(h.control.requests.some(request => request.path.startsWith('/runtime/')), false);
  assert.equal(h.state(directory).pending, undefined);

  writeFileSync(join(directory, 'index.html'), '<title>Draft</title>Second');
  h.control.reset();
  const second = await h.cli('publish', directory);
  const upload = h.control.calls().find(request => request.method === 'POST');
  assert.equal(upload.body.expectedRevisionId, first.revisionId);
  assert.equal(upload.body.publish, undefined, 'the helper does not silently skip preview');
  assert.equal(second.postId, first.postId);
  assert.notEqual(second.revisionId, first.revisionId);
  assert.equal((await h.cli('status', directory)).draft, true);
});
