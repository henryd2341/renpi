import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { initialState, startBridge, protocol, lockProject } from './bridge.mjs';

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'renpi-shared-'));
  const descriptor = { format_version: 1, protocol, project_id: randomUUID(), base_branch_id: randomUUID() };
  await fs.mkdir(path.join(root, 'game'), { recursive: true });
  await fs.writeFile(path.join(root, 'game', 'script.rpy'), 'label start:\n    return\n');
  await fs.mkdir(path.join(root, '.renpi-live/bridge'), { recursive: true });
  await fs.writeFile(path.join(root, '.renpi-live/bridge/project.json'), JSON.stringify(descriptor));
  await fs.writeFile(path.join(root, '.renpi-live/bridge/state.json'), JSON.stringify(initialState(descriptor)));
  let validate = options.validate ?? (async build => {
    const content = path.join(build, 'game/renpi_content');
    for (const id of await fs.readdir(content)) {
      const file = path.join(content, id, 'scene.rpy');
      await fs.writeFile(`${file}c`, Buffer.concat([Buffer.from('compiled:'), await fs.readFile(file)]));
    }
    return [{ command: ['compile'], code: 0 }, { command: ['lint', '--error-code'], code: 0 }];
  });
  let bridge = await startBridge({ root, validate, sessionId: 'fixture-session' });
  t.after(async () => { await bridge.close(); await fs.rm(root, { recursive: true, force: true }); });
  const event = (type, fields = {}) => ({ project_id: descriptor.project_id, request_id: randomUUID(), type, ...fields });
  const dispatch = (type, fields) => bridge.dispatch(event(type, fields));
  const position = (branch = descriptor.base_branch_id, anchor = 'choice') => dispatch('position', { branch_id: branch, anchor_id: anchor });
  const choose = (option = 'a', type = 'choose') => dispatch(type, { branch_id: bridge.status().position.branch_id,
    anchor_id: bridge.status().position.anchor_id, position_revision: bridge.status().position.revision, option_id: option, text: `Choice ${option}` });
  const content = async job => fs.writeFile(path.join(job.output, 'scene.rpy'), `label ${job.entry_label}:\n    "Story ${job.id}"\n    return\n`);
  const ready = async () => { const job = await bridge.claimNext(); await content(job); await bridge.submitCandidate(job.id); return bridge.status().branches[job.branch_id]; };
  const adopt = branch => dispatch('adopt', { branch_id: branch.id, candidate_id: branch.candidate_id });
  const ack = (adoption, success = true) => dispatch('loaded', { branch_id: adoption.branch_id, adoption_id: adoption.adoption_id,
    candidate_id: adoption.candidate_id, anchor_id: adoption.anchor_id, success });
  return { root, descriptor, event, dispatch, position, choose, content, ready, adopt, ack,
    get bridge() { return bridge; },
    async restart() { await bridge.close(); bridge = await startBridge({ root, validate }); },
  };
}

test('descriptor validation and independent projects', async t => {
  assert.throws(() => initialState({}), /descriptor/);
  const a = await fixture(t), b = await fixture(t);
  await a.position(); await a.choose();
  assert.equal(Object.keys(a.bridge.status().branches).length, 2);
  assert.equal(Object.keys(b.bridge.status().branches).length, 1);
  await assert.rejects(a.bridge.dispatch(b.event('position', { branch_id: b.descriptor.base_branch_id, anchor_id: 'choice' })), /project/);
  await assert.rejects(startBridge({ root: a.root }), /already alive/);
});

