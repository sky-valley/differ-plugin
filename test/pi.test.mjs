import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runPi} from '../helper/pi.mjs';

for(const mode of ['settled','permission','error','resume'])test(`Pi RPC: ${mode}`,async t=>{
 const cwd=mkdtempSync(join(tmpdir(),'differ-pi-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const script=join(cwd,'cli.mjs'), wire=join(cwd,'wire'), saved=join(cwd,'saved');
 const id='12345678-1234-4234-8234-123456789abc';
 writeFileSync(script,`import {createInterface} from 'node:readline';import {appendFileSync,existsSync} from 'node:fs';
const send=m=>console.log(JSON.stringify(m));
createInterface({input:process.stdin}).on('line',line=>{appendFileSync(${JSON.stringify(wire)},line+'\\n');const m=JSON.parse(line);
 if(m.type==='get_state')send({id:m.id,type:'response',success:true,data:{sessionId:'${id}'}});
 if(m.type==='prompt'){
  if(!existsSync(${JSON.stringify(saved)}))process.exit(3);
  send({id:m.id,type:'response',success:true,data:{disposition:'started'}});
  if(${JSON.stringify(mode)}==='permission'){send({type:'extension_ui_request',id:'permit',method:'confirm',title:'Allow?'});return;}
  send({type:'message_end',message:{role:'assistant',stopReason:'stop',content:[{type:'text',text:'{"status":"ready"}'}]}});
  send({type:'agent_end',willRetry:true});
  setTimeout(()=>{
   send({type:'message_end',message:{role:'assistant',stopReason:${JSON.stringify(mode==='error'?'error':'stop')},content:[{type:'text',text:'{"status":"needs_input"}'}]}});
   send({type:'agent_settled',aborted:false});
  },30);
 }
});`);
 const result=await runPi({cwd,prompt:'private',sessionId:mode==='resume'?id:undefined,onSession:value=>writeFileSync(saved,value),command:process.execPath,args:[script]});
 assert.equal(result.status,mode==='permission'?'needs_input':mode==='error'?'failed':'completed');
 if(mode==='settled')assert.equal(result.text,'{"status":"needs_input"}','must wait past agent_end retries');
 if(mode==='permission')assert.ok(!readFileSync(wire,'utf8').includes('"confirmed":true'));
});
