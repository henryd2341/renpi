import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { digest, managedPath, atomicJSON, run, validateCandidateSDK, tree, writeBytes, stageValidationFiles, finishValidationBuild } from './bridge-common.mjs';

import { installFoundation } from './foundation.mjs';

export const protocol = 'renpi-bridge-v1';
const area = '.renpi-live/bridge';
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value)
  && !Object.hasOwn(Object.prototype, value) && value !== 'prototype';
const fault = (message, status = 409) => Object.assign(new Error(message), { status });
const clone = value => structuredClone(value);
const canonical = value => JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
const prefix = id => `rp_b_${id.replaceAll('-', '')}`;
const activeAdoption = adoption => adoption && ['prepared', 'awaiting_load', 'recovery_failed'].includes(adoption.phase);
const exists = async file => { try { return await fs.readFile(file); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };

export function initialState(descriptor) {
  if (descriptor.format_version !== 1 || descriptor.protocol !== protocol ||
      !identifier(descriptor.project_id) || !identifier(descriptor.base_branch_id)) throw fault('invalid project descriptor', 400);
  const id = descriptor.base_branch_id;
  return { format_version: 1, protocol, project_id: descriptor.project_id, base_branch_id: id,
    head_branch_id: id, position: { branch_id: id, anchor_id: 'start', revision: 0 },
    branches: { [id]: { id, parent_id: null, fork_anchor: null, entry_label: 'start', status: 'base',
      job_id: null, candidate_id: null, published: true } },
    bindings: {}, jobs: {}, candidates: {}, requests: {}, adoption: null, recovery_required: false };
}

export async function lockProject(directory, instance) {
  const ownerFile = path.join(directory, 'owner.json');
  let recovered = false;
  try { await fs.mkdir(directory); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const original = await exists(ownerFile);
    if (!original) throw fault('bridge lock has incomplete ownership; inspect it before recovery');
    const owner = JSON.parse(original);
    if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw fault('invalid bridge lock owner');
    try { process.kill(owner.pid, 0); throw fault('a bridge writer is already alive'); }
    catch (e) { if (e.code !== 'ESRCH') throw e; }
    const reclaim = await fs.open(path.join(directory, 'reclaim'), 'wx');
    try {
      if (!(await fs.readFile(ownerFile)).equals(original)) throw fault('bridge owner changed during recovery');
      await atomicJSON(ownerFile, { pid: process.pid, instance_id: instance });
      recovered = true;
    } finally { await reclaim.close(); await fs.unlink(path.join(directory, 'reclaim')); }
  }
  if (!recovered) await atomicJSON(ownerFile, { pid: process.pid, instance_id: instance });
  return async () => {
    const owner = JSON.parse(await fs.readFile(ownerFile));
    if (owner.instance_id !== instance) throw fault('bridge lock ownership changed');
    await fs.unlink(ownerFile); await fs.rmdir(directory);
  };
}

function checkScripts(files, branch) {
  const namespace = `${prefix(branch.id)}_`;
  if (!files.some(file => file.path === 'scene.rpy')) throw fault('candidate needs scene.rpy');
  let entryFound = false;
  for (const file of files) {
    if (/\.(py|pyc|pyo|rpyc|rpym|rpymc|rpa)$/i.test(file.path)) throw fault('candidate contains executable or precompiled content outside RPY validation');
    if (!file.path.endsWith('.rpy')) continue;
    const script = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes);
    for (const line of script.split(/\r?\n/)) {
      if (/^\s*(?:init\b.*\bpython|python\b|init\s*:|\$)/.test(line))
        throw fault('candidate Python statements need a separately reviewed namespace contract');
      const declaration = line.match(/^\s*(?:(?:init\s+-?\d+\s+)?(label|screen|transform|image|define|default|style))\s+([^\s(:=]+)/);
      if (declaration && !declaration[2].startsWith(namespace)) throw fault(`candidate global symbol must start with ${namespace}`);
      if (declaration?.[1] === 'label' && declaration[2] === branch.entry_label) entryFound = true;
    }
  }
  if (!entryFound) throw fault('candidate entry label is missing');
}

export async function startBridge({ root, sdk, sessionId, validate = validateCandidateSDK }) {
  root = await fs.realpath(root);
  const base = await managedPath(root, area);
  await fs.mkdir(base, { recursive: true });
  const descriptor = JSON.parse(await fs.readFile(await managedPath(root, `${area}/project.json`)));
  initialState(descriptor);
  const instance = randomUUID();
  const release = await lockProject(await managedPath(root, `${area}/writer.lock`), instance);
  const credentialRelative = `renpi-bridge/${descriptor.project_id}/${instance}`;
  let token, runtimeDir, tokenFile;
  const removeCredential = async () => {
    if (!runtimeDir) return;
    const directory = await managedPath(os.tmpdir(), credentialRelative);
    const file = await managedPath(directory, 'bridge.token');
    const current = await exists(file);
    if (current && current.toString('utf8') !== token) return;
    if (current) await fs.unlink(file);
    try { await fs.rmdir(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
  let server, closed = false, foundationPending = false, chain = Promise.resolve(), state;
  const validations = new Map();
  const serial = operation => {
    const result = chain.then(() => { if (closed) throw fault('bridge is closed', 503); return operation(); });
    chain = result.catch(() => {}); return result;
  };
  const location = relative => managedPath(root, `${area}/${relative}`);
  const commit = async next => { await atomicJSON(await location('state.json'), next); state = next; };
  const gameFiles = async () => tree(await managedPath(root, 'game'), '', name =>
    /^(saves|cache)(\/|$)/.test(name) || /(^|\/)__pycache__(\/|$)/.test(name) || /\.(rpyc|rpymc|pyc|pyo)$/i.test(name));
  const sourceBasis = async () => digest(JSON.stringify((await gameFiles()).map(file => [file.path, digest(file.bytes)])));
  const runtimePath = async (branch, relative) => {
    if (!identifier(branch)) throw fault('invalid runtime branch identity');
    return managedPath(await managedPath(root, `game/renpi_content/${branch}`), relative);
  };
  const candidateFiles = async candidate => {
    if (!candidate || !identifier(candidate.id) || !identifier(candidate.branch_id)) throw fault('invalid candidate identity');
    const bytes = await fs.readFile(await location(`candidates/${candidate.id}/manifest.json`));
    if (digest(bytes) !== candidate.manifest_sha256) throw fault('candidate manifest was changed');
    const manifest = JSON.parse(bytes);
    if (manifest.project_id !== state.project_id || manifest.branch_id !== candidate.branch_id || manifest.candidate_id !== candidate.id)
      throw fault('candidate ownership mismatch');
    const files = await tree(await location(`candidates/${candidate.id}/content`));
    if (files.length !== manifest.files.length || files.some((file, i) => file.path !== manifest.files[i].path || digest(file.bytes) !== manifest.files[i].sha256))
      throw fault('candidate bytes were changed');
    return files;
  };
  const restore = async adoption => {
    const changes = [];
    for (const file of adoption.files) {
      const target = await runtimePath(adoption.branch_id, file.path), current = await exists(target);
      const before = file.before_sha256 === null ? null : await fs.readFile(await location(`recovery/${adoption.id}/${file.path}`));
      if (before && digest(before) !== file.before_sha256) throw fault('recovery backup was changed');
      const hash = current === null ? null : digest(current);
      if (hash === file.before_sha256) continue;
      if (hash !== file.sha256) throw fault('runtime changed during recovery; preserving external edits');
      changes.push({ target, before });
    }
    for (const { target, before } of changes) {
      if (before === null) await fs.rm(target, { force: true }); else await writeBytes(target, before);
    }
  };
  const rollback = async (next, reason) => {
    try {
      await restore(next.adoption); next.adoption.phase = 'rolled_back'; next.recovery_required = false;
    } catch (error) {
      next.adoption.phase = 'recovery_failed'; next.recovery_required = true;
      reason = `${reason}; ${error.message}`;
    }
    const branch = next.branches[next.adoption.branch_id];
    branch.status = 'failed'; branch.error = reason; next.adoption.error = reason;
    await commit(next);
  };
  const queueJob = async (next, branch, previous) => {
    const id = randomUUID(), output = await location(`work/${branch.id}/${id}`);
    await fs.mkdir(output, { recursive: true });
    const job = { id, branch_id: branch.id, status: 'queued', output, entry_label: branch.entry_label,
      option_id: branch.option_id ?? null, text: branch.text ?? '', source_branch_id: branch.parent_id,
      anchor_id: branch.fork_anchor, previous_job_id: previous?.id ?? null,
      previous_output: previous?.output ?? null, previous_candidate_id: branch.candidate_id,
      source_basis: await sourceBasis(),
      ...(previous ? { continuation: 'Inspect the prior job and its local output before continuing; do not blindly repeat external requests.' } : {}) };
    next.jobs[id] = job; branch.job_id = id; branch.status = 'queued'; delete branch.error;
    return job;
  };
  const writable = () => {
    if (foundationPending) throw fault('Resolve the interrupted foundation installation before production.');
    if (state.recovery_required || activeAdoption(state.adoption)) throw fault('resolve the pending adoption before other writes');
  };
  const summary = branch => ({ branch_id: branch.id, job_id: branch.job_id, candidate_id: branch.candidate_id,
    entry_label: branch.entry_label, phase: branch.status });

  async function dispatch(event) {
    return serial(async () => {
      if (!event || Array.isArray(event) || !identifier(event.request_id) || event.project_id !== state.project_id)
        throw fault('invalid request or project identity', 400);
      const fields = {
        position: ['branch_id', 'anchor_id'], choose: ['branch_id', 'anchor_id', 'position_revision', 'option_id', 'text'],
        retry: ['branch_id', 'anchor_id', 'position_revision', 'option_id', 'text'],
        continue: ['branch_id'], cancel: ['branch_id'], revise: ['branch_id'],
        adopt: ['branch_id', 'candidate_id'], loaded: ['adoption_id', 'candidate_id', 'branch_id', 'anchor_id', 'success'],
      }[event.type];
      if (!fields || Object.keys(event).some(key => !['type', 'request_id', 'project_id', ...fields].includes(key)) ||
          fields.some(key => !Object.hasOwn(event, key))) throw fault('invalid event fields', 400);
      const fingerprint = digest(canonical(event)), old = state.requests[event.request_id];
      if (old) {
        if (old.fingerprint !== fingerprint) throw fault('request_id reused with different payload');
        return { ...clone(old.result), replay: true };
      }
      if (event.type !== 'loaded') writable();
      else if (state.recovery_required) throw fault('runtime recovery is required');
      const next = clone(state), branch = next.branches[event.branch_id];
      if (!identifier(event.branch_id) || !branch) throw fault('unknown branch');
      let result;
      if (event.type === 'position') {
        if (!identifier(event.anchor_id) || !branch.published && event.anchor_id !== branch.entry_label)
          throw fault('position needs published content or the exact waiting entry');
        next.head_branch_id = branch.id;
        next.position = { branch_id: branch.id, anchor_id: event.anchor_id, revision: next.position.revision + 1 };
        result = { ...summary(branch), position: clone(next.position) };
      } else if (event.type === 'choose' || event.type === 'retry') {
        if (!identifier(event.anchor_id) || !identifier(event.option_id) || typeof event.text !== 'string' || event.text.length > 16000)
          throw fault('invalid choice', 400);
        const position = next.position;
        if (!branch.published || position.branch_id !== branch.id || position.anchor_id !== event.anchor_id ||
            position.revision !== event.position_revision) throw fault('stale choice position');
        const key = JSON.stringify([branch.id, event.anchor_id, event.option_id]);
        let target = next.branches[next.bindings[key]];
        if (!target || event.type === 'retry') {
          const id = randomUUID();
          target = { id, parent_id: branch.id, fork_anchor: event.anchor_id, entry_label: `${prefix(id)}_entry`,
            status: 'queued', job_id: null, candidate_id: null, published: false, option_id: event.option_id, text: event.text };
          next.branches[id] = target; next.bindings[key] = id; await queueJob(next, target);
        }
        next.head_branch_id = target.id;
        next.position = { branch_id: target.id, anchor_id: target.entry_label, revision: position.revision + 1 };
        result = { ...summary(target), position: clone(next.position) };
      } else if (event.type === 'cancel') {
        if (!['queued', 'running', 'validating', 'interrupted', 'ready'].includes(branch.status)) throw fault('branch has no cancellable job');
        branch.status = 'cancelled';
        if (branch.job_id) next.jobs[branch.job_id].status = 'cancelled';
        result = summary(branch);
      } else if (event.type === 'continue') {
        if (!['cancelled', 'interrupted', 'failed'].includes(branch.status)) throw fault('branch is not held for continuation');
        const previous = next.jobs[branch.job_id];
        const retained = previous?.late_candidate_id ?? (previous?.candidate_id === branch.candidate_id ? branch.candidate_id : null);
        if (retained && next.candidates[retained]?.source_basis === await sourceBasis()) {
          await candidateFiles(next.candidates[retained]); branch.candidate_id = retained; branch.status = 'ready';
        } else await queueJob(next, branch, previous);
        result = summary(branch);
      } else if (event.type === 'revise') {
        if (!branch.published || next.head_branch_id !== branch.id || !['published', 'base', 'failed'].includes(branch.status))
          throw fault('revision needs the current published branch with no active job');
        if (branch.id === next.base_branch_id) throw fault('base revision requires the shared-source editing workflow');
        await queueJob(next, branch, next.jobs[branch.job_id]); result = summary(branch);
      } else if (event.type === 'adopt') {
        if (branch.status !== 'ready' || branch.id !== next.head_branch_id || branch.candidate_id !== event.candidate_id ||
            next.position.anchor_id !== branch.entry_label) throw fault('candidate is not applicable at this entry boundary');
        const candidate = next.candidates[branch.candidate_id];
        if (candidate.source_basis !== await sourceBasis()) throw fault('candidate source basis changed; revise or continue from current sources');
        const files = await candidateFiles(candidate);
        const adoption = { id: randomUUID(), branch_id: branch.id, candidate_id: branch.candidate_id,
          entry_label: branch.entry_label, anchor_id: branch.entry_label, phase: 'prepared', files: [] };
        let beforeFiles = [];
        try { beforeFiles = await tree(await runtimePath(branch.id, '')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
        const paths = [...new Set([...files, ...beforeFiles].map(file => file.path))].sort();
        for (const name of paths) {
          const before = beforeFiles.find(file => file.path === name), after = files.find(file => file.path === name);
          if (before) await writeBytes(await location(`recovery/${adoption.id}/${name}`), before.bytes);
          adoption.files.push({ path: name, before_sha256: before ? digest(before.bytes) : null, sha256: after ? digest(after.bytes) : null });
        }
        if (candidate.source_basis !== await sourceBasis()) throw fault('candidate source basis changed before publication');
        next.adoption = adoption; branch.status = 'loading';
        result = { ...summary(branch), adoption_id: adoption.id, anchor_id: adoption.anchor_id, phase: 'awaiting_load' };
        next.requests[event.request_id] = { fingerprint, result: clone(result) };
        await commit(next);
        try {
          for (const file of adoption.files) {
            const target = await runtimePath(branch.id, file.path);
            const current = await exists(target);
            if ((current === null ? null : digest(current)) !== file.before_sha256) throw fault('runtime changed before publication write');
            if (file.sha256 === null) await fs.rm(target, { force: true });
            else await writeBytes(target, files.find(item => item.path === file.path).bytes);
          }
          adoption.phase = 'awaiting_load';
        } catch (error) {
          await rollback(next, error.message); result.phase = next.adoption.phase;
        }
      } else if (event.type === 'loaded') {
        const adoption = next.adoption;
        if (!adoption || adoption.phase !== 'awaiting_load' || adoption.id !== event.adoption_id ||
            adoption.branch_id !== branch.id || adoption.candidate_id !== event.candidate_id ||
            adoption.anchor_id !== event.anchor_id || typeof event.success !== 'boolean') throw fault('load ACK identity mismatch');
        try {
          if (!event.success) throw fault('client reported load failure');
          const files = await candidateFiles(next.candidates[adoption.candidate_id]);
          const current = await tree(await runtimePath(branch.id, ''));
          if (files.length !== current.length || files.some((file, i) => file.path !== current[i].path || !file.bytes.equals(current[i].bytes)))
            throw fault('runtime bytes differ from the validated candidate');
          branch.published = true; branch.published_candidate_id = branch.candidate_id; branch.status = 'published';
          adoption.phase = 'committed';
        } catch (error) { await rollback(next, error.message); }
        result = { ...summary(branch), adoption_id: adoption.id, phase: adoption.phase };
      }
      next.requests[event.request_id] = { fingerprint, result: clone(result) };
      await commit(next); return clone(result);
    });
  }

  async function submitCandidate(id) {
    const job = await serial(async () => {
      writable();
      if (!identifier(id) || !Object.hasOwn(state.jobs, id)) throw fault(`unknown production job: ${id}`, 404);
      const current = state.jobs[id], branch = state.branches[current.branch_id];
      if (branch.job_id !== id)
        throw fault(`job ${id} was superseded; current job_id is ${branch.job_id}. Inspect that job's output before submitting it.`);
      if (!['running', 'failed', 'interrupted'].includes(current.status))
        throw fault(`job ${id} is ${current.status}; only running, failed or interrupted current jobs accept submission`);
      const next = clone(state); next.jobs[id].status = 'validating'; next.jobs[id].validation_failed = false;
      next.branches[current.branch_id].status = 'validating';
      await commit(next); return clone(current);
    });
    const candidateId = randomUUID();
    try {
      if (job.source_basis !== await sourceBasis()) throw fault('job source basis changed during generation');
      const branch = clone(state.branches[job.branch_id]), input = await tree(await managedPath(root, path.relative(root, job.output)));
      checkScripts(input, branch);
      const build = await location(`builds/${candidateId}`), buildGame = path.join(build, 'game');
      await fs.mkdir(buildGame, { recursive: true });
      const links = await stageValidationFiles(buildGame, await managedPath(root, 'game'),
        (await gameFiles()).filter(file => !file.path.startsWith(`renpi_content/${branch.id}/`)));
      await stageValidationFiles(buildGame, job.output, input, `renpi_content/${branch.id}/`, links);
      const staged = (await tree(buildGame, '', () => false, links)).map(file => ({ path: file.path, sha256: digest(file.bytes) }));
      await atomicJSON(path.join(build, 'validation-inputs.json'), staged);
      const reports = await validate(build, sdk);
      if (job.source_basis !== await sourceBasis()) throw fault('job source basis changed during validation');
      if (!Array.isArray(reports) || !reports.length || reports.some(report => report.code !== 0)) throw fault('SDK validation has no successful evidence');
      if (reports.some(report => /Traceback \(most recent call last\)|PermissionError:/.test(report.output ?? '')))
        throw fault('SDK reported an exception despite its exit status');
      const checked = await tree(buildGame, '', () => false, links);
      const checkedHashes = new Map(checked.map(file => [file.path, digest(file.bytes)]));
      if (staged.some(file => checkedHashes.get(file.path) !== file.sha256))
        throw fault('validation inputs changed during SDK checks');
      const built = await tree(await managedPath(buildGame, `renpi_content/${branch.id}`), '', () => false, links);
      if (!built.some(file => file.path === 'scene.rpyc')) throw fault('SDK compile produced no scene.rpyc');
      if (input.some(file => !built.some(other => other.path === file.path && other.bytes.equals(file.bytes)))) throw fault('candidate source changed during validation');
      const manifest = { format_version: 1, project_id: state.project_id, candidate_id: candidateId, branch_id: branch.id,
        job_id: id, entry_label: branch.entry_label, source_basis: job.source_basis, reports,
        files: built.map(file => ({ path: file.path, sha256: digest(file.bytes) })) };
      for (const file of built) await writeBytes(await location(`candidates/${candidateId}/content/${file.path}`), file.bytes);
      const manifestPath = await location(`candidates/${candidateId}/manifest.json`);
      await atomicJSON(manifestPath, manifest);
      const manifestHash = digest(await fs.readFile(manifestPath));
      await atomicJSON(path.join(build, 'validation-reports.json'), reports);
      await finishValidationBuild(build, links);
      return await serial(async () => {
        const next = clone(state), current = next.jobs[id], target = next.branches[job.branch_id];
        next.candidates[candidateId] = { id: candidateId, branch_id: branch.id, job_id: id,
          manifest_sha256: manifestHash, source_basis: job.source_basis };
        current.candidate_id = candidateId;
        if (current.status !== 'validating' || target.job_id !== id) {
          current.late_candidate_id = candidateId; await commit(next); return { phase: 'held', candidate_id: candidateId };
        }
        current.status = 'ready'; target.status = 'ready'; target.candidate_id = candidateId;
        delete current.error; delete target.error;
        await commit(next); return summary(target);
      });
    } catch (error) {
      await serial(async () => {
        const next = clone(state), current = next.jobs[id];
        current.error = error.message;
        if (current.status === 'validating' && next.branches[job.branch_id].job_id === id) {
          current.validation_failed = true;
          if (error.validation_reports) current.validation_reports = error.validation_reports;
          current.status = 'failed'; next.branches[job.branch_id].status = 'failed'; next.branches[job.branch_id].error = error.message;
        }
        await commit(next);
      });
      throw error;
    }
  }

  try {
    if (await exists(await location('foundation.pending.json'))) throw fault('Resolve the interrupted foundation installation offline before connecting.');
    const saved = await exists(await location('state.json'));
    if (!saved) throw fault('project state is missing; restore its state rather than resetting history');
    state = JSON.parse(saved);
    if (state.format_version !== 1 || state.protocol !== protocol || state.project_id !== descriptor.project_id || state.base_branch_id !== descriptor.base_branch_id)
      throw fault('persisted state does not match project descriptor');
    for (const [id, branch] of Object.entries(state.branches))
      if (!identifier(id) || id !== branch.id) throw fault('invalid persisted branch identity');
    for (const job of Object.values(state.jobs)) {
      if (!identifier(job.id) || !state.branches[job.branch_id] || job.output !== await location(`work/${job.branch_id}/${job.id}`)) throw fault('invalid persisted job path');
      if (['running', 'validating'].includes(job.status)) {
        job.status = 'interrupted';
        if (state.branches[job.branch_id].job_id === job.id) state.branches[job.branch_id].status = 'interrupted';
      }
    }
    if (activeAdoption(state.adoption)) await rollback(clone(state), 'bridge restarted during adoption');
    await commit(state);
    token = randomBytes(32).toString('hex');
    const credentialDirectory = await managedPath(os.tmpdir(), credentialRelative);
    const fromProject = path.relative(root, credentialDirectory);
    if (fromProject !== '..' && !fromProject.startsWith(`..${path.sep}`) && !path.isAbsolute(fromProject))
      throw fault('private credential directory must stay outside the project');
    runtimeDir = credentialDirectory;
    await fs.mkdir(runtimeDir, { recursive: true, mode: 0o700 });
    if (process.platform === 'win32') {
      const who = await run('whoami.exe', [], root);
      if (who.code !== 0) throw fault('runtime owner lookup failed');
      const acl = await run('icacls.exe', [runtimeDir, '/inheritance:r', '/grant:r', `${who.output.trim()}:(OI)(CI)F`], root);
      if (acl.code !== 0) throw fault('runtime credential directory ACL failed');
    }
    tokenFile = await managedPath(runtimeDir, 'bridge.token');
    await fs.writeFile(tokenFile, token, { mode: 0o600, flag: 'wx' });
    server = http.createServer(async (request, response) => {
      const reply = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); };
      try {
        const supplied = Buffer.from(request.headers.authorization ?? ''), expected = Buffer.from(`Bearer ${token}`);
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected) || request.headers['x-renpi-instance'] !== instance)
          throw fault('invalid bridge credentials', 401);
        if (request.headers.origin) throw fault('browser origins are not accepted', 403);
        if (request.method === 'GET' && request.url === '/status') return reply(200, { ok: true, state: clone(state) });
        if (request.method !== 'POST' || request.url !== '/event') throw fault('unknown endpoint', 404);
        const chunks = []; let size = 0;
        for await (const chunk of request) {
          size += chunk.length; if (size > 65536) throw fault('event exceeds size limit', 413);
          chunks.push(chunk);
        }
        let event;
        try { event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
        catch { throw fault('invalid JSON or UTF-8', 400); }
        const result = await dispatch(event); reply(200, { ok: true, result, state: clone(state) });
      } catch (error) { reply(error.status ?? 500, { ok: false, error: error.message }); }
    });
    server.requestTimeout = 15000; server.headersTimeout = 10000;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    await atomicJSON(await location('connection.json'), { protocol, project_id: state.project_id, root,
      port: server.address().port, token_file: tokenFile, instance_id: instance, pid: process.pid, session_id: sessionId ?? null });
    return {
      status: () => clone(state), dispatch,
      installFoundation: (source, files, signal) => serial(async () => {
        try { return await installFoundation({ root, sdk, state, source, files, signal, validate }); }
        finally { foundationPending = Boolean(await exists(await location('foundation.pending.json'))); }
      }),
      submitCandidate: id => {
        if (validations.has(id)) return validations.get(id);
        const pending = submitCandidate(id); validations.set(id, pending);
        pending.then(() => validations.delete(id), () => validations.delete(id));
        return pending;
      },
      claimNext: () => serial(async () => {
        writable();
        if (!Object.values(state.jobs).some(job => job.status === 'queued')) return null;
        const next = clone(state), basis = await sourceBasis();
        for (const job of Object.values(next.jobs).filter(item => item.status === 'queued')) {
          const branch = next.branches[job.branch_id];
          if (job.source_basis !== basis) {
            job.status = 'failed'; job.error = 'queued source basis changed; explicit continuation required';
            branch.status = 'failed'; branch.error = job.error; continue;
          }
          job.status = 'running'; branch.status = 'running'; await commit(next); return clone(job);
        }
        await commit(next); return null;
      }),
      failJob: (id, error) => serial(async () => {
        const next = clone(state), job = next.jobs[id];
        if (!job || !['running', 'validating'].includes(job.status) || next.branches[job.branch_id].job_id !== id) return false;
        job.status = 'failed'; job.validation_failed = false; job.error = String(error);
        next.branches[job.branch_id].status = 'failed'; next.branches[job.branch_id].error = String(error);
        await commit(next); return true;
      }),
      close: async () => {
        if (closed) return; closed = true;
        await new Promise(resolve => server.close(resolve)); await Promise.allSettled([...validations.values()]); await chain;
        const connection = await exists(await location('connection.json'));
        if (connection && JSON.parse(connection).instance_id === instance) await fs.unlink(await location('connection.json'));
        try { await removeCredential(); } finally { await release(); }
      },
    };
  } catch (error) {
    if (server) await new Promise(resolve => server.close(resolve));
    try { await removeCredential(); } finally { await release(); }
    throw error;
  }
}
