import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readBundle, runtime } from '../../scripts/runtime.mjs';
import { launchBrowser, viewer } from '../../scripts/browser.mjs';
import { voteRequest } from './content/vote.mjs';

const host = await runtime(); let browser;
try {
  browser = await launchBrowser();
  const site = await host.site(await readBundle(fileURLToPath(new URL('./content/', import.meta.url))));
  const alice = await site.participate('p_alice');
  const saved = await site.request('/data/votes.html', voteRequest('p_alice', 'tea'), alice);
  assert.equal(saved.status, 206); await saved.text();
  const before = await (await site.request('/data/votes.html')).text();
  const returning = await viewer(site, browser, 'p_alice'), guest = await viewer(site, browser, null);
  try {
    await returning.page.locator('[data-choice="tea"][aria-pressed="true"]').waitFor();
    assert.equal(await returning.page.locator('#mine').textContent(), 'Your current choice: tea.');
    assert.equal(await guest.page.locator('[aria-pressed="true"]').count(), 0);
    assert.equal(await (await site.request('/data/votes.html')).text(), before, 'opening must not add a vote');
    await returning.page.getByRole('button', { name: 'Coffee' }).click();
    await returning.page.locator('[data-choice="coffee"][aria-pressed="true"]').waitFor();
    assert.equal(await returning.page.locator('#totals').textContent(), 'Tea 0 · Coffee 1');
    console.log('PASS: returning identity displays its existing vote before interaction; opening writes nothing; an intentional change updates it. Fixture identity, real runtime and browser.');
  } finally { await returning.context.close(); await guest.context.close(); }
} finally { if (browser) await browser.close(); await host.close(); }
