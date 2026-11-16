import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { activeConfiguration, request } from './connection.mjs';
import { pack } from './client.mjs';
import { workspaceFor } from './task-source.mjs';
import { taskRequest } from './task-api.mjs';
import { taskDirectory, taskError, uuid, savePrivate, editTask } from './task-store.mjs';

const optionalText = value => value === undefined || typeof value === 'string';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const selectionValid = value => object(value) && optionalText(value.label) && optionalText(value.selector) && optionalText(value.text)
  && (value.region === undefined || (object(value.region) && ['x','y','width','height'].every(key => Number.isFinite(value.region[key]))));

// New requests save a draft for the maker to review. Earlier requests may publish.
// It is carried inside the temporary prompt; no caption or instructions are
// added to Control's durable task event. An edit (schema 2) carries the
// creator's prompt and what they picked on the phone, with no caption or publish.
export function taskInput(task) {
  let value;
  try { value=JSON.parse(task.delivery.prompt); } catch { throw taskError('invalid_task_instructions'); }
  if (editTask(task)) {
    if (value?.schema!==2 || value.kind!=='edit' || typeof value.instructions!=='string' || !value.instructions.trim()
      || !Array.isArray(value.selections) || !value.selections.every(selectionValid)) throw taskError('invalid_task_instructions');
    return value;
  }
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

// Freeze the exact files before the first post, so a retry after an uncertain
// response sends identical bytes and Control answers it with the same edit.
// Invalid local content waits for the creator; Control's refusal is final.
export async function submitEdit(task) {
  const path=join(taskDirectory(task.id),'edit.json');
  let saved;
  if(existsSync(path))saved=JSON.parse(readFileSync(path,'utf8'));
  else{
    let artifact;
    try{artifact=pack(join(workspaceFor(task),'content'));}catch{throw taskError('task_edit_invalid');}
    saved={files:artifact.files};
    savePrivate(path,saved);
  }
  let result;
  try{result=await taskRequest(`/${task.id}/edit`,{body:{claimId:task.claimId,files:saved.files},refusal:true});}
  catch(error){
    if(error.status===409||error.status===422)throw Object.assign(taskError('task_edit_refused'),{status:error.status,reason:error.reason});
    throw error;
  }
  if(result?.id!==task.id||result.state!=='completed'||!Number.isSafeInteger(result.outcome?.edit)||result.outcome.edit<0)throw taskError('invalid_task_response');
  return {edit:result.outcome.edit};
}
