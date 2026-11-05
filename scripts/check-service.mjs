// Explicit opt-in, read-only inspection of the public service. No publication or login.
// It checks what the OpenAI and Anthropic portals rely on (docs/submission.md):
// tool titles and annotations, each host's sign-in signal, OAuth discovery and
// the OpenAI domain-verification token.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const origin = 'https://publish.getdiffer.com';
const endpoint = `${origin}/mcp`;
// Well-formed arguments, so the call reaches the account check rather than schema
// validation. Without a token nothing is uploaded or published.
const html = Buffer.from('<p>preflight</p>');
const accountTools = {
  get_profile: () => ({}),
  publish_as_me: () => ({ id: crypto.randomUUID(), requestId: crypto.randomUUID(), files: [{ path: 'index.html', content: html.toString('base64') }] }),
  start_upload_as_me: async () => ({ id: crypto.randomUUID(), requestId: crypto.randomUUID(), files: [{ path: 'index.html', sha256: Buffer.from(await crypto.subtle.digest('SHA-256', html)).toString('hex') }] }),
};
const client = new Client({ name: 'differ-directory-preflight', version: '1' });
const findings = [];

// One anonymous JSON-RPC call over plain HTTP, so the status code is visible.
const anonymousCall = async (name, args, userAgent) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'user-agent': userAgent },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, challenge: response.headers.get('www-authenticate') ?? '', body: response.status === 200 ? await response.json() : null };
};

try {
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
  const { tools } = await client.listTools();
  for (const tool of tools) {
    // Both directories require a human title on every tool.
    if (!tool.title?.trim()) findings.push(`${tool.name}: missing title`);
    for (const field of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) {
      if (typeof tool.annotations?.[field] !== 'boolean') findings.push(`${tool.name}: missing explicit ${field}`);
    }
    if (['publish_bit', 'publish_as_me'].includes(tool.name)) {
      if (tool.annotations?.destructiveHint !== true) findings.push(`${tool.name}: new versions and public publication require destructiveHint review`);
      if (tool.annotations?.openWorldHint !== true) findings.push(`${tool.name}: public publication requires openWorldHint review`);
    }
  }

  // Claude starts sign-in only on an HTTP 401 with WWW-Authenticate (lazy authentication).
  // ChatGPT reads a 200 error tool result carrying _meta["mcp/www_authenticate"] with
  // error and error_description. Control picks by User-Agent (gdiffer #314).
  const signIn = {};
  for (const [name, argumentsFor] of Object.entries(accountTools)) {
    const args = await argumentsFor();
    const claude = await anonymousCall(name, args, 'Claude-User');
    if (claude.status !== 401 || !/resource_metadata="/.test(claude.challenge)) findings.push(`${name}: Claude needs HTTP 401 with a resource_metadata challenge, got ${claude.status}`);
    const chatgpt = await anonymousCall(name, args, 'openai-mcp/1.0.0');
    const challenge = chatgpt.body?.result?._meta?.['mcp/www_authenticate']?.[0] ?? '';
    if (chatgpt.status !== 200 || chatgpt.body?.result?.isError !== true || !/error="/.test(challenge) || !/error_description="/.test(challenge)) {
      findings.push(`${name}: ChatGPT needs a 200 error result whose mcp/www_authenticate names error and error_description, got ${chatgpt.status}`);
    }
    signIn[name] = { claude: claude.status, chatgpt: chatgpt.status };
  }

  const metadata = await fetch(`${origin}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(10000) });
  if (!metadata.ok) throw new Error(`OAuth discovery HTTP ${metadata.status}`);
  const oauth = await metadata.json();
  if (typeof oauth.registration_endpoint !== 'string') findings.push('OAuth discovery: no registration_endpoint (directory mcp.json declares DCR)');

  // OpenAI rescans the server and keeps checking domain ownership.
  const token = await fetch(`${origin}/.well-known/openai-apps-challenge`, { signal: AbortSignal.timeout(10000) });
  const tokenText = token.ok ? (await token.text()).trim() : '';
  if (!token.ok || !tokenText || /\s/.test(tokenText)) findings.push(`openai-apps-challenge: expected one plain-text token, got HTTP ${token.status}`);

  console.log(JSON.stringify({
    endpoint,
    tools: tools.map(t => ({ name: t.name, title: t.title, annotations: t.annotations })),
    signIn,
    oauth: { pkceS256: oauth.code_challenge_methods_supported?.includes('S256') === true, dynamicRegistration: typeof oauth.registration_endpoint === 'string' },
    openaiDomainToken: token.ok ? 'served' : `HTTP ${token.status}`,
    findings,
    note: 'No account flow or publication was exercised. This is not directory acceptance.',
  }, null, 2));
  if (findings.length) process.exitCode = 1;
} finally { await client.close(); }
