import {agentProcess} from './agent-process.mjs';
import {uuid,taskError} from './task-store.mjs';

// Pi 1.1+ signals the whole run with agent_settled. agent_end alone can be
// followed by automatic retries or compaction, so it cannot authorize upload.
export async function runPi({cwd,prompt,sessionId,onSession,signal,command='pi',args=[]}) {
 if(sessionId&&!uuid(sessionId))throw taskError('invalid_session');
 const process=agentProcess({command,cwd,signal,args:[...args,'--mode','rpc',...(sessionId?['--session',sessionId]:[])]});
 let text='',failed=false,id,settled;
 const event=message=>{
  if(message.type==='agent_settled')settled=message;
  if(message.type==='extension_ui_request'&&['select','confirm','input','editor'].includes(message.method)){
   process.send({type:'extension_ui_response',id:message.id,cancelled:true});
   process.send({type:'abort'});throw taskError('agent_needs_input');
  }
  if(message.type==='message_end'&&message.message?.role==='assistant'){
   text=(message.message.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('');
   failed=['error','aborted'].includes(message.message.stopReason);
  }
 };
 try{
  const state=await process.request({type:'get_state'},event);id=state?.sessionId;
  if(!uuid(id)||(sessionId&&id!==sessionId))throw taskError('invalid_session');
  await onSession(id);
  const result=await process.request({type:'prompt',message:prompt},event);
  if(result?.disposition==='handled')return {status:'needs_input',sessionId:id};
  while(!settled)event(await process.next());
  return {status:failed?'failed':settled.aborted?'needs_input':'completed',sessionId:id,text};
 }catch(error){if(error.code==='agent_needs_input')return {status:'needs_input',sessionId:id};throw error;}
 finally{await process.close();}
}
