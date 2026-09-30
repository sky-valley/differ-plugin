import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

// An in-process stand-in for Control's publishing surface (gdiffer
// services/control/internal/content). It enforces the parts of the wire
// contract the plugin depends on (routes, bearer rules, strict JSON bodies,
// receipts and OAuth errors) and records every request it receives.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const deviceGrant = 'urn:ietf:params:oauth:grant-type:device_code';
class Rejection { constructor(status, body, headers = {}) { Object.assign(this, { status, body, headers }); } }
const reject = (status, code, message, headers) => { throw new Rejection(status, { code, message }, headers); };
const oauthReject = (status, error, description) => { throw new Rejection(status, { error, error_description: description }); };
const hex = () => randomBytes(32).toString('hex');
const sha256 = data => createHash('sha256').update(data).digest('hex');
const only = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));

export async function fakeControl() {
  const requests = [], posts = new Map(), grants = new Map(), devices = new Map(), failures = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString();
      let body;
      try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
      const path = new URL(req.url, control.origin).pathname;
      const entry = { method: req.method, path, authorization: req.headers.authorization, contentType: req.headers['content-type'], body };
      requests.push(entry);
      let status = 200, value, headers = {};
      try { [status, value] = route(req.method, path, req.headers, body); }
      catch (error) {
        ({ status, body: value, headers } = error instanceof Rejection ? error : { status: 500, body: { code: 'fake_failed', message: String(error) }, headers: {} });
      }
      Object.assign(entry, { status, response: value });
      if (path.startsWith('/runtime/')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1>live</h1>'); return; }
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(value));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const control = {
    origin: `http://127.0.0.1:${server.address().port}`, requests,
    // Requests the plugin made, without the public content check after publishing.
    calls: () => requests.filter(r => !r.path.startsWith('/runtime/')),
    reset() { requests.length = 0; },
    post: id => posts.get(id),
    // Deliberately not derivable from capabilities: the plugin must use the one it was given.
    claimUrl: (id, proof) => `https://claims.test/private/${id}#${proof}`,
    failNextVersion(status, code, { commit = false } = {}) { failures.push({ status, code, commit }); },
    claim(id, username) { posts.get(id).owner = username; },
    // Another holder of the post's credential publishes behind the plugin's back.
    advance(id) { posts.get(id).versions.push({ id: randomUUID(), title: 'Elsewhere', createdAt: new Date().toISOString() }); },
    approve(username) { [...devices.values()].at(-1).username = username; },
    deny() { [...devices.values()].at(-1).denied = true; },
    revokeAll() { for (const grant of grants.values()) grant.live = false; },
    close: () => new Promise(resolve => server.close(resolve)),
  };
  const challenge = () => ({ 'www-authenticate': `Bearer resource_metadata="${control.origin}/.well-known/oauth-protected-resource", scope="profile posts:write"` });
  const postURL = post => post.owner ? `https://player.test/@${post.owner}/post/${post.id}` : `https://player.test/post/${post.id}`;
  const runtimeURL = (id, revision) => `${control.origin}/runtime/${id}/revision/${revision}/`;

  function agent(bearer) {
    const grant = grants.get(bearer);
    if (!bearer?.startsWith('dfa_') || grant?.kind !== 'access' || !grant.live) reject(401, 'reconnect_required', 'Your agent connection expired or was revoked. Reconnect to publish as yourself.', challenge());
    return grant.username;
  }
  function author(bearer, post) {
    if (!bearer) reject(401, 'unauthorized', 'Supply this post\'s upload pass, or connect your account to publish as yourself.', challenge());
    if (bearer.startsWith('dfa_')) {
      const username = agent(bearer);
      if (post && post.owner !== username) reject(403, 'owner_conflict', 'This post belongs to another creator.');
      return { username };
    }
    if (!post) reject(404, 'creation_not_found', 'This creation was not found.');
    if (bearer !== post.uploadToken) reject(401, 'invalid_upload_pass', 'The upload pass is invalid.');
    return { guest: true };
  }
  function strict(headers, body, keys) {
    if (headers['content-type'] !== 'application/json') reject(415, 'content_type', 'Expected application/json.');
    // Control decodes with DisallowUnknownFields, nested structs included.
    if (!only(body, keys)) reject(400, 'invalid_json', 'Supply one valid JSON request.');
  }
  function artifactId(files) {
    const manifest = { files: {} };
    for (const file of [...files].sort((a, b) => a.path < b.path ? -1 : 1)) manifest.files[file.path] = sha256(Buffer.from(file.content, 'base64'));
    return sha256(JSON.stringify(manifest));
  }
  const receiptView = (post, receipt) => receipt.draft
    ? { ...receipt, claimed: true, url: `${postURL(post)}/draft`, expiresAt: post.draft.expiresAt }
    : { ...receipt, runtimeUrl: runtimeURL(post.id, receipt.revisionId), url: postURL(post),
      revisionUrl: `${postURL(post)}/revision/${receipt.revisionId}`, ...(post.owner ? { claimed: true } : { expiresAt: post.expiresAt }) };
  function publish(id, headers, body) {
    const post = posts.get(id); const as = author(bearerOf(headers), post);
    strict(headers, body, ['requestId', 'title', 'expectedRevisionId', 'files', 'parentPostId', 'parentRevisionId']);
    if (!uuid.test(body.requestId) || !Array.isArray(body.files) || !body.files.every(file => only(file, ['path', 'content']))) reject(400, 'invalid_publication', 'Supply valid post, request and expected revision identifiers.');
    const failure = failures.shift();
    if (failure && !failure.commit) reject(failure.status, failure.code, 'Injected failure.');
    const artifact = artifactId(body.files);
    const fingerprint = JSON.stringify([artifact, body.title, body.expectedRevisionId, body.parentPostId ?? '', body.parentRevisionId ?? '']);
    const saved = post?.receipts.get(body.requestId);
    if (saved) {
      if (saved.fingerprint !== fingerprint) reject(409, 'request_conflict', 'This request identifier belongs to a different publication.');
      return receiptView(post, saved.receipt);
    }
    if (as.guest && post.owner) reject(403, 'owner_conflict', 'This post was claimed. Publish its changes as its owner.');
    if ((body.expectedRevisionId ?? null) !== (post?.draft?.id ?? post?.versions.at(-1)?.id ?? null)) reject(409, 'revision_conflict', 'The post changed after this draft.');
    const target = post ?? { id, owner: as.username, versions: [], receipts: new Map() };
    posts.set(id, target);
    const revisionId = randomUUID();
    const version = { id: revisionId, title: body.title, createdAt: new Date().toISOString() };
    if (as.username) target.draft = { ...version, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() };
    else target.versions.push(version);
    const receipt = { state: 'succeeded', requestId: body.requestId, postId: id, revisionId, artifactId: artifact, ...(as.username ? { draft: true } : {}) };
    target.receipts.set(body.requestId, { fingerprint, receipt });
    if (failure) reject(failure.status, failure.code, 'Injected failure after commit.');
    return receiptView(target, receipt);
  }
  function operation(id, request, headers) {
    const post = posts.get(id); author(bearerOf(headers), post);
    const saved = post?.receipts.get(request);
    return saved ? receiptView(post, saved.receipt) : { state: 'unknown', requestId: request };
  }
  function publicState(id) {
    const post = posts.get(id);
    if (!post) reject(404, 'post_not_found', 'Post not found.');
    const current = post.versions.at(-1);
    return { id, ready: !!current, claimed: !!post.owner, ...(post.owner ? {} : { expiresAt: post.expiresAt }), url: postURL(post),
      post: current ? { id, ...(post.owner ? { username: post.owner } : {}), currentRevisionId: current.id,
        revisions: post.versions.map(v => ({ id: v.id, title: v.title, runtimeUrl: runtimeURL(id, v.id), createdAt: v.createdAt })) } : null };
  }
  function issue(username) {
    const access = `dfa_${hex()}`, refresh = `dfr_${hex()}`;
    grants.set(access, { username, kind: 'access', live: true }); grants.set(refresh, { username, kind: 'refresh', live: true });
    return { access_token: access, token_type: 'Bearer', expires_in: 900, refresh_token: refresh, scope: 'profile posts:write' };
  }
  function token(headers, body) {
    if (headers['content-type'] !== 'application/json' || !only(body, ['grant_type', 'client_id', 'device_code', 'refresh_token', 'resource', 'scope'])) oauthReject(400, 'invalid_request', 'Send OAuth parameters as strings.');
    if (body.resource !== `${control.origin}/mcp`) oauthReject(400, 'invalid_target', 'Use the Differ MCP resource.');
    if (body.grant_type === 'refresh_token') {
      const grant = grants.get(body.refresh_token);
      if (grant?.kind !== 'refresh' || !grant.live || body.client_id !== 'differ-plugin') oauthReject(400, 'invalid_grant', 'Reconnect your agent.');
      grant.live = false;
      return issue(grant.username);
    }
    if (body.grant_type !== deviceGrant) oauthReject(400, 'unsupported_grant_type', 'Unsupported grant type.');
    const device = devices.get(body.device_code);
    if (!device || device.used || body.client_id !== 'differ-plugin') oauthReject(400, 'invalid_grant', 'Authorization expired or was already used.');
    if (device.denied) oauthReject(400, 'access_denied', 'Connection declined.');
    if (!device.username) oauthReject(400, 'authorization_pending', 'Finish sign-in in your browser.');
    device.used = true;
    return issue(device.username);
  }
  const bearerOf = headers => /^Bearer (.+)$/.exec(headers.authorization ?? '')?.[1];

  function route(method, path, headers, body) {
    let match;
    if (method === 'GET' && path === '/v1/publishing/capabilities') return [200, { playerOrigin: 'https://player.test', limits: { files: 256, bytes: 20 << 20, wireBytes: 29 << 20 } }];
    if (method === 'GET' && path === '/v1/publishing/account') return [200, { username: agent(bearerOf(headers)) }];
    if (method === 'POST' && (match = /^\/v1\/publishing\/posts\/([^/]+)\/reservation$/.exec(path))) {
      strict(headers, body, ['ownerProof']);
      const [, id] = match;
      if (!uuid.test(id) || !/^[a-f0-9]{64}$/.test(body.ownerProof)) reject(400, 'invalid_creation', 'Supply a post identifier and a 64-character owner proof.');
      const existing = posts.get(id);
      if (existing && existing.ownerProof !== body.ownerProof) reject(409, 'creation_conflict', 'That post already exists.');
      const post = existing ?? { id, ownerProof: body.ownerProof, uploadToken: hex(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), versions: [], receipts: new Map() };
      posts.set(id, post);
      return [201, { ...publicState(id), uploadUrl: `${control.origin}/v1/publishing/posts/${id}/versions`, uploadToken: post.uploadToken, claimUrl: control.claimUrl(id, post.ownerProof) }];
    }
    if (method === 'POST' && (match = /^\/v1\/publishing\/posts\/([^/]+)\/versions$/.exec(path))) return [200, publish(match[1], headers, body)];
    if (method === 'GET' && (match = /^\/v1\/publishing\/posts\/([^/]+)\/operations\/([^/]+)$/.exec(path))) return [200, operation(match[1], match[2], headers)];
    if (method === 'GET' && (match = /^\/v1\/publishing\/posts\/([^/]+)$/.exec(path))) return [200, publicState(match[1])];
    if (method === 'POST' && path === '/oauth/device') {
      if (!only(body, ['client_id', 'resource', 'scope']) || body.client_id !== 'differ-plugin') oauthReject(400, 'invalid_client', 'Device login is available for the Differ creator plugin.');
      if (body.resource !== `${control.origin}/mcp` || body.scope !== 'profile posts:write') oauthReject(400, 'invalid_target', 'Use the Differ MCP resource.');
      const code = hex(), id = hex();
      devices.set(code, {});
      return [200, { device_code: code, user_code: 'ABCDE12345', verification_uri: 'https://player.test/connect', verification_uri_complete: `https://player.test/connect/${id}`, expires_in: 600, interval: 0 }];
    }
    if (method === 'POST' && path === '/oauth/token') return [200, token(headers, body)];
    if (method === 'POST' && path === '/oauth/revoke') {
      const grant = grants.get(body?.token);
      if (grant && body.client_id === 'differ-plugin') for (const other of grants.values()) if (other.username === grant.username) other.live = false;
      return [200, {}];
    }
    if (method === 'GET' && path.startsWith('/runtime/')) return [200, null];
    reject(404, 'not_found', 'No such route.');
  }
  return control;
}
