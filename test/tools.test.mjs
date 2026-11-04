import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const bundle = fileURLToPath(new URL('../plugins/differ/scripts/differ.cjs', import.meta.url));

test('the local tools speak of bits, versions and captions', async () => {
  const client = new Client({ name: 'tools-test', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [bundle, 'mcp'] }));
  try {
    const tools = Object.fromEntries((await client.listTools()).tools.map(tool => [tool.name, tool]));
    assert.deepEqual(Object.keys(tools).sort(), ['check_content', 'connect_account', 'connection_status', 'disconnect_account', 'get_bit', 'image_candidate', 'inspect_video', 'publication_status', 'publish_directory', 'publisher_status']);
    assert.deepEqual(Object.keys(tools.publish_directory.inputSchema.properties).sort(), ['caption', 'directory', 'newBit', 'parentBitId', 'parentVersionId']);
    assert.deepEqual(tools.publish_directory.inputSchema.required, ['directory'], 'an upload\'s caption is a suggestion the maker confirms later');
    assert.deepEqual(Object.keys(tools.get_bit.inputSchema.properties), ['bitId']);
  } finally { await client.close(); }
});
