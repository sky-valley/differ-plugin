import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runClaude} from '../helper/claude.mjs';

// A denial the agent worked around leaves a ready answer complete; an unfinished one waits.
const expected={ready:'completed',denied:'completed','denied-event':'completed','denied-unfinished':'needs_input',failure:'failed',resume:'completed'};
for(const mode of Object.keys(expected)) test(`Claude protocol: ${mode}`,async t=>{
 const cwd=mkdtempSync(join(tmpdir(),'differ-claude-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const script=join(cwd,'cli.mjs'), saved=join(cwd,'saved'), wire=join(cwd,'wire');
 writeFileSync(script,`import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const args=process.argv.slice(2);writeFileSync(${JSON.stringify(wire)},JSON.stringify(args));
let input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{
 if(!existsSync(${JSON.stringify(saved)}))process.exit(2);
 const id=readFileSync(${JSON.stringify(saved)},'utf8');
 if(!input.includes('private task'))process.exit(3);
 console.log(JSON.stringify({type:'system',subtype:'init',session_id:id}));
 if(${mode==='denied-event'})console.log(JSON.stringify({type:'system',subtype:'permission_denied',session_id:id}));
 console.log(JSON.stringify({type:'result',subtype:${JSON.stringify(mode==='failure'?'error_during_execution':'success')},is_error:${mode==='failure'},session_id:id,result:${JSON.stringify(mode==='denied-unfinished'?'{"status":"needs_input"}':'{"status":"ready"}')},permission_denials:${['denied','denied-unfinished'].includes(mode)?'[{tool_name:"Bash"}]':'[]'}}));
 setTimeout(()=>process.exit(0),100);
});`);
 const prior=mode==='resume'?'12345678-1234-4234-8234-123456789abc':undefined;
 const result=await runClaude({cwd,prompt:'private task',sessionId:prior,onSession:id=>writeFileSync(saved,id),command:process.execPath,args:[script]});
 assert.equal(result.status,expected[mode]);
 assert.equal(result.denied,mode.startsWith('denied')?true:undefined);
 const args=JSON.parse(readFileSync(wire,'utf8'));
 assert.ok(args.includes(prior?'--resume':'--session-id'));
 assert.ok(!args.includes('--dangerously-skip-permissions'));
 assert.ok(!args.includes('private task'));
 assert.equal(args[args.indexOf('--permission-mode')+1],'acceptEdits');
});

test('agent selection rejects unknown commands and opens the exact local folder',async()=>{
 const {taskAgent,resumeInvocation}=await import('../helper/task-agents.mjs');
 assert.throws(()=>taskAgent('sh'),e=>e.code==='unsupported_agent');
 assert.equal(taskAgent(),'codex');
 const id='12345678-1234-4234-8234-123456789abc';
 assert.throws(()=>resumeInvocation({agent:'claude-code',sessionId:'../path'}),e=>e.code==='invalid_session');
});
