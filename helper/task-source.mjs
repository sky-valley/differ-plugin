import { existsSync, lstatSync, mkdirSync, writeFileSync, readFileSync, renameSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { configuration } from './connection.mjs';
import { limits, validateArtifact } from './artifact.mjs';
import { taskRequest } from './task-api.mjs';
import { saveTask, withTask, taskDirectory, taskError } from './task-store.mjs';

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
      const source = await taskRequest(`/${id}/source?claimId=${task.claimId}`, { maxBytes: limits.wireBytes });
      if (!source || source.bitId !== task.delivery.parentBitId || source.versionId !== task.delivery.parentVersionId) throw taskError('invalid_task_source');
      let artifact;
      try { artifact = validateArtifact(source); } catch { throw taskError('invalid_task_source'); }
      // Reject case aliases and file/directory collisions on all platforms.
      const names = new Set();
      for (const path of artifact.files.keys()) {
        const key = path.toLowerCase();
        if (names.has(key)) throw taskError('invalid_task_source');
        names.add(key);
      }
      for (const path of names) {
        const parts = path.split('/'); parts.pop();
        while (parts.length) { if (names.has(parts.join('/'))) throw taskError('invalid_task_source'); parts.pop(); }
      }
      const temporary = mkdtempSync(join(taskDirectory(id), 'source-'));
      try {
        for (const [path, bytes] of artifact.files) {
          const target = join(temporary, 'content', path);
          mkdirSync(dirname(target), { recursive:true, mode:0o700 });
          writeFileSync(target, bytes, { flag:'wx', mode:0o600 });
        }
        writeFileSync(join(temporary, 'source.json'), JSON.stringify({ bitId:source.bitId, versionId:source.versionId, artifactId:artifact.artifactId }), { flag:'wx', mode:0o600 });
        renameSync(temporary, workspace);
      } finally { rmSync(temporary, { recursive:true, force:true }); }
    }
    task.prepared = true; saveTask(task);
    return { id, state:task.state, directory:join(workspace,'content') };
  });
}
