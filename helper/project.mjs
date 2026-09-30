import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { problem } from './diagnostics.mjs';

export const bindingName = 'differ-post.json';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function contentDirectory(input) {
  if (typeof input !== 'string' || !input) throw problem('missing_directory', 'Supply an app or content directory.', 'Use the app name from the repo root, or an absolute directory.');
  let root;
  try { root = realpathSync(resolve(input)); } catch { throw problem('missing_directory', 'The selected app directory does not exist.', 'Check the app name/path; do not search or publish an unrelated app.'); }
  const candidates = [root, join(root, 'content')].filter(path => existsSync(join(path, 'index.html')));
  if (candidates.length !== 1) throw problem('content_directory_required', candidates.length ? 'Both app root and content/ contain index.html.' : 'No index.html at the app root or in content/.', 'Select the exact static output directory; do not upload source/tooling or remove backend features.');
  const selected = candidates[0];
  if (!lstatSync(selected).isDirectory() || lstatSync(selected).isSymbolicLink()) throw problem('unsafe_input', 'Content must be a real directory.', 'Select a content-only directory without links.');
  return selected;
}
export function readBinding(directory) {
  const path = join(directory, bindingName);
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1 || stat.size > 4096) throw problem('invalid_binding', 'Unsafe publication binding.', 'Restore the regular differ-post.json file; never discard pending state.');
  let value;
  try { value = JSON.parse(readFileSync(path, 'utf8')); } catch { /* Report without echoing contents. */ }
  if (!value || value.version !== 1 || !uuid.test(value.postId) || !uuid.test(value.revisionId)
      || typeof value.publisher !== 'string' || Object.keys(value).some(k => !['version', 'publisher', 'postId', 'revisionId', 'title'].includes(k))
      || (value.title !== undefined && (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200))
      )
    throw problem('invalid_binding', 'Invalid differ-post.json.', 'Restore its public post/revision identity or deliberately bind after reviewing the remote post.');
  try { const url = new URL(value.publisher); if (url.origin !== value.publisher || url.username || url.password) throw Error(); }
  catch { throw problem('invalid_binding', 'Invalid publisher origin in differ-post.json.', 'Restore the intended public publisher origin.'); }
  return value;
}
export function contentTitle(directory, supplied) {
  const title = supplied ?? readBinding(directory)?.title ?? readFileSync(join(directory, 'index.html'), 'utf8').match(/<title\b[^>]*>([^<]*)<\/title>/i)?.[1];
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200) throw problem('invalid_title', 'Supply a title of 1–200 characters.', 'Use --title or add an HTML title; never infer identity from the title.');
  return title.trim();
}
export function assetReport(artifact) {
  const assets = artifact.files.map(f => ({ path: f.path, bytes: Buffer.byteLength(f.content, 'base64') })).sort((a,b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
  const stateful = artifact.files.some(f => f.path === 'rules.html');
  const text = artifact.files.filter(f => /\.(html|css|js|mjs|json|txt|webmanifest)$/.test(f.path)).map(f => Buffer.from(f.content, 'base64').toString()).join('\n');
  return { largestAssets: assets.slice(0, 10), warnings: assets.filter(f => /\.(png|jpe?g)$/i.test(f.path) && f.bytes > 512 * 1024).map(f => ({ code: 'large_image', path: f.path, bytes: f.bytes, action: 'Compare a compressed candidate visually; retain the original.' })),
    // These are consumed by the runtime at installation, not by an HTML link.
    unreferencedCandidates: assets.filter(f => f.path !== 'index.html'
      && !(stateful && (f.path === 'rules.html' || /^data\/.*\.(html|json|txt)$/.test(f.path)))
      && !text.includes(f.path.split('/').pop())).map(f => f.path),
    note: 'Unreferenced candidates are a text-scan heuristic, not proof of dead assets; dynamic references may be missed. No files changed.' };
}
