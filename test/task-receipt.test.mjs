import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, task } from './task-fixture.mjs';
const bit = '12345678-1234-4234-8234-123456789abc';
const version = '22345678-1234-4234-8234-123456789abc';
const receive = ['task-receive', task.id, String(task.version)];
function delivery(call) {
  return { ...task, version: 2, claimId: JSON.parse(call.body).claimId, expiresAt: new Date(Date.now()+60000).toISOString(), parentBitId: bit, parentVersionId: version, prompt: 'PRIVATE data request' };
}
const journal = f => join(f.root, 'tasks', task.id, 'task.json');
test('receive saves the prompt before receipt and retries a lost receipt without a second claim', async t => {
  const f = await fixture(t); let receipts = 0, claim;
  f.state.reply = call => {
    if (call.path.endsWith('/claim')) { claim = JSON.parse(call.body); return { status: 200, body: delivery(call) }; }
    assert.ok(call.path.endsWith('/receipt'));
    const saved = JSON.parse(readFileSync(journal(f), 'utf8'));
    assert.equal(saved.delivery.prompt, 'PRIVATE data request'); assert.equal(saved.claimId, claim.claimId);
    assert.equal(statSync(journal(f)).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(call.body), { claimId: claim.claimId });
    return ++receipts === 1 ? { status: 503, body: { error: 'PRIVATE ERROR' } } : { status: 200, body: { ...task, version: 3, state: 'received' } };
  };
  const first = await f.run(receive); assert.equal(first.status, 1); assert.ok(!first.stdout.includes('PRIVATE'));
  const second = await f.run(receive); assert.equal(second.status, 0); assert.equal(second.data.state, 'received');
  assert.ok(!second.stdout.includes('PRIVATE')); assert.equal(f.calls.filter(c => c.path.endsWith('/claim')).length, 1);
  assert.equal((await f.run(receive)).status, 0); assert.equal(receipts, 2);
  assert.equal(readdirSync(join(f.root, 'tasks', task.id)).includes('lock'), false);
});
test('invalid delivery never receives and an uncertain claim reuses its saved ID', async t => {
  const f = await fixture(t); let count=0;
  f.state.reply = call => ({ status: 200, body: { ...delivery(call), ...(count++ === 0 ? { id: 'wrong' } : {}) } });
  assert.equal((await f.run(receive)).status, 1); assert.equal(f.calls.length, 1);
  const claim = JSON.parse(f.calls[0].body).claimId;
  f.state.reply = call => call.path.endsWith('/claim') ? { status:200, body: delivery(call) } : { status:200, body:{ ...task, version:3, state:'received' } };
  assert.equal((await f.run(receive)).status, 0);
  assert.equal(JSON.parse(f.calls[1].body).claimId, claim);
});
test('receiver refuses unsafe task IDs and linked state directories', async t => {
  const f = await fixture(t);
  assert.equal((await f.run(['task-receive','../outside','1'])).status, 1); assert.equal(f.calls.length, 0);
  symlinkSync(f.root, join(f.root, 'tasks'));
  assert.equal((await f.run(receive)).status, 1); assert.equal(f.calls.length, 0);
});
