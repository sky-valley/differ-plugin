import { activeConfiguration, request } from './connection.mjs';
import { problem } from './diagnostics.mjs';

const invalidCursor = () => problem('invalid_task_cursor', 'The task cursor must be a nonnegative safe integer.', 'Use tasks, or tasks --after with the next value from the previous page.');
export function taskCursor(args) {
  if (args.length === 0) return 0;
  if (args.length !== 2 || args[0] !== '--after' || !/^(0|[1-9]\d*)$/.test(args[1])) throw invalidCursor();
  const after = Number(args[1]);
  if (!Number.isSafeInteger(after)) throw invalidCursor();
  return after;
}

const fields = (value, names) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const taskID = /^agt_[a-f0-9]{64}$/;
const invalidResponse = () => problem('invalid_task_response', 'Control returned an invalid task page.', 'Keep existing local task state and check that the plugin and Control versions agree.');

// One page is discovery only, never permission to execute. A nonzero next
// continues this cycle, even for an empty page. Start each later cycle at zero.
export async function pollTasks(after = 0) {
  if (!Number.isSafeInteger(after) || after < 0) throw invalidCursor();
  const config = await activeConfiguration();
  if (config.mode !== 'connected') throw problem('account_connection_required', 'Task polling requires a connected Differ account.', 'Run connect and complete browser approval first.');
  let page;
  try {
    page = await request(config.url, `/v1/publishing/agent-tasks?after=${after}`, { bearer: config.token });
  } catch (error) {
    // Error bodies are not task data. Do not echo arbitrary server text.
    if (error.status === 401) throw problem('reconnect_required', 'The agent connection is no longer authorized.', 'Reconnect this account before polling again.');
    if (error.status === 404) throw problem('task_delivery_unavailable', 'Task delivery is not available on this Control service.', 'Ask the service operator to enable task delivery.');
    if (!error.status && error.code === 'network_permission_required') throw problem('network_permission_required', 'Network access to Control was refused.', 'Allow access to the configured publisher, then retry.', { retryable: true });
    throw problem('task_poll_failed', 'Control could not list pending tasks.', 'Retry later. Keep existing local task state.', { retryable: true });
  }
  if (!fields(page, ['tasks', 'next']) || !Array.isArray(page.tasks) || page.tasks.length > 50
    || !Number.isSafeInteger(page.next) || page.next < 0 || (page.next !== 0 && page.next <= after)) throw invalidResponse();
  const seen = new Set();
  for (const task of page.tasks) {
    if (!fields(task, ['id', 'version']) || typeof task.id !== 'string' || !taskID.test(task.id)
      || !Number.isSafeInteger(task.version) || task.version < 1 || seen.has(task.id)) throw invalidResponse();
    seen.add(task.id);
  }
  return page;
}
