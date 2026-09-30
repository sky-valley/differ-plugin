import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readBundle, runtime } from '../../scripts/runtime.mjs';
import { launchBrowser, viewer } from '../../scripts/browser.mjs';

export async function checkBoard(host, browser) {
  const files = await readBundle(fileURLToPath(new URL('./content/', import.meta.url)));
  const site = await host.site(files);
  const alice = await viewer(site, browser, 'p_alice'), bob = await viewer(site, browser, 'p_bob'), guest = await viewer(site, browser, null, 320);
  try {
    await alice.page.getByLabel('A thought').fill('A cloud looks like a whale');
    await alice.page.getByRole('button', { name: 'Add a note' }).click();
    await guest.page.getByText('A cloud looks like a whale', { exact: true }).waitFor();
    bob.page.once('dialog', dialog => dialog.accept('A cloud looks like a boat'));
    await bob.page.getByRole('button', { name: 'Rewrite', exact: true }).click();
    await guest.page.getByText('A cloud looks like a boat', { exact: true }).waitFor();
    const whole = await site.request('/data/notes.html', { method: 'PUT', headers: { 'Content-Type': 'text/html' }, body: '<ul id="notes"></ul>' }, bob.cookie);
    assert.equal(whole.status, 403); await whole.text();
    const code = await site.request('/index.html', { method: 'PUT', body: 'changed' }, bob.cookie);
    assert.equal(code.status, 403); await code.text();
    const anonymous = await site.request('/data/notes.html', { method: 'POST', headers: { 'Content-Type': 'text/html', Range: 'selector=#notes' }, body: '<li id="bad">anonymous</li>' });
    assert.equal(anonymous.status, 401); await anonymous.text();
    await bob.page.getByRole('button', { name: 'Remove', exact: true }).click();
    await guest.page.waitForFunction(() => document.querySelector('#wall').children.length === 0);
    assert.doesNotMatch(await (await site.request('/data/notes.html')).text(), /cloud/);
    return { passed: true, checks: ['real UI add/rewrite/remove across identities', 'anonymous live updates', 'whole replacement refused', 'authored write refused', 'anonymous write refused'] };
  } finally { for (const person of [alice, bob, guest]) await person.context.close(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const host = await runtime(); let browser;
  try { browser = await launchBrowser(); console.log(JSON.stringify(await checkBoard(host, browser), null, 2)); }
  finally { if (browser) await browser.close(); await host.close(); }
}
