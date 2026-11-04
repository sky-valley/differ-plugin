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
  const bit = (name, files) => {
    const directory = join(root, name); mkdirSync(directory);
    for (const [path, text] of Object.entries(files)) writeFileSync(join(directory, path), text);
    return directory;
  };
  const config = () => json(env.DIFFER_CONFIG);
  const state = directory => json(join(directory, '.differ', 'state.json'));
  // Time passes locally: the next connection-status may poll immediately.
  const pollNow = () => writeFileSync(env.DIFFER_CONFIG, JSON.stringify({ ...config(), pendingConnection: { ...config().pendingConnection, nextPollAt: 0 } }));
  async function connectAs(handle) {
    await cli('connect');
    control.approve(handle);
    const connected = await cli('connection-status');
    assert.equal(connected.state, 'connected', JSON.stringify(connected));
  }
  return { control, cli, bit, config, state, env, pollNow, connectAs };
}

test('guest publishing reserves once, sends the upload pass as a bearer and the caption, and returns the reservation claim link', async t => {
  const h = await harness(t);
  const html = '<!doctype html><title>Guest piece</title><link rel="stylesheet" href="style.css"><h1>One</h1>';
  const css = 'h1{color:red}';
  const directory = h.bit('guest', { 'index.html': html, 'style.css': css });

  const first = await h.cli('publish', directory, '--caption', '  Tap the\nred one  ');
  const id = first.bitId;
  assert.match(id, uuid);
  const [reserve, upload, ...others] = h.control.calls();
  assert.deepEqual(others, [], 'no capabilities read to build a claim link');
  assert.deepEqual([reserve.method, reserve.path, reserve.authorization, reserve.contentType], ['POST', `/v1/publishing/bits/${id}/reservation`, undefined, 'application/json']);
  assert.deepEqual(Object.keys(reserve.body), ['ownerProof']);
  assert.match(reserve.body.ownerProof, /^[a-f0-9]{64}$/);
  const pass = h.control.bit(id).uploadToken;
  assert.equal(reserve.response.uploadToken, pass);
  assert.deepEqual([upload.method, upload.path, upload.authorization, upload.contentType], ['POST', `/v1/publishing/bits/${id}/versions`, `Bearer ${pass}`, 'application/json']);
  assert.deepEqual(Object.keys(upload.body).sort(), ['caption', 'expectedVersionId', 'files', 'requestId']);
  assert.equal(upload.body.expectedVersionId, null);
  assert.equal(upload.body.caption, 'Tap the\nred one', 'the caption is sent trimmed, never taken from the page title');
  assert.match(upload.body.requestId, uuid);
  assert.deepEqual(upload.body.files, [{ path: 'index.html', content: b64(html) }, { path: 'style.css', content: b64(css) }]);

  assert.equal(first.state, 'succeeded');
  assert.equal(first.versionId, h.control.bit(id).versions[0].id);
  assert.equal(first.url, `https://player.test/bit/${id}`);
  assert.equal(first.claimUrl, h.control.claimUrl(id, reserve.body.ownerProof));
  assert.equal(first.claimLinkPrivate, true);
  assert.equal(first.expiresAt, h.control.bit(id).expiresAt);
  assert.equal(first.contentVerified, true);
  assert.deepEqual(h.state(directory).bit, { id, mode: 'guest', ownerProof: reserve.body.ownerProof, uploadToken: pass, claimUrl: first.claimUrl });
  assert.deepEqual(json(join(directory, 'differ-bit.json')), { version: 1, publisher: h.control.origin, bitId: id, versionId: first.versionId, caption: 'Tap the\nred one' });

  writeFileSync(join(directory, 'index.html'), html.replace('One', 'Two'));
  h.control.reset();
  const second = await h.cli('publish', directory);
  const [update, ...extra] = h.control.calls();
  assert.deepEqual(extra, [], 'a new version reuses the reservation');
  assert.deepEqual([update.method, update.path, update.authorization], ['POST', `/v1/publishing/bits/${id}/versions`, `Bearer ${pass}`]);
  assert.equal(update.body.expectedVersionId, first.versionId);
  assert.equal(update.body.caption, 'Tap the\nred one', 'the saved caption carries to the next version of the same bit');
  assert.notEqual(update.body.requestId, upload.body.requestId);
  assert.equal(second.claimUrl, first.claimUrl);

  h.control.reset();
  const status = await h.cli('status', directory);
  assert.deepEqual(h.control.calls().map(({ method, path, authorization, contentType, body }) => ({ method, path, authorization, contentType, body })),
    [{ method: 'GET', path: `/v1/publishing/bits/${id}/operations/${update.body.requestId}`, authorization: `Bearer ${pass}`, contentType: undefined, body: undefined }]);
  assert.equal(status.state, 'succeeded');
  assert.equal(status.versionId, second.versionId);
  assert.equal(status.claimUrl, first.claimUrl);

  h.control.reset();
  assert.equal((await h.cli('publish', directory)).versionId, second.versionId);
  assert.deepEqual(lines(h.control.calls()), [`GET /v1/publishing/bits/${id}/operations/${update.body.requestId}`], 'unchanged content is not uploaded again');

  h.control.reset();
  const remote = await h.cli('get-bit', id);
  assert.deepEqual(h.control.calls().map(r => [r.method, r.path, r.authorization]), [['GET', `/v1/publishing/bits/${id}`, undefined]]);
  assert.equal(remote.currentVersionId, second.versionId);
  assert.deepEqual(remote.versions.map(v => v.id), [first.versionId, second.versionId]);
  assert.equal(remote.handle, undefined);
});

