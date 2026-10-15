import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { meetsPiVersionRequirement } from './runtime.mjs';

if (!process.argv[2]) throw new Error('Pass the installed Pi SDK dist/index.js absolute path.');
const sdk = await import(pathToFileURL(path.resolve(process.argv[2])).href);
assert(meetsPiVersionRequirement(sdk.VERSION), `Pass a Pi >=1.1.0 stable SDK; received ${sdk.VERSION}.`);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'renpi-load-'));
let session;
try {
  const settingsManager = sdk.SettingsManager.inMemory();
  const modelRuntime = await sdk.ModelRuntime.create({
    authPath: path.join(root, 'agent', 'auth.json'), modelsPath: null, refreshOnCreate: false,
  });
  const model = modelRuntime.getModels()[0];
  assert(model, 'Installed SDK should have a model descriptor; no authentication is required for loading.');
  const loader = new sdk.DefaultResourceLoader({
    cwd: root, agentDir: path.join(root, 'agent'), settingsManager,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    additionalExtensionPaths: [fileURLToPath(new URL('./index.ts', import.meta.url))],
  });
  await loader.reload();
  const loaded = await sdk.createAgentSession({ cwd: root, resourceLoader: loader, settingsManager,
    model, modelRuntime, sessionManager: sdk.SessionManager.inMemory(root) });
  session = loaded.session;
  assert.deepEqual(loaded.extensionsResult.errors, []);
  const errors = [];
  await session.bindExtensions({ onError: error => errors.push(error) });
  assert.deepEqual(errors, []);
  assert.equal(session.model, model, 'extension preserves the selected model');
  assert(session.getActiveToolNames().includes('renpi_delegate'));
  assert(session.getActiveToolNames().includes('renpi_install_foundation'));
  assert(session.getActiveToolNames().includes('write'), 'main tools are preserved');
  const names = session.resourceLoader.getSkills().skills.map(skill => skill.name);
  for (const name of ['initialize-game', 'code-renpy-game', 'write-plots', 'create-image-assets', 'review-renpy-candidate']) {
    assert(names.includes(name), `Missing skill: ${name}`);
  }
  const extension = loaded.extensionsResult.extensions.find(item => item.tools.has('renpi_delegate'));
  const tool = extension.tools.get('renpi_delegate').definition;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(tool.execute('cancel-check', { role: 'writing', task: 'read only' }, controller.signal, undefined, {}));
  const foundation = extension.tools.get('renpi_install_foundation').definition;
  await assert.rejects(foundation.execute('cancel-foundation', { source: 'authoring/shared', files: ['opening.rpy'] }, controller.signal, undefined, {}));
  assert(!fs.existsSync(path.join(root, '.renpi-live')), 'load and pre-cancel create no project state');
  console.log(JSON.stringify({ status: 'passed', pi_version: sdk.VERSION, skills: names.length, tools: session.getActiveToolNames(),
    model_preserved: true, model_requests: 0, project_state_created: false }, null, 2));
} finally {
  if (session) { await session.abort(); session.dispose(); }
  assert(path.resolve(root).startsWith(path.join(path.resolve(os.tmpdir()), 'renpi-load-')));
  fs.rmSync(root, { recursive: true, force: true });
}
