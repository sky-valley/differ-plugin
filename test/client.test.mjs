import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { connectionError, errorResult } from '../helper/diagnostics.mjs';
import { contentTitle } from '../helper/project.mjs';

const bundle = fileURLToPath(new URL('../plugins/differ/scripts/differ.cjs', import.meta.url));
const cli = (...args) => { const r = spawnSync(process.execPath, [bundle, ...args], { encoding: 'utf8' }); return { status: r.status, data: JSON.parse(r.stdout) }; };
test('app-name resolution, media report and portable binding never alter or upload source metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'differ-app-'));
  try {
    const content = join(root, 'content'); mkdirSync(join(content, 'assets', 'nested'), { recursive: true });
    const html = '<title>My piece</title><img src="./assets/photo.png"><link href="./assets/nested/style.css" rel="stylesheet">';
    writeFileSync(join(content, 'index.html'), html);
    writeFileSync(join(content, 'assets/photo.png'), Buffer.alloc(600 * 1024));
    writeFileSync(join(content, 'assets/nested/style.css'), 'body{color:black}');
    writeFileSync(join(content, 'assets/unused.svg'), '<svg/>');
    const first = cli('check', root); assert.equal(first.status, 0); assert.equal(first.data.files, 4);
    assert.equal(first.data.largestAssets[0].bytes, 600 * 1024);
    assert.equal(first.data.warnings[0].code, 'large_image');
    assert.deepEqual(first.data.unreferencedCandidates, ['assets/unused.svg']);
    assert.equal(contentTitle(content), 'My piece');
    const binding = { version: 1, publisher: 'https://publish.example', postId: '11111111-1111-4111-8111-111111111111', revisionId: '22222222-2222-4222-8222-222222222222', title: 'Saved title' };
    writeFileSync(join(content, 'differ-post.json'), JSON.stringify(binding));
    const second = cli('check', root); assert.equal(second.data.artifactId, first.data.artifactId); assert.equal(second.data.files, 4);
    assert.equal(contentTitle(content), 'Saved title'); assert.equal(contentTitle(content, 'Override'), 'Override');
    assert.equal(readFileSync(join(content, 'index.html'), 'utf8'), html);
    writeFileSync(join(content, 'differ-post.json'), JSON.stringify({ ...binding, token: 'must-not-be-accepted' }));
    assert.equal(cli('check', root).data.code, 'invalid_binding');
    rmSync(join(content, 'differ-post.json'));
    mkdirSync(join(content, 'recordings')); writeFileSync(join(content, 'recordings/clip.mp4'), 'scratch');
    assert.match(cli('check', root).data.message, /tooling\/scratch/);
    writeFileSync(join(root, 'index.html'), '<title>Ambiguous</title>');
    assert.equal(cli('check', root).data.code, 'content_directory_required');
  } finally { rmSync(root, { recursive: true }); }
});
test('diagnostics distinguish permission, DNS and service failures without echoing secret causes', () => {
  for (const code of ['EPERM', 'EACCES', 'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'TimeoutError']) {
    const error = new Error('secret bearer must never appear', { cause: { code, message: 'secret' } });
    const result = errorResult(connectionError(error, 'publication', 'https://publish.example/v1/publishing/posts/11111111-1111-4111-8111-111111111111/versions'));
    assert.equal(result.cause, code); assert.equal(result.stage, 'publication');
    assert.equal(result.retryable, true); assert.ok(!JSON.stringify(result).includes('secret'));
    if (['EPERM', 'EACCES'].includes(code)) assert.equal(result.code, 'network_permission_required');
  }
});
