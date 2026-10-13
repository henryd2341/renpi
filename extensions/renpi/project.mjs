import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { atomicJSON, digest, managedPath } from './bridge-common.mjs';
import { initialState, lockProject } from './bridge.mjs';

export const protocol = 'renpi-bridge-v1';
export const runtimeFiles = ['game/python-packages/renpi_bridge.py', 'game/renpi_bridge.rpy'];
const template = fileURLToPath(new URL('./template/', import.meta.url));
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const control = '.renpi-live/bridge';
async function optional(file) {
  try { return await read(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function validateDescriptor(value) {
  if (value?.format_version !== 1 || value.protocol !== protocol || !uuid(value.project_id) || !uuid(value.base_branch_id)) {
    throw new Error('Unsupported bridge project descriptor; preserve state and repair the installation.');
  }
  return value;
}

export async function readProject(root) {
  root = await fs.realpath(root);
  const descriptor = await optional(await managedPath(root, `${control}/project.json`));
  if (!descriptor) return null;
  validateDescriptor(descriptor);
  const installed = await read(await managedPath(root, `${control}/runtime.json`));
  if (installed.protocol !== protocol || installed.project_id !== descriptor.project_id) throw new Error('Bridge runtime ownership mismatch.');
  for (const relative of runtimeFiles) {
    const bytes = await fs.readFile(await managedPath(root, relative));
    if (digest(bytes) !== installed.files?.[relative]) throw new Error(`Managed runtime changed: ${relative}. Preserve edits before setup.`);
    if (digest(bytes) !== digest(await fs.readFile(path.join(template, relative)))) throw new Error('Run /renpi-setup to update the bundled runtime before connecting.');
  }
  const state = await read(await managedPath(root, `${control}/state.json`));
  if (state.project_id !== descriptor.project_id || state.base_branch_id !== descriptor.base_branch_id) throw new Error('Bridge project/state identity mismatch.');
  return descriptor;
}

export async function installProject(root) {
  root = await fs.realpath(root);
  const game = await managedPath(root, 'game');
  if (!(await fs.stat(game)).isDirectory()) throw new Error('Create the game directory before installing the shared bridge.');
  const directory = await managedPath(root, control);
  await fs.mkdir(directory, { recursive: true });
  const release = await lockProject(await managedPath(root, `${control}/writer.lock`), randomUUID());
  try {
    const descriptorPath = await managedPath(root, `${control}/project.json`);
    const pendingPath = await managedPath(root, `${control}/install.pending.json`);
    const existing = await optional(descriptorPath);
    const pending = await optional(pendingPath);
    const descriptor = validateDescriptor(existing ?? pending?.descriptor ?? {
      format_version: 1, protocol, project_id: randomUUID(), base_branch_id: randomUUID(),
    });
    if (pending && (pending.descriptor.project_id !== descriptor.project_id || pending.descriptor.base_branch_id !== descriptor.base_branch_id)) {
      throw new Error('Conflicting installation journal; preserve both identities.');
    }
    const installed = await optional(await managedPath(root, `${control}/runtime.json`));
    if (installed && (installed.protocol !== protocol || installed.project_id !== descriptor.project_id)) throw new Error('Runtime manifest belongs to another project.');
    const files = {}, writes = [];
    for (const relative of runtimeFiles) {
      const bytes = await fs.readFile(path.join(template, relative));
      const target = await managedPath(root, relative);
      files[relative] = digest(bytes);
      let current = null;
      try { current = await fs.readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (current && digest(current) !== files[relative] && digest(current) !== installed?.files?.[relative]) {
        throw new Error(`Existing project file differs from the bundled runtime: ${relative}. No files replaced.`);
      }
      if (!current || digest(current) !== files[relative]) writes.push({ target, bytes });
    }
    const statePath = await managedPath(root, `${control}/state.json`);
    const state = await optional(statePath);
    if (existing && !state) throw new Error('Existing project state is missing; setup does not reset branch history.');
    if (state && (state.project_id !== descriptor.project_id || state.base_branch_id !== descriptor.base_branch_id)) {
      throw new Error('Existing branch state belongs to another installation.');
    }
    // Preflight every owned file before beginning a recoverable installation.
    await fs.mkdir(directory, { recursive: true });
    await atomicJSON(pendingPath, { descriptor, files });
    for (const { target, bytes } of writes) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${randomUUID()}.tmp`;
      await fs.writeFile(temporary, bytes, { flag: 'wx' });
      await fs.rename(temporary, target);
    }
    if (!state) await atomicJSON(statePath, initialState(descriptor));
    await atomicJSON(path.join(directory, 'runtime.json'), { protocol, project_id: descriptor.project_id, files });
    await atomicJSON(descriptorPath, descriptor);
    await fs.unlink(pendingPath);
    return { ...descriptor, updated_files: writes.map(item => path.relative(root, item.target)), files };
  } finally { await release(); }
}
