import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { problem } from './diagnostics.mjs';

export const bindingName = 'differ-bit.json';
// The binding an older helper wrote. It is refused, never read or uploaded.
const staleBindingName = 'differ-post.json';
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
// The caption is the maker's own words over the bit, as Control checks them:
// 1–200 characters after trimming, at most 800 bytes, no control characters
// but line breaks, and at most 3 of those.
export function caption(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || [...text].length > 200 || Buffer.byteLength(text) > 800 || /[\u0000-\u0009\u000b-\u001f\u007f]/.test(text) || text.split('\n').length > 4)
    throw problem('invalid_caption', 'Supply a caption of 1–200 characters with at most 3 line breaks.', 'Use the maker\'s own words; they confirm the caption in Differ before the bit goes public.');
  return text;
}
export function readBinding(directory) {
  if (existsSync(join(directory, staleBindingName))) throw problem('stale_binding', 'differ-post.json was written by an older Differ helper, which named bits posts.', 'Remove differ-post.json; it is never uploaded. To keep updating the bit it names, run bind DIR --bit <its postId> after reviewing get-bit <its postId>.');
  const path = join(directory, bindingName);
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1 || stat.size > 4096) throw problem('invalid_binding', 'Unsafe publication binding.', 'Restore the regular differ-bit.json file; never discard pending state.');
  let value;
  try { value = JSON.parse(readFileSync(path, 'utf8')); } catch { /* Report without echoing contents. */ }
  if (!value || value.version !== 1 || !uuid.test(value.bitId) || !uuid.test(value.versionId)
      || typeof value.publisher !== 'string' || typeof value.caption !== 'string'
      || Object.keys(value).some(k => !['version', 'publisher', 'bitId', 'versionId', 'caption'].includes(k)))
    throw problem('invalid_binding', 'Invalid differ-bit.json.', 'Restore its public bit/version identity or deliberately bind after reviewing the remote bit.');
  if (value.caption) caption(value.caption);
  try { const url = new URL(value.publisher); if (url.origin !== value.publisher || url.username || url.password) throw Error(); }
  catch { throw problem('invalid_binding', 'Invalid publisher origin in differ-bit.json.', 'Restore the intended public publisher origin.'); }
  return value;
}
export function assetReport(artifact) {
  const assets = artifact.files.map(f => ({ path: f.path, bytes: Buffer.byteLength(f.content, 'base64') })).sort((a,b) => b.bytes - a.bytes || a.path.localeCompare(b.path));
  const stateful = artifact.files.some(f => f.path === 'rules.html');
  const text = artifact.files.filter(f => /\.(html|css|js|mjs|json|txt|webmanifest)$/.test(f.path)).map(f => Buffer.from(f.content, 'base64').toString()).join('\n');
  const warnings = assets.filter(f => /\.(png|jpe?g)$/i.test(f.path) && f.bytes > 512 * 1024).map(f => ({ code: 'large_image', path: f.path, bytes: f.bytes, action: 'Compare a compressed candidate visually; retain the original.' }));
  if (!artifact.files.some(f => f.path === 'preview.html')) warnings.push({ code: 'missing_preview', path: 'preview.html', action: 'Add a root preview.html: the 390×520 interactive preview the feed shows. Without it the feed shows index.html scaled into that box.' });
  return { largestAssets: assets.slice(0, 10), warnings,
    // These are consumed by the runtime at installation, not by an HTML link.
    unreferencedCandidates: assets.filter(f => !['index.html', 'preview.html'].includes(f.path)
      && !(stateful && (f.path === 'rules.html' || /^data\/.*\.(html|json|txt)$/.test(f.path)))
      && !text.includes(f.path.split('/').pop())).map(f => f.path),
    note: 'Unreferenced candidates are a text-scan heuristic, not proof of dead assets; dynamic references may be missed. No files changed.' };
}
