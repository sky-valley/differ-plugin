import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fixture, task } from './task-fixture.mjs';
import { saveTask, taskDirectory } from '../helper/task-store.mjs';
const bit = '12345678-1234-4234-8234-123456789abc', version = '22345678-1234-4234-8234-123456789abc';
const claimId = '32345678-1234-4234-8234-123456789abc';
async function setup(t) {
  const f = await fixture(t); const before = process.env.DIFFER_CONFIG; process.env.DIFFER_CONFIG = f.config;
  t.after(() => { if (before === undefined) delete process.env.DIFFER_CONFIG; else process.env.DIFFER_CONFIG = before; });
  const record = { schema:1, ...task, claimId, publisher:f.url, state:'received', delivery:{ parentBitId:bit, parentVersionId:version, prompt:'private' } };
  saveTask(record);
  const source = { bitId:bit, versionId:version, caption:'Original caption', files:[{path:'index.html',content:Buffer.from('<h1>Source</h1>').toString('base64')}] };
  f.state.reply = () => ({status:200,body:source});
  return { ...f, source, record, dir:taskDirectory(task.id) };
}
test('source downloads the exact received parent and preserves edits on retry', async t => {
  const f=await setup(t); const result=await f.run(['task-source',task.id]);
  assert.equal(result.status,0); const content=join(f.dir,'workspace','content','index.html');
  assert.equal(readFileSync(content,'utf8'),'<h1>Source</h1>');
  assert.equal(f.calls[0].path,`/v1/publishing/agent-tasks/${task.id}/source?claimId=${claimId}`);
  assert.equal(f.calls[0].headers.authorization,'Bearer dfa_test_access');
  assert.ok(!result.stdout.includes('private'));
  writeFileSync(content,'Edited');
  assert.equal((await f.run(['task-source',task.id])).status,0);
  assert.equal(readFileSync(content,'utf8'),'Edited'); assert.equal(f.calls.length,1);
});
test('source rejects wrong versions, paths, duplicate files and bad base64 before writing content', async t => {
  const f=await setup(t);
  for (const source of [{...f.source,versionId:bit}, {...f.source,files:[{path:'../escape.html',content:'YQ=='}]},
    {...f.source,files:[...f.source.files,...f.source.files]}, {...f.source,files:[{path:'index.html',content:'!'}]}]) {
    f.state.reply=()=>({status:200,body:source});
    assert.equal((await f.run(['task-source',task.id])).status,1);
    assert.equal(existsSync(join(f.dir,'workspace')),false);
  }
});
test('source requires receipt and refuses an existing linked workspace', async t => {
  const f=await setup(t); saveTask({...f.record,state:'saved'});
  assert.equal((await f.run(['task-source',task.id])).status,1); assert.equal(f.calls.length,0);
  saveTask(f.record); symlinkSync(f.root,join(f.dir,'workspace'));
  assert.equal((await f.run(['task-source',task.id])).status,1); assert.equal(f.calls.length,0);
});
