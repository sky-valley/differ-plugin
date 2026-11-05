import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Codex saves session identity before sending the task and waits for its completed turn', async t => {
  const { runCodex } = await import('../helper/codex.mjs');
  const root=mkdtempSync(join(tmpdir(),'differ-codex-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const fake=join(root,'server.mjs'), log=join(root,'wire.jsonl');
  writeFileSync(fake, `import {createInterface} from 'node:readline'; import {appendFileSync,existsSync} from 'node:fs';
const send=m=>console.log(JSON.stringify(m));
createInterface({input:process.stdin}).on('line',line=>{ const m=JSON.parse(line);appendFileSync(${JSON.stringify(log)},line+'\\n');
if(m.method==='initialize')send({id:m.id,result:{}});
if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'12345678-1234-4234-8234-123456789abc'}}});
if(m.method==='turn/start'){ if(!existsSync(${JSON.stringify(join(root,'saved'))})) process.exit(3);send({id:m.id,result:{turn:{id:'turn-one'}}});
send({method:'turn/completed',params:{threadId:'other',turn:{id:'other',status:'failed'}}});
send({method:'item/completed',params:{threadId:'12345678-1234-4234-8234-123456789abc',turnId:'turn-one',item:{type:'agentMessage',text:'{"status":"ready"}'}}});
send({method:'turn/completed',params:{threadId:'12345678-1234-4234-8234-123456789abc',turn:{id:'turn-one',status:'completed'}}});}
});`);
  const result=await runCodex({cwd:root,prompt:'private instructions',onSession:id=>{assert.match(id,/^1234/);writeFileSync(join(root,'saved'),id);},onTurn:()=>{},command:process.execPath,args:[fake]});
  assert.equal(result.status,'completed');assert.equal(result.text,'{"status":"ready"}');
  const messages=readFileSync(log,'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(messages.find(m=>m.method==='thread/start').params.sandbox,'workspace-write');
  assert.equal(messages.find(m=>m.method==='thread/start').params.approvalPolicy,'on-request');
  assert.equal(messages.find(m=>m.method==='turn/start').params.input[0].text,'private instructions');
});
test('Codex fails safely when the process exits without completing a turn', async t => {
  const { runCodex }=await import('../helper/codex.mjs');
  await assert.rejects(runCodex({cwd:tmpdir(),prompt:'private',onSession:()=>{},onTurn:()=>{},command:process.execPath,args:['-e','process.exit(0)']}),e=>e.code==='codex_disconnected');
});

test('approval before turn response stops for the user without hanging or accepting', async t => {
  const { runCodex }=await import('../helper/codex.mjs');
  const root=mkdtempSync(join(tmpdir(),'differ-approval-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const fake=join(root,'server.mjs');
  writeFileSync(fake,`import {createInterface} from 'node:readline';const send=m=>console.log(JSON.stringify(m));
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
if(m.method==='initialize')send({id:m.id,result:{}});
if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'12345678-1234-4234-8234-123456789abc'}}});
if(m.method==='turn/start')send({id:99,method:'item/commandExecution/requestApproval',params:{}});
});`);
  const result=await runCodex({cwd:root,prompt:'private',onSession:()=>{},onTurn:()=>{},command:process.execPath,args:[fake]});
  assert.equal(result.status,'needs_input');
});

test('Codex releases its process before returning a result or requesting user input', async t => {
  const { runCodex }=await import('../helper/codex.mjs');
  for(const mode of ['completed','approval','abort']) await t.test(mode,async t=>{
    const root=mkdtempSync(join(tmpdir(),'differ-handoff-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
    const fake=join(root,'server.mjs'), pidFile=join(root,'pid'), stopped=join(root,'stopped');
    writeFileSync(fake,`import {createInterface} from 'node:readline';import {writeFileSync} from 'node:fs';
writeFileSync(${JSON.stringify(pidFile)},String(process.pid));
const stop=()=>setTimeout(()=>{writeFileSync(${JSON.stringify(stopped)},'released');process.exit(0);},150);
process.on('SIGTERM',stop);setInterval(()=>{},1000);
const send=m=>console.log(JSON.stringify(m));
const input=createInterface({input:process.stdin});input.on('close',stop);
input.on('line',line=>{const m=JSON.parse(line);
if(m.method==='initialize')send({id:m.id,result:{}});
if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'12345678-1234-4234-8234-123456789abc'}}});
if(m.method==='turn/start'){
 if(${JSON.stringify(mode)}==='approval'){send({id:99,method:'item/commandExecution/requestApproval',params:{}});return;}
 send({id:m.id,result:{turn:{id:'turn-one'}}});
 if(${JSON.stringify(mode)}==='completed')send({method:'turn/completed',params:{threadId:'12345678-1234-4234-8234-123456789abc',turn:{id:'turn-one',status:'completed'}}});
}});`);
    const abort=new AbortController();
    const operation=runCodex({cwd:root,prompt:'local handoff fixture',onSession:()=>{},onTurn:()=>{if(mode==='abort')abort.abort();},signal:abort.signal,command:process.execPath,args:[fake]});
    if(mode==='abort')await assert.rejects(operation,e=>e.code==='codex_interrupted');
    else assert.equal((await operation).status,mode==='approval'?'needs_input':'completed');
    const pid=Number(readFileSync(pidFile,'utf8'));
    t.after(()=>{try{process.kill(pid,'SIGKILL');}catch{}});
    assert.throws(()=>process.kill(pid,0),{code:'ESRCH'},'the process must release the chat before its result is exposed');
    assert.equal(readFileSync(stopped,'utf8'),'released');
  });
});

test('a completed Codex process that ignores shutdown is killed before handoff', async t=>{
  const {runCodex}=await import('../helper/codex.mjs');
  const root=mkdtempSync(join(tmpdir(),'differ-stuck-codex-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const fake=join(root,'server.mjs'), pidFile=join(root,'pid');
  writeFileSync(fake,`import {createInterface} from 'node:readline';import {writeFileSync} from 'node:fs';
writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.on('SIGTERM',()=>{});setInterval(()=>{},1000);
const send=m=>console.log(JSON.stringify(m));createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
if(m.method==='initialize')send({id:m.id,result:{}});
if(m.method==='thread/start')send({id:m.id,result:{thread:{id:'12345678-1234-4234-8234-123456789abc'}}});
if(m.method==='turn/start'){send({id:m.id,result:{turn:{id:'turn-one'}}});send({method:'turn/completed',params:{threadId:'12345678-1234-4234-8234-123456789abc',turn:{id:'turn-one',status:'completed'}}});}
});`);
  assert.equal((await runCodex({cwd:root,prompt:'local fixture',onSession:()=>{},onTurn:()=>{},command:process.execPath,args:[fake]})).status,'completed');
  assert.throws(()=>process.kill(Number(readFileSync(pidFile,'utf8')),0),{code:'ESRCH'});
});

test('a missing Codex executable fails without waiting for a nonexistent process',async()=>{
 const {runCodex}=await import('../helper/codex.mjs');
 await assert.rejects(runCodex({cwd:tmpdir(),prompt:'fixture',onSession:()=>{},onTurn:()=>{},command:join(tmpdir(),'differ-missing-codex-executable')}),e=>e.code==='codex_unavailable');
});

test('an explicit continuation reads a newer completed desktop result without taking the chat', async t=>{
  const {runCodex}=await import('../helper/codex.mjs');
  const root=mkdtempSync(join(tmpdir(),'differ-desktop-result-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const fake=join(root,'server.mjs'),log=join(root,'wire.jsonl'),id='12345678-1234-4234-8234-123456789abc';
  writeFileSync(fake,`import {createInterface} from 'node:readline';import {appendFileSync} from 'node:fs';
const send=m=>console.log(JSON.stringify(m));
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);appendFileSync(${JSON.stringify(log)},line+'\\n');
if(m.method==='initialize')send({id:m.id,result:{}});
if(m.method==='thread/read')send({id:m.id,result:{thread:{id:${JSON.stringify(id)},cwd:${JSON.stringify(root)}}}});
if(m.method==='thread/turns/list')send({id:m.id,result:{data:[{id:'desktop-turn',status:'completed',items:[{type:'agentMessage',phase:'final_answer',text:'{"status":"ready"}'}]},{id:'receiver-turn',status:'interrupted',items:[]}]}});
if(m.method==='thread/resume')send({id:m.id,error:{code:-32600,message:'Thread is open in another app'}});
});`);
  let savedTurn;
  const result=await runCodex({cwd:root,sessionId:id,afterTurnId:'receiver-turn',prompt:'original request',onSession:got=>assert.equal(got,id),onTurn:got=>{savedTurn=got;},command:process.execPath,args:[fake]});
  assert.equal(result.status,'completed');assert.equal(result.text,'{"status":"ready"}');assert.equal(savedTurn,'desktop-turn');
  const methods=readFileSync(log,'utf8').trim().split('\n').map(x=>JSON.parse(x).method);
  assert.ok(methods.includes('thread/turns/list'));assert.ok(!methods.includes('thread/resume'));assert.ok(!methods.includes('turn/start'));
});

test('desktop completion must be new, final, completed, and from the same workspace',async t=>{
 const {runCodex}=await import('../helper/codex.mjs');
 for(const mode of ['stale','older','active','interrupted','commentary','needs_input','wrong_workspace'])await t.test(mode,async t=>{
  const root=mkdtempSync(join(tmpdir(),'differ-desktop-guard-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const fake=join(root,'server.mjs'),id='12345678-1234-4234-8234-123456789abc';
  const latest={id:mode==='stale'?'receiver-turn':'desktop-turn',status:mode==='active'?'inProgress':mode==='interrupted'?'interrupted':'completed',items:[{type:'agentMessage',phase:mode==='commentary'?'commentary':'final_answer',text:JSON.stringify({status:mode==='needs_input'?'needs_input':'ready'})}]};
  const prior={id:'receiver-turn',status:'interrupted',items:[]};
  const turns=mode==='older'?[prior,latest]:[latest,prior];
  writeFileSync(fake,`import {createInterface} from 'node:readline';const send=m=>console.log(JSON.stringify(m));
createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line);
if(m.method==='initialize')send({id:m.id,result:{}});
if(m.method==='thread/read')send({id:m.id,result:{thread:{id:${JSON.stringify(id)},cwd:${JSON.stringify(mode==='wrong_workspace'?root+'/other':root)}}}});
if(m.method==='thread/turns/list')send({id:m.id,result:{data:${JSON.stringify(turns)}}});
if(m.method==='thread/resume')send({id:m.id,error:{code:-32600,message:'Thread is open in another app'}});
});`);
  await assert.rejects(runCodex({cwd:root,sessionId:id,afterTurnId:'receiver-turn',prompt:'fixture',onSession:()=>assert.fail('must not accept this result'),onTurn:()=>assert.fail('must not record this result'),command:process.execPath,args:[fake]}),e=>e.code===(mode==='wrong_workspace'?'codex_invalid_response':'codex_request_failed'));
 });
});
