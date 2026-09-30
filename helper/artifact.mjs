import { createHash } from 'node:crypto';
import { extname, posix } from 'node:path';

export const limits = { files: 256, bytes: 20 * 1024 * 1024, wireBytes: 29 * 1024 * 1024 };
export const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
export class PublishError extends Error {
  constructor(code, message, recovery, status = 400) {
    super(message); this.code = code; this.recovery = recovery; this.status = status;
  }
}
export function fail(code, message, recovery, status) { throw new PublishError(code, message, recovery, status); }
export function safePath(path) {
  return typeof path === 'string' && path.length <= 240 && /^[\w@+ /.-]+$/.test(path)
    && !/^(?:-|v|uploads)\//.test(path)
    && path.split('/').every(part => part && part !== '.' && part !== '..' && !part.startsWith('.'))
    && !path.split('/').some(part => ['node_modules', 'tools', 'research'].includes(part))
    && !!mimeTypes[extname(path).toLowerCase()];
}
export function validateArtifact(input) {
  if (!input || !Array.isArray(input.files) || input.files.length < 1 || input.files.length > limits.files)
    fail('invalid_artifact', `Supply 1–${limits.files} static files.`, 'Select the built content directory, not the repository.');
  const files = new Map(); let bytes = 0;
  for (const file of input.files) {
    if (!safePath(file.path) || files.has(file.path) || typeof file.content !== 'string')
      fail('invalid_file', `Unsupported or duplicate asset path: ${String(file.path).slice(0, 240)}`, 'Use relative static asset paths; exclude hidden files, dependencies and tooling.');
    const content = Buffer.from(file.content, 'base64');
    if (content.toString('base64') !== file.content) fail('invalid_encoding', `Invalid asset encoding: ${file.path}`, 'Repackage the content directory.');
    bytes += content.length;
    if (bytes > limits.bytes) fail('artifact_too_large', 'Post exceeds 20 MiB.', 'Compress media or remove unused files.', 413);
    files.set(file.path, content);
  }
  if (!files.has('index.html')) fail('missing_entrypoint', 'No index.html in the selected directory.', 'Select or build the static output directory.');
  // Deliberately bounded static checks, not a JavaScript interpreter or secret scanner.
  for (const [path, content] of files) {
    if (!/\.(html|css|js|mjs|json|txt)$/i.test(path)) continue;
    const text = content.toString();
    if (/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:sk_live_|ghp_)[A-Za-z0-9]{16,}/.test(text))
      fail('possible_secret', `Possible credential in ${path}.`, 'Remove credentials; static content is public.');
    const refs = [];
    if (path.endsWith('.html')) {
      for (const match of text.matchAll(/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi)) refs.push(match[1]);
    }
    const css = path.endsWith('.css') ? text : path.endsWith('.html')
      ? [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi), ...text.matchAll(/\bstyle\s*=\s*["']([^"']*)["']/gi)].map(match => match[1]).join('\n') : '';
    for (const match of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) refs.push(match[1]);
    if (/\.(js|mjs)$/.test(path)) for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)) refs.push(match[1]);
    for (const ref of refs) {
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\?|\/\/)/i.test(ref)) continue;
      let decoded;
      try { decoded = decodeURIComponent(ref.split(/[?#]/)[0]); } catch { fail('invalid_url', `Invalid URL in ${path}.`, 'Correct the asset URL.'); }
      if (files.has('rules.html') && (decoded === '/-/client.js' || decoded.startsWith('/data/') || decoded.startsWith('/uploads/'))) continue;
      const target = posix.normalize(decoded.startsWith('/') ? decoded.slice(1) : posix.join(posix.dirname(path), decoded));
      if (!files.has(target) && !files.has(posix.join(target, 'index.html')))
        fail('missing_asset', `${path} refers to missing ${ref}.`, 'Include the asset or correct its relative URL.');
    }
  }
  const manifest = { files: {} };
  for (const [path, content] of [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    manifest.files[path] = createHash('sha256').update(content).digest('hex');
  }
  // Match Control's canonical complete path-to-file-digest manifest. Receipts
  // identify this manifest so identical local files can reuse their publication.
  return { artifactId: createHash('sha256').update(JSON.stringify(manifest)).digest('hex'), files, bytes };
}