test('an unknown outcome keeps the exact saved request; a 4xx rejection drops it', async t => {
  const h = await harness(t);
  const directory = h.bit('retry', { 'index.html': '<title>Retry</title>v1' });
  const edit = text => writeFileSync(join(directory, 'index.html'), `<title>Retry</title>${text}`);
  const first = await h.cli('publish', directory);
  const id = first.bitId;

  edit('v2');
  h.control.failNextVersion(503, 'content_unavailable');
  assert.equal((await h.cli('publish', directory)).code, 'content_unavailable');
  const pending = h.state(directory).pending;
  h.control.reset();
  const retried = await h.cli('publish', directory);
  const [check, resend] = h.control.calls();
  assert.deepEqual(lines([check, resend]), [`GET /v1/publishing/bits/${id}/operations/${pending.requestId}`, `POST /v1/publishing/bits/${id}/versions`]);
  assert.deepEqual(check.response, { state: 'unknown', requestId: pending.requestId });
  assert.equal(resend.body.requestId, pending.requestId);
  assert.equal(resend.body.expectedVersionId, first.versionId);
  assert.equal(retried.state, 'succeeded');
  assert.equal(h.state(directory).pending, undefined);

  edit('v3');
  h.control.failNextVersion(503, 'content_unavailable', { commit: true });
  assert.equal((await h.cli('publish', directory)).code, 'content_unavailable');
  h.control.reset();
  const recovered = await h.cli('publish', directory);
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.versionId, h.control.bit(id).versions.at(-1).id);
  assert.deepEqual(h.control.calls().map(r => r.method), ['GET'], 'a committed request is recovered, not uploaded again');

  h.control.advance(id);
  edit('v4');
  const conflict = await h.cli('publish', directory);
  assert.equal(conflict.code, 'version_conflict');
  assert.equal(conflict.message, 'The bit changed after this draft.');
  assert.match(conflict.recovery, /bind DIR --bit ID/);
  const after = h.state(directory);
  assert.equal(after.pending, undefined);
  assert.equal(after.rejected.code, 'version_conflict');
});

test('connecting uses the device grant, saves the account handle and uploads drafts with the access token', async t => {
  const h = await harness(t);
  const started = await h.cli('connect');
  const [device] = h.control.calls();
  assert.deepEqual([device.method, device.path, device.authorization], ['POST', '/oauth/device', undefined]);
  assert.deepEqual(device.body, { client_id: 'differ-plugin', resource: `${h.control.origin}/mcp`, scope: 'profile bits:write' });
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
  assert.equal(connected.handle, 'maker');
  assert.equal(statSync(h.env.DIFFER_CONFIG).mode & 0o777, 0o600);
  const saved = h.config();
  assert.deepEqual({ ...saved, expiresAt: typeof saved.expiresAt },
    { url: h.control.origin, mode: 'connected', accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: 'number', accountHandle: 'maker' });

  h.control.reset();
  assert.deepEqual(await h.cli('connection-status'), { state: 'connected', handle: 'maker' });
  assert.deepEqual(h.control.calls(), []);

  const directory = h.bit('mine', { 'index.html': '<title>Mine</title>made by me' });
  const receipt = await h.cli('publish', directory);
  assert.match(receipt.bitId, uuid);
  const [whoami, upload, ...rest] = h.control.calls();
  assert.deepEqual(rest, [], 'no guest reservation');
  assert.deepEqual([whoami.path, whoami.authorization], ['/v1/publishing/account', `Bearer ${tokens.access_token}`]);
  assert.deepEqual([upload.method, upload.path, upload.authorization], ['POST', `/v1/publishing/bits/${receipt.bitId}/versions`, `Bearer ${tokens.access_token}`]);
  assert.deepEqual(Object.keys(upload.body).sort(), ['expectedVersionId', 'files', 'requestId'], 'without --caption the draft carries no caption, and the page title is never one');
  assert.equal(upload.body.expectedVersionId, null);
  assert.equal(receipt.claimed, true);
  assert.equal(receipt.url, `https://player.test/@maker/bit/${receipt.bitId}/draft`);
  assert.equal(receipt.claimUrl, undefined);
  assert.deepEqual(h.state(directory).bit, { id: receipt.bitId, mode: 'connected', accountHandle: 'maker' });
  assert.deepEqual(json(join(directory, 'differ-bit.json')), { version: 1, publisher: h.control.origin, bitId: receipt.bitId, versionId: receipt.versionId, caption: '' });
});

