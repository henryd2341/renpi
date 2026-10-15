import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateCandidateSDK, stageValidationFiles, finishValidationBuild, tree, digest } from './bridge-common.mjs';

// Explicit opt-in SDK check; never targets the user's game or starts a GUI/provider.
const sdk = process.env.RENPY_HOME;
if (!sdk || !path.isAbsolute(sdk)) throw new Error('Set RENPY_HOME to an absolute installed SDK path.');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'renpi-lint-policy-'));
const sdkLintPath = path.join(sdk, 'renpy/lint.py');
const originalSDKLint = await fs.readFile(sdkLintPath);
const evidence = [];
try {
  const source = path.join(root, 'inputs');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'large.bin'), Buffer.alloc(1024 * 1024, 9));
  const assets = await tree(source);
  for (const [name, script, failure] of [
    ['unicode-assets', 'label start:\n    "Fixture."\n    return\n', null],
    ['missing-label', 'label start:\n    jump renpi_missing_label\n', 'lint'],
    ['invalid-syntax', 'label start\n    return\n', 'compile'],
  ]) {
    const project = path.join(root, name), game = path.join(project, 'game');
    await fs.mkdir(game, { recursive: true });
    await fs.writeFile(path.join(game, 'script.rpy'), script);
    await fs.writeFile(path.join(game, '中文素材.txt'), 'preserved asset');
    const links = await stageValidationFiles(game, source, assets);
    assert.equal((await fs.lstat(path.join(game, 'large.bin'))).isSymbolicLink(), true);
    let reports;
    if (failure) {
      await assert.rejects(validateCandidateSDK(project, sdk), error => {
        reports = error.validation_reports;
        assert.equal(reports.at(-1).command[0], failure);
        assert.notEqual(reports.at(-1).code, 0);
        if (failure === 'lint') {
          assert.equal(reports[0].code, 0);
          assert.match(reports.at(-1).output, /nonexistent label 'renpi_missing_label'/);
        }
        return true;
      });
    } else {
      reports = await validateCandidateSDK(project, sdk);
      assert.deepEqual(reports.map(report => [report.command[0], report.code]), [['compile', 0], ['lint', 0]]);
      await fs.access(path.join(game, 'script.rpyc'));
    }
    const lint = reports.find(report => report.command[0] === 'lint');
    if (lint) {
      assert.deepEqual(lint.command, ['lint', '--error-code']);
      assert.deepEqual(lint.ignored_checks, ['non_ascii_filenames']);
      assert.doesNotMatch(lint.output, /contains non-ASCII characters in its filename/);
    }
    assert.equal(await fs.readFile(path.join(game, 'script.rpy'), 'utf8'), script);
    assert.equal(await fs.readFile(path.join(game, '中文素材.txt'), 'utf8'), 'preserved asset');
    assert.equal(digest(await fs.readFile(path.join(source, 'large.bin'))), digest(assets[0].bytes));
    const font = path.join(project, 'common/TwemojiCOLRv0.ttf');
    assert.equal((await fs.lstat(font)).isSymbolicLink(), true);
    await assert.rejects(fs.access(path.join(game, 'renpi_lint_policy.rpy')), { code: 'ENOENT' });
    evidence.push({ name, reports });
    await fs.writeFile(path.join(project, 'reports.json'), JSON.stringify(reports, null, 2));
    await finishValidationBuild(project, links);
    await assert.rejects(fs.access(game), { code: 'ENOENT' });
  }
  assert.deepEqual(await fs.readFile(sdkLintPath), originalSDKLint);
  await fs.writeFile(path.join(root, 'results.json'), JSON.stringify(evidence, null, 2));
  assert(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'renpi-lint-policy-')));
  await fs.rm(source, { recursive: true });
  console.log('Passed: linked large inputs and SDK fonts; successful and expected-failure scratch retired; lint/syntax gates preserved.');
} finally {
  console.log('Isolated SDK evidence retained:', root);
}
