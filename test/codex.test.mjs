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
