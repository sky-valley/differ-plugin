import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configuration } from '../helper/connection.mjs';

function isolated(t) {
  const directory = mkdtempSync(join(tmpdir(), 'differ-config-'));
  const configPath = join(directory, 'publisher.json');
  const prior = Object.fromEntries(['DIFFER_CONFIG', 'DIFFER_PUBLISH_URL'].map(name => [name, process.env[name]]));
  process.env.DIFFER_CONFIG = configPath;
  delete process.env.DIFFER_PUBLISH_URL;
  t.after(() => {
    for (const [name, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    rmSync(directory, { recursive: true });
  });
  return value => writeFileSync(configPath, JSON.stringify(value), { mode: 0o600 });
}

test('an unrecognized saved mode never silently publishes as a guest', t => {
  const save = isolated(t);
  assert.equal(configuration().mode, 'guest');
  for (const config of [{ mode: 'legacy-team' }, { mode: 'unsupported' }]) {
    save(config);
    assert.throws(configuration, { code: 'unsupported_configuration' });
  }
  save({ mode: 'guest' });
  assert.equal(configuration().mode, 'guest');
});

test('the environment chooses the publisher; a saved connection only names its own', t => {
  const save = isolated(t);
  assert.equal(configuration().url, 'https://publish.getdiffer.com');
  save({ mode: 'guest', url: 'https://apps.example' });
  assert.equal(configuration().url, 'https://publish.getdiffer.com', 'a saved origin never retargets publishing');
  process.env.DIFFER_PUBLISH_URL = 'http://127.0.0.1:8080';
  assert.equal(configuration().url, 'http://127.0.0.1:8080');
  // A connection saved for another publisher, such as one made before Control
  // published, stops instead of sending its tokens elsewhere: connect again.
  const connection = { mode: 'connected', accessToken: 'dfa_a', refreshToken: 'dfr_a', expiresAt: 0, accountUsername: 'maker' };
  save({ ...connection, url: 'https://apps.example' });
  assert.throws(configuration, { code: 'target_changed' });
  save({ ...connection, url: 'http://127.0.0.1:8080' });
  assert.deepEqual([configuration().mode, configuration().token], ['connected', 'dfa_a']);
  process.env.DIFFER_PUBLISH_URL = 'http://publish.example';
  assert.throws(configuration, { code: 'unsafe_endpoint' });
});
