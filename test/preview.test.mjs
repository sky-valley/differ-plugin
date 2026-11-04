import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { preview } from '../helper/client.mjs';

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

test('preview frames preview.html at 390×520 and index.html at 390×693 on a player page bundles cannot shadow', async t => {
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

test('without preview.html the player page says what the feed shows instead', async t => {
  const { pages, get } = await serve(t, { 'index.html': '<p>only</p>' });
  assert.deepEqual(pages, ['index.html']);
  const page = await (await get('/__differ/')).text();
  assert.doesNotMatch(page, /id="preview"/);
  assert.match(page, /No preview\.html/);
  assert.equal((await get('/preview.html', 'iframe')).status, 404);
});
