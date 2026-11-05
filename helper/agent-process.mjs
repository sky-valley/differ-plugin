import {spawn} from 'node:child_process';
import {taskError} from './task-store.mjs';

// A local JSONL subprocess. Keep UTF-8 intact across chunks, bound buffered
// output, discard diagnostics, and release the process before returning files.
export function agentProcess({command,args,cwd,signal,timeoutMs=30*60_000}) {
 const child=spawn(command,args,{cwd,stdio:['pipe','pipe','pipe'],shell:false});
 const queue=[];let buffer='',bytes=0,error,waiter,serial=0,closed=false;
 const fail=code=>{error ||= taskError(code);waiter?.();};
 const exited=new Promise(resolve=>{child.once('exit',resolve);child.once('error',()=>{if(!child.pid)resolve();});});
 child.once('error',()=>fail('agent_unavailable'));
 child.once('close',()=>{closed=true;waiter?.();});
 child.stdin.on('error',()=>fail('agent_disconnected'));
 child.stderr.resume();child.stdout.setEncoding('utf8');
 child.stdout.on('data',chunk=>{
  if(error)return;
  buffer+=chunk;bytes+=Buffer.byteLength(chunk);
  if(bytes>8*1024*1024){fail('agent_invalid_response');return;}
  let end;
  while((end=buffer.indexOf('\n'))>=0){
   const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
   if(!line.trim()){bytes-=Buffer.byteLength(line)+1;continue;}
   try{queue.push({value:JSON.parse(line),bytes:Buffer.byteLength(line)+1});}
   catch{fail('agent_invalid_response');return;}
  }
  waiter?.();
 });
 const abort=()=>fail('agent_interrupted');signal?.addEventListener('abort',abort,{once:true});
 if(signal?.aborted)abort();
 const timeout=setTimeout(()=>fail('agent_timeout'),timeoutMs);
 async function next(){
  while(!queue.length&&!error&&!closed)await new Promise(resolve=>{waiter=resolve;});
  waiter=undefined;if(error)throw error;
  if(!queue.length)throw taskError('agent_disconnected');
  const record=queue.shift();bytes-=record.bytes;return record.value;
 }
 function send(value){if(error)throw error;child.stdin.write(JSON.stringify(value)+'\n');}
 return {next,send,
  text(value){if(error)throw error;child.stdin.end(value);},
  async request(message,onMessage=()=>{}){
   const id=String(++serial);send({...message,id});
   for(;;){const reply=await next();
    if(reply.id===id&&!reply.method){if(reply.error||reply.success===false)throw taskError('agent_request_failed');return reply.result??reply.data;}
    await onMessage(reply);
   }
  },
  async close(){
   clearTimeout(timeout);signal?.removeEventListener('abort',abort);child.stdin.end();
   const terminate=setTimeout(()=>child.kill('SIGTERM'),2000), kill=setTimeout(()=>child.kill('SIGKILL'),4000);
   try{await exited;}finally{clearTimeout(terminate);clearTimeout(kill);child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();}
  }
 };
}
