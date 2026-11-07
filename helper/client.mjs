import { lstatSync, readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { createServer } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { validateArtifact, mimeTypes, safePath, reserved, reservedPrefixes, limits } from './artifact.mjs';
import { problem } from './diagnostics.mjs';
import { contentDirectory, caption as checkCaption, bindingName, readBinding, assetReport } from './project.mjs';
import { previewPage, sdkStandIn } from './preview.mjs';

import { atomic, configuration, activeConfiguration, request } from './connection.mjs';
export { configuration };
export { connect, connectionStatus, disconnect } from './connection.mjs';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
// The connected creator, read with the access token. Control refuses a token it
// cannot authenticate (reconnect_required); nothing falls back to guest.
const account = config => config.mode === 'connected' ? request(config.url, '/v1/publishing/account', { bearer: config.token }) : null;
const publicState = (config, bitId) => request(config.url, `/v1/publishing/bits/${bitId}`);
export async function doctor() {
  const config = await activeConfiguration();
  const capabilities = await request(config.url, '/v1/publishing/capabilities');
  return { ready: true, mode: config.mode, url: config.url, ...await account(config), limits: capabilities.limits,
    notice: config.mode === 'guest' ? 'Ready without sign-in. Guest bits are live by link for 24 hours; show the private claim link and deadline after publishing. Run connect to publish as yourself.' : 'New bits are automatically yours. Earlier guest bits need their own claim link.' };
}
export function pack(directory) {
  const root = contentDirectory(directory); const files = []; let bytes = 0;
  readBinding(root); // Metadata is excluded only after validating its exact public schema.
  function walk(path) {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.differ') continue;
      const full = join(path, entry.name); const name = relative(root, full).replaceAll('\\', '/');
      if (name === bindingName) continue;
      const stat = lstatSync(full);
      const reason = entry.isSymbolicLink() ? 'symbolic link' : stat.isFile() && stat.nlink > 1 ? 'hard-linked file' : entry.name.startsWith('.') ? 'hidden entry' : ['node_modules', 'tools', 'research', 'artifacts', 'recordings'].includes(entry.name) ? 'tooling/scratch directory' : null;
      if (reason) throw problem('unsafe_input', `Refusing ${name}: ${reason}.`, 'Select a content-only directory; keep originals, experiments and recordings outside it.');
      if (reserved(entry.isDirectory() ? `${name}/` : name)) throw problem('reserved_path', `Refusing ${name}: Differ reserves ${reservedPrefixes.join(', ')}.`, 'Rename or move it; Differ serves those paths itself.');
      if (entry.isDirectory()) { walk(full); continue; }
      if (!stat.isFile() || !safePath(name)) throw problem('unsupported_file', `Unsupported static asset: ${name}.`, 'Select the built content output, not source or server code.');
      bytes += stat.size;
      if (bytes > limits.bytes || files.length >= limits.files) throw problem('artifact_too_large', 'The bit exceeds 20 MiB or 256 files.', 'Compress media or remove unused assets.');
      files.push({ path: name, content: readFileSync(full).toString('base64') });
    }
  }
  walk(root);
  const validated = validateArtifact({ files });
  return { root, files, artifactId: validated.artifactId, bytes: validated.bytes };
}
export function check(directory) {
  const artifact = pack(directory);
  const participation = artifact.files.some(file => file.path === 'rules.html') ? {
    state: 'unverified', rules: 'rules.html',
    nextStep: 'Read publish-content/references/participation.md and run its disposable runtime rehearsal with the actual UI payloads, an anonymous viewer and two participants. Static validation and a publication receipt do not verify permissions or live updates.',
  } : { state: 'not_requested' };
  return { valid: true, validation: 'static', participation, directory: artifact.root, files: artifact.files.length, bytes: artifact.bytes, artifactId: artifact.artifactId, ...assetReport(artifact), checks: 'Static paths and obvious secrets checked; browser interaction and visual quality still need review.' };
}
const statePath = directory => join(resolve(directory), '.differ', 'state.json');
// The private journal. Version 2 names bits and versions; an older helper's
// journal is refused, never read.
const stateVersion = 2;
function stateFor(directory, config, rebinding = false) {
  const binding = readBinding(directory);
  if (binding && binding.publisher !== config.url) throw problem('target_changed', 'The portable binding names another publisher.', 'Use the intended publisher configuration; never silently retarget this bit.');
  const path = statePath(directory); const state = existsSync(path) ? read(path) : { version: stateVersion, url: config.url,
    ...(binding ? { receipt: { bitId: binding.bitId, versionId: binding.versionId } } : {}) };
  if (state.version !== stateVersion) throw problem('stale_state', '.differ/state.json was written by an older Differ helper.', 'Move .differ out of the content directory, keeping any claim link it holds, then bind DIR --bit ID or publish with --new.');
  if (state.url !== config.url) throw problem('target_changed', 'This content is bound to another publisher.', 'Keep its receipt. Use a separate directory for a different destination.');
  if (!rebinding && !state.pending && binding && state.receipt && (binding.bitId !== state.receipt.bitId || binding.versionId !== state.receipt.versionId)) throw problem('binding_conflict', 'Portable and local state name different bits/versions.', 'Review both identities; deliberately bind only after reconciling pending work.');
  return state;
}
function saveBinding(directory, state, caption) {
  const receipt = state.receipt;
  atomic(join(directory, bindingName), { version: 1, publisher: state.url, bitId: receipt.bitId, versionId: receipt.versionId, caption: caption ?? '' });
}
function lock(directory) {
  const path = join(resolve(directory), '.differ', 'lock');
  if (existsSync(dirname(path)) && (!lstatSync(dirname(path)).isDirectory() || lstatSync(dirname(path)).isSymbolicLink())) throw problem('unsafe_state', '.differ must be a real directory, not a link.', 'Use a safe content directory.');
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // The journal now holds claim proof as well as receipts. Protect it even in
  // a new repository that has no root .gitignore yet.
  const ignore = join(dirname(path), '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n', { mode: 0o600, flag: 'wx' });
  try { writeFileSync(path, JSON.stringify({ pid: process.pid }), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let active = true;
    try { process.kill(read(path).pid, 0); } catch (e) { if (e.code === 'ESRCH') active = false; }
    if (active) throw problem('publication_busy', 'Another publisher is using this directory.', 'Wait for it to finish, then run status.');
    unlinkSync(path); return lock(directory);
  }
  return () => unlinkSync(path);
}
export async function status(directory) {
  directory = contentDirectory(directory);
  const config = await activeConfiguration(); const unlock = lock(directory);
  try { return await creatorStatus(config, stateFor(directory, config), directory); }
  finally { unlock(); }
}
// The caption is the maker's words for this version: the one supplied, or
// the one differ-bit.json saved for the bit when it updates the same bit. The maker confirms it in Differ
// before the bit goes public, so an upload may carry none.
export async function publish(directory, caption, { newBit = false, parentBitId, parentVersionId } = {}) {
  directory = contentDirectory(directory);
  if (!!parentBitId !== !!parentVersionId) throw problem('invalid_diff', 'A diff requires the source bit and version IDs.', 'Read the source bit first.');
  // A new bit or a diff starts with no words: a child never copies its parent's.
  const words = caption !== undefined ? checkCaption(caption) : newBit || parentBitId ? '' : readBinding(directory)?.caption || '';
  const config = await activeConfiguration(); const artifact = pack(directory); const unlock = lock(directory);
  try { return await publishCreator(config, stateFor(directory, config), directory, artifact, words, { newBit, parentBitId, parentVersionId }); }
  finally { unlock(); }
}
export async function getBit(bitId) {
  const state = await publicState(configuration(), bitId);
  if (!state.bit) throw problem('bit_not_ready', 'This bit has not been published.', 'Finish the first upload.');
  return state.bit;
}
export async function bind(directory, bitId) {
  directory = contentDirectory(directory);
  const config = await activeConfiguration(); const unlock = lock(directory);
  try {
    const state = stateFor(directory, config, true);
    if (state.pending) throw problem('pending_publication', 'Reconcile the pending publication first.', 'Run status.');
    const bit = await getBit(bitId);
    if (state.bit && state.bit.id !== bit.id) {
      state.previous = [...(state.previous ?? []), { bit: state.bit, receipt: state.receipt, lastInput: state.lastInput }];
      delete state.bit;
    }
    state.receipt = { bitId: bit.id, versionId: bit.currentVersionId };
    delete state.lastInput;
    atomic(statePath(directory), state);
    saveBinding(directory, state, bit.versions.find(v => v.id === bit.currentVersionId)?.caption);
    return { bound: true, bitId: bit.id, expectedVersionId: bit.currentVersionId, recovery: 'Local files were not changed. Publish only after deliberately reconciling this draft with the current bit.' };
  } finally { unlock(); }
}
// The bearer decides who a publication acts for: the connected creator for its
// own drafts and for guest bits it has since claimed, otherwise the guest
// upload pass. A claimed bit is the account's when Control names its handle.
// A caller that already read the account passes it as me.
async function bearerFor(config, state, me) {
  const bit = state.bit;
  if (me === undefined) me = await account(config);
  if (bit.mode === 'connected') {
    if (me?.handle !== bit.accountHandle) throw problem('account_changed', 'This draft belongs to a different connected creator.', 'Reconnect that account, or deliberately create a separate diff.');
    return config.token;
  }
  if (me) {
    const current = await publicState(config, bit.id);
    if (current.claimed) {
      if (current.bit?.handle !== me.handle) throw problem('owner_conflict', 'This claimed bit belongs to another creator.', 'Connect its owner or create a diff.');
      bit.mode = 'connected'; bit.accountHandle = me.handle;
      return config.token;
    }
  }
  return bit.uploadToken;
}
function claimReceipt(receipt, state) {
  if (receipt.draft) return { ...receipt, contentVerified: false, notice: 'Saved as a draft, not published yet. Open the returned url to preview it, confirm its caption and publish it.' };
  return receipt.state === 'succeeded' && !receipt.claimed && state.bit?.claimUrl
    ? { ...receipt, claimUrl: state.bit.claimUrl, claimLinkPrivate: true } : receipt;
}
// The path names the bit and the bearer its author; the body carries neither.
const draft = ({ requestId, caption, expectedVersionId, parentBitId, parentVersionId }, files) =>
  ({ requestId, ...(caption ? { caption } : {}), expectedVersionId, files, ...(parentBitId ? { parentBitId, parentVersionId } : {}) });
// Control refuses with a 4xx before committing anything, so that request is
// dropped. A retry refused for its credential or a busy upload slot may follow
// an attempt that did commit; those, network failures and 5xx keep the request.
const outcomeUnknown = error => !(error.status >= 400 && error.status < 500) || ['reconnect_required', 'upload_busy'].includes(error.code);
async function creatorStatus(config, state, directory, me) {
  if (state.pending && !state.bit) throw problem('invalid_state', 'The pending publication has no saved publishing identity.', 'Keep the private journal and recover its publishing identity before retrying.');
  if (!state.bit) return state.receipt ? { state: 'bound', ...await getBit(state.receipt.bitId) } : { state: 'local', mode: config.mode };
  const input = state.pending ?? state.lastInput;
  if (!input) return { state: 'reserved', bitId: state.bit.id };
  const receipt = await request(config.url, `/v1/publishing/bits/${state.bit.id}/operations/${input.requestId}`, { bearer: await bearerFor(config, state, me) });
  if (receipt.state === 'succeeded') {
    state.receipt = receipt; state.lastInput = input; delete state.pending;
    saveBinding(directory, state, input.caption); atomic(statePath(directory), state);
  }
  return claimReceipt(receipt, state);
}
async function publishCreator(config, state, directory, artifact, caption, { newBit, parentBitId, parentVersionId }) {
  const me = await account(config);
  if (state.pending) {
    const recovered = await creatorStatus(config, state, directory, me);
    if (recovered.state === 'succeeded') return { ...recovered, recovered: true, recovery: 'Recovered the previous upload. Run publish again only if more edits were requested.' };
    if (state.pending.artifactId !== artifact.artifactId || state.pending.caption !== caption) throw problem('pending_changed', 'Pending publication belongs to different content.', 'Restore the pending content/caption and retry; never discard uncertain state.');
  }
  if (!state.pending && (newBit || parentBitId)) {
    state.previous = [...(state.previous ?? []), { bit: state.bit, receipt: state.receipt, lastInput: state.lastInput }];
    delete state.bit; delete state.receipt; delete state.lastInput;
  }
  if (!state.bit) {
    if (state.receipt && !me) throw problem('ownership_required', 'A public bit binding does not grant editing rights.', 'Use the original private workspace or connect the owner. To make your own, create a diff.');
    state.bit = { id: state.receipt?.bitId ?? randomUUID(), mode: me ? 'connected' : 'guest',
      ...(me ? { accountHandle: me.handle } : { ownerProof: randomBytes(32).toString('hex') }) };
    atomic(statePath(directory), state);
  }
  if (state.bit.mode === 'guest' && !state.bit.uploadToken) {
    // The proof is saved first, so a lost response is recovered by reserving again.
    const reserved = await request(config.url, `/v1/publishing/bits/${state.bit.id}/reservation`, { body: { ownerProof: state.bit.ownerProof } });
    state.bit.uploadToken = reserved.uploadToken; state.bit.claimUrl = reserved.claimUrl;
    atomic(statePath(directory), state);
  }
  if (!state.pending && state.receipt?.artifactId === artifact.artifactId && state.lastInput?.caption === caption) return creatorStatus(config, state, directory, me);
  const bearer = await bearerFor(config, state, me);
  const input = state.pending ?? { requestId: randomUUID(), artifactId: artifact.artifactId, caption,
    expectedVersionId: state.receipt?.versionId ?? null, ...(parentBitId ? { parentBitId, parentVersionId } : {}) };
  state.pending = input; atomic(statePath(directory), state);
  let receipt;
  try { receipt = await request(config.url, `/v1/publishing/bits/${state.bit.id}/versions`, { bearer, body: draft(input, artifact.files) }); }
  catch (error) {
    if (!outcomeUnknown(error)) { state.rejected = { input, code: error.code }; delete state.pending; atomic(statePath(directory), state); }
    throw error;
  }
  state.receipt = receipt; state.lastInput = input; delete state.pending;
  saveBinding(directory, state, caption); atomic(statePath(directory), state);
  if (receipt.draft) return claimReceipt(receipt, state);
  const live = await fetch(receipt.runtimeUrl, { redirect: 'error', signal: AbortSignal.timeout(15_000) }).then(r => r.ok).catch(() => false);
  return { ...claimReceipt(receipt, state), contentVerified: live, ...(live ? {} : { recovery: 'Publication committed; its public content could not be verified. Run status, never create a duplicate.' }) };
}
// The local preview opens the bit as the feed does: preview.html in its
// 390×520 box and index.html open at 390×693, side by side on one page at
// /__differ/, each page given a stand-in for the SDK the content Worker
// injects. Bundles cannot use __differ/, so its pages never shadow a file.
export function preview(directory, port = 0) {
  const artifact = pack(directory); const files = new Map(artifact.files.map(f => [f.path, Buffer.from(f.content, 'base64')]));
  if (files.has('rules.html')) throw problem('runtime_preview_required', 'This bit uses shared document state.', 'Use a pagelike runtime preview; this local file server cannot verify shared writes or participation.');
  const page = previewPage({ preview: files.has('preview.html') });
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const send = (type, body) => { response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); response.end(request.method === 'HEAD' ? undefined : body); };
    let path;
    try { path = decodeURIComponent(url.pathname.slice(1)) || 'index.html'; } catch { path = ''; }
    if (!['GET', 'HEAD'].includes(request.method)) path = '';
    if (path === '__differ/') return send(mimeTypes['.html'], page);
    if (path === '__differ/sdk.js') return send(mimeTypes['.js'], sdkStandIn);
    if (!files.has(path)) { response.writeHead(404); response.end('Not found'); return; }
    const ext = '.' + path.split('.').pop().toLowerCase();
    // As the content Worker does, every page a browser opens or frames gets
    // the SDK first in its head; a bit's own fetch of HTML is left alone.
    const framed = ext === '.html' && ['document', 'iframe'].includes(request.headers['sec-fetch-dest']);
    send(mimeTypes[ext], framed ? withSDK(files.get(path)) : files.get(path));
  });
  server.listen(port, '127.0.0.1');
  return { server, mount: '/__differ/', pages: files.has('preview.html') ? ['index.html', 'preview.html'] : ['index.html'] };
}
const sdkTag = '<script src="/__differ/sdk.js"></script>';
function withSDK(bytes) {
  const html = bytes.toString('utf8');
  const head = /<head\b[^>]*>/i.exec(html);
  return head ? html.slice(0, head.index + head[0].length) + sdkTag + html.slice(head.index + head[0].length) : sdkTag + html;
}
