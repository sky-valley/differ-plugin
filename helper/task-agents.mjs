import {spawn} from 'node:child_process';
import {runCodex,sessionLink} from './codex.mjs';
import {runOpenCode,openCodeID} from './opencode.mjs';
import {runPi} from './pi.mjs';
import {runClaude} from './claude.mjs';
import {uuid,taskError,withTask} from './task-store.mjs';
import {workspaceFor} from './task-source.mjs';

const agents=new Map([['codex',runCodex],['claude-code',runClaude],['pi',runPi],['opencode',runOpenCode]]);
export function taskAgent(value='codex') {if(!agents.has(value))throw taskError('unsupported_agent');return value;}
export function executeAgent(agent,options) {return agents.get(taskAgent(agent))(options);}
export function taskSessionLink(task) {
 const agent=taskAgent(task.agent);if(!(agent==='opencode'?openCodeID(task.sessionId):uuid(task.sessionId)))throw taskError('invalid_session');
 return agent==='codex'?sessionLink(task.sessionId):{agent,sessionId:task.sessionId};
}
export function resumeInvocation(task,ui='terminal') {
 const agent=taskAgent(task.agent);if(!(agent==='opencode'?openCodeID(task.sessionId):uuid(task.sessionId)))throw taskError('invalid_session');
 if(ui!=='terminal'&&!(ui==='desktop'&&agent==='claude-code'))throw taskError('unsupported_interface');
 if(ui==='desktop')return {command:'claude',args:['--desktop','--resume',task.sessionId],cwd:workspaceFor(task)};
 if(agent==='opencode')return {command:'opencode',args:['--session',task.sessionId],cwd:workspaceFor(task)};
 if(agent==='pi')return {command:'pi',args:['--session',task.sessionId],cwd:workspaceFor(task)};
 return {command:agent==='claude-code'?'claude':'codex',args:[agent==='codex'?'resume':'--resume',task.sessionId],cwd:workspaceFor(task)};
}
// One task folder has one writer. Keep the receiver out while the person uses
// the terminal chat, and open in its exact folder (needed for session lookup).
// Desktop handoff exits after opening the app; its native session lock then applies.
export async function openTask(id,ui='terminal') {
 return withTask(id,async task=>{
  if(!task||!['needs_input','completed','failed'].includes(task.state))throw taskError('agent_still_working');
  const {command,args,cwd}=resumeInvocation(task,ui);
  await new Promise((resolve,reject)=>{
   const child=spawn(command,args,{cwd,stdio:'inherit',shell:false});
   child.once('error',()=>reject(taskError('agent_unavailable')));
   child.once('exit',code=>code===0?resolve():reject(taskError('agent_disconnected')));
  });
 });
}
