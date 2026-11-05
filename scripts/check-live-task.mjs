// Explicit opt-in: starts the user's selected local agent and may use model credits.
// Control and publishing are local fixtures; no live Differ account is touched.
const {taskAgent,resumeInvocation} = await import('../helper/task-agents.mjs');
const selected = process.env.DIFFER_LIVE_AGENT || (process.env.DIFFER_LIVE_CODEX === '1' ? 'codex' : '');
if (!selected) throw new Error('Set DIFFER_LIVE_AGENT=codex|claude-code|pi|opencode to run the installed agent integration check.');
const agent = taskAgent(selected);
const { createServer } = await import('node:http');
const { once } = await import('node:events');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
const { randomUUID } = await import('node:crypto');
const assert = (await import('node:assert/strict')).default;
const { receiveTask } = await import('../helper/task-receipt.mjs');
const { advanceTask } = await import('../helper/task-runner.mjs');
const id = `agt_${'c'.repeat(64)}`, bit = randomUUID(), version = randomUUID();
const root = mkdtempSync(join(tmpdir(), 'differ-live-task-'));
let state = 'requested', revision = 1, session, upload, claimId;
const server = createServer(async (req, res) => {
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    assert.equal(req.headers.authorization, 'Bearer dfa_fixture');
    let answer;
    if (req.url.endsWith('/claim')) {
      claimId = body.claimId; state = 'claimed'; revision++;
      answer = { id, version: revision, claimId, expiresAt: new Date(Date.now() + 60_000).toISOString(), parentBitId: bit, parentVersionId: version,
        prompt: JSON.stringify({ schema: 1, instructions: 'Replace SOURCE-0 with DATA-42 in content/index.html. Keep the markup. Use file tools instead of shell commands. This is a tiny local fixture; do not browse, use connectors, or access any other personal files. Check the saved HTML. No browser check is needed for this one text replacement.', caption: 'My test data', publish: true }) };
    } else if (req.url.endsWith('/receipt')) { state = 'received'; revision++; }
    else if (req.url.includes('/source?')) answer = { bitId: bit, versionId: version, caption: 'Original', files: [{ path: 'index.html', content: Buffer.from('<!doctype html><html><head><title>Data</title></head><body><h1>SOURCE-0</h1></body></html>').toString('base64') }] };
    else if (req.url.endsWith('/session')) { session = body.session; revision++; }
    else if (req.url.endsWith('/versions')) {
      upload = body;
      answer = { state: 'succeeded', bitId: req.url.split('/')[4], versionId: randomUUID() };
    } else if (req.url.endsWith('/outcome')) { state = 'completed'; revision++; }
    answer ||= { id, state, version: revision, ...(session ? { session } : {}) };
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(answer));
  } catch { res.statusCode = 500; res.end('{}'); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}`;
process.env.DIFFER_CONFIG = join(root, 'publisher.json'); process.env.DIFFER_PUBLISH_URL = url;
writeFileSync(process.env.DIFFER_CONFIG, JSON.stringify({ mode: 'connected', url, accessToken: 'dfa_fixture', expiresAt: Date.now() + 3600_000 }), { mode: 0o600 });
try {
  await receiveTask(id, 1);
  const result = await advanceTask(id,{agent,signal:AbortSignal.timeout(180_000)});
  assert.equal(result.state, 'completed');
  assert.equal(upload.parentBitId, bit); assert.equal(upload.parentVersionId, version);
  assert.equal(upload.caption, 'My test data'); assert.equal(upload.publish, true);
  const html = Buffer.from(upload.files.find(file => file.path === 'index.html').content, 'base64').toString();
  assert.ok(html.includes('DATA-42')); assert.ok(!html.includes('SOURCE-0'));
  const saved = JSON.parse(readFileSync(join(root, 'tasks', id, 'task.json'), 'utf8'));
  assert.ok(saved.sessionId);
  if (agent === 'codex') assert.ok(saved.turnId);
  assert.equal(saved.agent, agent); assert.equal(session.agent, agent);
  assert.equal(resumeInvocation(saved).cwd, join(root,'tasks',id,'workspace'));
  console.log(JSON.stringify({ completed: true, actualAgent: agent, verifiedFileChange: true, exactLineage: true, publication: 'local fixture only', workspace: root }));
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  // Retain this workspace for the persistent agent session and manual review.
  rmSync(process.env.DIFFER_CONFIG, { force: true });
}
