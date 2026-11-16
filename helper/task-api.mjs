import { activeConfiguration } from './connection.mjs';
import { taskError } from './task-store.mjs';

const refusalCode = /^[a-z][a-z0-9_]{0,63}$/;
// A refusal's body is read only for its fixed error code, which is kept only
// when it is a plain identifier.
async function refusalReason(response) {
  const chunks = []; let size = 0;
  try {
    for await (const chunk of response.body) { size += chunk.length; if (size > 4096) return undefined; chunks.push(chunk); }
    const code = JSON.parse(Buffer.concat(chunks).toString('utf8'))?.error;
    return typeof code === 'string' && refusalCode.test(code) ? code : undefined;
  } catch { return undefined; }
}

// Task responses can contain private instructions. Do not pass response bodies
// or transport exceptions to the CLI error formatter.
export async function taskRequest(path, { body, maxBytes = 512 * 1024, refusal = false } = {}) {
  const config = await activeConfiguration();
  if (config.mode !== 'connected') throw taskError('account_connection_required');
  let response;
  try {
    response = await fetch(config.url + '/v1/publishing/agent-tasks' + path, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(45_000),
      headers: { authorization: `Bearer ${config.token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      let reason;
      if (refusal && [409, 422].includes(response.status)) reason = await refusalReason(response);
      else await response.body?.cancel();
      throw Object.assign(taskError(response.status === 401 ? 'reconnect_required' : response.status === 409 ? 'task_conflict' : response.status === 404 ? 'task_unavailable' : 'task_request_failed'), { status: response.status, ...(reason ? { reason } : {}) });
    }
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length; if (size > maxBytes) throw taskError('invalid_task_response'); chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error.recovery) throw error;
    throw taskError('task_request_failed');
  }
}
