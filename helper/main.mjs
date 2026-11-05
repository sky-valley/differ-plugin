import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { doctor, check, preview, publish, status, getBit, bind, connect, connectionStatus, disconnect } from './client.mjs';
import { errorResult } from './diagnostics.mjs';
import {openTask} from './task-agents.mjs';
import { watchTasks } from './task-watch.mjs';
import { installReceiver } from './task-service.mjs';
import { advanceTask, localTaskView } from './task-runner.mjs';
import { readTask } from './task-store.mjs';
import { prepareTask } from './task-source.mjs';
import { receiveTask } from './task-receipt.mjs';
import { pollTasks, taskCursor } from './tasks.mjs';
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
    description: 'Upload content when the human asks. Works as a guest without sign-in, or as the deliberately connected creator. A new directory creates a bit; its saved identity uploads a new version of that bit. Connected uploads are drafts: when the receipt has draft:true, say it is not published yet and show its url, where the maker previews it, confirms its caption and publishes it. For guests show the url, private claim link, expiry and unclaimed notice; never hide them or block publishing to demand sign-in.',
    inputSchema: { directory,
      caption: z.string().optional().describe("The maker's own words shown over the bit: 1–200 characters, at most 3 line breaks, checked before upload. Suggest it and let the maker confirm it; they confirm it again in Differ before the bit goes public. Defaults to the caption differ-bit.json saved for this bit."),
      newBit: z.boolean().optional(), parentBitId: z.string().uuid().optional(), parentVersionId: z.string().uuid().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, wrap(({ directory, caption, ...options }) => publish(directory, caption, options)));
  server.registerTool('connect_account', { description: 'When the human asks to sign in/connect, start browser approval and return its private link and verification code. Do not approve it on their behalf. This authorizes future bits, not claims of earlier guest bits.', inputSchema: {}, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } }, wrap(connect));
  server.registerTool('connection_status', { description: 'After the human approves the connection link, finish connecting. Respect retryAfter; do not poll in a tight loop.', inputSchema: {}, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } }, wrap(connectionStatus));
  server.registerTool('disconnect_account', { description: 'Only when the human requests it, revoke this agent connection and explicitly return future publishing to guest mode. Existing bits keep their ownership.', inputSchema: {}, annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false } }, wrap(disconnect));
  server.registerTool('publication_status', { description: 'Recover a pending publication or verify the saved receipt for a local directory.', inputSchema: { directory }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } }, wrap(({ directory }) => status(directory)));
  server.registerTool('get_bit', { description: 'Inspect a remote bit and its versions before conflict recovery or diffing.', inputSchema: { bitId: z.string().uuid() }, annotations }, wrap(({ bitId }) => getBit(bitId)));
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
    case 'tasks-install': return output(installReceiver(false,option('agent')));
    case 'tasks-uninstall': return output(installReceiver(true));
    case 'tasks-watch': {
      const controller=new AbortController(); const stop=()=>controller.abort();
      process.once('SIGINT',stop);process.once('SIGTERM',stop);
      try{return await watchTasks({signal:controller.signal,report:output,agent:option('agent')});}
      finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
    }
    case 'task-run': return output(await advanceTask(args[0],{agent:option('agent')}));
    case 'task-open': return openTask(args[0]);
    case 'task-status': return output(localTaskView(readTask(args[0])));
    case 'task-source': return output(await prepareTask(args[0]));
    case 'task-receive': return output(await receiveTask(args[0], args.length === 2 ? Number(args[1]) : NaN));
    case 'tasks': return output(await pollTasks(taskCursor(args)));
    case 'connect': return output(await connect());
    case 'connection-status': return output(await connectionStatus());
    case 'disconnect': return output(await disconnect());
    case 'check': return output(check(args[0]));
    case 'status': return output(await status(args[0]));
    case 'get-bit': return output(await getBit(args[0]));
    case 'bind': return output(await bind(args[0], option('bit')));
    case 'image-candidate': return output(imageCandidate(args[0], option('output'), option('quality') === undefined ? 85 : Number(option('quality'))));
    case 'inspect-video': return output(inspectVideo(args[0]));
    case 'publish': return output(await publish(args[0], option('caption'), { newBit: args.includes('--new'), parentBitId: option('parent-bit'), parentVersionId: option('parent-version') }));
    case 'preview': {
      const { server, mount, pages } = preview(args[0], Number(option('port') || 0));
      server.on('error', error => {
        output({ code: 'preview_unavailable', message: `Local preview could not listen (${error.code}).`, recovery: 'Use an available loopback port or authorize local listening in this environment, then retry. No content was uploaded.' });
        process.exitCode = 1;
      });
      server.on('listening', () => {
        const origin = `http://127.0.0.1:${server.address().port}`;
        output({ url: origin + mount, pages: Object.fromEntries(pages.map(page => [page, `${origin}/${page}`])), snapshot: true,
          note: 'Open url to see preview.html at 390×520 and index.html open at 390×693, framed as Differ frames them, with a stand-in for the SDK Differ adds to every page. differ.open and differ.close are logged on that page and in the console. Restart preview after editing. Nothing uploaded.' });
      });
      return;
    }
    default: output({ commands: ['doctor', 'tasks [--after SEQUENCE]', 'task-receive ID VERSION', 'task-source ID', 'task-run ID [--agent codex|claude-code|pi|opencode]', 'task-open ID', 'task-status ID', 'tasks-watch [--agent codex|claude-code|pi|opencode]', 'tasks-install [--agent codex|claude-code|pi|opencode]', 'tasks-uninstall', 'connect', 'connection-status', 'disconnect', 'check APP_OR_CONTENT', 'preview APP_OR_CONTENT [--port N]', 'publish APP_OR_CONTENT [--caption CAPTION] [--new] [--parent-bit UUID --parent-version UUID]', 'status APP_OR_CONTENT', 'get-bit UUID', 'bind APP_OR_CONTENT --bit UUID', 'image-candidate FILE --output NEW.webp [--quality 85]', 'inspect-video FILE', 'mcp'], note: 'Node 24+. App roots resolve content/. Keep differ-bit.json with source for team handoff; keep .differ state locally for retries. Guest publishing needs no setup. Connect optionally to publish as yourself. Never pass tokens in chat.' });
  }
}
main().catch(e => { output(error(e)); process.exitCode = 1; });
