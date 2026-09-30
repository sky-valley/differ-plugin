import { lstatSync, readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { createServer } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { validateArtifact, mimeTypes, safePath, limits } from './artifact.mjs';
import { problem } from './diagnostics.mjs';
import { contentDirectory, contentTitle, bindingName, readBinding, assetReport } from './project.mjs';

import { atomic, configuration, activeConfiguration, request } from './connection.mjs';
export { configuration };
export { connect, connectionStatus, disconnect } from './connection.mjs';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
// The connected creator, read with the access token. Control refuses a token it
// cannot authenticate (reconnect_required); nothing falls back to guest.
const account = config => config.mode === 'connected' ? request(config.url, '/v1/publishing/account', { bearer: config.token }) : null;
const publicState = (config, postId) => request(config.url, `/v1/publishing/posts/${postId}`);
export async function doctor() {
  const config = await activeConfiguration();
  const capabilities = await request(config.url, '/v1/publishing/capabilities');
  return { ready: true, mode: config.mode, url: config.url, ...await account(config), limits: capabilities.limits,
    notice: config.mode === 'guest' ? 'Ready without sign-in. Posts are live by link for 24 hours; show the private claim link and deadline after publishing. Run connect to publish as yourself.' : 'New posts are automatically yours. Earlier guest posts need their own claim link.' };
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
      if (entry.isDirectory()) { walk(full); continue; }
      if (!stat.isFile() || !safePath(name)) throw problem('unsupported_file', `Unsupported static asset: ${name}.`, 'Select the built content output, not source or server code.');
      bytes += stat.size;
      if (bytes > limits.bytes || files.length >= limits.files) throw problem('artifact_too_large', 'Post exceeds 20 MiB or 256 files.', 'Compress media or remove unused assets.');
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
function stateFor(directory, config, rebinding = false) {
  const binding = readBinding(directory);
  if (binding && binding.publisher !== config.url) throw problem('target_changed', 'The portable binding names another publisher.', 'Use the intended publisher configuration; never silently retarget this post.');
  const path = statePath(directory); const state = existsSync(path) ? read(path) : { version: 1, url: config.url,
    ...(binding ? { receipt: { postId: binding.postId, revisionId: binding.revisionId } } : {}) };
  if (state.url !== config.url) throw problem('target_changed', 'This content is bound to another publisher.', 'Keep its receipt. Use a separate directory for a different destination.');
  if (!rebinding && !state.pending && binding && state.receipt && (binding.postId !== state.receipt.postId || binding.revisionId !== state.receipt.revisionId)) throw problem('binding_conflict', 'Portable and local state name different posts/revisions.', 'Review both identities; deliberately bind only after reconciling pending work.');
  return state;
}
function saveBinding(directory, state, title) {
  const receipt = state.receipt;
  atomic(join(directory, bindingName), { version: 1, publisher: state.url, postId: receipt.postId, revisionId: receipt.revisionId,
    ...(title ? { title } : {}) });
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
export async function publish(directory, title, { newPost = false, parentPostId, parentRevisionId } = {}) {
  directory = contentDirectory(directory); title = contentTitle(directory, title);
  if (!!parentPostId !== !!parentRevisionId) throw problem('invalid_remix', 'Remix requires source post and revision IDs.', 'Read the source post first.');
  const config = await activeConfiguration(); const artifact = pack(directory); const unlock = lock(directory);
  try { return await publishCreator(config, stateFor(directory, config), directory, artifact, title, { newPost, parentPostId, parentRevisionId }); }
  finally { unlock(); }
}
export async function getPost(postId) {
  const state = await publicState(configuration(), postId);
  if (!state.post) throw problem('post_not_ready', 'This post has not been published.', 'Finish the first upload.');
  return state.post;
}
export async function bind(directory, postId) {
  directory = contentDirectory(directory);
  const config = await activeConfiguration(); const unlock = lock(directory);
  try {
    const state = stateFor(directory, config, true);
    if (state.pending) throw problem('pending_publication', 'Reconcile the pending publication first.', 'Run status.');
    const post = await getPost(postId);
    if (state.creation && state.creation.id !== post.id) {
      state.previous = [...(state.previous ?? []), { creation: state.creation, receipt: state.receipt, lastInput: state.lastInput }];
      delete state.creation;
    }
    state.receipt = { postId: post.id, revisionId: post.currentRevisionId };
    delete state.lastInput;
    atomic(statePath(directory), state);
    saveBinding(directory, state, post.revisions.find(r => r.id === post.currentRevisionId)?.title);
    return { bound: true, postId: post.id, expectedRevisionId: post.currentRevisionId, recovery: 'Local files were not changed. Publish only after deliberately reconciling this draft with the current post.' };
  } finally { unlock(); }
}
// The bearer decides who a publication acts for: the connected creator for its
// own drafts and for guest drafts it has since claimed, otherwise the guest
// upload pass. A claimed post is the account's when Control names its username.
// A caller that already read the account passes it as me.
async function bearerFor(config, state, me) {
  const creation = state.creation;
  if (me === undefined) me = await account(config);
  if (creation.mode === 'connected') {
    if (me?.username !== creation.accountUsername) throw problem('account_changed', 'This draft belongs to a different connected creator.', 'Reconnect that account, or deliberately create a separate remix.');
    return config.token;
  }
  if (me) {
    const current = await publicState(config, creation.id);
    if (current.claimed) {
      if (current.post?.username !== me.username) throw problem('owner_conflict', 'This claimed post belongs to another creator.', 'Connect its owner or create a remix.');
      creation.mode = 'connected'; creation.accountUsername = me.username;
      return config.token;
    }
  }
  return creation.uploadToken;
}
function claimReceipt(receipt, state) {
  if (receipt.draft) return { ...receipt, contentVerified: false, notice: 'Saved as a draft, not published yet. Open the returned url to preview and publish it.' };
  return receipt.state === 'succeeded' && !receipt.claimed && state.creation?.claimUrl
    ? { ...receipt, claimUrl: state.creation.claimUrl, claimLinkPrivate: true } : receipt;
}
// The path names the post and the bearer its author; the body carries neither.
const draft = ({ requestId, title, expectedRevisionId, parentPostId, parentRevisionId }, files) =>
  ({ requestId, title, expectedRevisionId, files, ...(parentPostId ? { parentPostId, parentRevisionId } : {}) });
// Control refuses with a 4xx before committing anything, so that request is
// dropped. A retry refused for its credential or a busy upload slot may follow
// an attempt that did commit; those, network failures and 5xx keep the request.
const outcomeUnknown = error => !(error.status >= 400 && error.status < 500) || ['reconnect_required', 'upload_busy'].includes(error.code);
async function creatorStatus(config, state, directory, me) {
  if (state.pending && !state.creation) throw problem('invalid_state', 'The pending publication has no saved publishing identity.', 'Keep the private journal and recover its publishing identity before retrying.');
  if (!state.creation) return state.receipt ? { state: 'bound', ...await getPost(state.receipt.postId) } : { state: 'local', mode: config.mode };
  const input = state.pending ?? state.lastInput;
  if (!input) return { state: 'reserved', postId: state.creation.id };
  const receipt = await request(config.url, `/v1/publishing/posts/${state.creation.id}/operations/${input.requestId}`, { bearer: await bearerFor(config, state, me) });
  if (receipt.state === 'succeeded') {
    state.receipt = receipt; state.lastInput = input; delete state.pending;
    saveBinding(directory, state, input.title); atomic(statePath(directory), state);
  }
  return claimReceipt(receipt, state);
}
async function publishCreator(config, state, directory, artifact, title, { newPost, parentPostId, parentRevisionId }) {
  const me = await account(config);
  if (state.pending) {
    const recovered = await creatorStatus(config, state, directory, me);
    if (recovered.state === 'succeeded') return { ...recovered, recovered: true, recovery: 'Recovered the previous upload. Run publish again only if more edits were requested.' };
    if (state.pending.artifactId !== artifact.artifactId || state.pending.title !== title) throw problem('pending_changed', 'Pending publication belongs to different content.', 'Restore the pending content/title and retry; never discard uncertain state.');
  }
  if (!state.pending && (newPost || parentPostId)) {
    state.previous = [...(state.previous ?? []), { creation: state.creation, receipt: state.receipt, lastInput: state.lastInput }];
    delete state.creation; delete state.receipt; delete state.lastInput;
  }
  if (!state.creation) {
    if (state.receipt && !me) throw problem('ownership_required', 'A public post binding does not grant editing rights.', 'Use the original private workspace or connect the owner. To make your own version, create a remix.');
    state.creation = { id: state.receipt?.postId ?? randomUUID(), mode: me ? 'connected' : 'guest',
      ...(me ? { accountUsername: me.username } : { ownerProof: randomBytes(32).toString('hex') }) };
    atomic(statePath(directory), state);
  }
  if (state.creation.mode === 'guest' && !state.creation.uploadToken) {
    // The proof is saved first, so a lost response is recovered by reserving again.
    const reserved = await request(config.url, `/v1/publishing/posts/${state.creation.id}/reservation`, { body: { ownerProof: state.creation.ownerProof } });
    state.creation.uploadToken = reserved.uploadToken; state.creation.claimUrl = reserved.claimUrl;
    atomic(statePath(directory), state);
  }
  if (!state.pending && state.receipt?.artifactId === artifact.artifactId && state.lastInput?.title === title) return creatorStatus(config, state, directory, me);
  const bearer = await bearerFor(config, state, me);
  const input = state.pending ?? { requestId: randomUUID(), artifactId: artifact.artifactId, title,
    expectedRevisionId: state.receipt?.revisionId ?? null, ...(parentPostId ? { parentPostId, parentRevisionId } : {}) };
  state.pending = input; atomic(statePath(directory), state);
  let receipt;
  try { receipt = await request(config.url, `/v1/publishing/posts/${state.creation.id}/versions`, { bearer, body: draft(input, artifact.files) }); }
  catch (error) {
    if (!outcomeUnknown(error)) { state.rejected = { input, code: error.code }; delete state.pending; atomic(statePath(directory), state); }
    throw error;
  }
  state.receipt = receipt; state.lastInput = input; delete state.pending;
  saveBinding(directory, state, title); atomic(statePath(directory), state);
  if (receipt.draft) return claimReceipt(receipt, state);
  const live = await fetch(receipt.runtimeUrl, { redirect: 'error', signal: AbortSignal.timeout(15_000) }).then(r => r.ok).catch(() => false);
  return { ...claimReceipt(receipt, state), contentVerified: live, ...(live ? {} : { recovery: 'Publication committed; its public content could not be verified. Run status, never create a duplicate.' }) };
}
export function preview(directory, port = 0) {
  const artifact = pack(directory); const files = new Map(artifact.files.map(f => [f.path, Buffer.from(f.content, 'base64')]));
  if (files.has('rules.html')) throw problem('runtime_preview_required', 'This post uses shared document state.', 'Use a pagelike runtime preview; this local file server cannot verify shared writes or participation.');
  const mount = '/';
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    let path;
    try { path = decodeURIComponent(url.pathname.slice(mount.length)) || 'index.html'; } catch { path = ''; }
    if (!['GET', 'HEAD'].includes(request.method) || !url.pathname.startsWith(mount) || !files.has(path)) { response.writeHead(404); response.end('Not found'); return; }
    const ext = '.' + path.split('.').pop().toLowerCase();
    response.writeHead(200, { 'Content-Type': mimeTypes[ext], 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : files.get(path));
  });
  server.listen(port, '127.0.0.1');
  return { server, mount };
}
