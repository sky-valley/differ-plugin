import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, task } from './task-fixture.mjs';
import { saveTask, readTask, taskDirectory } from '../helper/task-store.mjs';
const bit='12345678-1234-4234-8234-123456789abc', version='22345678-1234-4234-8234-123456789abc', claimId='32345678-1234-4234-8234-123456789abc';

test('runner freezes publication bytes and retries one publication after a lost response', async t=>{
 const { advanceTask }=await import('../helper/task-runner.mjs');
 const f=await fixture(t); const env={DIFFER_CONFIG:process.env.DIFFER_CONFIG,DIFFER_PUBLISH_URL:process.env.DIFFER_PUBLISH_URL};
 process.env.DIFFER_CONFIG=f.config;process.env.DIFFER_PUBLISH_URL=f.url;
 t.after(()=>{for(const [k,v] of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const dir=taskDirectory(task.id);mkdirSync(join(dir,'workspace','content'),{recursive:true});writeFileSync(join(dir,'workspace','content','index.html'),'<h1>Done</h1>');
 writeFileSync(join(dir,'workspace','source.json'),JSON.stringify({bitId:bit,versionId:version}));
 const record={schema:1,id:task.id,claimId,publisher:f.url,offerVersion:1,state:'ready',prepared:true,sessionId:bit,delivery:{parentBitId:bit,parentVersionId:version,prompt:JSON.stringify({schema:1,instructions:'Use my data',caption:'My own caption',publish:true})}};
 saveTask(record);let uploads=0; const bodies=[];
 f.state.reply=call=>{
  if(call.path.endsWith('/versions')){ bodies.push(JSON.parse(call.body)); return ++uploads===1?{status:503,body:{message:'private'}}:{status:200,body:{state:'succeeded',bitId:JSON.parse(readFileSync(join(dir,'publication.json'),'utf8')).bitId,versionId:version}}; }
  if(call.path.endsWith('/outcome'))return {status:200,body:{id:task.id,state:'completed',version:5}};
  if(call.path==='/v1/publishing/account')return {status:200,body:{handle:'maker'}};
  return {status:200,body:{id:task.id,state:'received',version:4,session:{id:bit,state:'ready'}}};
 };
 await assert.rejects(advanceTask(task.id));
 writeFileSync(join(dir,'workspace','content','index.html'),'<h1>Changed after uncertain upload</h1>');
 await advanceTask(task.id);
 assert.equal(readTask(task.id).state,'completed');assert.equal(uploads,2);assert.deepEqual(bodies[0],bodies[1]);
 assert.equal(bodies[0].publish,true);assert.equal(bodies[0].parentBitId,bit);assert.equal(bodies[0].parentVersionId,version);assert.equal(bodies[0].caption,'My own caption');
 await advanceTask(task.id);assert.equal(uploads,2);
});

test('a stopped turn needs explicit continuation and keeps the same session', async t=>{
 const {advanceTask}=await import('../helper/task-runner.mjs');
 const f=await fixture(t);const before={DIFFER_CONFIG:process.env.DIFFER_CONFIG,DIFFER_PUBLISH_URL:process.env.DIFFER_PUBLISH_URL};
 Object.assign(process.env,{DIFFER_CONFIG:f.config,DIFFER_PUBLISH_URL:f.url});
 t.after(()=>{for(const[k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const dir=taskDirectory(task.id);mkdirSync(join(dir,'workspace','content'),{recursive:true});
 writeFileSync(join(dir,'workspace','source.json'),JSON.stringify({bitId:bit,versionId:version}));
 saveTask({schema:1,id:task.id,claimId,publisher:f.url,state:'running',prepared:true,sessionId:bit,delivery:{parentBitId:bit,parentVersionId:version,prompt:JSON.stringify({schema:1,instructions:'Read my data',caption:'My data',publish:true})}});
 let continuation=0, executions=0;
 f.state.reply=()=>({status:200,body:{id:task.id,state:'received',version:4,continuation,session:{id:bit,state:'needs_input'}}});
 const execute=async options=>{executions++;assert.equal(options.sessionId,bit);await options.onSession(bit);options.onTurn('turn-two');return {status:'needs_input'};};
 assert.equal((await advanceTask(task.id,{execute})).state,'needs_input');assert.equal(executions,0);
 continuation=1;assert.equal((await advanceTask(task.id,{execute})).state,'needs_input');assert.equal(executions,1);
 await advanceTask(task.id,{execute});assert.equal(executions,1);
 assert.ok(f.calls.every(c=>!c.path.endsWith('/versions')));
});