test('candidate validation links assets then freezes independent deliverables and retires scratch', async t => {
  let buildRoot;
  const f = await fixture(t, { validate: async build => {
    buildRoot = build;
    assert.equal((await fs.lstat(path.join(build, 'game/background.png'))).isSymbolicLink(), true);
    for (const id of await fs.readdir(path.join(build, 'game/renpi_content'))) {
      const content = path.join(build, 'game/renpi_content', id);
      assert.equal((await fs.lstat(path.join(content, 'asset.png'))).isSymbolicLink(), true);
      await fs.writeFile(path.join(content, 'scene.rpyc'), 'compiled');
    }
    return [{ command: ['compile'], code: 0 }, { command: ['lint'], code: 0 }];
  } });
  await fs.writeFile(path.join(f.root, 'game/background.png'), 'existing image');
  await f.position(); await f.choose();
  const job = await f.bridge.claimNext(); await f.content(job);
  const asset = Buffer.alloc(1024 * 1024, 6);
  await fs.writeFile(path.join(job.output, 'asset.png'), asset);
  const ready = await f.bridge.submitCandidate(job.id);
  const content = path.join(f.root, '.renpi-live/bridge/candidates', ready.candidate_id, 'content/asset.png');
  assert.equal((await fs.lstat(content)).isSymbolicLink(), false);
  assert.deepEqual(await fs.readFile(content), asset);
  assert.deepEqual(await fs.readFile(path.join(job.output, 'asset.png')), asset);
  await assert.rejects(fs.access(path.join(buildRoot, 'game')), { code: 'ENOENT' });
  await fs.access(path.join(buildRoot, 'validation-links.json'));
  assert.equal(ready.phase, 'ready');
});

test('idle claim does not traverse game assets or write durable state', async t => {
  const f = await fixture(t), statePath = path.join(f.root, '.renpi-live/bridge/state.json');
  const originalRead = fs.readdir, originalRename = fs.rename; let reads = 0, writes = 0;
  fs.readdir = async (...args) => { reads++; return originalRead(...args); };
  fs.rename = async (...args) => { if (args[1] === statePath) writes++; return originalRename(...args); };
  try { for (let i = 0; i < 3; i++) assert.equal(await f.bridge.claimNext(), null); }
  finally { fs.readdir = originalRead; fs.rename = originalRename; }
  assert.equal(reads, 0); assert.equal(writes, 0);
});

test('multi-option A1/A2 bindings, old-save HEAD, replay before stale check', async t => {
  const f = await fixture(t); await f.position();
  const request = f.event('choose', { ...f.bridge.status().position, position_revision: f.bridge.status().position.revision, option_id: 'a', text: 'Choice a' });
  delete request.revision;
  const a1 = await f.bridge.dispatch(request); const a1branch = await f.ready(); await f.ack(await f.adopt(a1branch));
  await f.position(); const b = await f.choose('b');
  await f.position(); const a2 = await f.choose('a', 'retry');
  assert.notEqual(a1.branch_id, a2.branch_id);
  await f.position(a1.branch_id, 'old-save');
  const replay = await f.bridge.dispatch(request);
  assert.equal(replay.replay, true); assert.equal(f.bridge.status().head_branch_id, a1.branch_id);
  await f.position(); assert.equal((await f.choose()).branch_id, a2.branch_id);
  await f.position(); assert.equal((await f.choose('b')).branch_id, b.branch_id);
  await f.restart(); assert.equal((await f.bridge.dispatch(request)).replay, true);
  await assert.rejects(f.bridge.dispatch({ ...request, text: 'changed' }), /different payload/);
});