test('a claimed guest bit refuses its upload pass and is updated as its connected owner; another owner stops before upload', async t => {
  const h = await harness(t);
  const mine = h.bit('mine', { 'index.html': '<title>Mine</title>v1' });
  const theirs = h.bit('theirs', { 'index.html': '<title>Theirs</title>v1' });
  const guest = await h.cli('publish', mine);
  const other = await h.cli('publish', theirs);
  h.control.claim(guest.bitId, 'maker', 'Mine, claimed');
  h.control.claim(other.bitId, 'someone-else', 'Theirs, claimed');

  writeFileSync(join(mine, 'index.html'), '<title>Mine</title>v2');
  h.control.reset();
  const refused = await h.cli('publish', mine);
  assert.deepEqual(h.control.calls().map(r => [r.path, r.authorization, r.status]), [[`/v1/publishing/bits/${guest.bitId}/versions`, `Bearer ${h.control.bit(guest.bitId).uploadToken}`, 403]]);
  assert.equal(refused.code, 'owner_conflict');
  assert.match(refused.recovery, /Connect the account that owns this bit/);
  assert.equal(h.state(mine).pending, undefined);

  await h.connectAs('maker');
  const token = h.config().accessToken;
  h.control.reset();
  const updated = await h.cli('publish', mine);
  assert.deepEqual(h.control.calls().map(r => [r.method, r.path, r.authorization]), [
    ['GET', '/v1/publishing/account', `Bearer ${token}`],
    ['GET', `/v1/publishing/bits/${guest.bitId}`, undefined],
    ['POST', `/v1/publishing/bits/${guest.bitId}/versions`, `Bearer ${token}`],
  ]);
  assert.equal(updated.claimed, true);
  assert.equal(updated.url, `https://player.test/@maker/bit/${guest.bitId}/draft`);
  assert.equal(updated.claimUrl, undefined);
  assert.deepEqual([h.state(mine).bit.mode, h.state(mine).bit.accountHandle], ['connected', 'maker']);

  writeFileSync(join(theirs, 'index.html'), '<title>Theirs</title>v2');
  h.control.reset();
  const blocked = await h.cli('publish', theirs);
  assert.equal(blocked.code, 'owner_conflict');
  assert.deepEqual(lines(h.control.calls()), ['GET /v1/publishing/account', `GET /v1/publishing/bits/${other.bitId}`]);
  assert.equal(h.state(theirs).pending, undefined);
});

