import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture, task } from './task-fixture.mjs';

test('tasks lists one page with the connection bearer and preserves empty continuation pages', async t => {
  const f = await fixture(t);
  const pages = [{ tasks: [task], next: 7 }, { tasks: [], next: 12 }, { tasks: [], next: 0 }];
  f.state.reply = () => ({ status: 200, body: pages[f.calls.length - 1] });
  for (const [i, after] of [0, 7, 12].entries()) {
    const result = await f.run(i ? ['tasks', '--after', String(after)] : ['tasks']);
    assert.equal(result.status, 0); assert.deepEqual(result.data, pages[i]);
    assert.equal(f.calls[i].path, `/v1/publishing/agent-tasks?after=${after}`);
    assert.equal(f.calls[i].method, 'GET'); assert.equal(f.calls[i].body, '');
    assert.equal(f.calls[i].headers.authorization, 'Bearer dfa_test_access');
    assert.ok(!result.stdout.includes('dfa_')); assert.ok(!result.stdout.includes('dfr_'));
  }
  assert.equal(f.calls.length, 3, 'one invocation makes one poll, with no claim or receipt');
});

test('tasks refuses guests, unsafe cursors and a changed publisher before making requests', async t => {
  const f = await fixture(t);
  f.save({ mode: 'guest' });
  assert.equal((await f.run()).data.code, 'account_connection_required');
  f.save(f.connected);
  for (const args of [['--after'], ['--after', '-1'], ['--after', '1.5'], ['--after', '1e2'], ['--after', '9007199254740992'], ['--unknown', '0']]) {
    const result = await f.run(['tasks', ...args]);
    assert.equal(result.status, 1); assert.equal(result.data.code, 'invalid_task_cursor');
  }
  assert.equal((await f.run(['tasks'], { DIFFER_PUBLISH_URL: 'https://another.example' })).data.code, 'target_changed');
  assert.equal(f.calls.length, 0);
});

test('tasks refreshes an expired connection before polling, without changing identity', async t => {
  const f = await fixture(t);
  f.save({ ...f.connected, expiresAt: 0 });
  f.state.reply = call => call.path === '/oauth/token'
    ? { status: 200, body: { access_token: 'dfa_rotated', refresh_token: 'dfr_rotated', expires_in: 900 } }
    : { status: 200, body: { tasks: [], next: 0 } };
  const result = await f.run();
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(f.calls[0].body), { grant_type: 'refresh_token', client_id: 'differ-plugin', refresh_token: 'dfr_test_refresh', resource: `${f.url}/mcp` });
  assert.equal(f.calls[1].headers.authorization, 'Bearer dfa_rotated');
  assert.equal(JSON.parse(readFileSync(f.config, 'utf8')).refreshToken, 'dfr_rotated');
  assert.ok(!result.stdout.includes('rotated')); assert.equal(f.calls.length, 2);
  f.calls.length = 0;
  f.save({ ...f.connected, expiresAt: 0 });
  f.state.reply = () => ({ status: 400, body: { error: 'invalid_grant' } });
  const refused = await f.run();
  assert.equal(refused.status, 1); assert.equal(refused.data.code, 'reconnect_required');
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].path, '/oauth/token', 'failed refresh never falls back to guest polling');
});

test('task polling gives fixed errors for revoked access, disabled delivery and server failures', async t => {
  const f = await fixture(t);
  for (const [status, code] of [[401, 'reconnect_required'], [404, 'task_delivery_unavailable'], [503, 'task_poll_failed']]) {
    f.state.reply = () => ({ status, body: { error: 'PRIVATE-SERVER-TEXT', message: 'PRIVATE-SERVER-TEXT' } });
    const result = await f.run();
    assert.equal(result.status, 1); assert.equal(result.data.code, code);
    assert.ok(!result.stdout.includes('PRIVATE-SERVER-TEXT'));
  }
  f.state.reply = () => ({ status: 404, raw: '404 page not found' });
  assert.equal((await f.run()).data.code, 'task_delivery_unavailable');
  f.state.reply = () => ({ status: 302, headers: { location: `${f.url}/must-not-receive-token` } });
  assert.equal((await f.run()).data.code, 'task_poll_failed');
  assert.ok(f.calls.every(call => !call.path.includes('must-not-receive-token')));
});

test('task polling rejects malformed metadata and never prints unexpected prompt fields', async t => {
  const f = await fixture(t);
  for (const body of [null, [], { tasks: [], next: 4 }, { tasks: [], next: -1 }, { tasks: [], next: 1.5 },
    { tasks: [task, task], next: 0 }, { tasks: Array(51).fill(task), next: 0 },
    { tasks: [{ ...task, version: 0 }], next: 0 }, { tasks: [{ ...task, id: '../task' }], next: 0 },
    { tasks: [task], next: 0, prompt: 'PRIVATE-PROMPT' }, { tasks: [{ ...task, prompt: 'PRIVATE-PROMPT' }], next: 0 }]) {
    f.state.reply = () => ({ status: 200, body });
    const result = await f.run(['tasks', '--after', '4']);
    assert.equal(result.status, 1); assert.equal(result.data.code, 'invalid_task_response');
    assert.ok(!result.stdout.includes('PRIVATE-PROMPT'));
  }
});