test('stale clicks do not create branches; concurrent choose accepts one', async t => {
  const f = await fixture(t); await f.position(); const position = f.bridge.status().position;
  const make = option => f.event('choose', { branch_id: position.branch_id, anchor_id: position.anchor_id,
    position_revision: position.revision, option_id: option, text: option });
  const results = await Promise.allSettled([f.bridge.dispatch(make('a')), f.bridge.dispatch(make('b'))]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(Object.keys(f.bridge.status().branches).length, 2);
  await assert.rejects(f.bridge.dispatch(make('c')), /stale/);
});

test('stable option identity survives display text edits while retry records new direction', async t => {
  const f = await fixture(t); await f.position(); const original = await f.choose('a');
  const branch = await f.ready(); await f.ack(await f.adopt(branch)); await f.position();
  const position = f.bridge.status().position;
  const revised = f.event('choose', { branch_id: position.branch_id, anchor_id: position.anchor_id,
    position_revision: position.revision, option_id: 'a', text: 'Updated wording for A' });
  const reused = await f.bridge.dispatch(revised);
  assert.equal(reused.branch_id, original.branch_id); assert.equal(reused.job_id, original.job_id);
  assert.equal(Object.keys(f.bridge.status().jobs).length, 1);
  assert.equal(f.bridge.status().branches[original.branch_id].text, 'Choice a');
  assert.equal(f.bridge.status().jobs[original.job_id].text, 'Choice a');
  await assert.rejects(f.bridge.dispatch({ ...revised, text: 'Different replay content' }), /different payload/);
  await f.position();
  const retry = await f.dispatch('retry', { branch_id: f.descriptor.base_branch_id, anchor_id: 'choice',
    position_revision: f.bridge.status().position.revision, option_id: 'a', text: revised.text });
  assert.notEqual(retry.branch_id, original.branch_id);
  assert.equal(Object.keys(f.bridge.status().jobs).length, 2);
  assert.equal(f.bridge.status().branches[retry.branch_id].text, revised.text);
  assert.equal(f.bridge.status().jobs[retry.job_id].text, revised.text);
});

test('explicit continuation preserves the branch and supersedes the previous job', async t => {
  const f = await fixture(t); await f.position(); const selected = await f.choose(); await f.restart();
  const job = await f.bridge.claimNext(); await f.content(job); await f.restart();
  assert.equal(f.bridge.status().jobs[job.id].status, 'interrupted'); assert.equal(await f.bridge.claimNext(), null);
  await f.position(selected.branch_id, selected.entry_label);
  await assert.rejects(f.position(selected.branch_id, 'unpublished-label'), /exact waiting entry/);
  const resumed = await f.dispatch('continue', { branch_id: selected.branch_id });
  assert.equal(resumed.branch_id, selected.branch_id); assert.notEqual(resumed.job_id, job.id);
  const next = await f.bridge.claimNext();
  assert.equal(next.previous_job_id, job.id); assert.equal(next.previous_output, job.output);
  const before = f.bridge.status();
  await assert.rejects(f.bridge.submitCandidate(job.id), new RegExp(`superseded; current job_id is ${next.id}`));
  assert.deepEqual(f.bridge.status(), before);
  assert.equal(Object.keys(f.bridge.status().branches).length, 2);
});

for (const status of ['failed', 'interrupted']) {
  test(`explicit submission reuses the current ${status} job and retained output`, async t => {
    const f = await fixture(t); await f.position(); await f.choose();
    const job = await f.bridge.claimNext(); await f.content(job);
    const source = await fs.readFile(path.join(job.output, 'scene.rpy'));
    if (status === 'failed') await f.bridge.failJob(job.id, 'Coding turn ended without a candidate');
    await f.restart();
    assert.equal(f.bridge.status().jobs[job.id].status, status);
    assert.notEqual(f.bridge.status().jobs[job.id].validation_failed, true);
    const result = await f.bridge.submitCandidate(job.id);
    assert.equal(result.phase, 'ready'); assert.equal(result.job_id, job.id);
    assert.equal(result.branch_id, job.branch_id);
    assert.equal(Object.keys(f.bridge.status().jobs).length, 1);
    assert.equal(Object.keys(f.bridge.status().branches).length, 2);
    assert.deepEqual(await fs.readFile(path.join(job.output, 'scene.rpy')), source);
    assert.equal(f.bridge.status().branches[job.branch_id].published, false);
    assert.equal(f.bridge.status().jobs[job.id].error, undefined);
  });
}

test('resubmission preserves cancellation, frozen output and source-basis guards', async t => {
  const f = await fixture(t); await f.position(); const selected = await f.choose();
  await assert.rejects(f.bridge.submitCandidate(selected.job_id), /is queued/);
  await assert.rejects(f.bridge.submitCandidate('__proto__'), /unknown production job/);
  const job = await f.bridge.claimNext(); await f.content(job);
  await f.dispatch('cancel', { branch_id: job.branch_id });
  await assert.rejects(f.bridge.submitCandidate(job.id), /is cancelled/);
  assert.equal(f.bridge.status().jobs[job.id].status, 'cancelled');
  await f.dispatch('continue', { branch_id: job.branch_id });
  const next = await f.bridge.claimNext(); await f.content(next);
  await f.bridge.failJob(next.id, 'paused with retained output');
  const script = path.join(f.root, 'game/script.rpy'), original = await fs.readFile(script);
  await fs.appendFile(script, '# changed source\n');
  await assert.rejects(f.bridge.submitCandidate(next.id), /source basis/);
  await fs.writeFile(script, original);
  const ready = await f.bridge.submitCandidate(next.id);
  await assert.rejects(f.bridge.submitCandidate(next.id), /is ready/);
  assert.equal(f.bridge.status().branches[next.branch_id].candidate_id, ready.candidate_id);
});

for (const status of ['cancelled', 'failed']) {
  test(`${status} late completion stays held and overlapping submissions share one validation`, async t => {
    let proceed, entered, validations = 0;
    const waiting = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { proceed = resolve; });
    const f = await fixture(t, { validate: async build => {
      validations++; entered(); await gate;
      const ids = await fs.readdir(path.join(build, 'game/renpi_content'));
      await fs.writeFile(path.join(build, `game/renpi_content/${ids[0]}/scene.rpyc`), 'compiled');
      return [{ code: 0 }];
    } });
    await f.position(); const selected = await f.choose(); const job = await f.bridge.claimNext(); await f.content(job);
    const pending = f.bridge.submitCandidate(job.id); await waiting;
    if (status === 'cancelled') await f.dispatch('cancel', { branch_id: selected.branch_id });
    else await f.bridge.failJob(job.id, 'producer stopped during validation');
    assert.equal(f.bridge.submitCandidate(job.id), pending);
    proceed();
    assert.equal((await pending).phase, 'held');
    assert.equal(validations, 1);
    assert.equal(f.bridge.status().branches[selected.branch_id].status, status);
    assert.equal(f.bridge.status().head_branch_id, selected.branch_id);
    await f.dispatch('continue', { branch_id: selected.branch_id });
    assert.equal(f.bridge.status().branches[selected.branch_id].status, 'ready');
    assert.equal(await f.bridge.claimNext(), null);
  });
}

