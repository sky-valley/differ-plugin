import { existsSync, lstatSync, mkdirSync, writeFileSync, readFileSync, renameSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { configuration } from './connection.mjs';
import { limits, PublishError, validateArtifact } from './artifact.mjs';
import { taskRequest } from './task-api.mjs';
import { saveTask, withTask, taskDirectory, taskError, editTask } from './task-store.mjs';

function invalidSource(code) {
  return Object.assign(taskError('invalid_task_source'), {sourceDiagnostic: {stage:'validate', code}});
}

// Screenshots an editor edit's creator attached. They stay outside content/,
// so they never become part of the app's files.
export const imageLimits = { count: 4, bytes: 2 * 1024 * 1024 };
const imageTypes = new Map([['image/png', ['png']], ['image/jpeg', ['jpg', 'jpeg']], ['image/webp', ['webp']]]);
function sourceImages(source) {
  if (source.images === undefined || source.images === null) return new Map();
  if (!Array.isArray(source.images) || source.images.length > imageLimits.count) throw invalidSource('invalid_image');
  const images = new Map(), names = new Set();
  for (const image of source.images) {
    const extension = typeof image?.name === 'string' ? /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\.([A-Za-z]{3,4})$/.exec(image.name)?.[1]?.toLowerCase() : undefined;
    if (!extension || !imageTypes.get(image.mediaType)?.includes(extension) || names.has(image.name.toLowerCase()) || typeof image.content !== 'string') throw invalidSource('invalid_image');
    const bytes = Buffer.from(image.content, 'base64');
    if (bytes.length === 0 || bytes.length > imageLimits.bytes || bytes.toString('base64') !== image.content) throw invalidSource('invalid_image');
    names.add(image.name.toLowerCase()); images.set(image.name, bytes);
  }
  return images;
}

export function workspaceFor(task) {
  const path = join(taskDirectory(task.id), 'workspace');
  if (existsSync(path)) {
    if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) throw taskError('unsafe_task_directory');
    const marker = JSON.parse(readFileSync(join(path, 'source.json'), 'utf8'));
    if (marker.bitId !== task.delivery.parentBitId || marker.versionId !== task.delivery.parentVersionId) throw taskError();
  }
  return path;
}
export async function prepareTask(id) {
  return withTask(id, async task => {
    if (!task || task.state !== 'received') throw taskError('task_not_received');
    const config = configuration();
    if (config.mode !== 'connected' || task.publisher !== config.url) throw taskError('account_connection_required');
    const workspace = workspaceFor(task);
    // The directory rename is the commit. Recover it if saving the journal was
    // interrupted; never replace the agent's edited files on a later retry.
    if (!existsSync(workspace)) {
      const fresh = task.delivery.parentBitId === '' && task.delivery.parentVersionId === '', edit = editTask(task);
      // An edit's source is its editor session's current files, plus attached screenshots.
      const maxBytes = limits.wireBytes + (edit ? Math.ceil(imageLimits.count * imageLimits.bytes * 4 / 3) + 64 * 1024 : 0);
      const source = fresh ? {bitId:'', versionId:''} : await taskRequest(`/${id}/source?claimId=${task.claimId}`, { maxBytes });
      if (!source || source.bitId !== task.delivery.parentBitId || source.versionId !== task.delivery.parentVersionId) throw invalidSource('parent_mismatch');
      let artifact;
      try { artifact = fresh ? {files:new Map()} : validateArtifact(source); } catch (error) { throw invalidSource(error instanceof PublishError ? error.code : 'invalid_artifact'); }
      const images = edit ? sourceImages(source) : new Map();
      // Reject case aliases and file/directory collisions on all platforms.
      const names = new Set();
      for (const path of artifact.files.keys()) {
        const key = path.toLowerCase();
        if (names.has(key)) throw invalidSource('path_collision');
        names.add(key);
      }
      for (const path of names) {
        const parts = path.split('/'); parts.pop();
        while (parts.length) { if (names.has(parts.join('/'))) throw invalidSource('path_collision'); parts.pop(); }
      }
      const temporary = mkdtempSync(join(taskDirectory(id), 'source-'));
      try {
        mkdirSync(join(temporary, 'content'), {mode:0o700});
        for (const [path, bytes] of artifact.files) {
          const target = join(temporary, 'content', path);
          mkdirSync(dirname(target), { recursive:true, mode:0o700 });
          writeFileSync(target, bytes, { flag:'wx', mode:0o600 });
        }
        if (images.size) mkdirSync(join(temporary, 'images'), {mode:0o700});
        for (const [name, bytes] of images) writeFileSync(join(temporary, 'images', name), bytes, { flag:'wx', mode:0o600 });
        writeFileSync(join(temporary, 'source.json'), JSON.stringify({ bitId:source.bitId, versionId:source.versionId, artifactId:artifact.artifactId, ...(edit ? {images:[...images.keys()]} : {}) }), { flag:'wx', mode:0o600 });
        renameSync(temporary, workspace);
      } finally { rmSync(temporary, { recursive:true, force:true }); }
    }
    task.prepared = true; saveTask(task);
    return { id, state:task.state, directory:join(workspace,'content') };
  });
}
