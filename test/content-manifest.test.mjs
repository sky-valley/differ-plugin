import test from 'node:test';
import assert from 'node:assert/strict';
import { validateArtifact } from '../helper/artifact.mjs';

test('artifact identity is the complete canonical manifest of file digests', () => {
  const html = '<!doctype html><h1>Canonical version</h1>';
  const css = 'body{color:red}';
  // sha256 of the canonical {files:{path:sha256(bytes)}} JSON, matching the
  // immutable manifest returned in Control's publication receipt.
  const expected = '979fad0761134effcec09feec43bd389a17f74372c29a4168066558ecf2fb1f6';
  const files = [{ path: 'style.css', content: Buffer.from(css).toString('base64') }, { path: 'index.html', content: Buffer.from(html).toString('base64') }];
  assert.equal(validateArtifact({ files }).artifactId, expected);
  assert.equal(validateArtifact({ files: [...files].reverse() }).artifactId, expected);
  assert.notEqual(validateArtifact({ files: [...files, { path: 'extra.txt', content: '' }] }).artifactId, expected);
});

test('stateful bundles allow runtime URLs and reserve platform namespaces', () => {
  const pack = obj => ({ files: Object.entries(obj).map(([path, text]) => ({ path, content: Buffer.from(text).toString('base64') })) });
  const input = { 'index.html': '<script src="/-/client.js"></script><link rel="stylesheet" href="/style.css"><img src="/uploads/photo.jpg">', 'rules.html': '<p>rules</p>', 'style.css': 'body{}' };
  assert.equal(validateArtifact(pack(input)).files.size, 3);
  for (const path of ['-/client.js', 'uploads/photo.jpg', 'v/example/index.html', '__differ/sdk.js', '__dfr/bridge.js']) {
    assert.throws(() => validateArtifact(pack({ ...input, [path]: 'reserved' })), { code: 'reserved_path' }, path);
  }
  assert.throws(() => validateArtifact(pack({ 'index.html': '<script src="/-/client.js"></script>' })), { code: 'missing_asset' });
  for (const reference of ['/__differ/sdk.js', '__differ/sdk.js', './__dfr/bridge.js']) {
    assert.throws(() => validateArtifact(pack({ ...input, 'preview.html': `<script src="${reference}"></script>` })), { code: 'reserved_path' }, reference);
  }
  assert.equal(validateArtifact(pack({ 'index.html': '<a href="preview.html">', 'preview.html': '<img src="pic.png">', 'pic.png': 'png' })).files.size, 3, 'preview.html is checked like any page');
  assert.throws(() => validateArtifact(pack({ 'index.html': '<p>', 'preview.html': '<img src="gone.png">' })), { code: 'missing_asset' });
});

test('inline script builds image URLs at runtime while external script sources are checked', () => {
  const files = html => ({files: [{path:'index.html', content:Buffer.from(html).toString('base64')}]});
  const script = '<script type="module">card.innerHTML = `<img src="${item.img}">`;</script>';
  assert.doesNotThrow(() => validateArtifact(files(script)));
  assert.throws(() => validateArtifact(files(script + '<script src="missing.js"></script>')), {code:'missing_asset'});
});
