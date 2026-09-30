import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readBundle, runtime } from '../../scripts/runtime.mjs';
import { voteRequest } from './content/vote.mjs';

// Each check gets a new site. A failed destructive probe cannot spoil another.
export async function checkVote(files, host) {
  const checks = [];
  async function check(name, run) {
    try { const site = await host.site(files); await run(site); checks.push({ name, passed: true }); }
    catch (error) { checks.push({ name, passed: false, message: error.message }); }
  }
  const saved = async response => { const body = await response.text(); assert.equal(response.status, 206, body); };
  const rejected = async response => { const body = await response.text(); assert.ok([401, 403, 422].includes(response.status), `Unexpected ${response.status}: ${body}`); };
  await check('anonymous reads and receives an actual mutation', async site => {
    const first = await site.request('/data/votes.html'); assert.equal(first.status, 200); await first.text();
    const stream = await site.subscribe('/data/votes.html');
    try {
      const alice = await site.participate('p_alice');
      await saved(await site.request('/data/votes.html', voteRequest('p_alice', 'tea'), alice));
      await stream.mutation();
      const snapshot = await (await site.request('/data/votes.html')).text(); assert.match(snapshot, /data-choice="tea"/);
    } finally { stream.close(); }
  });
  await check('anonymous cannot submit', async site => {
    await rejected(await site.request('/data/votes.html', voteRequest('p_alice', 'tea')));
    assert.doesNotMatch(await (await site.request('/data/votes.html')).text(), /data-voter=/);
  });
  await check('two identities and changed choices use real UI payloads', async site => {
    const alice = await site.participate('p_alice'), bob = await site.participate('p_bob');
    for (const [who, choice, cookie] of [['p_alice', 'tea', alice], ['p_bob', 'coffee', bob], ['p_alice', 'coffee', alice]])
      await saved(await site.request('/data/votes.html', voteRequest(who, choice), cookie));
    const body = await (await site.request('/data/votes.html')).text();
    assert.equal((body.match(/data-voter="p_alice"/g) ?? []).length, 2);
    assert.equal((body.match(/data-voter="p_bob"/g) ?? []).length, 1);
    assert.match(body, /data-voter="p_alice" data-choice="coffee"/);
  });
  await check('forged identity and multiple or nested entries are refused', async site => {
    const alice = await site.participate('p_alice');
    const good = voteRequest('p_alice', 'tea'), forged = voteRequest('p_bob', 'coffee');
    for (const request of [forged, { ...good, body: good.body + forged.body }, { ...good, body: good.body.replace('</li>', forged.body + '</li>') }])
      await rejected(await site.request('/data/votes.html', request, alice));
    assert.doesNotMatch(await (await site.request('/data/votes.html')).text(), /data-voter=/);
  });
  await check('whole replacement and cross-person removal are refused', async site => {
    const alice = await site.participate('p_alice'), bob = await site.participate('p_bob');
    await saved(await site.request('/data/votes.html', voteRequest('p_alice', 'tea'), alice));
    const entries = await (await site.request('/-/contributions', {}, alice)).json(); assert.equal(entries.length, 1);
    const response = await site.request(`/-/contributions/${entries[0].id}`, { method: 'DELETE' }, bob);
    assert.equal(response.status, 404); await response.text();
    await rejected(await site.request('/data/votes.html', { method: 'PUT', headers: { 'Content-Type': 'text/html' }, body: '<ul id="votes"></ul>' }, bob));
    assert.match(await (await site.request('/data/votes.html')).text(), /data-voter="p_alice"/);
  });
  for (const moderator of [false, true]) await check(moderator ? 'creator moderates another identity' : 'participant removes own contribution', async site => {
    const alice = await site.participate('p_alice');
    await saved(await site.request('/data/votes.html', voteRequest('p_alice', 'tea'), alice));
    const entries = await (await site.request('/-/contributions', {}, alice)).json(); assert.equal(entries.length, 1);
    const cookie = moderator ? await site.participate('p_creator', true) : alice;
    const response = await site.request(`/-/contributions/${entries[0].id}${moderator ? '?all=1' : ''}`, { method: 'DELETE' }, cookie);
    assert.equal(response.status, 204); await response.text();
    assert.doesNotMatch(await (await site.request('/data/votes.html')).text(), /data-voter=/);
  });
  return { passed: checks.every(check => check.passed), checks,
    unverified: ['Player Google login and consent', 'browser rendering and reconnect', 'arbitrary applications outside this example contract'] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = await readBundle(fileURLToPath(new URL('./content/', import.meta.url)));
  const host = await runtime();
  try { const result = await checkVote(files, host); console.log(JSON.stringify(result, null, 2)); if (!result.passed) process.exitCode = 1; }
  finally { await host.close(); }
}
