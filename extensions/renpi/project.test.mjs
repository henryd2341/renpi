import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installProject, readProject, runtimeFiles } from './project.mjs';
import { lockProject } from './bridge.mjs';
import { randomUUID } from 'node:crypto';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'renpi-project-'));
  t.after(async () => {
    assert(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'renpi-project-')));
    await fs.rm(root, { recursive: true, force: true });
  });
  await fs.mkdir(path.join(root, 'game'));
  await fs.writeFile(path.join(root, 'game/story.rpy'), 'label start:\n    return\n');
  return root;
}

test('two projects install identical public runtime, independent identity, and preserve repeat setup', async t => {
  const a = await fixture(t), b = await fixture(t);
  assert.equal(await readProject(a), null);
  const first = await installProject(a), other = await installProject(b);
  assert.notEqual(first.project_id, other.project_id);
  assert.notEqual(first.base_branch_id, other.base_branch_id);
  assert.deepEqual(first.files, other.files);
  const statePath = path.join(a, '.renpi-live/bridge/state.json');
  const before = await fs.readFile(statePath, 'utf8');
  const again = await installProject(a);
  assert.equal(again.project_id, first.project_id);
  assert.deepEqual(again.updated_files, []);
  assert.equal(await fs.readFile(statePath, 'utf8'), before);
  assert.equal((await readProject(a)).project_id, first.project_id);
  assert.equal(await fs.readFile(path.join(a, 'game/story.rpy'), 'utf8'), 'label start:\n    return\n');
});

test('conflicting client preflights all files without creating business state', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'game/renpi_bridge.rpy'), 'user-owned');
  await assert.rejects(installProject(root), /Existing project file differs/);
  await assert.rejects(fs.stat(path.join(root, '.renpi-live/bridge/state.json')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(root, 'game/renpi_bridge.rpy'), 'utf8'), 'user-owned');
});

test('modified runtime warns without blocking reads; setup preserves edits and missing state', async t => {
  const root = await fixture(t);
  const descriptor = await installProject(root);
  const target = path.join(root, runtimeFiles[0]);
  const bytes = await fs.readFile(target);
  await fs.appendFile(target, '\n# user edit\n');
  const warnings = [];
  assert.equal((await readProject(root, message => warnings.push(message))).project_id, descriptor.project_id);
  assert.equal(warnings.length, 1);
  assert(warnings[0].includes(runtimeFiles[0]));
  assert.equal((await readProject(root)).project_id, descriptor.project_id);
  await assert.rejects(installProject(root), /Existing project file differs/);
  assert.equal(await fs.readFile(target, 'utf8'), bytes.toString() + '\n# user edit\n');
  await fs.writeFile(target, bytes);
  await fs.unlink(path.join(root, '.renpi-live/bridge/state.json'));
  await assert.rejects(installProject(root), /state is missing/);
});

test('junctions in managed paths are rejected before installation', async t => {
  const root = await fixture(t), outside = await fixture(t);
  await fs.symlink(outside, path.join(root, '.renpi-live'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(installProject(root), /reparse link/);
  await assert.rejects(fs.stat(path.join(outside, 'bridge')), { code: 'ENOENT' });
});

test('concurrent setup preserves one identity and active writer blocks runtime updates', async t => {
  const root = await fixture(t);
  const attempts = await Promise.allSettled([installProject(root), installProject(root)]);
  const accepted = attempts.filter(item => item.status === 'fulfilled');
  assert(accepted.length >= 1);
  const descriptor = await readProject(root);
  for (const item of accepted) assert.equal(item.value.project_id, descriptor.project_id);
  for (const item of attempts.filter(item => item.status === 'rejected'))
    assert.match(item.reason.message, /writer is already alive|incomplete ownership/);
  const control = path.join(root, '.renpi-live/bridge');
  const before = await fs.readFile(path.join(control, 'state.json'));
  const release = await lockProject(path.join(control, 'writer.lock'), randomUUID());
  try { await assert.rejects(installProject(root), /writer is already alive/); }
  finally { await release(); }
  assert.deepEqual(await fs.readFile(path.join(control, 'state.json')), before);
  assert.equal((await readProject(root)).project_id, descriptor.project_id);
});
