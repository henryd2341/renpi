import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { installProject, installFoundationProject } from './project.mjs';
import { lockProject, startBridge } from './bridge.mjs';
import { tree } from './bridge-common.mjs';

const source = 'authoring/shared/opening';
const files = ['opening.rpy', 'fonts/license.txt'];
const reports = () => [{ command: ['compile'], code: 0 }, { command: ['lint', '--error-code'], code: 0 }];
async function validate(build) {
  const game = path.join(build, 'game');
  for (const file of await tree(game)) {
    if (file.path.endsWith('.rpy')) await fs.writeFile(path.join(game, `${file.path}c`), 'compiled fixture');
  }
  return reports();
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'renpi-foundation-'));
  t.after(async () => {
    assert(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'renpi-foundation-')));
    await fs.rm(root, { recursive: true, force: true });
  });
  const put = async (name, text) => { const file = path.join(root, name); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, text); };
  await put('game/keep.txt', 'keep');
  await put('game/saves/test.save', 'save');
  await put(`${source}/opening.rpy`, 'label start:\n    return\n');
  await put(`${source}/fonts/license.txt`, 'license');
  await put(`${source}/draft.rpy`, 'invalid draft must not be copied');
  const project = await installProject(root);
  const stateFile = path.join(root, '.renpi-live/bridge/state.json');
  const initial = await fs.readFile(stateFile, 'utf8');
  const install = (options = {}, selected = files, from = source) => installFoundationProject(root, from, selected, { validate, ...options });
  return { root, put, project, stateFile, initial, install };
}

test('initial install validates explicit files, preserves state/runtime/saves/assets, and repeats read-only', async t => {
  const f = await fixture(t), before = await tree(path.join(f.root, 'game'));
  const receipt = await f.install();
  assert.equal(receipt.phase, 'installed'); assert.equal(receipt.runtime_tested, false);
  assert.equal(receipt.project_id, f.project.project_id);
  assert.equal(await fs.readFile(f.stateFile, 'utf8'), f.initial);
  for (const file of before) assert.deepEqual(await fs.readFile(path.join(f.root, 'game', file.path)), file.bytes);
  assert.equal(await fs.readFile(path.join(f.root, 'game/opening.rpy'), 'utf8'), 'label start:\n    return\n');
  await assert.rejects(fs.access(path.join(f.root, 'game/draft.rpy')), { code: 'ENOENT' });
  await assert.rejects(fs.access(path.join(f.root, 'game/opening.rpyc')), { code: 'ENOENT' });
  assert.equal((await f.install({ validate: () => { throw new Error('must not revalidate'); } })).already_installed, true);
  await f.put(`${source}/extra.txt`, 'extra');
  await assert.rejects(f.install({}, [...files, 'extra.txt']), /already installed/);
});

