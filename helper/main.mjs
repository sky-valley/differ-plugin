import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { doctor, check, preview, publish, status, getPost, bind, connect, connectionStatus, disconnect } from './client.mjs';
import { errorResult } from './diagnostics.mjs';
import { imageCandidate, inspectVideo } from './media.mjs';
import metadata from '../package.json' with { type: 'json' };

const error = errorResult;
const output = value => process.stdout.write(JSON.stringify(value) + '\n');
async function mcp() {
  const server = new McpServer({ name: 'differ-local', version: metadata.version });
  const wrap = fn => async args => {
    try { const value = await fn(args); return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value }; }
    catch (e) { return { isError: true, content: [{ type: 'text', text: JSON.stringify(error(e)) }] }; }
  };
  const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const directory = z.string().describe('Absolute app directory (content/index.html) or content-only directory (index.html).');
  server.registerTool('publisher_status', { description: 'Check publishing service access, account, and limits. No publication.', inputSchema: {}, annotations }, wrap(doctor));
  server.registerTool('check_content', { description: 'Validate local static files without uploading or publishing. Reports shared participation as unverified: read the participation reference and examples and rehearse with the real runtime. Does not test authorization, live updates or browser behavior.', inputSchema: { directory }, annotations }, wrap(({ directory }) => check(directory)));
  server.registerTool('publish_directory', {
    description: 'Upload content when the human asks. Works as a guest without sign-in, or as the deliberately connected creator. New directory creates a post; saved identity revises it. Connected uploads are drafts: when the receipt has draft:true, say it is not published yet and show its url to preview and publish. For guests show the public URL, private claim link, expiry and unclaimed notice; never hide them or block publishing to demand sign-in.',
    inputSchema: { directory, title: z.string().min(1).max(200).optional().describe('Defaults to saved title or HTML title.'), newPost: z.boolean().optional(), parentPostId: z.string().uuid().optional(), parentRevisionId: z.string().uuid().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, wrap(({ directory, title, ...options }) => publish(directory, title, options)));
  server.registerTool('connect_account', { description: 'When the human asks to sign in/connect, start browser approval and return its private link and verification code. Do not approve it on their behalf. This authorizes future posts, not claims of earlier guest posts.', inputSchema: {}, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } }, wrap(connect));
  server.registerTool('connection_status', { description: 'After the human approves the connection link, finish connecting. Respect retryAfter; do not poll in a tight loop.', inputSchema: {}, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } }, wrap(connectionStatus));
  server.registerTool('disconnect_account', { description: 'Only when the human requests it, revoke this agent connection and explicitly return future publishing to guest mode. Existing posts keep ownership.', inputSchema: {}, annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false } }, wrap(disconnect));
  server.registerTool('publication_status', { description: 'Recover a pending publication or verify the saved receipt for a local directory.', inputSchema: { directory }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, wrap(({ directory }) => status(directory)));
  server.registerTool('get_post', { description: 'Inspect a remote post before conflict recovery or diffing.', inputSchema: { postId: z.string().uuid() }, annotations }, wrap(({ postId }) => getPost(postId)));
  server.registerTool('image_candidate', { description: 'Create a separate WebP candidate using installed cwebp. Never replaces source or adopts visual quality automatically.', inputSchema: { source: z.string(), output: z.string(), quality: z.number().min(0).max(100).optional() }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } }, wrap(({ source, output, quality }) => imageCandidate(source, output, quality)));
  server.registerTool('inspect_video', { description: 'Read recording dimensions, codec, duration and encoded frame rate using installed ffprobe. Not proof of smooth motion or good composition.', inputSchema: { file: z.string() }, annotations }, wrap(({ file }) => inspectVideo(file)));
  await server.connect(new StdioServerTransport());
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const option = name => { const at = args.indexOf(`--${name}`); return at < 0 ? undefined : args[at + 1]; };
  switch (command) {
    case 'mcp': return mcp();
    case 'doctor': return output(await doctor());
    case 'connect': return output(await connect());
    case 'connection-status': return output(await connectionStatus());
    case 'disconnect': return output(await disconnect());
    case 'check': return output(check(args[0]));
    case 'status': return output(await status(args[0]));
    case 'get-post': return output(await getPost(args[0]));
    case 'bind': return output(await bind(args[0], option('post')));
    case 'image-candidate': return output(imageCandidate(args[0], option('output'), option('quality') === undefined ? 85 : Number(option('quality'))));
    case 'inspect-video': return output(inspectVideo(args[0]));
    case 'publish': return output(await publish(args[0], option('title'), { newPost: args.includes('--new'), parentPostId: option('parent-post'), parentRevisionId: option('parent-revision') }));
    case 'preview': {
      const { server, mount } = preview(args[0], Number(option('port') || 0));
      server.on('error', error => {
        output({ code: 'preview_unavailable', message: `Local preview could not listen (${error.code}).`, recovery: 'Use an available loopback port or authorize local listening in this environment, then retry. No content was uploaded.' });
        process.exitCode = 1;
      });
      server.on('listening', () => output({ url: `http://127.0.0.1:${server.address().port}${mount}`, snapshot: true, note: 'Restart preview after editing. Nothing uploaded.' }));
      return;
    }
    default: output({ commands: ['doctor', 'connect', 'connection-status', 'disconnect', 'check APP_OR_CONTENT', 'preview APP_OR_CONTENT [--port N]', 'publish APP_OR_CONTENT [--title TITLE] [--new]', 'status APP_OR_CONTENT', 'get-post UUID', 'bind APP_OR_CONTENT --post UUID', 'image-candidate FILE --output NEW.webp [--quality 85]', 'inspect-video FILE', 'mcp'], note: 'Node 24+. App roots resolve content/. Keep differ-post.json with source for team handoff; keep .differ state locally for retries. Guest publishing needs no setup. Connect optionally to publish as yourself. Never pass tokens in chat.' });
  }
}
main().catch(e => { output(error(e)); process.exitCode = 1; });
