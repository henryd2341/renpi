import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { digest, tree, stageValidationFiles, finishValidationBuild, validationCopyLimit } from './bridge-common.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'renpi-validation-files-'));
  t.after(async () => {
    assert(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'renpi-validation-files-')));
    await fs.rm(root, { recursive: true, force: true });
  });
  const source = path.join(root, 'source'), build = path.join(root, 'build'), game = path.join(build, 'game');
  await fs.mkdir(source);
  const put = async (name, bytes) => {
    const file = path.join(source, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
    return { path: name, bytes: Buffer.from(bytes) };
  };
  return { root, source, build, game, put };
}

test('large inputs and tiny media are real symlinks; small writable inputs are independent', async t => {
  const f = await fixture(t);
  const files = await Promise.all([
    f.put('large.bin', Buffer.alloc(validationCopyLimit, 7)),
    f.put('images/tiny.png', 'image'), f.put('fonts/tiny.ttf', 'font'),
    f.put('below.txt', Buffer.alloc(validationCopyLimit - 1, 8)), f.put('script.rpy', 'label start:\n    return\n'),
  ]);
  const links = await stageValidationFiles(f.game, f.source, files);
  for (const file of files) {
    const target = path.join(f.game, file.path);
    assert.equal((await fs.lstat(target)).isSymbolicLink(), links.has(target));
    assert.deepEqual(await fs.readFile(target), file.bytes);
  }
  assert.equal(links.size, 3);
  assert.deepEqual(await tree(f.game, '', () => false, links), [...files].sort((a, b) => a.path.localeCompare(b.path)));
  await assert.rejects(tree(f.game), /reparse/);
  await fs.writeFile(path.join(f.game, 'script.rpy'), 'changed scratch');
  assert.equal(await fs.readFile(path.join(f.source, 'script.rpy'), 'utf8'), 'label start:\n    return\n');
  await fs.mkdir(path.join(f.build, 'common'));
  await finishValidationBuild(f.build, links);
  await assert.rejects(fs.access(f.game), { code: 'ENOENT' });
  await assert.rejects(fs.access(path.join(f.build, 'common')), { code: 'ENOENT' });
  assert.equal(JSON.parse(await fs.readFile(path.join(f.build, 'validation-links.json'))).length, 3);
  for (const file of files) assert.equal(digest(await fs.readFile(path.join(f.source, file.path))), digest(file.bytes));
});

test('oversized writable inputs stop; symlink permission failures never copy assets', async t => {
  const f = await fixture(t);
  const script = await f.put('large.rpy', Buffer.alloc(validationCopyLimit, 32));
  await assert.rejects(stageValidationFiles(f.game, f.source, [script]), /Oversized writable/);
  await assert.rejects(fs.access(path.join(f.game, script.path)), { code: 'ENOENT' });
  const image = await f.put('image.png', 'source image');
  const mock = t.mock.method(fs, 'symlink', async () => { throw Object.assign(new Error('permission denied'), { code: 'EPERM' }); });
  await assert.rejects(stageValidationFiles(f.game, f.source, [image]), /No copy fallback/);
  mock.mock.restore();
  await assert.rejects(fs.access(path.join(f.game, image.path)), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(f.source, image.path), 'utf8'), 'source image');
});

test('only recorded file links are readable; source changes, redirected links and copied replacements fail', async t => {
  const f = await fixture(t), file = await f.put('image.png', 'original');
  const links = await stageValidationFiles(f.game, f.source, [file]);
  const target = path.join(f.game, file.path);
  await fs.writeFile(path.join(f.source, file.path), 'edited source');
  await assert.rejects(tree(f.game, '', () => false, links), /linked source changed/);
  await fs.writeFile(path.join(f.source, file.path), file.bytes);
  const other = await f.put('other.png', file.bytes);
  await fs.unlink(target);
  await assert.rejects(tree(f.game, '', () => false, links), { code: 'ENOENT' });
  await fs.symlink(path.join(f.source, other.path), target, 'file');
  await assert.rejects(tree(f.game, '', () => false, links), /link changed/);
  await fs.unlink(target);
  await fs.writeFile(target, file.bytes);
  await assert.rejects(tree(f.game, '', () => false, links), /link changed/);
  await fs.symlink(f.source, path.join(f.game, 'unexpected'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(tree(f.game), /reparse/);
  await assert.rejects(stageValidationFiles(f.game, f.source, [{ path: '../escape.png', bytes: file.bytes }]), /leaves/);
});

test('source/build root links are rejected and cleanup preserves their targets', async t => {
  const f = await fixture(t), file = await f.put('keep.png', 'preserve');
  const alias = path.join(f.root, 'alias');
  await fs.symlink(f.source, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(stageValidationFiles(f.game, alias, [file]), /reparse/);
  await assert.rejects(stageValidationFiles(alias, f.source, [file]), /reparse/);
  await assert.rejects(finishValidationBuild(alias, new Map()), /reparse/);
  assert.equal(await fs.readFile(path.join(f.source, 'keep.png'), 'utf8'), 'preserve');
});