test('validation failure stays isolated and keeps binding', async t => {
  const f = await fixture(t, { validate: async () => { throw new Error('lint failed'); } });
  await f.position(); const selected = await f.choose(); const job = await f.bridge.claimNext(); await f.content(job);
  await assert.rejects(f.bridge.submitCandidate(job.id), /lint failed/);
  assert.equal(f.bridge.status().branches[selected.branch_id].status, 'failed');
  await assert.rejects(fs.access(path.join(f.root, `game/renpi_content/${selected.branch_id}/scene.rpy`)), /ENOENT/);
  await f.position(); assert.equal((await f.choose()).branch_id, selected.branch_id);
});

test('namespace, missing entry, and precompiled candidate content are rejected', async t => {
  const f = await fixture(t);
  for (const [index, script, extra] of [[1, 'label start:\n    return', false], [2, 'label rp_missing_entry:\n    return', false], [3, null, true]]) {
    await f.position(); await f.choose(String(index)); const job = await f.bridge.claimNext(); await f.content(job);
    if (script) await fs.writeFile(path.join(job.output, 'scene.rpy'), script);
    if (extra) await fs.writeFile(path.join(job.output, 'evil.py'), 'pass');
    await assert.rejects(f.bridge.submitCandidate(job.id), /symbol|entry|executable/);
  }
});

test('Coding may fix a validation failure and resubmit the same current job', async t => {
  const f = await fixture(t); await f.position(); await f.choose(); const job = await f.bridge.claimNext();
  await fs.writeFile(path.join(job.output, 'scene.rpy'), 'label wrong_namespace:\n    return\n');
  await assert.rejects(f.bridge.submitCandidate(job.id), /symbol/);
  assert.equal(f.bridge.status().jobs[job.id].validation_failed, true);
  await f.content(job); const result = await f.bridge.submitCandidate(job.id);
  assert.equal(result.phase, 'ready'); assert.equal(result.job_id, job.id);
  assert.equal(Object.keys(f.bridge.status().jobs).length, 1);
  assert.equal(f.bridge.status().branches[job.branch_id].error, undefined);
});

