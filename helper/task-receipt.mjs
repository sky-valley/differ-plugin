import { randomUUID } from 'node:crypto';
import { configuration } from './connection.mjs';
import { taskRequest } from './task-api.mjs';
import { saveTask, withTask, uuid, taskError } from './task-store.mjs';

// An editor edit names its Diff editor session and turn, both or neither, and
// always has a parent: the session's published version.
const editorID = (value, prefix) => typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,64}$`).test(value);
function editorValid(delivery) {
  const session = delivery.editorSessionId ?? '', turn = delivery.editorTurnId ?? '';
  if (session === '' && turn === '') return true;
  return editorID(session, 'eds') && editorID(turn, 'edt') && uuid(delivery.parentBitId) && uuid(delivery.parentVersionId);
}
export function deliveryValid(delivery, task) {
  return delivery && delivery.id === task.id && delivery.claimId === task.claimId && editorValid(delivery)
    && delivery.version === task.offerVersion + 1 && ((delivery.parentBitId === '' && delivery.parentVersionId === '') || (uuid(delivery.parentBitId) && uuid(delivery.parentVersionId)))
    && Number.isFinite(Date.parse(delivery.expiresAt)) && typeof delivery.prompt === 'string'
    && delivery.prompt.trim().length > 0 && Buffer.byteLength(delivery.prompt) <= 64 * 1024;
}
export const taskSummary = task => ({ id: task.id, state: task.state });
export async function receiveTask(id, version) {
  if (!Number.isSafeInteger(version) || version < 1) throw taskError('invalid_task_version');
  const config = configuration();
  if (config.mode !== 'connected') throw taskError('account_connection_required');
  return withTask(id, async task => {
    if (task && task.publisher !== config.url) throw taskError('target_changed');
    if (task && !['claiming', 'saved'].includes(task.state)) return taskSummary(task);
    // A fresh offer with a newer version proves the old claim no longer owns
    // delivery. This never replaces a received task or an uncertain receipt.
    if (!task || (task.state === 'claiming' && version > task.offerVersion)) {
      task = { schema: 1, id, publisher: config.url, claimId: randomUUID(), offerVersion: version, state: 'claiming' };
      saveTask(task);
    }
    if (!task.delivery) {
      const delivery = await taskRequest(`/${id}/claim`, { body: { claimId: task.claimId, version: task.offerVersion } });
      if (!deliveryValid(delivery, task)) throw taskError('invalid_task_response');
      task.delivery = delivery; task.state = 'saved'; saveTask(task);
    }
    let receipt;
    try { receipt = await taskRequest(`/${id}/receipt`, { body: { claimId: task.claimId } }); }
    catch(error) {
      if(error.status===409){task.state='claiming';delete task.delivery;saveTask(task);}
      throw error;
    }
    if (receipt?.id !== id || receipt.state !== 'received' || receipt.version !== task.delivery.version + 1) throw taskError('invalid_task_response');
    task.state = 'received'; saveTask(task);
    return taskSummary(task);
  });
}
