import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { check } from '../helper/client.mjs';

test('a statically valid stateful bundle explicitly remains behaviorally unverified', () => {
  const directory = mkdtempSync(join(tmpdir(), 'differ-participation-'));
  try {
    writeFileSync(join(directory, 'index.html'), '<h1>Vote</h1>');
    writeFileSync(join(directory, 'rules.html'), '<p>No useful grants at all</p>');
    mkdirSync(join(directory, 'data'));
    writeFileSync(join(directory, 'data', 'answers.html'), '<ul id="answers"></ul>');
    const result = check(directory);
    assert.equal(result.valid, true);
    assert.equal(result.validation, 'static');
    assert.equal(result.participation.state, 'unverified');
    assert.match(result.participation.nextStep, /runtime/);
    assert.equal(result.participation.rules, 'rules.html');
    assert.deepEqual(result.unreferencedCandidates, []);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
