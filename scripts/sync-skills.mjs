#!/usr/bin/env node
// npm run sync-skills: replace skills/ with what Control serves, verified.
// npm run check-skills: confirm skills/ matches skills.lock.json and the lock
// matches what Control serves. DIFFER_PUBLISH_URL selects the Control.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publisher } from '../helper/connection.mjs';
import { changes, readLock, readSnapshot, served, writeSnapshot } from '../helper/skills.mjs';

const args = process.argv.slice(2);
const at = args.indexOf('--plugin');
const root = at >= 0 ? resolve(args[at + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '../plugins/differ');
const endpoint = `${publisher()}/mcp`;

const fail = message => { process.stderr.write(message + '\n'); process.exit(1); };

if (args.includes('--check')) {
  if (!existsSync(join(root, 'skills.lock.json'))) fail('No skills.lock.json: run npm run sync-skills.');
  const lock = readLock(root);
  if (changes(readSnapshot(root), lock).length) fail('skills/ differs from skills.lock.json: edit skills in Control, then run npm run sync-skills.');
  const changed = changes(lock, (await served(endpoint)).files);
  if (changed.length) fail(`Control serves different skills than skills.lock.json; run npm run sync-skills:\n${changed.join('\n')}`);
  process.stdout.write(JSON.stringify({ state: 'current', endpoint }) + '\n');
} else {
  const current = await served(endpoint, { read: true });
  writeSnapshot(root, current);
  process.stdout.write(JSON.stringify({ state: 'synced', endpoint, files: current.files.length }) + '\n');
}
