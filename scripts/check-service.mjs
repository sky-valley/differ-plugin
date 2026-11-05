// Explicit opt-in, read-only inspection of the public service. No publication or login.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const origin = 'https://publish.getdiffer.com';
const client = new Client({ name: 'differ-directory-preflight', version: '1' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`)));
  const { tools } = await client.listTools();
  const findings = [];
  for (const tool of tools) {
    for (const field of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) {
      if (typeof tool.annotations?.[field] !== 'boolean') findings.push(`${tool.name}: missing explicit ${field}`);
    }
    if (['publish_bit', 'publish_as_me'].includes(tool.name)) {
      if (tool.annotations?.destructiveHint !== true) findings.push(`${tool.name}: new versions and public publication require destructiveHint review`);
      if (tool.annotations?.openWorldHint !== true) findings.push(`${tool.name}: public publication requires openWorldHint review`);
    }
  }
  for (const tool of tools) if (!tool.title) findings.push(`${tool.name}: missing title`);
  // One /mcp URL signs in lazily: Claude reads an HTTP 401, OpenAI's hosts a
  // tool result carrying _meta["mcp/www_authenticate"] (gdiffer decision 0147).
  const callAccountTool = userAgent => fetch(`${origin}/mcp`, {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'user-agent': userAgent },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_profile', arguments: {} } }),
  });
  const claude = await callAccountTool('Claude-User');
  if (claude.status !== 401 || !claude.headers.get('www-authenticate')?.includes('resource_metadata=')) findings.push(`anonymous account tool for Claude: HTTP ${claude.status}, want 401 with WWW-Authenticate`);
  const chatgpt = await callAccountTool('openai-mcp/1.0');
  const chatgptBody = await chatgpt.text();
  if (!chatgpt.ok || !chatgptBody.includes('mcp/www_authenticate')) findings.push(`anonymous account tool for OpenAI: HTTP ${chatgpt.status}, want a tool result with mcp/www_authenticate`);
  // OpenAI rescans the server and rechecks the domain token after approval.
  const challenge = await fetch(`${origin}/.well-known/openai-apps-challenge`, { signal: AbortSignal.timeout(10000) });
  if (!challenge.ok || !(await challenge.text()).trim()) findings.push(`OpenAI domain token: HTTP ${challenge.status}, want the token`);
  const metadata = await fetch(`${origin}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(10000) });
  if (!metadata.ok) throw new Error(`OAuth discovery HTTP ${metadata.status}`);
  const oauth = await metadata.json();
  console.log(JSON.stringify({ endpoint: `${origin}/mcp`, tools: tools.map(t => ({ name: t.name, annotations: t.annotations })), oauth: { pkceS256: oauth.code_challenge_methods_supported?.includes('S256') === true, dynamicRegistration: typeof oauth.registration_endpoint === 'string' }, findings, note: 'No account flow or publication was exercised. This is not directory acceptance.' }, null, 2));
  if (findings.length) process.exitCode = 1;
} finally { await client.close(); }
