import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { activeConfiguration, request } from './connection.mjs';
import { pack } from './client.mjs';
import { workspaceFor } from './task-source.mjs';
import { taskDirectory, taskError, uuid, savePrivate } from './task-store.mjs';

// New requests save a draft for the maker to review. Earlier requests may publish.
// It is carried inside the temporary prompt; no caption or instructions are
// added to Control's durable task event.
export function taskInput(task) {
  let value;
  try { value=JSON.parse(task.delivery.prompt); } catch { throw taskError('invalid_task_instructions'); }
  const fresh = task.delivery.parentBitId === '' && task.delivery.parentVersionId === '';
  if(value?.schema!==1 || typeof value.publish!=='boolean' || typeof value.instructions!=='string' || !value.instructions.trim()
    || typeof value.caption!=='string' || (!value.caption.trim() && !fresh) || (fresh && value.publish) || [...value.caption].length>200 || (value.caption.match(/\n/g)||[]).length>3)
    throw taskError('invalid_task_instructions');
  return value;
}
export async function publishTask(task) {
  const config=await activeConfiguration();
  if(config.mode!=='connected'||config.url!==task.publisher)throw taskError('account_connection_required');
  const path=join(taskDirectory(task.id),'publication.json');
  let saved;
  if(existsSync(path))saved=JSON.parse(readFileSync(path,'utf8'));
  else{
    const input=taskInput(task),artifact=pack(join(workspaceFor(task),'content'));
    saved={bitId:randomUUID(),body:{requestId:randomUUID(),publish:input.publish,caption:input.caption,expectedVersionId:null,
      parentBitId:task.delivery.parentBitId,parentVersionId:task.delivery.parentVersionId,files:artifact.files}};
    // Freeze the exact bytes and idempotency identity before the first upload.
    savePrivate(path,saved);
  }
  let receipt;
  try { receipt=await request(config.url,`/v1/publishing/bits/${saved.bitId}/versions`,{bearer:config.token,body:saved.body}); }
  catch(error) {
    if(error.status>=400&&error.status<500&&error.status!==401&&error.code!=='upload_busy')throw taskError('task_publication_rejected');
    throw taskError('task_publication_pending');
  }
  if(receipt?.state!=='succeeded'||Boolean(receipt.draft)!==!saved.body.publish||receipt.bitId!==saved.bitId||!uuid(receipt.versionId))throw taskError('invalid_publication_response');
  // Bind subsequent agent edits to this child, never to the published parent.
  savePrivate(join(workspaceFor(task),'content','differ-bit.json'), {
    version:1,publisher:config.url,bitId:receipt.bitId,versionId:receipt.versionId,caption:saved.body.caption
  });
  return {bitId:receipt.bitId,versionId:receipt.versionId,...(receipt.draft?{draft:true}:{})};
}
