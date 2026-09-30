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
  for (const path of ['-/client.js', 'uploads/photo.jpg', 'v/example/index.html']) {
    assert.throws(() => validateArtifact(pack({ ...input, [path]: 'reserved' })), { code: 'invalid_file' });
  }
  assert.throws(() => validateArtifact(pack({ 'index.html': '<script src="/-/client.js"></script>' })), { code: 'missing_asset' });
});
