import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

test('task-open selects Claude Desktop, preserves terminal default, and refuses active tasks',t=>{
 const root=mkdtempSync(join(tmpdir(),'differ-open-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const id='agt_'+'a'.repeat(64),sessionId='12345678-1234-4234-8234-123456789abc';
 const directory=join(root,'tasks',id),workspace=join(directory,'workspace'),wire=join(root,'wire');
 mkdirSync(workspace,{recursive:true,mode:0o700});
 writeFileSync(join(workspace,'source.json'),JSON.stringify({bitId:'bit',versionId:'version'}));
 const task={schema:1,id,claimId:sessionId,sessionId,agent:'claude-code',state:'completed',delivery:{parentBitId:'bit',parentVersionId:'version'}};
 const save=()=>writeFileSync(join(directory,'task.json'),JSON.stringify(task),{mode:0o600});save();
 writeFileSync(join(root,'claude'),`#!${process.execPath}\nimport {writeFileSync,existsSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(wire)},JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),locked:existsSync(${JSON.stringify(join(directory,'lock'))})}));\n`,{mode:0o700});
 const open=(...args)=>spawnSync(process.execPath,[resolve('helper/main.mjs'),'task-open',id,...args],{encoding:'utf8',env:{...process.env,DIFFER_CONFIG:join(root,'publisher.json'),PATH:root+':'+process.env.PATH}});
 for(const [options,expected] of [[['--interface','desktop'],['--desktop','--resume',sessionId]],[[],['--resume',sessionId]]]){
  const result=open(...options);assert.equal(result.status,0,result.stderr||result.stdout);
  const call=JSON.parse(readFileSync(wire,'utf8'));assert.deepEqual(call.args,expected);
  assert.equal(call.cwd,realpathSync(workspace));
  assert.equal(call.locked,true);assert.equal(existsSync(join(directory,'lock')),false);
 }
 for(const [state,agent,options,code] of [
  ['running','claude-code',['--interface','desktop'],'agent_still_working'],
  ['completed','pi',['--interface','desktop'],'unsupported_interface'],
  ['completed','claude-code',['--interface','browser'],'unsupported_interface'],
  ['completed','claude-code',['--interface'],'unsupported_interface'],
 ]){
  task.state=state;task.agent=agent;save();rmSync(wire,{force:true});
  const result=open(...options);assert.match(result.stdout+result.stderr,new RegExp(code));
  assert.equal(existsSync(wire),false);assert.equal(existsSync(join(directory,'lock')),false);
 }
});
