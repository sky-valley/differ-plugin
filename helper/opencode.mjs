import {agentProcess} from './agent-process.mjs';
import {taskError} from './task-store.mjs';
export const openCodeID=value=>typeof value==='string'&&/^ses_[A-Za-z0-9]{1,120}$/.test(value);

// ACP uses local stdio. OpenCode owns tools and files; this client grants no
// filesystem, terminal or permission capabilities on the user's behalf.
export async function runOpenCode({cwd,prompt,sessionId,onSession,signal,command='opencode',args=['acp','--hostname','127.0.0.1']}) {
 if(sessionId&&!openCodeID(sessionId))throw taskError('invalid_session');
 const process=agentProcess({command,args,cwd,signal});
 let id=sessionId,text='',messageId,collect=false;
 const send=(method,params)=>process.send({jsonrpc:'2.0',method,params});
 const event=message=>{
  if(message.method&&message.id!==undefined){
   if(message.method==='session/request_permission')process.send({jsonrpc:'2.0',id:message.id,result:{outcome:{outcome:'cancelled'}}});
   else process.send({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'This action needs the user interface.'}});
   if(id)send('session/cancel',{sessionId:id});
   throw taskError('agent_needs_input');
  }
  if(!collect||message.method!=='session/update'||message.params?.sessionId!==id)return;
  const update=message.params.update;
  if(update?.sessionUpdate==='tool_call'){text='';messageId=undefined;}
  if(update?.sessionUpdate==='agent_message_chunk'&&update.content?.type==='text'){
   if(update.messageId&&update.messageId!==messageId){text='';messageId=update.messageId;}
   text+=update.content.text;
   if(Buffer.byteLength(text)>1024*1024)throw taskError('agent_invalid_response');
  }
 };
 const call=(method,params)=>process.request({jsonrpc:'2.0',method,params},event);
 try{
  const init=await call('initialize',{protocolVersion:1,clientCapabilities:{},clientInfo:{name:'differ-tasks',version:'1'}});
  if(init?.protocolVersion!==1)throw taskError('agent_protocol_unsupported');
  if(sessionId&&!init.agentCapabilities?.loadSession)throw taskError('agent_resume_unavailable');
  const session=await call(sessionId?'session/load':'session/new',{cwd,mcpServers:[],...(sessionId?{sessionId}:{})});
  id=sessionId??session?.sessionId;
  if(!openCodeID(id)||(session?.sessionId&&session.sessionId!==id))throw taskError('invalid_session');
  await onSession(id);collect=true;
  const result=await call('session/prompt',{sessionId:id,prompt:[{type:'text',text:prompt}]});
  return {sessionId:id,status:result?.stopReason==='end_turn'?'completed':'needs_input',text};
 }catch(error){if(error.code==='agent_needs_input')return {status:'needs_input',sessionId:id};throw error;}
 finally{await process.close();}
}