test('manifest and frozen content tamper stop adoption', async t => {
  const f = await fixture(t); await f.position(); await f.choose(); const branch = await f.ready();
  const directory = path.join(f.root, `.renpi-live/bridge/candidates/${branch.candidate_id}`);
  const manifest = await fs.readFile(path.join(directory, 'manifest.json'));
  await fs.writeFile(path.join(directory, 'manifest.json'), '{}'); await assert.rejects(f.adopt(branch), /manifest/);
  await fs.writeFile(path.join(directory, 'manifest.json'), manifest);
  await fs.appendFile(path.join(directory, 'content/scene.rpy'), '#tamper');
  await assert.rejects(f.adopt(branch), /bytes/);
});

test('wrong ACK is rejected; successful ACK replay does not republish', async t => {
  const f = await fixture(t); await f.position(); await f.choose(); const branch = await f.ready(); const adoption = await f.adopt(branch);
  await assert.rejects(f.ack({ ...adoption, anchor_id: 'wrong' }), /identity/);
  await assert.rejects(f.ack({ ...adoption, candidate_id: randomUUID() }), /identity/);
  const ack = f.event('loaded', { adoption_id: adoption.adoption_id, branch_id: adoption.branch_id,
    candidate_id: adoption.candidate_id, anchor_id: adoption.anchor_id, success: true });
  assert.equal((await f.bridge.dispatch(ack)).phase, 'committed');
  await f.position(); assert.equal((await f.bridge.dispatch(ack)).replay, true);
  assert.equal(f.bridge.status().head_branch_id, f.descriptor.base_branch_id);
});

test('failed load and restart during adoption restore previous runtime only', async t => {
  const f = await fixture(t); await f.position(); await f.choose(); let branch = await f.ready();
  await f.ack(await f.adopt(branch));
  const file = path.join(f.root, `game/renpi_content/${branch.id}/scene.rpy`), before = await fs.readFile(file);
  const binding = f.bridge.status().bindings;
  await f.dispatch('revise', { branch_id: branch.id }); branch = await f.ready();
  let adoption = await f.adopt(branch); assert.notDeepEqual(await fs.readFile(file), before);
  assert.equal((await f.ack(adoption, false)).phase, 'rolled_back'); assert.deepEqual(await fs.readFile(file), before);
  assert.deepEqual(f.bridge.status().bindings, binding);
  await f.dispatch('continue', { branch_id: branch.id }); branch = f.bridge.status().branches[branch.id];
  adoption = await f.adopt(branch); await f.restart();
  assert.equal(f.bridge.status().adoption.phase, 'rolled_back'); assert.deepEqual(await fs.readFile(file), before);
  assert.equal(f.bridge.status().head_branch_id, branch.id);
});

test('runtime tamper before ACK preserves external edits and blocks new writes', async t => {
  const f = await fixture(t); await f.position(); await f.choose(); const branch = await f.ready(); const adoption = await f.adopt(branch);
  const file = path.join(f.root, `game/renpi_content/${branch.id}/scene.rpy`);
  await fs.writeFile(file, '#external edit');
  assert.equal((await f.ack(adoption)).phase, 'recovery_failed');
  assert.equal(await fs.readFile(file, 'utf8'), '#external edit');
  await assert.rejects(f.position(), /pending adoption/);
});

test('partial adoption write failure restores all prior bytes, retaining revised candidate', async t => {
  const f = await fixture(t); await f.position(); await f.choose(); let branch = await f.ready();
  await f.ack(await f.adopt(branch));
  const directory = path.join(f.root, `game/renpi_content/${branch.id}`);
  const before = await fs.readFile(path.join(directory, 'scene.rpy'));
  const compiled = await fs.readFile(path.join(directory, 'scene.rpyc'));
  await f.dispatch('revise', { branch_id: branch.id }); branch = await f.ready();
  const originalRename = fs.rename; let injected = false;
  fs.rename = async (from, to) => {
    if (!injected && to === path.join(directory, 'scene.rpyc')) { injected = true; throw new Error('injected write fault'); }
    return originalRename(from, to);
  };
  let result;
  try { result = await f.adopt(branch); } finally { fs.rename = originalRename; }
  assert.equal(injected, true); assert.equal(result.phase, 'rolled_back');
  assert.deepEqual(await fs.readFile(path.join(directory, 'scene.rpy')), before);
  assert.deepEqual(await fs.readFile(path.join(directory, 'scene.rpyc')), compiled);
  assert.equal(f.bridge.status().branches[branch.id].candidate_id, branch.candidate_id);
});

