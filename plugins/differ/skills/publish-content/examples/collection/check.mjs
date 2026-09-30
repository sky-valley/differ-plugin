import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { readBundle, runtime } from '../../scripts/runtime.mjs';
import { launchBrowser, viewer } from '../../scripts/browser.mjs';

// A real 1x1 PNG with disposable metadata, generated without external tools.
function png() {
  const chunk = (kind, data) => {
    const bytes = Buffer.concat([Buffer.from(kind), data]); let crc = 0xffffffff;
    for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const length = Buffer.alloc(4), checksum = Buffer.alloc(4); length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, bytes, checksum]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('tEXt', Buffer.from('Comment\0fixture-private-location')), chunk('IDAT', deflateSync(Buffer.from([0, 120, 190, 230]))), chunk('IEND', Buffer.alloc(0))]);
}
export async function checkCollection(host, browser) {
  const files = await readBundle(fileURLToPath(new URL('./content/', import.meta.url)));
  const site = await host.site(files), alice = await viewer(site, browser, 'p_alice'), guest = await viewer(site, browser, null, 320);
  const bob = await site.participate('p_bob');
  try {
    const image = png(); assert.ok(image.includes(Buffer.from('fixture-private-location')));
    await alice.page.getByLabel('Your sky photo').setInputFiles({ name: 'sky.png', mimeType: 'image/png', buffer: image });
    const submission = alice.page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/data/skies.html'));
    await alice.page.getByRole('button', { name: 'Share my sky' }).click();
    const submitted = await submission;
    await guest.page.getByRole('img', { name: 'A participant’s sky' }).waitFor();
    const src = await guest.page.getByRole('img').getAttribute('src');
    const stored = await site.request(src); assert.equal(stored.status, 200);
    assert.equal(Buffer.from(await stored.arrayBuffer()).includes(Buffer.from('fixture-private-location')), false);
    const forged = await site.request('/data/skies.html', { method: 'POST', headers: { 'Content-Type': 'text/html', Range: 'selector=#skies' }, body: submitted.postData() }, bob);
    assert.equal(forged.status, 403); await forged.text();
    const overwrite = await site.request(src, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: image }, bob);
    assert.equal(overwrite.status, 403); await overwrite.text();
    const invalid = await site.request('/uploads/p_bob/not-a-photo.svg', { method: 'PUT', headers: { 'Content-Type': 'image/svg+xml' }, body: '<svg/>' }, bob);
    assert.equal(invalid.status, 422); await invalid.text();
    assert.equal(await guest.page.getByRole('img').count(), 1);
    const contributions = await (await site.request('/-/contributions', {}, alice.cookie)).json(); assert.equal(contributions.length, 2);
    for (const contribution of contributions) {
      const removed = await site.request(`/-/contributions/${contribution.id}`, { method: 'DELETE' }, alice.cookie);
      assert.equal(removed.status, 204); await removed.text();
    }
    await guest.page.waitForFunction(() => document.querySelector('#gallery').children.length === 0);
    const gone = await site.request(src); assert.equal(gone.status, 404); await gone.text();
    return { passed: true, checks: ['actual browser upload and entry payload', 'anonymous live gallery', 'metadata stripped', 'forged owner refused', 'cross-person upload replacement refused', 'invalid format refused', 'own entry and upload removal'] };
  } finally { await alice.context.close(); await guest.context.close(); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const host = await runtime(); let browser;
  try { browser = await launchBrowser(); console.log(JSON.stringify(await checkCollection(host, browser), null, 2)); }
  finally { if (browser) await browser.close(); await host.close(); }
}
