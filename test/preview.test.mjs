import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import { preview } from '../helper/client.mjs';
import { sdkStandIn } from '../helper/preview.mjs';

async function serve(t, files) {
  const directory = mkdtempSync(join(tmpdir(), 'differ-preview-'));
  for (const [path, text] of Object.entries(files)) writeFileSync(join(directory, path), text);
  const { server, mount, pages } = preview(directory);
  await once(server, 'listening');
  t.after(() => { server.close(); rmSync(directory, { recursive: true }); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const get = (path, dest) => fetch(origin + path, { headers: dest ? { 'sec-fetch-dest': dest } : {} });
  return { mount, pages, get };
}

test('preview frames preview.html at 390×520 and index.html at 390×693 on a feed page bundles cannot shadow', async t => {
  const index = '<!doctype html><html><HEAD lang="en"><title>Bit</title></HEAD><body>open</body></html>';
  const { mount, pages, get } = await serve(t, { 'index.html': index, 'preview.html': '<p>tap</p>' });
  assert.equal(mount, '/__differ/');
  assert.deepEqual(pages, ['index.html', 'preview.html']);
  const page = await (await get(mount)).text();
  assert.match(page, /<iframe id="preview" src="\/preview\.html"[^>]* width="390" height="520">/);
  assert.match(page, /frame\.src = '\/index\.html'.*frame\.width = 390; frame\.height = 693/);

  // As the content Worker does: the SDK goes first in the head of every page
  // a browser opens or frames, and nowhere else.
  const framed = await get('/index.html', 'iframe');
  assert.equal(framed.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(await framed.text(), index.replace('<HEAD lang="en">', '<HEAD lang="en"><script src="/__differ/sdk.js"></script>'));
  assert.equal(await (await get('/preview.html', 'document')).text(), '<script src="/__differ/sdk.js"></script><p>tap</p>', 'a page without a head gets the SDK prepended');
  assert.equal(await (await get('/index.html', 'empty')).text(), index, 'a bit\'s own fetch of HTML is left alone');

  const sdk = await get('/__differ/sdk.js');
  assert.equal(sdk.headers.get('content-type'), 'text/javascript; charset=utf-8');
  const source = await sdk.text();
  assert.doesNotThrow(() => new Function(source), 'the stand-in is plain script');
  for (const message of ["'differ:ready'", "'differ:open'", "'differ:close'", "'differ:activity'", "'differ:show'", "'differ:hide'", "'differ:pointer'"]) assert.ok(source.includes(message), message);
  assert.equal((await get('/__differ/other.js')).status, 404);
});

test('without preview.html the feed page says what the feed shows instead', async t => {
  const { pages, get } = await serve(t, { 'index.html': '<p>only</p>' });
  assert.deepEqual(pages, ['index.html']);
  const page = await (await get('/__differ/')).text();
  assert.doesNotMatch(page, /id="preview"/);
  assert.match(page, /No preview\.html/);
  assert.equal((await get('/preview.html', 'iframe')).status, 404);
});

// The stand-in in a framed preview.html, with only what it touches of a
// browser: the browser's own events arrive trusted, the ones the SDK
// dispatches for a forwarded gesture do not.
function framedStandIn() {
  const listeners = {}, sent = [], timers = [];
  const fire = (type, event) => (listeners[type] ?? []).forEach(fn => fn(event));
  const parent = { postMessage: message => sent.push(message) };
  const window = { parent, addEventListener: (type, fn) => (listeners[type] ??= []).push(fn) };
  const element = { dispatchEvent: event => fire(event.type, event) };
  class Synthetic { constructor(type, init) { Object.assign(this, init, { type, isTrusted: false }); } }
  runInNewContext(sdkStandIn, {
    window, location: { pathname: '/preview.html' }, console, TextEncoder,
    document: { addEventListener() {}, elementFromPoint: () => element, documentElement: element },
    Element: class {}, PointerEvent: Synthetic, MouseEvent: Synthetic,
    setTimeout: fn => timers.push(fn),
  });
  const activity = () => sent.filter(m => m.type === 'differ:activity').map(m => m.interactions);
  return {
    activity,
    forward: (phase, id, x = 10, y = 10) => fire('message', { source: parent, data: { type: 'differ:pointer', v: 1, phase, id, x, y } }),
    trusted: type => fire(type, { type, isTrusted: true }),
    untrusted: type => fire(type, { type, isTrusted: false }),
    tick: () => timers.splice(0).forEach(fn => fn()),
  };
}

test('the stand-in counts a forwarded gesture once on its up, never after a cancel, and only trusted events', () => {
  const bit = framedStandIn();
  bit.forward('down', 1); bit.forward('move', 1, 10, 80); bit.forward('cancel', 1, 10, 80);
  assert.deepEqual(bit.activity(), [], 'a swipe the feed took is not a touch, though its down reached the bit');
  bit.untrusted('pointerdown'); bit.untrusted('keydown');
  assert.deepEqual(bit.activity(), [], 'an event the page dispatched itself is not a touch');

  bit.forward('down', 2); bit.forward('move', 2, 14, 12); bit.forward('up', 2, 14, 12);
  assert.deepEqual(bit.activity(), [1], 'a gesture that stayed the bit\'s counts once, told at once');
  bit.forward('up', 2);
  assert.deepEqual(bit.activity(), [1], 'an up for a gesture already ended is ignored');

  bit.trusted('pointerdown'); bit.trusted('keydown'); bit.forward('down', 3); bit.forward('up', 3);
  assert.deepEqual(bit.activity(), [1], 'within the second, touches wait');
  bit.tick();
  assert.deepEqual(bit.activity(), [1, 3], 'the browser\'s own presses and keys count, with the forwarded tap');
  bit.tick(); bit.tick();
  assert.deepEqual(bit.activity(), [1, 3], 'nothing is told when nothing was touched');
});
