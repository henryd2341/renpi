import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

export const digest = value => createHash('sha256').update(value).digest('hex');

export async function managedPath(root, relative) {
  const target = path.resolve(root, relative), rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('managed path leaves fixture');
  let part = root;
  for (const segment of rel.split(path.sep).filter(Boolean)) {
    part = path.join(part, segment);
    try { if ((await fs.lstat(part)).isSymbolicLink()) throw new Error('managed path contains a reparse link'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}
export async function atomicJSON(file, value) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  const handle = await fs.open(tmp, 'wx');
  try { await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); }
  finally { await handle.close(); }
  await fs.rename(tmp, file);
  // ponytail: one synced file + rename; power-loss durability needs Windows fault testing.
}
export async function run(command, args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const collect = data => { output = (output + data.toString()).slice(-100_000); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const timer = setTimeout(() => { child.kill(); reject(new Error('command timed out')); }, 120_000);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, output }); });
  });
}
export async function validateSDK(project, sdk) {
  const python = path.join(sdk, 'lib', 'py3-windows-x86_64', 'python.exe');
  const reports = [];
  for (const args of [['compile'], ['lint', '--error-code']]) {
    const argv = [path.join(sdk, 'renpy.py'), project, ...args];
    const result = await run(python, argv, project);
    reports.push({ command: args, executable: python, argv, ...result });
    if (result.code !== 0) throw Object.assign(new Error(`SDK ${args[0]} failed: ${result.output}`), { validation_reports: reports });
  }
  return reports;
}

export async function validateCandidateSDK(project, sdk) {
  if (!sdk || !path.isAbsolute(sdk)) throw new Error('Set RENPY_HOME to the installed RenPy SDK before candidate validation.');
  const python = path.join(sdk, 'lib', 'py3-windows-x86_64', 'python.exe');
  const entry = path.join(sdk, 'renpy.py');
  await fs.access(python); await fs.access(entry);
  const common = path.join(project, 'common');
  await fs.cp(path.join(sdk, 'renpy', 'common'), common, { recursive: true, errorOnExist: true, force: false });
  // shortcut: this isolated hook uses an SDK internal checker; review it on RenPy upgrades.
  await fs.writeFile(path.join(common, 'renpi_lint_policy.rpy'), `init 999 python hide:
    import renpy.lint as lint
    assert callable(lint.check_filename_encodings), "SDK filename lint hook changed"
    lint.check_filename_encodings = lambda: None
`, { flag: 'wx' });
  const wrapper = path.join(project, 'validate-sdk.py');
  await fs.writeFile(wrapper, `import importlib.util, sys\nspec = importlib.util.spec_from_file_location('renpi_sdk_main', ${JSON.stringify(entry)})\nm = importlib.util.module_from_spec(spec)\nsys.modules['renpi_sdk_main'] = m\nspec.loader.exec_module(m)\nm.path_to_common = lambda base: ${JSON.stringify(common)}\nm.main()\n`, { flag: 'wx' });
  const reports = [];
  for (const command of [['compile'], ['lint', '--error-code']]) {
    const argv = [wrapper, project, ...command, '--savedir', path.join(project, 'validation-saves')];
    const result = await run(python, argv, project, { ...process.env,
      RENPY_PATH_TO_SAVES: path.join(project, 'validation-user-saves') });
    reports.push({ command, executable: python, argv, ...result,
      ignored_checks: command[0] === 'lint' ? ['non_ascii_filenames'] : [] });
    if (result.code !== 0 || /Traceback \(most recent call last\)|PermissionError:/.test(result.output)) {
      throw Object.assign(new Error(`SDK ${command[0]} failed: ${result.output}`), { validation_reports: reports });
    }
  }
  return reports;
}
