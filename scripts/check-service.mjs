// Explicit opt-in, read-only inspection of the public service. No creation or login.
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
    if (['publish_creation', 'publish_as_me'].includes(tool.name)) {
      if (tool.annotations?.destructiveHint !== true) findings.push(`${tool.name}: revisions and public publication require destructiveHint review`);
      if (tool.annotations?.openWorldHint !== true) findings.push(`${tool.name}: public publication requires openWorldHint review`);
    }
  }
  const metadata = await fetch(`${origin}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(10000) });
  if (!metadata.ok) throw new Error(`OAuth discovery HTTP ${metadata.status}`);
  const oauth = await metadata.json();
  console.log(JSON.stringify({ endpoint: `${origin}/mcp`, tools: tools.map(t => ({ name: t.name, annotations: t.annotations })), oauth: { pkceS256: oauth.code_challenge_methods_supported?.includes('S256') === true, dynamicRegistration: typeof oauth.registration_endpoint === 'string' }, findings, note: 'No account flow or publication was exercised. This is not directory acceptance.' }, null, 2));
  if (findings.length) process.exitCode = 1;
} finally { await client.close(); }
