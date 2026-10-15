import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { artifactFiles, checkWritePath, inside, lastAnswer, meetsPiVersionRequirement, roles } from './runtime.mjs';

test('Pi version requirement accepts stable releases >=1.1.0', () => {
  for (const version of ['1.1.0', '1.1.1', '1.2.0', '1.10.0', '2.0.0', '10.0.0', '1.1.0+build.001']) {
    assert.equal(meetsPiVersionRequirement(version), true, version);
  }
  for (const version of ['0.75.4', '0.99.99', '1.0.0', '1.0.99', '1.0.99+build',
    '1.1.0-beta.1', '1.2.0-rc.1', '2.0.0-alpha+build', '', 'latest', '1.1', 'v1.1.0',
    '01.1.0', '1.01.0', '1.1.00', '1.1.-1', '1.1.0.1', '1.1.0+', '1.1.0+build..1',
    '1.1.0+bad_name', ' 1.1.0', '1.1.0\n', '9007199254740992.0.0', undefined, null]) {
    assert.equal(meetsPiVersionRequirement(version), false, String(version));
  }
});

test('role boundaries, paths and actual artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'renpi-path-'));
  try {
    const output = path.join(root, 'output');
    fs.mkdirSync(output);
    assert.equal(inside(root, output), true);
    assert.equal(inside(output, root), false);
    assert.equal(inside(output, `${output}-other`), false);
    checkWritePath(root, output, 'output/scene.rpy');
    for (const name of ['../escape', 'scene.rpy', '@output/a', '~/output/a', 'output\u3000/a']) {
      assert.throws(() => checkWritePath(root, output, name));
    }
    const elsewhere = path.join(root, 'elsewhere');
    fs.mkdirSync(elsewhere);
    fs.symlinkSync(elsewhere, path.join(output, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => checkWritePath(root, output, 'output/link/a'));
    assert.throws(() => artifactFiles(output));
    fs.unlinkSync(path.join(output, 'link'));
    fs.writeFileSync(path.join(output, 'scene.rpy'), 'label opening:\n    return\n');
    assert.deepEqual(artifactFiles(output), [path.join(output, 'scene.rpy')]);
    assert.deepEqual(roles.review.tools, ['read', 'grep', 'find', 'ls']);
    assert(!roles.writing.tools.includes('bash'));
    assert(roles.image.tools.includes('bash'));
  } finally {
    assert(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'renpi-path-')));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('error, abort and empty output are not successful delivery', () => {
  for (const messages of [[], [{ role: 'assistant', stopReason: 'error', errorMessage: 'offline' }],
    [{ role: 'assistant', stopReason: 'aborted' }], [{ role: 'assistant', stopReason: 'length' }],
    [{ role: 'assistant', stopReason: 'toolUse' }], [{ role: 'assistant', stopReason: 'stop', content: [] }]]) {
    assert.throws(() => lastAnswer(messages));
  }
  assert.equal(lastAnswer([{ role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'report' }] }]), 'report');
});
