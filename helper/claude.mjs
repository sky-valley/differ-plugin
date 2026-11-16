import {randomUUID} from 'node:crypto';
import {agentProcess} from './agent-process.mjs';
import {uuid,taskError} from './task-store.mjs';

const ready=text=>{try{return JSON.parse(text)?.status==='ready';}catch{return false;}};
// Use the installed CLI's login, model and workspace edit permission. Pending
// approvals are denied by headless mode and returned to the person, not granted.
export async function runClaude({cwd,prompt,sessionId,onSession,signal,command='claude',args=[]}) {
 const id=sessionId??randomUUID();if(!uuid(id))throw taskError('invalid_session');
 const process=agentProcess({command,cwd,signal,args:[...args,'--print','--verbose','--output-format','stream-json',
  '--permission-mode','acceptEdits','--permission-prompts','none',sessionId?'--resume':'--session-id',id]});
 try{
  // The CLI accepts our exact ID. Save it before it can start any model work.
  await onSession(id);process.text(prompt);
  let denied=false;
  for(;;){const message=await process.next();
   if(message.session_id&&message.session_id!==id)throw taskError('invalid_session');
   if(message.type==='system'&&message.subtype==='permission_denied')denied=true;
   if(message.type==='result'){
    const text=typeof message.result==='string'?message.result:'',failed=message.is_error||message.subtype!=='success';
    const blocked=denied||message.permission_denials?.length>0;
    // A denied call the agent worked around does not hold back a successful turn
    // whose final answer is ready; the runner decides whether that may publish.
    return {sessionId:id,status:blocked&&(failed||!ready(text))?'needs_input':failed?'failed':'completed',text,...(blocked?{denied:true}:{})};
   }
  }
 }finally{await process.close();}
}
