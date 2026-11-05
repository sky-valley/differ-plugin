import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, task } from './task-fixture.mjs';
import { readTask } from '../helper/task-store.mjs';
const bit='12345678-1234-4234-8234-123456789abc';
test('watcher receives new work while another task is running and stops on abort', async t=>{
 const {watchTasks}=await import('../helper/task-watch.mjs');
 const f=await fixture(t),before={DIFFER_CONFIG:process.env.DIFFER_CONFIG,DIFFER_PUBLISH_URL:process.env.DIFFER_PUBLISH_URL};
 Object.assign(process.env,{DIFFER_CONFIG:f.config,DIFFER_PUBLISH_URL:f.url});
 t.after(()=>{for(const[k,v]of Object.entries(before)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const second={id:`agt_${'b'.repeat(64)}`,version:1};let polls=0,working=false;
 f.state.reply=call=>{
  if(call.path.includes('?after='))return {status:200,body:{tasks:++polls===1?[task]:[second],next:0}};
  const id=call.path.includes(second.id)?second.id:task.id;
  if(call.path.endsWith('/claim'))return {status:200,body:{id,version:2,claimId:JSON.parse(call.body).claimId,expiresAt:new Date(Date.now()+60000).toISOString(),parentBitId:bit,parentVersionId:bit,prompt:'private'}};
  return {status:200,body:{id,version:3,state:'received'}};
 };
 const controller=new AbortController();let release;
 const blocked=new Promise(resolve=>{release=resolve;});
 const run=watchTasks({signal:controller.signal,intervalMs:10,report:()=>{},execute:async()=>{working=true;await blocked;}});
 const deadline=Date.now()+3000;
 while(Date.now()<deadline && (!working || readTask(second.id)?.state!=='received'))await new Promise(r=>setTimeout(r,10));
 assert.ok(working);assert.equal(readTask(second.id).state,'received');
 controller.abort();release();await run;
});

test('macOS service arguments and environment are XML escaped without shell evaluation',async()=>{
 const {receiverPlist}=await import('../helper/task-service.mjs');
 const plist=receiverPlist({node:'/node binary',helper:'/a&b/helper.cjs',config:'/private/config.json',publisher:'https://publish.example',path:'/bin:/a<b',log:'/private/log'});
 assert.ok(plist.includes('<string>/node binary</string>'));
 assert.ok(plist.includes('/a&amp;b/helper.cjs'));assert.ok(plist.includes('/bin:/a&lt;b'));
 assert.ok(plist.includes('<string>tasks-watch</string>'));assert.ok(!plist.includes('/bin/sh'));
});
