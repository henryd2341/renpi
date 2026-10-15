import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

export const digest = value => createHash('sha256').update(value).digest('hex');

export const validationCopyLimit = 1024 * 1024;
const mediaFile = /\.(png|apng|jpe?g|webp|gif|avif|bmp|tga|tiff?|svg|ico|ogg|opus|mp3|wav|flac|aac|aiff?|m4a|mp4|m4v|mkv|mpe?g|webm|ogv|avi|mov|tt[fc]|otf|woff2?|rpa)$/i;
const writableFile = /\.(rpy|rpym|rpyc|rpymc|py|pyc|pyo)$/i;

// Only this staging path grants file-link reads; ordinary managed paths still reject links.
export async function stageValidationFiles(destination, sourceRoot, files, prefix = '', links = new Map()) {
  destination = path.resolve(destination); sourceRoot = path.resolve(sourceRoot);
  for (const root of [destination, sourceRoot]) await managedPath(path.parse(root).root, path.relative(path.parse(root).root, root));
  for (const file of files) {
    const source = await fs.realpath(await managedPath(sourceRoot, file.path));
    const target = await managedPath(destination, `${prefix}${file.path}`);
    const linked = file.bytes.length >= validationCopyLimit || mediaFile.test(file.path);
    if (linked && writableFile.test(file.path)) throw new Error(`Oversized writable validation input: ${file.path}; split or separately isolate it before validation.`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    if (linked) {
      try { await fs.symlink(source, target, 'file'); }
      catch (cause) { throw new Error(`Validation requires a file symlink for ${file.path}; enable symlink permission and retry. No copy fallback.`, { cause }); }
      links.set(target, { sourceRoot, relative: file.path, target: source, sha256: digest(file.bytes) });
    } else await writeBytes(target, file.bytes);
  }
  return links;
}

export async function finishValidationBuild(build, links) {
  build = path.resolve(build);
  await managedPath(path.parse(build).root, path.relative(path.parse(build).root, build));
  await atomicJSON(await managedPath(build, 'validation-links.json'), [...links].map(([file, link]) => ({
    path: path.relative(build, file), target: link.target, sha256: link.sha256,
  })));
  // Drop only owned scratch inputs after evidence/artifacts are secured, never linked sources.
  for (const name of ['game', 'common']) {
    const target = await managedPath(build, name);
    await fs.rm(target, { recursive: true, force: true });
  }
}

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
  const sourceCommon = await fs.realpath(path.join(sdk, 'renpy', 'common'));
  const commonFiles = await tree(sourceCommon, '', name => /(^|\/)__pycache__(\/|$)|\.(rpyc|rpymc|pyc|pyo)$/i.test(name));
  const commonLinks = await stageValidationFiles(common, sourceCommon, commonFiles);
  await atomicJSON(path.join(project, 'validation-sdk-links.json'), [...commonLinks.values()]);
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
  await tree(common, '', () => false, commonLinks);
  return reports;
}

export async function tree(root, relative = '', ignore = () => false, links = new Map()) {
  if (!relative) {
    for (const file of links.keys()) {
      const name = path.relative(root, file);
      if (name.startsWith('..') || path.isAbsolute(name)) continue;
      await managedPath(root, path.dirname(name));
      if (!(await fs.lstat(file)).isSymbolicLink()) throw new Error(`Validation link changed: ${name}`);
    }
  }
  const directory = await managedPath(root, relative), files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (ignore(name)) continue;
    const linkPath = path.join(directory, entry.name), link = links.get(linkPath);
    if (link) {
      if (!entry.isSymbolicLink() || await fs.readlink(linkPath) !== link.target ||
          await fs.realpath(await managedPath(path.parse(link.target).root, path.relative(path.parse(link.target).root, link.target))) !== link.target)
        throw new Error(`Validation link changed: ${name}`);
      const bytes = await fs.readFile(linkPath);
      if (digest(bytes) !== link.sha256) throw new Error(`Validation linked source changed: ${name}`);
      files.push({ path: name, bytes });
      continue;
    }
    const target = await managedPath(root, name);
    if (entry.isDirectory()) files.push(...await tree(root, name, ignore, links));
    else if (entry.isFile()) files.push({ path: name, bytes: await fs.readFile(target) });
    else throw Object.assign(new Error('only regular files and directories are supported'), { status: 409 });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function writeBytes(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, 'wx');
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  try { await fs.rename(temporary, file); }
  catch (error) { await fs.rm(temporary, { force: true }); throw error; }
}
