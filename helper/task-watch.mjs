import { writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pollTasks } from './tasks.mjs';
import { receiveTask } from './task-receipt.mjs';
import { advanceTask } from './task-runner.mjs';
import { localTasks, taskRoot, privateDirectory, taskError } from './task-store.mjs';

function pause(ms,signal) {
  return new Promise(resolve=>{
    const finish=()=>{clearTimeout(timer);signal?.removeEventListener('abort',finish);resolve();};
    const timer=setTimeout(finish,ms);signal?.addEventListener('abort',finish,{once:true});if(signal?.aborted)finish();
  });
}
function receiverLock() {
  privateDirectory(taskRoot());const path=join(taskRoot(),'receiver.lock');
  try{writeFileSync(path,String(process.pid),{flag:'wx',mode:0o600});}
  catch(error){
    if(error.code!=='EEXIST')throw error;
    const pid=Number(readFileSync(path,'utf8'));
    if(!Number.isSafeInteger(pid)||pid<1)throw taskError('receiver_busy');
    try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH'){unlinkSync(path);return receiverLock();}}
    throw taskError('receiver_busy');
  }
  return ()=>unlinkSync(path);
}
// Delivery runs independently of execution. A long Codex turn cannot consume
// the 15-minute delivery lifetime of tasks submitted while it is running.
export async function watchTasks({signal,intervalMs=5000,report=()=>{},execute=advanceTask}={}) {
  const unlock=receiverLock(), reported=new Map();
  const emit=(key,value)=>{const text=JSON.stringify(value);if(reported.get(key)!==text){reported.set(key,text);report(value);}};
  const failure=(key,error)=>emit(key,{id:key,code:/^[a-z_]+$/.test(error.code||'')?error.code:'task_unavailable'});
  async function deliver(){
    while(!signal?.aborted){
      try{
        for(const task of localTasks().filter(t=>['claiming','saved'].includes(t.state))){
          if(signal?.aborted)break;
          try{await receiveTask(task.id,task.offerVersion);}catch(error){failure(task.id,error);}
        }
        let after=0;
        do{
          const page=await pollTasks(after);
          for(const offer of page.tasks){
            if(signal?.aborted)break;
            try{emit(offer.id,await receiveTask(offer.id,offer.version));}catch(error){failure(offer.id,error);}
          }
          after=page.next;
        }while(after&&!signal?.aborted);
      }catch(error){failure('receiver',error);}
      await pause(intervalMs,signal);
    }
  }
  async function work(){
    while(!signal?.aborted){
      try{
        for(const task of localTasks().filter(t=>!['claiming','saved','completed','failed'].includes(t.state))){
          if(signal?.aborted)break;
          try{emit(task.id,await execute(task.id,{signal}));}catch(error){failure(task.id,error);}
        }
      }catch(error){failure('worker',error);}
      await pause(intervalMs,signal);
    }
  }
  try{await Promise.all([deliver(),work()]);}finally{unlock();}
}
