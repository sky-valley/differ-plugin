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
  const requests = [], bits = new Map(), grants = new Map(), devices = new Map(), failures = [];
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
    bit: id => bits.get(id),
    // Deliberately not derivable from capabilities: the plugin must use the one it was given.
    claimUrl: (id, proof) => `https://claims.test/private/${id}#${proof}`,
    failNextVersion(status, code, { commit = false } = {}) { failures.push({ status, code, commit }); },
    claim(id, handle, caption) { const bit = bits.get(id); bit.owner = handle; bit.versions.at(-1).caption = caption; },
    // Another holder of the bit's credential publishes behind the plugin's back.
    advance(id) { bits.get(id).versions.push({ id: randomUUID(), caption: 'Elsewhere', createdAt: new Date().toISOString() }); },
    approve(handle) { [...devices.values()].at(-1).handle = handle; },
    deny() { [...devices.values()].at(-1).denied = true; },
    revokeAll() { for (const grant of grants.values()) grant.live = false; },
    close: () => new Promise(resolve => server.close(resolve)),
  };
  const challenge = () => ({ 'www-authenticate': `Bearer resource_metadata="${control.origin}/.well-known/oauth-protected-resource", scope="profile bits:write"` });
  const bitURL = bit => bit.owner ? `https://player.test/@${bit.owner}/bit/${bit.id}` : `https://player.test/bit/${bit.id}`;
  const runtimeURL = (id, version) => `${control.origin}/runtime/${id}/v/${version}/`;

  function agent(bearer) {
    const grant = grants.get(bearer);
    if (!bearer?.startsWith('dfa_') || grant?.kind !== 'access' || !grant.live) reject(401, 'reconnect_required', 'Your agent connection expired or was revoked. Reconnect to publish as yourself.', challenge());
    return grant.handle;
  }
  function author(bearer, bit) {
    if (!bearer) reject(401, 'unauthorized', 'Supply this bit\'s upload pass, or connect your account to publish as yourself.', challenge());
    if (bearer.startsWith('dfa_')) {
      const handle = agent(bearer);
      if (bit && bit.owner !== handle) reject(403, 'owner_conflict', 'This bit belongs to another creator.');
      return { handle };
    }
    if (!bit) reject(404, 'bit_not_found', 'Bit not found.');
    if (bearer !== bit.uploadToken) reject(401, 'invalid_upload_pass', 'The upload pass is invalid.');
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
  // Receipts carry no per-version page: url is the bit's page (or its draft).
  const receiptView = (bit, receipt) => receipt.draft
    ? { ...receipt, claimed: true, url: `${bitURL(bit)}/draft`, expiresAt: bit.draft.expiresAt }
    : { ...receipt, runtimeUrl: runtimeURL(bit.id, receipt.versionId), url: bitURL(bit), ...(bit.owner ? { claimed: true } : { expiresAt: bit.expiresAt }) };
  // Control's caption rule, checked only when a caption is sent: an upload's
  // caption is optional (the agent's suggestion), as nothing here sets publish.
  const validCaption = caption => typeof caption === 'string' && !!caption.trim() && [...caption].length <= 200 && Buffer.byteLength(caption) <= 800
    && !/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(caption) && caption.split('\n').length <= 4;
  function publish(id, headers, body) {
    const bit = bits.get(id); const as = author(bearerOf(headers), bit);
    strict(headers, body, ['requestId', 'caption', 'expectedVersionId', 'files', 'parentBitId', 'parentVersionId', 'publish']);
    if (!uuid.test(body.requestId) || !Array.isArray(body.files) || !body.files.every(file => only(file, ['path', 'content']))) reject(400, 'invalid_publication', 'Supply valid bit, request and expected version identifiers.');
    if (body.caption !== undefined && !validCaption(body.caption)) reject(400, 'invalid_caption', 'Supply a caption of 1–200 characters.');
    const failure = failures.shift();
    if (failure && !failure.commit) reject(failure.status, failure.code, 'Injected failure.');
    const artifact = artifactId(body.files);
    const fingerprint = JSON.stringify([artifact, body.caption ?? '', body.expectedVersionId, body.parentBitId ?? '', body.parentVersionId ?? '']);
    const saved = bit?.receipts.get(body.requestId);
    if (saved) {
      if (saved.fingerprint !== fingerprint) reject(409, 'request_conflict', 'This request identifier belongs to a different publication.');
      return receiptView(bit, saved.receipt);
    }
    if (as.guest && bit.owner) reject(403, 'owner_conflict', 'This bit was claimed. Publish its changes as its owner.');
    if ((body.expectedVersionId ?? null) !== (bit?.draft?.id ?? bit?.versions.at(-1)?.id ?? null)) reject(409, 'version_conflict', 'The bit changed after this draft.');
    const target = bit ?? { id, owner: as.handle, versions: [], receipts: new Map() };
    bits.set(id, target);
    const versionId = randomUUID();
    const version = { id: versionId, caption: body.caption ?? '', createdAt: new Date().toISOString() };
    if (as.handle) target.draft = { ...version, expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString() };
    else target.versions.push(version);
    const receipt = { state: 'succeeded', requestId: body.requestId, bitId: id, versionId, artifactId: artifact, ...(as.handle ? { draft: true } : {}) };
    target.receipts.set(body.requestId, { fingerprint, receipt });
    if (failure) reject(failure.status, failure.code, 'Injected failure after commit.');
    return receiptView(target, receipt);
  }
  function operation(id, request, headers) {
    const bit = bits.get(id); author(bearerOf(headers), bit);
    const saved = bit?.receipts.get(request);
    return saved ? receiptView(bit, saved.receipt) : { state: 'unknown', requestId: request };
  }
  function publicState(id) {
    const bit = bits.get(id);
    if (!bit) reject(404, 'bit_not_found', 'Bit not found.');
    const current = bit.versions.at(-1);
    return { id, ready: !!current, claimed: !!bit.owner, ...(bit.owner ? {} : { expiresAt: bit.expiresAt }), url: bitURL(bit),
      bit: current ? { id, ...(bit.owner ? { handle: bit.owner } : {}), title: '', currentVersionId: current.id,
        versions: bit.versions.map(v => ({ id: v.id, caption: v.caption, runtimeUrl: runtimeURL(id, v.id), createdAt: v.createdAt })), commentCount: 0 } : null };
  }
  function issue(handle) {
    const access = `dfa_${hex()}`, refresh = `dfr_${hex()}`;
    grants.set(access, { handle, kind: 'access', live: true }); grants.set(refresh, { handle, kind: 'refresh', live: true });
    return { access_token: access, token_type: 'Bearer', expires_in: 900, refresh_token: refresh, scope: 'profile bits:write' };
  }
  function token(headers, body) {
    if (headers['content-type'] !== 'application/json' || !only(body, ['grant_type', 'client_id', 'device_code', 'refresh_token', 'resource', 'scope'])) oauthReject(400, 'invalid_request', 'Send OAuth parameters as strings.');
    if (body.resource !== `${control.origin}/mcp`) oauthReject(400, 'invalid_target', 'Use the Differ MCP resource.');
    if (body.grant_type === 'refresh_token') {
      const grant = grants.get(body.refresh_token);
      if (grant?.kind !== 'refresh' || !grant.live || body.client_id !== 'differ-plugin') oauthReject(400, 'invalid_grant', 'Reconnect your agent.');
      grant.live = false;
      return issue(grant.handle);
    }
    if (body.grant_type !== deviceGrant) oauthReject(400, 'unsupported_grant_type', 'Unsupported grant type.');
    const device = devices.get(body.device_code);
    if (!device || device.used || body.client_id !== 'differ-plugin') oauthReject(400, 'invalid_grant', 'Authorization expired or was already used.');
    if (device.denied) oauthReject(400, 'access_denied', 'Connection declined.');
    if (!device.handle) oauthReject(400, 'authorization_pending', 'Finish sign-in in your browser.');
    device.used = true;
    return issue(device.handle);
  }
  const bearerOf = headers => /^Bearer (.+)$/.exec(headers.authorization ?? '')?.[1];

  function route(method, path, headers, body) {
    let match;
    if (method === 'GET' && path === '/v1/publishing/capabilities') return [200, { playerOrigin: 'https://player.test', limits: { files: 256, bytes: 20 << 20, wireBytes: 29 << 20 } }];
    if (method === 'GET' && path === '/v1/publishing/account') return [200, { handle: agent(bearerOf(headers)) }];
    if (method === 'POST' && (match = /^\/v1\/publishing\/bits\/([^/]+)\/reservation$/.exec(path))) {
      strict(headers, body, ['ownerProof']);
      const [, id] = match;
      if (!uuid.test(id) || !/^[a-f0-9]{64}$/.test(body.ownerProof)) reject(400, 'invalid_reservation', 'Supply a bit identifier and a 64-character owner proof.');
      const existing = bits.get(id);
      if (existing && existing.ownerProof !== body.ownerProof) reject(409, 'bit_conflict', 'That bit already exists.');
      const bit = existing ?? { id, ownerProof: body.ownerProof, uploadToken: hex(), expiresAt: new Date(Date.now() + 86_400_000).toISOString(), versions: [], receipts: new Map() };
      bits.set(id, bit);
      return [201, { ...publicState(id), uploadUrl: `${control.origin}/v1/publishing/bits/${id}/versions`, uploadToken: bit.uploadToken, claimUrl: control.claimUrl(id, bit.ownerProof) }];
    }
    if (method === 'POST' && (match = /^\/v1\/publishing\/bits\/([^/]+)\/versions$/.exec(path))) return [200, publish(match[1], headers, body)];
    if (method === 'GET' && (match = /^\/v1\/publishing\/bits\/([^/]+)\/operations\/([^/]+)$/.exec(path))) return [200, operation(match[1], match[2], headers)];
    if (method === 'GET' && (match = /^\/v1\/publishing\/bits\/([^/]+)$/.exec(path))) return [200, publicState(match[1])];
    if (method === 'POST' && path === '/oauth/device') {
      if (!only(body, ['client_id', 'resource', 'scope']) || body.client_id !== 'differ-plugin') oauthReject(400, 'invalid_client', 'Device login is available for the Differ creator plugin.');
      if (body.resource !== `${control.origin}/mcp` || body.scope !== 'profile bits:write') oauthReject(400, 'invalid_target', 'Use the Differ MCP resource.');
      const code = hex(), id = hex();
      devices.set(code, {});
      return [200, { device_code: code, user_code: 'ABCDE12345', verification_uri: 'https://player.test/connect', verification_uri_complete: `https://player.test/connect/${id}`, expires_in: 600, interval: 0 }];
    }
    if (method === 'POST' && path === '/oauth/token') return [200, token(headers, body)];
    if (method === 'POST' && path === '/oauth/revoke') {
      const grant = grants.get(body?.token);
      if (grant && body.client_id === 'differ-plugin') for (const other of grants.values()) if (other.handle === grant.handle) other.live = false;
      return [200, {}];
    }
    if (method === 'GET' && path.startsWith('/runtime/')) return [200, null];
    reject(404, 'not_found', 'No such route.');
  }
  return control;
}
