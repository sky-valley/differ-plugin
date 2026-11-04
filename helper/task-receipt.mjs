import { randomUUID } from 'node:crypto';
import { configuration } from './connection.mjs';
import { taskRequest } from './task-api.mjs';
import { saveTask, withTask, uuid, taskError } from './task-store.mjs';

export function deliveryValid(delivery, task) {
  return delivery && delivery.id === task.id && delivery.claimId === task.claimId
    && delivery.version === task.offerVersion + 1 && uuid(delivery.parentBitId) && uuid(delivery.parentVersionId)
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
    const receipt = await taskRequest(`/${id}/receipt`, { body: { claimId: task.claimId } });
    if (receipt?.id !== id || receipt.state !== 'received' || receipt.version !== task.delivery.version + 1) throw taskError('invalid_task_response');
    task.state = 'received'; saveTask(task);
    return taskSummary(task);
  });
}
