// Differ's skills are edited in Control (gdiffer
// services/control/internal/content/skills) and served over MCP with the
// Skills extension (SEP-2640). skills/ here is a snapshot of what Control
// serves, and skills.lock.json lists the files it was taken from.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';

const extension = 'io.modelcontextprotocol/skills';
const segment = /^[A-Za-z0-9._-]+$/;

const byURI = (a, b) => (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0);
const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');

// Every file under skills/, described as a served entry describes its files.
// Like Control, names starting with "." or "_" are not part of a skill.
export function readSnapshot(root) {
  const files = [];
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (/^[._]/.test(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        const bytes = readFileSync(path);
        files.push({ uri: 'skill://' + relative(join(root, 'skills'), path).split(sep).join('/'), digest: digest(bytes), size: bytes.length });
      }
    }
  };
  walk(join(root, 'skills'));
  return files.sort(byURI);
}

export const readLock = root => JSON.parse(readFileSync(join(root, 'skills.lock.json'), 'utf8')).files;

const listResult = z.object({ skills: z.array(z.object({
  uri: z.string(),
  frontmatter: z.object({ name: z.string() }).passthrough(),
  resources: z.array(z.object({ uri: z.string(), digest: z.string(), size: z.number() })),
})), nextCursor: z.string().optional() }).passthrough();

// Every file Control's skills list, and with `read`, their bytes, each checked
// against its advertised digest and size before anything is written.
export async function served(endpoint, { read = false } = {}) {
  const client = new Client({ name: 'differ-skills-sync', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
  try {
    if (!client.getServerCapabilities()?.extensions?.[extension]) throw new Error(`${endpoint} does not serve skills (${extension})`);
    const files = [];
    const seen = new Set();
    let cursor;
    do {
      const page = await client.request({ method: 'skills/list', params: cursor ? { cursor } : {} }, listResult);
      for (const skill of page.skills) {
        const name = skill.frontmatter.name;
        if (skill.uri !== `skill://${name}/SKILL.md`) throw new Error(`${skill.uri} is not ${name}'s SKILL.md`);
        for (const file of skill.resources) {
          const path = file.uri.slice('skill://'.length).split('/');
          if (!file.uri.startsWith(`skill://${name}/`) || !path.every(part => segment.test(part) && part !== '.' && part !== '..')) throw new Error(`${file.uri} is not a file of ${name}`);
          files.push({ uri: file.uri, digest: file.digest, size: file.size });
        }
      }
      if (page.nextCursor && seen.has(page.nextCursor)) throw new Error(`${endpoint} repeats a skills cursor`);
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
    } while (cursor);
    if (files.length === 0) throw new Error(`${endpoint} serves no skills`);
    files.sort(byURI);
    const bytes = new Map();
    for (const file of read ? files : []) {
      const [contents] = (await client.readResource({ uri: file.uri })).contents;
      const content = contents.blob !== undefined ? Buffer.from(contents.blob, 'base64') : Buffer.from(contents.text, 'utf8');
      if (digest(content) !== file.digest || content.length !== file.size) throw new Error(`${file.uri} does not match its advertised digest and size`);
      bytes.set(file.uri, content);
    }
    return { files, bytes };
  } finally {
    await client.close();
  }
}

// Replaces skills/ and skills.lock.json with a verified fetch. Everything was
// read and checked first; git holds the previous snapshot.
export function writeSnapshot(root, { files, bytes }) {
  rmSync(join(root, 'skills'), { recursive: true, force: true });
  for (const file of files) {
    const path = join(root, 'skills', file.uri.slice('skill://'.length));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes.get(file.uri));
  }
  writeFileSync(join(root, 'skills.lock.json'), JSON.stringify({ files }, null, 2) + '\n');
}

// The files that differ between two lists.
export function changes(before, after) {
  const index = files => new Map(files.map(file => [file.uri, `${file.digest} ${file.size}`]));
  const [a, b] = [index(before), index(after)];
  return [...new Set([...a.keys(), ...b.keys()])].filter(uri => a.get(uri) !== b.get(uri)).sort();
}
