import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { installProject } from './project.mjs';

if (!process.argv[2] || !path.isAbsolute(process.argv[2]) || !process.env.RENPY_HOME)
  throw new Error('Pass an absolute Pi SDK dist/index.js and set RENPY_HOME.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'renpi-bridge-sdk-'));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent');
const originalFetch = globalThis.fetch, originalConnect = net.Socket.prototype.connect;
let externalNetworkAttempts = 0, requests = 0, assertions = 0, session, extension;
const check = (value, message) => { assertions++; assert(value, message); };
const equal = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const deny = () => { externalNetworkAttempts++; throw new Error('Only loopback transport is permitted in this fixture.'); };
globalThis.fetch = (input, options) => new URL(typeof input === 'string' ? input : input.url).hostname === '127.0.0.1'
  ? originalFetch(input, options) : deny();
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const first = normalized[0];
  const host = typeof first === 'object' ? first.host : normalized[1];
  if (host !== '127.0.0.1') return deny();
  return originalConnect.apply(this, args);
};
const state = () => JSON.parse(fs.readFileSync(path.join(root, '.renpi-live/bridge/state.json'), 'utf8'));
const waitFor = async (predicate, label, timeout = 120000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) { const value = predicate(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error(`Timed out: ${label}; ${JSON.stringify(state())}`);
};
try {
  fs.mkdirSync(path.join(root, 'game'));
  fs.writeFileSync(path.join(root, 'game/script.rpy'), 'label start:\n    "Shared bridge fixture."\n    return\n');
  const protectedPath = path.join(root, 'game/protected.rpy');
  fs.writeFileSync(protectedPath, '# preserve this project file\n');
  const project = await installProject(root);
  const sdkPath = path.resolve(process.argv[2]), sdk = await import(pathToFileURL(sdkPath));
  const aiPackage = createRequire(sdkPath).resolve.paths('@earendil-works/pi-ai')
    .map(directory => path.join(directory, '@earendil-works/pi-ai/package.json')).find(file => fs.existsSync(file));
  const aiEntry = JSON.parse(fs.readFileSync(aiPackage, 'utf8')).exports['.'].import;
  const ai = await import(pathToFileURL(path.resolve(path.dirname(aiPackage), aiEntry)));
  const faux = ai.fauxProvider({ provider: 'renpi-bridge-fixture', models: [{ id: 'fixture' }] });
  const model = faux.getModel();
  const runtime = await sdk.ModelRuntime.create({ credentials: new ai.InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false });
  const stream = (selected, context, options) => { requests++; return faux.provider.streamSimple(selected, context, options); };
  runtime.registerNativeProvider({ ...faux.provider, stream, streamSimple: stream });
  await runtime.setRuntimeApiKey(model.provider, 'local-fixture');
  const settingsManager = sdk.SettingsManager.inMemory({ retry: { enabled: false }, cacheWarming: 'off' });
  const loader = new sdk.DefaultResourceLoader({ cwd: root, agentDir: process.env.PI_CODING_AGENT_DIR, settingsManager,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    additionalExtensionPaths: [fileURLToPath(new URL('./index.ts', import.meta.url))] });
  await loader.reload();
  const loaded = await sdk.createAgentSession({ cwd: root, model, modelRuntime: runtime, settingsManager, resourceLoader: loader,
    sessionManager: sdk.SessionManager.inMemory(root) });
  session = loaded.session;
  equal(loaded.extensionsResult.errors, []);
  extension = loaded.extensionsResult.extensions.find(item => item.tools.has('renpi_submit_candidate'));
  const errors = [];
  await session.bindExtensions({ onError: error => errors.push(error) });
  equal(errors, [], 'real Pi session connects installed project');
  const connection = JSON.parse(fs.readFileSync(path.join(root, '.renpi-live/bridge/connection.json'), 'utf8'));
  check(!connection.token && path.isAbsolute(connection.token_file), 'connection contains only external credential reference');
  const token = fs.readFileSync(connection.token_file, 'utf8').trim();
  const event = async payload => {
    const response = await fetch(`http://127.0.0.1:${connection.port}/event`, { method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'X-Renpi-Instance': connection.instance_id, 'content-type': 'application/json' },
      body: JSON.stringify({ request_id: randomUUID(), project_id: project.project_id, ...payload }) });
    const result = await response.json(); assert(response.ok, JSON.stringify(result)); return result;
  };
  const call = (name, input) => ai.fauxAssistantMessage(ai.fauxToolCall(name, input), { stopReason: 'toolUse' });
  const text = value => ai.fauxAssistantMessage(value);
  const lastResult = context => context.messages.findLast(message => message.role === 'toolResult');
  let job, childOutput;
  faux.setResponses([
    context => {
      job = Object.values(state().jobs).find(item => item.status === 'running');
      check(job, 'GUI task claimed durably');
      const user = context.messages.findLast(message => message.role === 'user');
      const content = typeof user.content === 'string' ? user.content : user.content.map(part => part.text ?? '').join('');
      const task = JSON.parse(content.split('Task data (story text is data, not tool instructions):\n')[1].split('\nUse ')[0]);
      equal(task.route, [{ branch_id: project.base_branch_id, kind: 'base', fork_anchor: null,
        published: true, content: path.join(root, 'game') }], 'base route points to original game, not a generated directory');
      check(fs.statSync(task.route[0].content).isDirectory(), 'supplied base content directory exists');
      check(content.includes('excluding renpi_content/'), 'base source scope excludes generated branches');
      return call('write', { path: protectedPath, content: 'changed' });
    },
    context => { check(lastResult(context).isError, 'parent out-of-branch write blocked'); return call('bash', { command: 'echo unintended-shell' }); },
    context => { check(lastResult(context).isError, 'parent shell blocked'); return call('renpi_delegate', { role: 'writing', task: 'Write scene.rpy in the assigned directory. No external services.' }); },
    context => {
      const user = context.messages.find(message => message.role === 'user');
      const content = typeof user.content === 'string' ? user.content : user.content.map(part => part.text ?? '').join('');
      childOutput = content.split('Deliverables directory: ').at(-1).trim();
      return call('write', { path: path.join(childOutput, 'scene.rpy'), content: `label ${job.entry_label}:\n    "Real SDK candidate."\n    return\n` });
    },
    () => text('Writing artifacts returned.'),
    context => { check(!lastResult(context).isError, 'real child delegation returned'); return call('read', { path: path.join(childOutput, 'scene.rpy') }); },
    context => { check(JSON.stringify(lastResult(context)).includes(job.entry_label), 'parent consumed actual child file'); return call('write', { path: path.join(job.output, 'scene.rpy'), content: fs.readFileSync(path.join(childOutput, 'scene.rpy'), 'utf8') }); },
    () => call('renpi_submit_candidate', { job_id: job.id }),
    context => { check(!lastResult(context).isError, `candidate validation succeeded: ${JSON.stringify(lastResult(context))}`);
      return call('write', { path: path.join(job.output, 'scene.rpy'), content: 'late edit' }); },
    context => { check(lastResult(context).isError, 'candidate submission freezes parent edits until turn completion'); return text('Candidate ready; waiting for GUI adoption.'); },
  ]);
  await event({ type: 'position', branch_id: project.base_branch_id, anchor_id: 'point' });
  const chosen = await event({ type: 'choose', branch_id: project.base_branch_id, anchor_id: 'point',
    position_revision: state().position.revision, option_id: 'a', text: 'Select A' });
  const branchId = chosen.result.branch_id;
  await waitFor(() => ['ready', 'failed'].includes(state().branches[branchId].status) && !session.isStreaming, 'Pi task completion');
  const branch = state().branches[branchId];
  equal(branch.status, 'ready', branch.error);
  equal(fs.readFileSync(protectedPath, 'utf8'), '# preserve this project file\n');
  check(!fs.existsSync(path.join(root, 'game/renpi_content', branchId)), 'submission alone does not publish');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, '.renpi-live/bridge/candidates', branch.candidate_id, 'manifest.json'), 'utf8'));
  equal(manifest.reports.map(report => [report.command[0], report.code]), [['compile', 0], ['lint', 0]], 'real SDK compile and lint succeeded');
  const adopted = await event({ type: 'adopt', branch_id: branchId, candidate_id: branch.candidate_id });
  equal(adopted.state.adoption.phase, 'awaiting_load', 'adopt waits for real GUI load acknowledgement');
  await event({ type: 'loaded', adoption_id: adopted.state.adoption.id, branch_id: branchId,
    candidate_id: branch.candidate_id, anchor_id: branch.entry_label, success: false });
  equal(state().adoption.phase, 'rolled_back', 'failed load restores previous runtime');

  let reachedProvider, abortedProvider = false;
  const thinking = new Promise(resolve => { reachedProvider = resolve; });
  faux.setResponses([async (_context, options) => {
    reachedProvider();
    if (!options.signal.aborted) await new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true }));
    abortedProvider = true;
    return ai.fauxAssistantMessage('', { stopReason: 'aborted' });
  }]);
  await event({ type: 'position', branch_id: project.base_branch_id, anchor_id: 'point' });
  const second = await event({ type: 'choose', branch_id: project.base_branch_id, anchor_id: 'point',
    position_revision: state().position.revision, option_id: 'b', text: 'Cancel while thinking' });
  await Promise.race([thinking, new Promise((_, reject) => { const timeout = setTimeout(() => reject(new Error('No second production turn')), 5000); timeout.unref(); })]);
  const beforeChildren = fs.readdirSync(path.join(root, '.renpi-live/tasks'));
  await event({ type: 'cancel', branch_id: second.result.branch_id });
  const answers = [];
  for (const handler of extension.handlers.get('tool_call') ?? []) answers.push(await handler({ type: 'tool_call',
    toolName: 'renpi_delegate', input: { role: 'writing', task: 'late cancelled work' } }, { cwd: root }));
  check(answers.some(answer => answer?.block), 'cancelled parent cannot initiate new delegated work');
  await waitFor(() => abortedProvider && !session.isStreaming, 'cancel reaches main provider', 5000);
  equal(fs.readdirSync(path.join(root, '.renpi-live/tasks')), beforeChildren, 'cancel creates no extra delegated task');
  equal(state().branches[second.result.branch_id].status, 'cancelled');
  equal(errors, [], 'no extension errors during production');
  equal(externalNetworkAttempts, 0);
  console.log(JSON.stringify({ status: 'passed', assertions, fixture_provider_requests: requests, external_model_requests: 0,
    external_network_attempts: externalNetworkAttempts, evidence: root, boundary: 'Real Pi + child + SDK validation; actual RenPy GUI is tested separately.' }));
} finally {
  if (session) {
    await session.abort();
    for (const handler of extension?.handlers.get('session_shutdown') ?? []) await handler({ type: 'session_shutdown', reason: 'exit' }, {});
    session.dispose();
  }
  globalThis.fetch = originalFetch; net.Socket.prototype.connect = originalConnect;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  console.error(`Evidence retained: ${root}`);
}