test('queued, generating and ready candidates reject changed source basis', async t => {
  const f = await fixture(t); await f.position(); const selected = await f.choose();
  const script = path.join(f.root, 'game/script.rpy');
  await fs.appendFile(script, '#queue changed\n');
  assert.equal(await f.bridge.claimNext(), null);
  assert.equal(f.bridge.status().branches[selected.branch_id].status, 'failed');
  await f.dispatch('continue', { branch_id: selected.branch_id });
  let job = await f.bridge.claimNext(); await f.content(job); await fs.appendFile(script, '#generation changed\n');
  await assert.rejects(f.bridge.submitCandidate(job.id), /source basis/);
  await f.dispatch('continue', { branch_id: selected.branch_id });
  const branch = await f.ready(); await fs.appendFile(script, '#ready changed\n');
  await assert.rejects(f.adopt(branch), /source basis/);
  await f.dispatch('cancel', { branch_id: selected.branch_id });
  await f.dispatch('continue', { branch_id: selected.branch_id });
  job = await f.bridge.claimNext(); assert.notEqual(job.id, branch.job_id);
});

test('HTTP requires token and instance; validates payload and rejects path escape', async t => {
  const f = await fixture(t);
  const connection = JSON.parse(await fs.readFile(path.join(f.root, '.renpi-live/bridge/connection.json')));
  const url = `http://127.0.0.1:${connection.port}`;
  assert.equal((await fetch(`${url}/status`)).status, 401);
  const token = await fs.readFile(connection.token_file, 'utf8');
  assert.equal(Object.hasOwn(connection, 'token'), false);
  assert.equal(path.relative(f.root, connection.token_file).startsWith('..'), true);
  assert.equal(JSON.stringify(f.bridge.status()).includes(token), false);
  const headers = { Authorization: `Bearer ${token}`, 'X-Renpi-Instance': connection.instance_id };
  assert.equal((await fetch(`${url}/status`, { headers })).status, 200);
  assert.equal((await fetch(`${url}/status`, { headers: { ...headers, 'X-Renpi-Instance': 'wrong' } })).status, 401);
  assert.equal((await fetch(`${url}/event`, { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await fetch(`${url}/status`, { headers: { ...headers, Origin: 'https://example.com' } })).status, 403);
  await assert.rejects(f.dispatch('position', { branch_id: '../outside', anchor_id: 'a' }), /branch/);
  await f.position(); await f.choose(); const job = await f.bridge.claimNext(); await f.content(job);
  await fs.symlink(path.join(f.root, 'game'), path.join(job.output, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.bridge.submitCandidate(job.id), /reparse|link/);
});

test('close removes only its private token and preserves replacement discovery credentials', async t => {
  const f = await fixture(t), other = await fixture(t);
  const discovery = path.join(f.root, '.renpi-live/bridge/connection.json');
  const original = JSON.parse(await fs.readFile(discovery));
  const replacement = JSON.parse(await fs.readFile(path.join(other.root, '.renpi-live/bridge/connection.json')));
  const otherToken = await fs.readFile(replacement.token_file, 'utf8');
  await fs.writeFile(discovery, JSON.stringify(replacement));
  await f.bridge.close();
  await assert.rejects(fs.access(original.token_file), /ENOENT/);
  assert.equal(await fs.readFile(replacement.token_file, 'utf8'), otherToken);
  assert.equal(JSON.parse(await fs.readFile(discovery)).instance_id, replacement.instance_id);
  const headers = { Authorization: `Bearer ${otherToken}`, 'X-Renpi-Instance': replacement.instance_id };
  assert.equal((await fetch(`http://127.0.0.1:${replacement.port}/status`, { headers })).status, 200);
  await other.bridge.close(); await assert.rejects(fs.access(replacement.token_file), /ENOENT/);
});

test('SDK zero-exit exceptions are rejected rather than accepted as evidence', async t => {
  const f = await fixture(t, { validate: async () => [{ code: 0, output: 'PermissionError: SDK common is read-only' }] });
  await f.position(); await f.choose(); const job = await f.bridge.claimNext(); await f.content(job);
  await assert.rejects(f.bridge.submitCandidate(job.id), /exception despite/);
  assert.equal(f.bridge.status().jobs[job.id].status, 'failed');
});

test('runtime cache and saves are not traversed or included in generation basis', async t => {
  const f = await fixture(t); await f.position(); await f.choose(); const job = await f.bridge.claimNext(); await f.content(job);
  const external = path.join(f.root, 'ignored'); await fs.mkdir(external);
  await fs.writeFile(path.join(external, 'not-source'), 'private save');
  await fs.symlink(external, path.join(f.root, 'game/saves'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.mkdir(path.join(f.root, 'game/cache')); await fs.writeFile(path.join(f.root, 'game/cache/blob'), 'mutable');
  await fs.writeFile(path.join(f.root, 'game/script.rpyc'), 'mutable compiled bytecode');
  const ready = await f.bridge.submitCandidate(job.id); assert.equal(ready.phase, 'ready');
  await assert.rejects(fs.access(path.join(f.root, `.renpi-live/bridge/builds/${ready.candidate_id}/game/saves`)), /ENOENT/);
});

test('missing state fails closed and dead writer ownership can be recovered', async t => {
  const f = await fixture(t); await f.bridge.close();
  const statePath = path.join(f.root, '.renpi-live/bridge/state.json'), saved = await fs.readFile(statePath);
  await fs.unlink(statePath); await assert.rejects(startBridge({ root: f.root }), /state is missing/);
  await assert.rejects(fs.access(statePath), /ENOENT/); await fs.writeFile(statePath, saved);
  const lock = path.join(f.root, '.renpi-live/bridge/writer.lock'); await fs.mkdir(lock);
  await fs.writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: 2147483647, instance_id: randomUUID() }));
  await f.restart(); assert.equal(f.bridge.status().project_id, f.descriptor.project_id);
});

test('concurrent dead-owner recovery replaces ownership in place with exactly one winner', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'renpi-lock-race-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'writer.lock'), ownerFile = path.join(directory, 'owner.json');
  await fs.mkdir(directory);
  await fs.writeFile(ownerFile, JSON.stringify({ pid: 2147483647, instance_id: 'dead-instance' }));
  const originalRead = fs.readFile, originalRemove = fs.rmdir;
  let reads = 0, removes = 0, releaseReads;
  const bothReadDeadOwner = new Promise(resolve => { releaseReads = resolve; });
  fs.readFile = async (...args) => {
    const result = await originalRead(...args);
    if (args[0] === ownerFile && ++reads <= 2) {
      if (reads === 2) releaseReads();
      await bothReadDeadOwner;
    }
    return result;
  };
  fs.rmdir = async (...args) => { if (args[0] === directory) removes++; return originalRemove(...args); };
  let results;
  try { results = await Promise.allSettled([lockProject(directory, 'first'), lockProject(directory, 'second')]); }
  finally { fs.readFile = originalRead; fs.rmdir = originalRemove; }
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(removes, 0);
  const winner = results.findIndex(result => result.status === 'fulfilled');
  assert.equal(JSON.parse(await fs.readFile(ownerFile)).instance_id, winner === 0 ? 'first' : 'second');
  await assert.rejects(fs.access(path.join(directory, 'reclaim')), /ENOENT/);
  await results[winner].value();
  await assert.rejects(fs.access(directory), /ENOENT/);
  const release = await lockProject(directory, 'next-instance');
  assert.equal(JSON.parse(await fs.readFile(ownerFile)).instance_id, 'next-instance');
  await release();
});