test('refresh keeps the handle, unclaimed guest drafts keep their pass, a refused token never falls back to guest, and disconnect revokes', async t => {
  const h = await harness(t);
  const draft = h.bit('draft', { 'index.html': '<title>Draft</title>v1' });
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
  assert.deepEqual([doctor.mode, doctor.handle, doctor.url, doctor.limits.files], ['connected', 'maker', h.control.origin, 256]);
  const after = h.config();
  assert.deepEqual([after.accessToken, after.refreshToken, after.accountHandle], [refresh.response.access_token, refresh.response.refresh_token, 'maker']);

  // Connecting claims nothing: an unclaimed guest bit is still updated with its upload pass.
  writeFileSync(join(draft, 'index.html'), '<title>Draft</title>v2');
  h.control.reset();
  const bitId = h.state(draft).bit.id;
  const guestVersion = await h.cli('publish', draft);
  assert.deepEqual(h.control.calls().map(r => [r.method, r.path, r.authorization]), [
    ['GET', '/v1/publishing/account', `Bearer ${after.accessToken}`],
    ['GET', `/v1/publishing/bits/${bitId}`, undefined],
    ['POST', `/v1/publishing/bits/${bitId}/versions`, `Bearer ${h.control.bit(bitId).uploadToken}`],
  ]);
  assert.equal(guestVersion.claimUrl, h.state(draft).bit.claimUrl);

  // Control revokes the connection, for example from the player's connections page.
  h.control.revokeAll();
  writeFileSync(join(draft, 'index.html'), '<title>Draft</title>v3');
  h.control.reset();
  const refused = await h.cli('publish', draft);
  assert.equal(refused.code, 'reconnect_required');
  assert.match(refused.recovery, /Run connect/);
  assert.deepEqual(lines(h.control.calls()), ['GET /v1/publishing/account'], 'the guest draft is not published with its upload pass');
  const fresh = h.bit('fresh', { 'index.html': '<title>Fresh</title>new' });
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

test('a connected draft is reported as unpublished and replaced by naming its pending version', async t => {
  const h = await harness(t);
  await h.connectAs('maker');
  const directory = h.bit('draft-receipt', { 'index.html': '<title>Draft</title>First' });
  h.control.reset();
  const first = await h.cli('publish', directory);
  assert.equal(first.draft, true);
  assert.equal(first.contentVerified, false);
  assert.equal(first.recovery, undefined, 'a successful draft is not a failed public-content verification');
  assert.match(first.notice, /not published yet/);
  assert.equal(first.runtimeUrl, undefined);
  assert.equal(h.control.bit(first.bitId).versions.length, 0);
  assert.equal(h.control.requests.some(request => request.path.startsWith('/runtime/')), false);
  assert.equal(h.state(directory).pending, undefined);

  writeFileSync(join(directory, 'index.html'), '<title>Draft</title>Second');
  h.control.reset();
  const second = await h.cli('publish', directory);
  const upload = h.control.calls().find(request => request.method === 'POST');
  assert.equal(upload.body.expectedVersionId, first.versionId);
  assert.equal(upload.body.publish, undefined, 'the helper does not silently skip preview');
  assert.equal(second.bitId, first.bitId);
  assert.notEqual(second.versionId, first.versionId);
  assert.equal((await h.cli('status', directory)).draft, true);
});

test('an older helper\'s differ-post.json or journal stops every command before anything is sent', async t => {
  const h = await harness(t);
  const directory = h.bit('older', { 'index.html': '<title>Older</title>v1' });
  const legacy = { version: 1, publisher: h.control.origin, postId: '11111111-1111-4111-8111-111111111111', revisionId: '22222222-2222-4222-8222-222222222222', title: 'Older' };
  writeFileSync(join(directory, 'differ-post.json'), JSON.stringify(legacy));
  for (const args of [['publish', directory, '--caption', 'Older'], ['check', directory], ['status', directory], ['bind', directory, '--bit', legacy.postId]]) {
    const refused = await h.cli(...args);
    assert.equal(refused.code, 'stale_binding', args[0]);
    assert.match(refused.recovery, /Remove differ-post\.json/);
  }
  assert.deepEqual(h.control.calls(), [], 'nothing reaches Control, so differ-post.json is never uploaded');

  rmSync(join(directory, 'differ-post.json'));
  mkdirSync(join(directory, '.differ'), { recursive: true });
  writeFileSync(join(directory, '.differ', 'state.json'), JSON.stringify({ version: 1, url: h.control.origin, creation: { id: legacy.postId, mode: 'guest' } }));
  const stale = await h.cli('publish', directory);
  assert.equal(stale.code, 'stale_state');
  assert.deepEqual(h.control.calls(), [], 'an older journal is refused, not reinterpreted');
});

test('a caption is checked before upload; a new bit or a diff never inherits the saved caption', async t => {
  const h = await harness(t);
  const directory = h.bit('words', { 'index.html': '<title>Words</title>v1' });
  for (const caption of ['   ', 'x'.repeat(201), 'one\ntwo\nthree\nfour\nfive', 'tab\tinside']) {
    assert.equal((await h.cli('publish', directory, '--caption', caption)).code, 'invalid_caption', JSON.stringify(caption));
  }
  assert.deepEqual(h.control.calls(), [], 'an invalid caption is refused locally');
  const emoji = '🎈'.repeat(200);
  const first = await h.cli('publish', directory, '--caption', emoji);
  assert.equal(h.control.bit(first.bitId).versions[0].caption, emoji, 'the limit counts characters, not UTF-16 units');

  h.control.reset();
  writeFileSync(join(directory, 'index.html'), '<title>Words</title>v2');
  const fresh = await h.cli('publish', directory, '--new');
  assert.notEqual(fresh.bitId, first.bitId);
  const upload = h.control.calls().find(request => request.method === 'POST' && request.path.endsWith('/versions'));
  assert.equal(upload.body.caption, undefined, 'a new bit starts without the old bit\'s words');
  assert.equal(json(join(directory, 'differ-bit.json')).caption, '');

  h.control.reset();
  writeFileSync(join(directory, 'differ-bit.json'), JSON.stringify({ ...json(join(directory, 'differ-bit.json')), caption: 'Saved words' }));
  rmSync(join(directory, '.differ'), { recursive: true });
  const diff = await h.cli('publish', directory, '--parent-bit', first.bitId, '--parent-version', first.versionId);
  const child = h.control.calls().find(request => request.method === 'POST' && request.path.endsWith('/versions'));
  assert.deepEqual([child.body.parentBitId, child.body.parentVersionId, child.body.caption], [first.bitId, first.versionId, undefined], 'a diff never copies saved words');
  assert.equal(diff.state, 'succeeded');
});
