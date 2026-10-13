import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { roles } from './runtime.mjs';

if (!process.argv[2] || !path.isAbsolute(process.argv[2])) throw new Error('Pass the installed Pi SDK dist/index.js absolute path.');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'renpi-sdk-'));
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = path.join(root, 'agent');
const originalFetch = globalThis.fetch;
const originalConnect = net.Socket.prototype.connect;
let networkAttempts = 0;
const denyNetwork = () => { networkAttempts++; throw new Error('SDK regression prohibits network access'); };
globalThis.fetch = denyNetwork;
net.Socket.prototype.connect = denyNetwork;
let session;
let assertions = 0;
const check = (condition, message) => { assertions++; assert(condition, message); };
const equal = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const scenarios = [];
try {
  const sdkPath = path.resolve(process.argv[2]);
  const sdk = await import(pathToFileURL(sdkPath).href);
  const aiPackage = createRequire(sdkPath).resolve.paths('@earendil-works/pi-ai')
    .map(directory => path.join(directory, '@earendil-works/pi-ai/package.json')).find(file => fs.existsSync(file));
  assert(aiPackage, 'Host pi-ai dependency is installed');
  const aiEntry = JSON.parse(fs.readFileSync(aiPackage, 'utf8')).exports['.'].import;
  const ai = await import(pathToFileURL(path.resolve(path.dirname(aiPackage), aiEntry)).href);
  const marker = randomUUID();
  const privateMessage = `parent-only-${randomUUID()}`;
  let secret = randomUUID();
  const source = path.join(root, 'source.txt');
  const outside = path.join(root, 'protected.txt');
  fs.writeFileSync(source, marker);
  fs.writeFileSync(outside, 'preserve-me');
  const faux = ai.fauxProvider({ provider: 'renpi-sdk-fixture', models: [{ id: 'fixture', reasoning: true }] });
  const model = faux.getModel();
  model.baseUrl = 'https://fixture.invalid/catalog';
  model.headers = { 'x-model-fixture': 'model' };
  let role = 'review';
  let requestCount = 0;
  let latestReceipt;
  const inspectRequest = (requestModel, context, options) => {
    requestCount++;
    check(options.apiKey === secret, 'runtime-only credential reaches provider (value redacted)');
    equal(requestModel.baseUrl, 'https://fixture.invalid/runtime', 'dynamic base URL reaches provider');
    equal(options.headers['x-provider-fixture'], 'dynamic');
    equal(options.headers['x-model-fixture'], 'model');
    equal(options.reasoning, 'high', 'parent thinking level preserved');
    check(options.sessionId !== session.sessionId, 'provider receives a child session id');
    const serialized = JSON.stringify(context);
    check(!serialized.includes(privateMessage), 'parent conversation stays out of child');
    const systems = context.messages.filter(message => message.role === 'system');
    const tools = systems.flatMap(message => message.toolsAdded ?? []).map(tool => tool.name).sort();
    equal(tools, [...roles[role].tools].sort(), `${role} exact tool allowlist; no automatic MCP`);
    check(serialized.includes(roles[role].entry), 'assigned role skill is present');
    for (const other of Object.keys(roles).filter(name => name !== role)) {
      check(!serialized.includes(roles[other].entry), 'other role skills are absent');
    }
    return faux.provider.streamSimple(requestModel, context, options);
  };
  const runtime = await sdk.ModelRuntime.create({ credentials: new ai.InMemoryCredentialStore(),
    modelsPath: null, refreshOnCreate: false });
  runtime.registerNativeProvider({ ...faux.provider,
    auth: { apiKey: { name: 'Fixture', resolve: async ({ credential }) => credential?.key
      ? { auth: { apiKey: credential.key, baseUrl: 'https://fixture.invalid/runtime',
        headers: { 'x-provider-fixture': 'dynamic' } } } : undefined } },
    stream: inspectRequest, streamSimple: inspectRequest });
  await runtime.setRuntimeApiKey(model.provider, secret);
  const registry = new sdk.ModelRegistry(runtime);
  const settingsManager = sdk.SettingsManager.inMemory({ retry: { enabled: false } });
  const loader = new sdk.DefaultResourceLoader({ cwd: root, agentDir: process.env.PI_CODING_AGENT_DIR,
    settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true,
    noThemes: true, noContextFiles: true,
    additionalExtensionPaths: [fileURLToPath(new URL('./index.ts', import.meta.url))] });
  await loader.reload();
  const sessionManager = sdk.SessionManager.inMemory(root);
  sessionManager.appendMessage({ role: 'user', content: privateMessage, timestamp: Date.now() });
  const loaded = await sdk.createAgentSession({ cwd: root, model, modelRuntime: runtime,
    thinkingLevel: 'high', settingsManager, resourceLoader: loader, sessionManager });
  session = loaded.session;
  equal(loaded.extensionsResult.errors, []);
  await session.bindExtensions({});
  const extension = loaded.extensionsResult.extensions.find(item => item.tools.has('renpi_delegate'));
  const tool = extension.tools.get('renpi_delegate').definition;
  const context = { cwd: root, model, modelRegistry: registry, sessionManager };
  const delegate = (nextRole, task, signal) => {
    role = nextRole;
    latestReceipt = undefined;
    return tool.execute(randomUUID(), { role, task }, signal, update => { latestReceipt = update.details; }, context);
  };
  const text = message => ai.fauxAssistantMessage(message);
  const call = (name, args) => ai.fauxAssistantMessage(ai.fauxToolCall(name, args), { stopReason: 'toolUse' });
  const outputPath = context => {
    const user = context.messages.find(message => message.role === 'user');
    const content = typeof user.content === 'string' ? user.content : user.content.map(part => part.text ?? '').join('');
    return content.split('Deliverables directory: ').at(-1).trim();
  };
  const noReceipt = () => {
    check(latestReceipt, 'failed running task emitted a start update');
    const directory = path.dirname(latestReceipt.output);
    check(!fs.existsSync(path.join(directory, 'receipt.json')), 'failure emits no successful receipt');
    check(fs.existsSync(path.join(directory, 'error.txt')), 'failure has diagnostic');
  };
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(delegate('review', 'pre-cancel', cancelled.signal)); assertions++;
  check(!fs.existsSync(path.join(root, '.renpi-live')), 'pre-cancel creates no task state');
  scenarios.push('pre-cancel');
  context.model = { ...model, api: 'pi-virtual' };
  await assert.rejects(delegate('review', 'Virtual model preflight.'), /physical model/); assertions++;
  check(!fs.existsSync(path.join(root, '.renpi-live')), 'virtual preflight creates no task state');
  context.model = model;
  scenarios.push('virtual-model-preflight');

  faux.setResponses([call('read', { path: source }), context => {
    check(JSON.stringify(context.messages.filter(message => message.role === 'toolResult')).includes(marker),
      'real SDK read tool returned unpredictable file marker');
    return text(`review evidence ${marker}`);
  }]);
  const review = await delegate('review', 'Read source.txt and report its exact marker.');
  check(review.details.child_session !== review.details.parent_session, 'independent child session');
  check(fs.readFileSync(review.details.report, 'utf8').includes(marker), 'real report persisted');
  equal(review.details.files, [], 'review produces no artifacts');
  scenarios.push('review-read-isolation', 'runtime-auth-provider-thinking');

  faux.setResponses([context => call('write', { path: path.join(outputPath(context), 'draft.txt'), content: 'first draft' }),
    context => call('edit', { path: path.join(outputPath(context), 'draft.txt'), oldText: 'first', newText: 'final' }),
    call('write', { path: outside, content: 'destroyed' }),
    context => {
      const result = context.messages.findLast(message => message.role === 'toolResult');
      check(result.isError, 'out-of-output write was blocked');
      check(JSON.stringify(result).includes('outside'), 'block identifies write boundary');
      return call('edit', { path: outside, oldText: 'preserve-me', newText: 'destroyed' });
    }, context => {
      check(context.messages.findLast(message => message.role === 'toolResult').isError, 'outside edit was blocked');
      return text('Writing complete; outside write and edit blocked.');
    }]);
  const writing = await delegate('writing', 'Produce draft.txt in assigned output, then test write boundary.');
  equal(fs.readFileSync(path.join(writing.details.output, 'draft.txt'), 'utf8'), 'final draft');
  equal(fs.readFileSync(outside, 'utf8'), 'preserve-me');
  equal(writing.details.files, [path.join(writing.details.output, 'draft.txt')]);
  scenarios.push('writing-write-edit-boundary');

  faux.setResponses([text('Image backend not invoked; toolset inspected.')]);
  await delegate('image', 'Inspect tools only. Do not generate an image.');
  scenarios.push('image-toolset-no-mcp');

  const controller = new AbortController();
  faux.setResponses([async (_context, options) => {
    controller.abort();
    if (!options.signal.aborted) await new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true }));
    return ai.fauxAssistantMessage('', { stopReason: 'aborted' });
  }]);
  await assert.rejects(delegate('review', 'Abort during provider request.', controller.signal)); assertions++;
  noReceipt();
  scenarios.push('in-flight-abort');

  faux.setResponses([text('Next delegation succeeds after abort.')]);
  equal((await delegate('review', 'Check reset after abort.')).details.status, 'returned');
  scenarios.push('post-abort-recovery');

  const emit = async name => Promise.all((extension.handlers.get(name) ?? []).map(handler => handler({ type: name }, context)));
  const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
  const bounded = async promise => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Lifecycle fixture timed out')), 5000); })]); }
    finally { clearTimeout(timer); }
  };
  const activeGuards = async () => {
    equal(await emit('session_before_switch'), [{ cancel: true }], 'switch blocked during active delegation');
    equal(await emit('session_before_fork'), [{ cancel: true }], 'fork blocked during active delegation');
    await assert.rejects(tool.execute('concurrent-check', { role: 'review', task: 'Concurrent task' }, undefined, undefined, context), /active delegation/); assertions++;
  };
  const recoverAfterShutdown = async () => {
    equal(await emit('session_before_switch'), [undefined], 'switch guard released after shutdown');
    equal(await emit('session_before_fork'), [undefined], 'fork guard released after shutdown');
    faux.setResponses([text('Delegate state cleared after shutdown.')]);
    equal((await delegate('review', 'Verify shutdown cleanup.')).details.status, 'returned');
  };
  const originalReload = sdk.DefaultResourceLoader.prototype.reload;
  const preparing = deferred();
  const resumePreparation = deferred();
  const beforePreparation = requestCount;
  const tasksRoot = path.join(root, '.renpi-live/tasks');
  const previousTasks = new Set(fs.readdirSync(tasksRoot));
  sdk.DefaultResourceLoader.prototype.reload = async function (...args) {
    preparing.resolve();
    await resumePreparation.promise;
    return originalReload.apply(this, args);
  };
  try {
    const rejected = assert.rejects(delegate('review', 'Shutdown during resource preparation.'));
    await bounded(preparing.promise);
    await activeGuards();
    let shutdownComplete = false;
    const shutdown = emit('session_shutdown').then(() => { shutdownComplete = true; });
    await new Promise(resolve => setImmediate(resolve));
    check(!shutdownComplete, 'shutdown waits for preparation cleanup');
    resumePreparation.resolve();
    await bounded(Promise.all([shutdown, rejected])); assertions++;
    equal(requestCount, beforePreparation, 'shutdown during preparation sends no provider request');
    const newTasks = fs.readdirSync(tasksRoot).filter(id => !previousTasks.has(id));
    equal(newTasks.length, 1);
    check(!fs.existsSync(path.join(tasksRoot, newTasks[0], 'receipt.json')), 'preparation shutdown has no receipt');
    check(!fs.existsSync(path.join(tasksRoot, newTasks[0], 'sessions')), 'preparation shutdown creates no child session');
  } finally {
    resumePreparation.resolve();
    sdk.DefaultResourceLoader.prototype.reload = originalReload;
  }
  await recoverAfterShutdown();
  scenarios.push('shutdown-preparation-guards-cleanup');

  const providerStarted = deferred();
  const providerAborted = deferred();
  const providerRelease = deferred();
  faux.setResponses([async (_request, options) => {
    providerStarted.resolve();
    if (!options.signal.aborted) await new Promise(resolve => options.signal.addEventListener('abort', resolve, { once: true }));
    providerAborted.resolve();
    await providerRelease.promise;
    return ai.fauxAssistantMessage('', { stopReason: 'aborted' });
  }]);
  try {
    const rejected = assert.rejects(delegate('review', 'Shutdown while provider is running.'));
    await bounded(providerStarted.promise);
    await activeGuards();
    let shutdownComplete = false;
    const shutdown = emit('session_shutdown').then(() => { shutdownComplete = true; });
    await bounded(providerAborted.promise);
    await new Promise(resolve => setImmediate(resolve));
    check(!shutdownComplete, 'shutdown awaits in-flight provider completion and disposal');
    providerRelease.resolve();
    await bounded(Promise.all([shutdown, rejected])); assertions++;
    noReceipt();
  } finally { providerRelease.resolve(); }
  await recoverAfterShutdown();
  scenarios.push('shutdown-running-guards-cleanup');

  for (const [name, response] of [
    ['provider-error', ai.fauxAssistantMessage('', { stopReason: 'error', errorMessage: 'fixture provider failure' })],
    ['empty-report', text('')],
  ]) {
    faux.setResponses([response]);
    await assert.rejects(delegate('review', name)); assertions++;
    noReceipt();
    scenarios.push(name);
  }
  const diskAuth = path.join(root, 'fixture-auth.json');
  secret = randomUUID();
  fs.writeFileSync(diskAuth, JSON.stringify({ [model.provider]: { type: 'api_key', key: secret } }));
  const diskRuntime = await sdk.ModelRuntime.create({ authPath: diskAuth, modelsPath: null, refreshOnCreate: false });
  diskRuntime.registerNativeProvider(runtime.getRegisteredNativeProvider(model.provider));
  context.modelRegistry = new sdk.ModelRegistry(diskRuntime);
  faux.setResponses([text('Temporary fixture disk authentication preserved.')]);
  equal((await delegate('review', 'Check fixture-only disk credentials.')).details.status, 'returned');
  scenarios.push('fixture-disk-auth');

  const { createJiti } = createRequire(sdkPath)('jiti');
  const jiti = createJiti(import.meta.url, { interopDefault: true, alias: {
    '@earendil-works/pi-coding-agent': sdkPath,
    '@earendil-works/pi-ai': path.resolve(path.dirname(aiPackage), aiEntry),
  } });
  const { createDelegatedRuntime } = await jiti.import(fileURLToPath(new URL('./model-runtime.ts', import.meta.url)));
  const childRuntime = await createDelegatedRuntime(model, registry);
  let directRequests = 0;
  runtime.registerNativeProvider({ ...faux.provider,
    auth: { apiKey: { name: 'Replaced fixture', resolve: async () => ({ auth: {
      apiKey: 'fixture-replaced-key', headers: { 'X-Parent': 'parent', 'X-Delete': null },
    } }) } },
    streamSimple: (selected, request, options) => {
      directRequests++;
      check(options.apiKey === 'fixture-replaced-key', 'provider re-registration auth reaches existing child runtime');
      const matching = name => Object.entries(options.headers).filter(([key]) => key.toLowerCase() === name);
      equal(matching('x-parent'), [['X-Parent', 'parent']], 'parent header wins case-insensitively');
      equal(matching('x-delete'), [['X-Delete', null]], 'parent deletion wins case-insensitively');
      equal(matching('x-child-session'), [['x-child-session', 'child-fixture']], 'child attribution survives');
      equal(options.sessionId, 'child-fixture');
      return faux.provider.streamSimple(selected, request, options);
    } });
  faux.setResponses([text('Live provider replacement confirmed.')]);
  const directResult = await childRuntime.streamSimple(model,
    { messages: [{ role: 'user', content: 'direct helper check', timestamp: Date.now() }] },
    { sessionId: 'child-fixture', headers: { 'x-parent': 'child', 'x-delete': 'child', 'x-child-session': 'child-fixture' } }).result();
  equal(directResult.stopReason, 'stop');
  equal(directRequests, 1);
  scenarios.push('live-provider-reregistration-header-precedence');

  let compactionRequests = 0;
  runtime.registerNativeProvider({ ...runtime.getRegisteredNativeProvider(model.provider),
    streamSimple: (selected, request, options) => {
      compactionRequests++;
      check(options.apiKey === 'fixture-replaced-key', 'compaction uses parent provider auth');
      check(options.sessionId !== session.sessionId, 'compaction has child attribution');
      return faux.provider.streamSimple(selected, request, options);
    } });
  const compactManager = sdk.SessionManager.inMemory(root);
  for (let index = 0; index < 4; index++) {
    compactManager.appendMessage({ role: 'user', content: `Turn ${index}: ${'fixture '.repeat(100)}`, timestamp: Date.now() });
    compactManager.appendMessage(text(`Completed turn ${index}.`));
  }
  const compactSettings = sdk.SettingsManager.inMemory({ cacheWarming: 'off',
    compaction: { keepRecentTokens: 50 }, retry: { enabled: false } });
  const compactLoader = new sdk.DefaultResourceLoader({ cwd: root, agentDir: process.env.PI_CODING_AGENT_DIR,
    settingsManager: compactSettings, noExtensions: true, noSkills: true, noPromptTemplates: true,
    noThemes: true, noContextFiles: true });
  await compactLoader.reload();
  const compactChild = (await sdk.createAgentSession({ cwd: root, model, modelRuntime: childRuntime,
    sessionManager: compactManager, settingsManager: compactSettings, resourceLoader: compactLoader })).session;
  try {
    await compactChild.bindExtensions({});
    faux.setResponses(Array.from({ length: 4 }, () => text('Fixture compaction summary.')));
    const compactResult = await compactChild.compact();
    check(compactResult.summary.includes('Fixture compaction summary.'), 'SDK compaction stores fixture summary');
    check(compactionRequests > 0, 'SDK compaction dispatched through parent provider');
    scenarios.push('sdk-child-manual-compaction');
  } finally { await compactChild.abort(); compactChild.dispose(); }

  check(requestCount >= 10, 'all scenarios reached actual SDK provider dispatch');
  equal(networkAttempts, 0, 'no network attempt');
  console.log(JSON.stringify({ status: 'passed', assertions, scenario_count: scenarios.length,
    scenarios, fixture_provider_requests: requestCount + directRequests + compactionRequests, external_model_requests: 0, network_attempts: networkAttempts }));
} finally {
  if (session) { await session.abort(); session.dispose(); }
  globalThis.fetch = originalFetch;
  net.Socket.prototype.connect = originalConnect;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  const relative = path.relative(fs.realpathSync(os.tmpdir()), fs.realpathSync(root));
  assert(!path.isAbsolute(relative) && !relative.startsWith('..') && relative.startsWith('renpi-sdk-'));
  fs.rmSync(root, { recursive: true, force: true });
}
