import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {agentProcess} from '../helper/agent-process.mjs';

function fixture(t,source,options={}) {
 const cwd=mkdtempSync(join(tmpdir(),'differ-process-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));
 const script=join(cwd,'child.mjs');writeFileSync(script,source);
 const process=agentProcess({cwd,command:globalThis.process.execPath,args:[script],...options});
 t.after(()=>process.close());return {process,cwd};
}
test('JSONL preserves split UTF-8 and drains complete output before EOF',async t=>{
 const {process}=fixture(t,`const data=Buffer.from('{"value":"é😀"}\\n');for(const byte of data){process.stdout.write(Buffer.from([byte]));await new Promise(r=>setTimeout(r,1));}`);
 assert.deepEqual(await process.next(),{value:'é😀'});
 await assert.rejects(process.next(),e=>e.code==='agent_disconnected');
});
test('missing executable and early exit are failures, not ready results',async t=>{
 const missing=agentProcess({command:join(tmpdir(),'differ-no-such-agent'),args:[],cwd:tmpdir()});
 try{await assert.rejects(missing.next(),e=>e.code==='agent_unavailable');}finally{await missing.close();}
 const {process}=fixture(t,'process.exit(7)');
 await assert.rejects(process.next(),e=>e.code==='agent_disconnected');
});
test('malformed or oversized output cannot become a result',async t=>{
 for(const source of [`console.log('not json')`,`process.stdout.write('x'.repeat(9*1024*1024));setInterval(()=>{},1000)`]){
  const {process}=fixture(t,source);
  await assert.rejects(process.next(),e=>e.code==='agent_invalid_response');await process.close();
 }
});
test('cancellation releases the child before files are handed over',async t=>{
 const abort=new AbortController();
 const {process,cwd}=fixture(t,`import {writeFileSync} from 'node:fs';writeFileSync('pid',String(process.pid));console.log('{"started":true}');setInterval(()=>{},1000);`,{signal:abort.signal});
 await process.next();abort.abort();await assert.rejects(process.next(),e=>e.code==='agent_interrupted');
 await process.close();assert.throws(()=>globalThis.process.kill(Number(readFileSync(join(cwd,'pid'),'utf8')),0),{code:'ESRCH'});
});
test('an unresponsive agent reaches its bounded deadline',async t=>{
 const {process}=fixture(t,'setInterval(()=>{},1000)',{timeoutMs:50});
 await assert.rejects(process.next(),e=>e.code==='agent_timeout');
});
