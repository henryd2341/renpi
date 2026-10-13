import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Type } from 'typebox';
import {
  createAgentSession, DefaultResourceLoader, getAgentDir, SessionManager, SettingsManager, VERSION,
  type ExtensionAPI, type AgentSession,
} from '@earendil-works/pi-coding-agent';
import { artifactFiles, checkWritePath, inside, lastAnswer, roles } from './runtime.mjs';
import { createDelegatedRuntime } from './model-runtime.ts';
import { registerBridge } from './bridge-extension.ts';

const skills = fileURLToPath(new URL('../../skills/', import.meta.url));
const init = path.join(skills, 'renpi-initialization/initialize-game/SKILL.md');
const coding = path.join(skills, 'renpi-coding/code-renpy-game/SKILL.md');

export default function renpi(pi: ExtensionAPI) {
  if (VERSION !== '1.1.0') throw new Error(`Ren’Pi targets Pi 1.1.0; this process is Pi ${VERSION}. Check the Pi executable path.`);
  const children = new Set<AgentSession>();
  let active: { controller: AbortController; done: Promise<void> } | undefined;
  const bridgeControl = registerBridge(pi, { busy: () => Boolean(active), abort: () => active?.controller.abort() });

  pi.on('resources_discover', async () => ({ skillPaths: [skills] }));
  pi.on('session_start', async (_event, ctx) => {
    if (!fs.existsSync(init)) throw new Error(`Ren'Pi skills are missing: ${skills}`);
    ctx.ui.setStatus('renpi', `Ren’Pi live · ${ctx.cwd}`);
  });
  pi.on('before_agent_start', async (event, ctx) => ({
    systemPrompt: `${event.systemPrompt}\n\nRen’Pi: you are the Coding coordinator. Project: ${ctx.cwd}.
For initialization read ${init}; for production read ${coding}. Read linked skills when needed.
Use renpi_delegate for Writing, Image and Review with explicit source paths, scope and acceptance criteria.
Read actual returned files before integrating. A returned report is not proof of asset readiness or candidate acceptance.
Keep the bundled skill/extension repository read-only. Work only in the selected project and assigned task outputs.
For GUI-driven creation, call renpi_bridge_setup after creating game/. Use the bundled renpi_choice client and renpi_submit_candidate; bridge state and publication belong to the shared runtime, not project-specific scripts.
Use the installed SDK selected by RENPY_HOME when available; discover it during environment scanning otherwise.`,
  }));

  pi.registerCommand('renpi-status', {
    description: 'Show the real project, model, skills and available tools; no model call.',
    handler: async (_args, ctx) => {
      pi.sendMessage({ customType: 'renpi-status', display: true, content: JSON.stringify({
        project: ctx.cwd, session: ctx.sessionManager.getSessionId(),
        model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : null,
        skills, renpy_home: process.env.RENPY_HOME ?? null,
        tools: pi.getActiveTools(), active_children: children.size,
        gui_bridge: bridgeControl.status(),
      }, null, 2) });
    },
  });
  pi.registerCommand('renpi-init', {
    description: 'Start or continue initialization in the current project using the selected real model.',
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) { ctx.ui.notify('Wait for the current turn before starting init.', 'warning'); return; }
      pi.sendUserMessage(`Read ${init} and initialize the project at ${ctx.cwd}.\n${args}`);
    },
  });

  pi.registerTool({
    name: 'renpi_delegate', label: 'Ren’Pi delegate',
    description: 'Delegate one bounded Writing, Image or read-only Review task to an independent real-model Pi SDK session. Provide source paths, exact deliverables and acceptance criteria. Child inherits the currently selected model and authentication. Image has shell access for an already configured backend, not automatic access to parent extension tools. Returns report and actual file paths, not an approval or publication receipt.',
    parameters: Type.Object({
      role: Type.Union([Type.Literal('writing'), Type.Literal('image'), Type.Literal('review')]),
      task: Type.String({ minLength: 1, maxLength: 32768 }),
    }),
    async execute(_callId, { role, task }, signal, onUpdate, ctx) {
      signal?.throwIfAborted();
      if (!ctx.model) throw new Error('Select a model in Pi before delegating.');
      if (ctx.model.api === 'pi-virtual') throw new Error('Select a physical model before Ren’Pi delegation; virtual model routing is not supported.');
      if (!Object.hasOwn(roles, role) || !task.trim()) throw new Error('A known role and nonempty task are required.');
      if (active) throw new Error('Finish the active delegation before starting another.');
      const controller = new AbortController();
      signal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
      let finish!: () => void;
      active = { controller, done: new Promise<void>(resolve => { finish = resolve; }) };
      let child: AgentSession | undefined;
      let directory: string | undefined;
      const abort = () => { void child?.abort().catch(() => {}); };
      try {
        const id = randomUUID();
        const taskDirectory = path.join(ctx.cwd, '.renpi-live/tasks', id);
        if (!inside(ctx.cwd, taskDirectory)) throw new Error('Task directory points outside the project.');
        const output = path.join(taskDirectory, 'output');
        fs.mkdirSync(output, { recursive: true });
        directory = taskDirectory;
        fs.writeFileSync(path.join(directory, 'task.txt'), task, { flag: 'wx' });
        const spec = roles[role];
        const entry = path.join(skills, spec.group, spec.entry, 'SKILL.md');
        const settingsManager = SettingsManager.inMemory({ cacheWarming: 'off' });
        const modelRuntime = await createDelegatedRuntime(ctx.model, ctx.modelRegistry, signal);
        const loader = new DefaultResourceLoader({
          cwd: ctx.cwd, agentDir: getAgentDir(), settingsManager,
          noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
          additionalSkillPaths: [path.join(skills, spec.group)],
          appendSystemPrompt: [`You are the Ren’Pi ${role} specialist. First read ${entry}.
The assigned project is ${ctx.cwd}. All deliverable files go under ${output}.
Other agents own the project; preserve their work and return file paths to Coding for integration.
Do not delegate further. Ask Coding for missing inputs. Report completed work, evidence, limitations and blockers.
${role === 'review' ? 'Read product files only. Return your review as text; the coordinator stores that report.' : ''}
${role === 'image' ? 'Use only an already configured image backend through available tools. Report a missing backend honestly; a prompt alone is not a generated asset. Shell access is not an OS sandbox.' : ''}`],
          extensionFactories: [(api) => {
            api.on('tool_call', async event => {
              if (event.toolName === 'write' || event.toolName === 'edit') {
                try { checkWritePath(ctx.cwd, output, event.input.path); }
                catch (error) { return { block: true, reason: String(error) }; }
              }
            });
          }],
        });
        await loader.reload();
        signal.throwIfAborted();
        const loaded = await createAgentSession({
          cwd: ctx.cwd, model: ctx.model, thinkingLevel: pi.getThinkingLevel(),
          modelRuntime,
          tools: spec.tools, resourceLoader: loader, settingsManager,
          sessionManager: SessionManager.create(ctx.cwd, path.join(directory, 'sessions')),
        });
        child = loaded.session;
        children.add(child);
        if (loaded.extensionsResult.errors.length) throw new Error(JSON.stringify(loaded.extensionsResult.errors));
        await child.bindExtensions({});
        signal?.addEventListener('abort', abort, { once: true });
        signal?.throwIfAborted();
        const receipt = { task_id: id, parent_session: ctx.sessionManager.getSessionId(),
          child_session: child.sessionId, role, model: `${ctx.model.provider}/${ctx.model.id}`, output };
        onUpdate?.({ content: [{ type: 'text', text: `${role}: started ${id}` }], details: receipt });
        await child.prompt(`Read the role skill and execute this assignment.\n\n${task}\n\nDeliverables directory: ${output}`);
        signal?.throwIfAborted();
        const report = lastAnswer(child.messages);
        const files = artifactFiles(output);
        if (!inside(ctx.cwd, directory)) throw new Error('Task directory changed during execution.');
        fs.writeFileSync(path.join(directory, 'result.md'), report, { flag: 'wx' });
        const result = { ...receipt, status: 'returned', report: path.join(directory, 'result.md'), files };
        fs.writeFileSync(path.join(directory, 'receipt.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
        return { content: [{ type: 'text', text: `${JSON.stringify(result, null, 2)}\n\n${report.slice(0, 16000)}` }], details: result };
      } catch (error) {
        if (directory && fs.existsSync(directory) && inside(ctx.cwd, directory)) {
          try { fs.writeFileSync(path.join(directory, 'error.txt'), String(error), { flag: 'wx' }); }
          catch { /* Preserve the original task failure if diagnostic writing also fails. */ }
        }
        throw error;
      } finally {
        signal?.removeEventListener('abort', abort);
        try { if (child) await child.abort(); }
        finally {
          try { if (child) { children.delete(child); child.dispose(); } }
          finally { active = undefined; finish(); }
        }
      }
    },
  });
  pi.on('session_before_switch', async () => active || bridgeControl.busy() ? { cancel: true } : undefined);
  pi.on('session_before_fork', async () => active || bridgeControl.busy() ? { cancel: true } : undefined);
  pi.on('session_shutdown', async () => {
    const pending = active;
    pending?.controller.abort();
    await pending?.done;
  });
}