test('all conflicts preflight before any runtime write', async t => {
  const f = await fixture(t);
  await f.put('game/fonts/license.txt', 'user edit');
  await assert.rejects(f.install(), /conflicts/);
  await assert.rejects(fs.access(path.join(f.root, 'game/opening.rpy')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(f.stateFile, 'utf8'), f.initial);
});

test('foundation links validation assets, installs independent files, and retires successful scratch', async t => {
  const f = await fixture(t), asset = Buffer.alloc(1024 * 1024, 5);
  await f.put(`${source}/fonts/font.ttf`, asset);
  await f.put('game/background.png', 'existing image');
  const receipt = await f.install({ validate: async build => {
    for (const name of ['fonts/font.ttf', 'background.png'])
      assert.equal((await fs.lstat(path.join(build, 'game', name))).isSymbolicLink(), true);
    assert.equal((await fs.lstat(path.join(build, 'game/opening.rpy'))).isSymbolicLink(), false);
    await fs.writeFile(path.join(build, 'game/opening.rpyc'), 'compiled fixture');
    return reports();
  } }, [...files, 'fonts/font.ttf']);
  assert.equal((await fs.lstat(path.join(f.root, 'game/fonts/font.ttf'))).isSymbolicLink(), false);
  assert.deepEqual(await fs.readFile(path.join(f.root, 'game/fonts/font.ttf')), asset);
  assert.deepEqual(await fs.readFile(path.join(f.root, source, 'fonts/font.ttf')), asset);
  await assert.rejects(fs.access(path.join(receipt.build, 'game')), { code: 'ENOENT' });
  await fs.access(path.join(receipt.build, 'validation-inputs.json'));
  await fs.access(path.join(receipt.build, 'validation-reports.json'));
});

test('reject path aliases, reserved runtime, traversal, bytecode, and authoring junctions', async t => {
  const f = await fixture(t);
  for (const selected of [['../oops.rpy'], ['C:/oops.rpy'], ['a:stream.rpy'], ['x\\y.rpy'], ['foo./x.rpy'], ['CON.rpy'],
    ['renpi_bridge.rpy'], ['python-packages/test.py'], ['saves/test.txt'], ['renpi_content/test.rpy'], ['opening.rpyc'], ['a.rpy', 'A.rpy']])
    await assert.rejects(f.install({}, selected), /relative|Reserved/);
  await assert.rejects(f.install({}, files, 'game'), /authoring/);
  await fs.symlink(path.join(f.root, 'game'), path.join(f.root, 'authoring/link'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.install({}, ['keep.txt'], 'authoring/link'), /reparse/);
});

test('missing setup, active writer, production history, and orphan bytecode block initialization', async t => {
  const f = await fixture(t);
  const release = await lockProject(path.join(f.root, '.renpi-live/bridge/writer.lock'), randomUUID());
  try { await assert.rejects(f.install(), /writer is already alive/); } finally { await release(); }
  const state = JSON.parse(f.initial); state.jobs.previous = { status: 'failed' };
  await fs.writeFile(f.stateFile, JSON.stringify(state));
  await assert.rejects(f.install(), /initial base/);
  await fs.writeFile(f.stateFile, f.initial);
  await f.put('game/opening.rpyc', 'preserve orphan');
  await assert.rejects(f.install(), /Orphan bytecode/);
  await assert.rejects(installFoundationProject(path.join(f.root, 'authoring'), source, files), /setup/);
});

test('lint failure, zero-exit exception, missing artifact/evidence, and cancellation never install', async t => {
  const f = await fixture(t);
  for (const check of [async () => { throw new Error('lint failed'); }, async () => [{ command: ['compile'], code: 0 }],
    async () => [...reports(), { code: 0, output: 'PermissionError: denied' }], async () => reports()]) {
    await assert.rejects(f.install({ validate: check }));
    await assert.rejects(fs.access(path.join(f.root, 'game/opening.rpy')), { code: 'ENOENT' });
  }
  const controller = new AbortController();
  await assert.rejects(f.install({ signal: controller.signal, validate: async build => { const result = await validate(build); controller.abort(); return result; } }));
  await assert.rejects(fs.access(path.join(f.root, 'game/opening.rpy')), { code: 'ENOENT' });
});

test('source and runtime edits during SDK validation are detected and preserved', async t => {
  const f = await fixture(t);
  await assert.rejects(f.install({ validate: async build => { const result = await validate(build); await fs.writeFile(path.join(build, 'game/keep.txt'), 'changed build'); return result; } }), /Staged foundation files changed/);
  await assert.rejects(f.install({ validate: async build => { const result = await validate(build); await f.put(`${source}/opening.rpy`, 'edited'); return result; } }), /source changed/);
  await f.put(`${source}/opening.rpy`, 'label start:\n    return\n');
  await assert.rejects(f.install({ validate: async build => { const result = await validate(build); await f.put('game/keep.txt', 'external'); return result; } }), /Runtime files changed/);
  assert.equal(await fs.readFile(path.join(f.root, 'game/keep.txt'), 'utf8'), 'external');
  await assert.rejects(fs.access(path.join(f.root, 'game/opening.rpy')), { code: 'ENOENT' });
});

test('interrupted installation stays gated until identical offline retry; identity is preserved', async t => {
  const f = await fixture(t);
  const result = await f.install();
  const pending = path.join(f.root, '.renpi-live/bridge/foundation.pending.json');
  await fs.writeFile(pending, JSON.stringify({ manifest: result.manifest, project_id: result.project_id, base_branch_id: result.base_branch_id }));
  await assert.rejects(startBridge({ root: f.root, validate }), /interrupted foundation/);
  await assert.rejects(f.install({}, ['opening.rpy']), /different inputs/);
  assert.equal((await f.install()).already_installed, true);
  await assert.rejects(fs.access(pending), { code: 'ENOENT' });
  assert.equal(await fs.readFile(f.stateFile, 'utf8'), f.initial);
});

test('partial write failure rolls back owned additions and identical retry completes the retained journal', async t => {
  const f = await fixture(t), link = fs.link;
  let calls = 0;
  const mock = t.mock.method(fs, 'link', async (...args) => {
    if (++calls === 2) throw new Error('injected write failure');
    return link(...args);
  });
  await assert.rejects(f.install(), /injected/);
  mock.mock.restore();
  for (const name of files) await assert.rejects(fs.access(path.join(f.root, 'game', name)), { code: 'ENOENT' });
  await fs.access(path.join(f.root, '.renpi-live/bridge/foundation.pending.json'));
  await assert.rejects(startBridge({ root: f.root, validate }), /interrupted foundation/);
  assert.equal((await f.install()).phase, 'installed');
  assert.equal(await fs.readFile(f.stateFile, 'utf8'), f.initial);
});

test('live bridge owns installation and serializes position events behind validation', async t => {
  const f = await fixture(t);
  let entered, release;
  const ready = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const bridge = await startBridge({ root: f.root, validate: async build => { entered(); await held; return validate(build); } });
  try {
    const installation = bridge.installFoundation(source, files);
    await ready;
    let finished = false;
    const position = bridge.dispatch({ type: 'position', project_id: f.project.project_id, request_id: randomUUID(),
      branch_id: f.project.base_branch_id, anchor_id: 'start' }).then(() => { finished = true; });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(finished, false);
    release();
    assert.equal((await installation).phase, 'installed');
    await position;
    assert.equal(bridge.status().project_id, f.project.project_id);
    assert.equal(Object.keys(bridge.status().jobs).length, 0);
  } finally { release(); await bridge.close(); }
});
