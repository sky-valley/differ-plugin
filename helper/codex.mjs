import metadata from '../package.json' with { type: 'json' };
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { taskError, uuid } from './task-store.mjs';

// Stdio keeps the local session off the network. The caller saves session and
// turn IDs before proceeding. No shell, model override, or full-access flag.
export async function runCodex({ cwd, prompt, sessionId, afterTurnId, onSession, onTurn, signal,
  command = 'codex', args = ['app-server', '--listen', 'stdio://'] }) {
  const child = spawn(command, args, { cwd, stdio:['pipe','pipe','pipe'], shell:false });
  const exited=new Promise(resolve=>{
    child.once('exit',resolve);
    child.once('error',()=>{if(!child.pid)resolve();});
  });
  let serial=0, buffer='', threadId=sessionId, turnId, text='', ended=false, inputNeeded=false;
  const pending=new Map(), completed=[];
  let finish, fail;
  const done=new Promise((resolve,reject)=>{finish=resolve;fail=reject;});
  // Startup errors can occur while initialize is pending.
  done.catch(()=>{});
  const send=value=>child.stdin.write(JSON.stringify(value)+'\n');
  const stop=error=>{
    for(const {reject,timer} of pending.values()){clearTimeout(timer);reject(error);}
    pending.clear();if(!ended){ended=true;fail(error);}
  };
  const call=(method,params)=>new Promise((resolve,reject)=>{
    const id=++serial;
    const timer=setTimeout(()=>stop(taskError('codex_timeout')),45_000);
    pending.set(id,{resolve,reject,timer});send({id,method,params});
  });
  const acceptCompletion=params=>{
    if(params.threadId!==threadId)return;
    if(!turnId){completed.push(params);return;}
    if(params.turn.id!==turnId)return;
    ended=true;finish({status:params.turn.status,text,sessionId:threadId,turnId});
  };
  child.on('error',()=>stop(taskError('codex_unavailable')));
  child.on('exit',()=>stop(taskError('codex_disconnected')));
  child.stdin.on('error',()=>stop(taskError('codex_disconnected')));
  child.stderr.resume(); // Arbitrary tool output never enters logs or Control.
  child.stdout.on('data',chunk=>{
    buffer+=chunk.toString();
    if(Buffer.byteLength(buffer)>4*1024*1024){stop(taskError('codex_invalid_response'));return;}
    let at;
    while((at=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,at);buffer=buffer.slice(at+1);
      if(!line.trim())continue;
      try{
        const message=JSON.parse(line);
        if(message.method && message.id!==undefined){
          // Approval, permission and user-input requests need a person. Interrupt
          // instead of accepting on their behalf or inventing an answer.
          send({id:message.id,error:{code:-32000,message:'Continue this task in the Codex interface.'}});
          if(threadId && turnId)send({id:++serial,method:'turn/interrupt',params:{threadId,turnId}});
          inputNeeded=true;ended=true;finish({status:'needs_input',sessionId:threadId,turnId});stop(taskError('codex_needs_input'));continue;
        }
        if(message.id!==undefined){
          const waiter=pending.get(message.id);if(!waiter)continue;
          clearTimeout(waiter.timer);pending.delete(message.id);
          if(message.error)waiter.reject(taskError('codex_request_failed'));else waiter.resolve(message.result);
        }else if(message.method==='item/completed' && message.params.threadId===threadId && message.params.item?.type==='agentMessage'){
          text=message.params.item.text;
        }else if(message.method==='turn/completed')acceptCompletion(message.params);
      }catch{stop(taskError('codex_invalid_response'));}
    }
  });
  const abort=()=>{
    if(threadId&&turnId)send({id:++serial,method:'turn/interrupt',params:{threadId,turnId}});
    stop(taskError('codex_interrupted'));
  };
  signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(()=>stop(taskError('codex_timeout')),30*60_000);
  try{
    if(signal?.aborted)throw taskError('codex_interrupted');
    await call('initialize',{clientInfo:{name:'differ_tasks',version:metadata.version}});
    send({method:'initialized',params:{}});
    // Continue is explicit permission to publish work finished in the user's
    // desktop chat. Reading history does not acquire that app's writer lock.
    if(sessionId && afterTurnId){
      const {thread}=await call('thread/read',{threadId:sessionId});
      if(thread?.id!==sessionId || typeof thread.cwd!=='string' || resolve(thread.cwd)!==resolve(cwd))throw taskError('codex_invalid_response');
      const page=await call('thread/turns/list',{threadId:sessionId,limit:20,sortDirection:'desc',itemsView:'full'});
      const turns=page?.data;
      if(!Array.isArray(turns))throw taskError('codex_invalid_response');
      const latest=turns[0];
      const answer=latest?.items?.filter(item=>item.type==='agentMessage').at(-1);
      let ready=false;try{ready=JSON.parse(answer?.text).status==='ready';}catch{}
      if(turns.findIndex(turn=>turn.id===afterTurnId)>0 && latest?.status==='completed' && answer?.phase==='final_answer' && ready){
        if(typeof latest.id!=='string' || !latest.id.length || latest.id.length>128)throw taskError('codex_invalid_response');
        await onSession(sessionId);await onTurn(latest.id);
        return {status:'completed',text:answer.text,sessionId,turnId:latest.id};
      }
    }
    const result=await call(sessionId?'thread/resume':'thread/start',{
      ...(sessionId?{threadId:sessionId}:{}),cwd,approvalPolicy:'on-request',sandbox:'workspace-write',
    });
    threadId=result?.thread?.id;
    if(!uuid(threadId))throw taskError('codex_invalid_response');
    await onSession(threadId);
    const turn=await call('turn/start',{threadId,input:[{type:'text',text:prompt}]});
    turnId=turn?.turn?.id;
    if(typeof turnId!=='string'||!turnId.length||turnId.length>128)throw taskError('codex_invalid_response');
    await onTurn(turnId);
    for(const event of completed)acceptCompletion(event);
    return await done;
  }catch(error){
    if(inputNeeded)return {status:'needs_input',sessionId:threadId,turnId};
    throw error;
  }finally{
    clearTimeout(timeout);signal?.removeEventListener('abort',abort);
    for(const waiter of pending.values())clearTimeout(waiter.timer);
    // EOF lets app-server save and release its chat. A result is not a handoff
    // until this process has exited. Bound shutdown if it stops responding.
    child.stdin.end();
    const terminate=setTimeout(()=>child.kill('SIGTERM'),2000);
    const kill=setTimeout(()=>child.kill('SIGKILL'),4000);
    try { await exited; }
    finally {
      clearTimeout(terminate);clearTimeout(kill);
      child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();
    }
  }
}

export function sessionLink(sessionId) {
  if(!uuid(sessionId))throw taskError('invalid_session');
  return { url:`codex://threads/${sessionId}`, resumeCommand:`codex resume ${sessionId}` };
}
