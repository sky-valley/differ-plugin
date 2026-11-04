import { mkdirSync, lstatSync, readFileSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, unlinkSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { configPath } from './connection.mjs';
import { problem } from './diagnostics.mjs';

export const validTaskID = id => typeof id === 'string' && /^agt_[a-f0-9]{64}$/.test(id);
export const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export const taskError = (code = 'invalid_task_state') => problem(code, 'The task could not proceed.', 'Keep its local files. Check the account and task status before retrying.');
export const taskRoot = () => join(dirname(configPath()), 'tasks');
export function privateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077) throw taskError('unsafe_task_directory');
}
export function taskDirectory(id) {
  if (!validTaskID(id)) throw taskError('invalid_task_id');
  privateDirectory(taskRoot());
  const path = join(taskRoot(), id); privateDirectory(path); return path;
}
export function readTask(id) {
  const path = join(taskDirectory(id), 'task.json');
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.nlink !== 1 || stat.mode & 0o077) throw taskError();
    const value = JSON.parse(readFileSync(path, 'utf8'));
    if (value.schema !== 1 || value.id !== id || !uuid(value.claimId)) throw taskError();
    return value;
  } catch (error) { if (error.code === 'ENOENT') return null; throw taskError(); }
}
// Flush the file and its rename before telling Control the prompt is safe here.
export function saveTask(task) { savePrivate(join(taskDirectory(task.id), 'task.json'), task); }
export function savePrivate(path, value) {
  const directory = dirname(path); privateDirectory(directory); const temporary = join(directory, `${randomUUID()}.tmp`);
  let fd;
  try {
    fd = openSync(temporary, 'wx', 0o600); writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd); closeSync(fd); fd = undefined;
    renameSync(temporary, path);
    fd = openSync(directory, 'r'); fsyncSync(fd);
  } finally { if (fd !== undefined) closeSync(fd); try { unlinkSync(temporary); } catch {} }
}
export function localTasks() {
  privateDirectory(taskRoot());
  return readdirSync(taskRoot()).filter(validTaskID).map(readTask).filter(Boolean);
}
export async function withTask(id, operation) {
  const path = join(taskDirectory(id), 'lock');
  try { writeFileSync(path, String(process.pid), { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const pid = Number(readFileSync(path, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid < 1) throw taskError('task_busy');
    try { process.kill(pid, 0); } catch (e) {
      if (e.code === 'ESRCH') { unlinkSync(path); return withTask(id, operation); }
    }
    throw taskError('task_busy');
  }
  try { return await operation(readTask(id)); } finally { unlinkSync(path); }
}
