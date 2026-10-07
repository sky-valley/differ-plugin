import { lstatSync, readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { problem, connectionError } from './diagnostics.mjs';

const defaultPublisher = 'https://publish.getdiffer.com';
const client = 'differ-plugin';
const reconnect = 'Run connect. Guest publishing requires an explicit disconnect first.';
export const configPath = () => process.env.DIFFER_CONFIG || join(homedir(), '.config', 'differ', 'publisher.json');
export function atomic(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' }); renameSync(temp, path);
}
function saved() {
  if (!existsSync(configPath())) return {};
  const stat = lstatSync(configPath());
  if (!stat.isFile() || stat.mode & 0o077) throw problem('unsafe_credentials', 'Differ configuration must be a private regular file (mode 600).', 'Restrict its permissions before continuing.');
  return JSON.parse(readFileSync(configPath(), 'utf8'));
}
function origin(value) {
  const parsed = new URL(value);
  if (parsed.origin !== value || parsed.username || parsed.password || !(parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname)))) throw problem('unsafe_endpoint', 'Use an HTTPS origin or loopback HTTP.', 'Correct the publishing URL.');
  return value;
}
// The publisher is chosen by the environment, never by saved configuration. A
// saved connection only records which publisher its tokens belong to.
export const publisher = () => origin(process.env.DIFFER_PUBLISH_URL || defaultPublisher);
export function configuration() {
  const config = saved(); const url = publisher();
  if (config.mode === 'connected' && config.url !== url) throw problem('target_changed', 'Your connection belongs to another publisher.', 'Connect separately to the intended publisher.');
  if (config.mode && !['guest', 'connected'].includes(config.mode))
    throw problem('unsupported_configuration', 'This publishing configuration is not recognized.', 'Connect your account, or disconnect for guest publishing.');
  return { ...config, url, mode: config.mode ?? 'guest', token: config.accessToken };
}
// Control reports stable codes. The helper owns what a creator does next.
const recoveries = {
  reconnect_required: reconnect,
  owner_conflict: 'Connect the account that owns this post, or publish your own version as a diff.',
  revision_conflict: 'Compare get-post ID with your files, then deliberately bind DIR --post ID and publish again.',
  creation_expired: 'Unclaimed guest posts expire after 24 hours. Publish again with --new to start a new post.',
};
// Publishing errors are {code, message}; OAuth errors are {error, error_description}.
// A bearer travels only in the Authorization header, never in a URL or body.
export async function request(url, path, { bearer, body } = {}) {
  let response;
  try {
    response = await fetch(url + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(45_000),
      headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) { throw connectionError(error, body === undefined ? 'account' : 'publication', url + path); }
  let data;
  try { data = await response.json(); } catch { throw problem('invalid_response', `Publisher returned non-JSON (HTTP ${response.status}).`, 'Keep your pending request and retry later.', { status: response.status }); }
  if (!response.ok) {
    const code = data.code || data.error || 'publisher_error';
    throw problem(code, data.message || data.error_description || `Publisher returned ${response.status}.`, recoveries[code] || 'Keep your files and reconnect if needed. Never silently change publishing identity.', { status: response.status });
  }
  return data;
}
function connectionLock() {
  const path = configPath() + '.lock'; mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try { writeFileSync(path, String(process.pid), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let active = true;
    try { process.kill(Number(readFileSync(path, 'utf8')), 0); } catch (e) { if (e.code === 'ESRCH') active = false; }
    if (!active) { unlinkSync(path); return connectionLock(); }
    throw problem('connection_busy', 'Another Differ process is updating this connection.', 'Retry shortly.');
  }
  return () => unlinkSync(path);
}
// A connection is one publisher's rotating grant for one creator handle.
const connection = (url, tokens) => ({ url, mode: 'connected', accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000 });
export async function activeConfiguration() {
  let config = configuration();
  if (config.mode !== 'connected' || config.expiresAt > Date.now() + 30_000) return config;
  const unlock = connectionLock();
  try {
    config = configuration();
    if (config.mode !== 'connected' || config.expiresAt > Date.now() + 30_000) return config;
    let tokens;
    try { tokens = await request(config.url, '/oauth/token', { body: { grant_type: 'refresh_token', client_id: client, refresh_token: config.refreshToken, resource: `${config.url}/mcp` } }); }
    catch (error) {
      if (error.code === 'invalid_grant') throw problem('reconnect_required', 'Your Differ connection expired or was revoked.', reconnect);
      throw error;
    }
    atomic(configPath(), { ...connection(config.url, tokens), accountUsername: config.accountUsername });
    return configuration();
  } finally { unlock(); }
}
export async function connect() {
  const url = publisher(); const unlock = connectionLock();
  try {
    const config = saved();
    const device = await request(url, '/oauth/device', { body: { client_id: client, resource: `${url}/mcp`, scope: 'profile posts:write' } });
    // The request remembers its publisher; any current connection stays usable until approval.
    atomic(configPath(), { ...config, pendingConnection: { url, deviceCode: device.device_code, expiresAt: Date.now() + device.expires_in * 1000, nextPollAt: Date.now() + device.interval * 1000 } });
    return { state: 'awaiting_approval', url: device.verification_uri_complete, code: device.user_code, expiresIn: device.expires_in,
      instruction: 'Open this private link, check the code, sign in and approve. Then run connection-status. This connects future publishing; it does not claim earlier posts.' };
  } finally { unlock(); }
}
export async function connectionStatus() {
  const unlock = connectionLock();
  try {
    const config = saved(); const pending = config.pendingConnection;
    if (!pending) return config.mode === 'connected' ? { state: 'connected', username: config.accountUsername } : { state: 'guest' };
    if (pending.expiresAt <= Date.now()) throw problem('connection_expired', 'This connection request expired.', 'Run connect again.');
    if (pending.nextPollAt > Date.now()) return { state: 'awaiting_approval', retryAfter: Math.ceil((pending.nextPollAt - Date.now()) / 1000) };
    pending.nextPollAt = Date.now() + 5000; atomic(configPath(), config);
    let tokens;
    try { tokens = await request(pending.url, '/oauth/token', { body: { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', client_id: client, device_code: pending.deviceCode, resource: `${pending.url}/mcp` } }); }
    catch (error) { if (['authorization_pending', 'slow_down'].includes(error.code)) return { state: 'awaiting_approval', retryAfter: 5 }; throw error; }
    // Save immediately so a failure reading the account cannot lose tokens.
    const connected = connection(pending.url, tokens);
    atomic(configPath(), connected);
    const account = await request(pending.url, '/v1/publishing/account', { bearer: connected.accessToken });
    atomic(configPath(), { ...connected, accountUsername: account.username });
    return { state: 'connected', username: account.username, notice: 'Future posts are yours. Earlier guest posts still need their own claim link.' };
  } finally { unlock(); }
}
export async function disconnect() {
  const unlock = connectionLock();
  try {
    const config = saved();
    if (config.mode === 'connected') await request(config.url, '/oauth/revoke', { body: { client_id: client, token: config.refreshToken } });
    atomic(configPath(), { mode: 'guest' });
    return { state: 'guest', notice: 'Disconnected. New posts are guest posts until you connect again. Your existing posts keep their ownership.' };
  } finally { unlock(); }
}
