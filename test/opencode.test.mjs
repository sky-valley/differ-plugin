import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runOpenCode} from '../helper/opencode.mjs';

for(const mode of ['ready','permission','resume','wrong-id'])test(`OpenCode ACP: ${mode}`,async t=>{
 const cwd=mkdtempSync(join(tmpdir(),'differ-opencode-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const script=join(cwd,'cli.mjs'),wire=join(cwd,'wire'),saved=join(cwd,'saved'),id='ses_abcdefgh123456';
 writeFileSync(script,`import {createInterface} from 'node:readline';import {appendFileSync,existsSync} from 'node:fs';
const send=m=>console.log(JSON.stringify({jsonrpc:'2.0',...m}));
createInterface({input:process.stdin}).on('line',line=>{appendFileSync(${JSON.stringify(wire)},line+'\\n');const m=JSON.parse(line);
 if(m.method==='initialize')send({id:m.id,result:{protocolVersion:1,agentCapabilities:{loadSession:true}}});
 if(m.method==='session/new'||m.method==='session/load'){
  send({method:'session/update',params:{sessionId:'${id}',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'old history'}}}});
  send({id:m.id,result:{sessionId:${JSON.stringify(mode==='wrong-id'?'bad/path':id)}}});
 }
 if(m.method==='session/prompt'){
  if(!existsSync(${JSON.stringify(saved)}))process.exit(3);
  if(${JSON.stringify(mode)}==='permission'){send({id:99,method:'session/request_permission',params:{sessionId:'${id}',options:[{optionId:'allow',kind:'allow_once'}]}});return;}
  for(const text of ['{"status":','"ready"}'])send({method:'session/update',params:{sessionId:'${id}',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text}}}});
  send({id:m.id,result:{stopReason:'end_turn'}});
 }
});`);
 const operation=runOpenCode({cwd,prompt:'private',sessionId:mode==='resume'?id:undefined,onSession:value=>writeFileSync(saved,value),command:process.execPath,args:[script]});
 if(mode==='wrong-id'){await assert.rejects(operation,e=>e.code==='invalid_session');return;}
 const result=await operation;
 assert.equal(result.status,mode==='permission'?'needs_input':'completed');
 if(mode!=='permission')assert.equal(result.text,'{"status":"ready"}','history is not this turn’s answer');
 const calls=readFileSync(wire,'utf8').trim().split('\n').map(JSON.parse);
 const start=calls.find(c=>c.method==='session/new'||c.method==='session/load');
 assert.equal(start.params.cwd,cwd);assert.deepEqual(start.params.mcpServers,[]);
 if(mode==='resume')assert.equal(start.method,'session/load');
 assert.ok(!calls.some(c=>c.result?.outcome?.optionId==='allow'));
});
