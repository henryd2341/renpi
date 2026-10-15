import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJSON, digest, managedPath, tree, stageValidationFiles, finishValidationBuild, validateCandidateSDK } from './bridge-common.mjs';

const control = '.renpi-live/bridge';
const optional = async file => {
  try { return await fs.readFile(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};
const relative = value => typeof value === 'string' && value.length > 0 &&
  value.split('/').every(part => part && part !== '.' && part !== '..' &&
    !/[\\:<>"|?*\x00-\x1f]/.test(part) && !/[. ]$/.test(part) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
const ignored = name => /^(saves|cache)(\/|$)/i.test(name) || /(^|\/)__pycache__(\/|$)/i.test(name) || /\.(rpyc|rpymc|pyc|pyo)$/i.test(name);
const hashes = files => files.map(file => ({ path: file.path, sha256: digest(file.bytes) }));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Caller owns the project writer lock and serializes bridge operations for the entire install.
export async function installFoundation({ root, sdk, state, source, files, signal, validate = validateCandidateSDK }) {
  if (!relative(source) || !source.startsWith('authoring/')) throw new Error('Foundation source must be a project authoring directory.');
  if (!Array.isArray(files) || !files.length || files.some(name => !relative(name)) ||
      new Set(files.map(name => name.toLowerCase())).size !== files.length) throw new Error('List distinct relative foundation files.');
  for (const name of files) {
    if (/^(renpi_bridge\.rpy|python-packages|renpi_content|saves|cache)(\/|$)/i.test(name) ||
        !/\.(rpy|png|jpe?g|webp|ogg|mp3|wav|ttf|otf|txt|json)$/i.test(name)) throw new Error(`Reserved or unsupported foundation file: ${name}`);
  }
  const input = await Promise.all([...files].sort().map(async name => ({ path: name,
    bytes: await fs.readFile(await managedPath(root, `${source}/${name}`)) })));
  const manifest = { source, files: hashes(input) };
  const receiptPath = await managedPath(root, `${control}/foundation.json`);
  const pendingPath = await managedPath(root, `${control}/foundation.pending.json`);
  const receipt = await optional(receiptPath), pending = await optional(pendingPath);
  if (pending) {
    const recorded = JSON.parse(pending);
    if (recorded.project_id !== state.project_id || recorded.base_branch_id !== state.base_branch_id ||
        !same(recorded.manifest, manifest)) throw new Error('Interrupted foundation uses different inputs or identity; preserve its journal and restore the original sources.');
  }
  const additions = [];
  for (const file of input) {
    const target = await managedPath(root, `game/${file.path}`), before = await optional(target);
    if (before && !before.equals(file.bytes)) throw new Error(`Foundation conflicts with existing game/${file.path}; no files replaced.`);
    if (!before) {
      if (file.path.endsWith('.rpy') && await optional(`${target}c`)) throw new Error(`Orphan bytecode conflicts with ${file.path}.`);
      additions.push(file);
    }
  }
  if (receipt) {
    const recorded = JSON.parse(receipt);
    if (recorded.project_id !== state.project_id || recorded.base_branch_id !== state.base_branch_id ||
        !same(recorded.manifest, manifest) || additions.length) throw new Error('Foundation already installed; use a separately scoped shared-content revision.');
    if (pending) await fs.unlink(pendingPath);
    return { ...recorded, already_installed: true };
  }
  if (state.head_branch_id !== state.base_branch_id || state.position?.anchor_id !== 'start' ||
      Object.keys(state.branches).length !== 1 || !state.branches[state.base_branch_id] ||
      Object.keys(state.jobs).length || Object.keys(state.candidates).length || Object.keys(state.bindings).length ||
      state.adoption || state.recovery_required) throw new Error('Foundation installation requires the initial base before story production.');
  signal?.throwIfAborted();
  const game = await managedPath(root, 'game');
  const before = await tree(game, '', ignored);
  const build = await managedPath(root, `${control}/foundation-builds/${randomUUID()}`);
  const buildGame = path.join(build, 'game');
  const links = await stageValidationFiles(buildGame, game, before.filter(file => !input.some(item => item.path === file.path)));
  await stageValidationFiles(buildGame, await managedPath(root, source), input, '', links);
  const staged = hashes(await tree(buildGame, '', ignored, links));
  await atomicJSON(path.join(build, 'validation-inputs.json'), staged);
  if (![...before, ...input].some(file => file.path.endsWith('.rpy') && /^label start\s*:/m.test(file.bytes.toString('utf8'))))
    throw new Error('Foundation needs a start label.');
  const reports = await validate(build, sdk);
  if (!Array.isArray(reports) || !['compile', 'lint'].every(command => reports.some(report => report.command?.[0] === command)) ||
      reports.some(report => report.code !== 0 || /Traceback \(most recent call last\)|PermissionError:/.test(report.output ?? '')))
    throw new Error('Foundation compile/lint evidence is missing or failed.');
  if (!same(staged, hashes(await tree(buildGame, '', ignored, links)))) throw new Error('Staged foundation files changed during validation.');
  for (const file of input) {
    const current = await fs.readFile(await managedPath(root, `${source}/${file.path}`));
    if (!current.equals(file.bytes)) throw new Error('Foundation source changed during validation.');
    if (file.path.endsWith('.rpy')) await fs.access(await managedPath(build, `game/${file.path}c`));
  }
  if (!same(hashes(before), hashes(await tree(game, '', ignored)))) throw new Error('Runtime files changed during foundation validation.');
  signal?.throwIfAborted();
  const result = { format_version: 1, project_id: state.project_id, base_branch_id: state.base_branch_id,
    phase: 'installed', runtime_tested: false, manifest, reports, build, installed_at: new Date().toISOString() };
  await atomicJSON(path.join(build, 'validation-reports.json'), reports);
  await finishValidationBuild(build, links);
  await atomicJSON(pendingPath, { manifest, project_id: state.project_id, base_branch_id: state.base_branch_id });
  const written = [];
  try {
    for (const file of additions) {
      signal?.throwIfAborted();
      const target = await managedPath(root, `game/${file.path}`);
      await fs.mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${randomUUID()}.tmp`;
      const handle = await fs.open(temporary, 'wx');
      try { await handle.writeFile(file.bytes); await handle.sync(); } finally { await handle.close(); }
      try { await fs.link(temporary, target); written.push(file); }
      finally { await fs.unlink(temporary); }
    }
    await atomicJSON(receiptPath, result);
  } catch (error) {
    for (const file of written.reverse()) {
      const target = await managedPath(root, `game/${file.path}`), current = await optional(target);
      if (current?.equals(file.bytes)) await fs.unlink(target);
    }
    // shortcut: a process crash retains the journal; rerun the identical offline install before opening the GUI.
    throw error;
  }
  await fs.unlink(pendingPath);
  return result;
}
