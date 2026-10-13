import { InMemoryCredentialStore, type ProviderHeaders, type StreamOptions } from '@earendil-works/pi-ai';
import { ModelRuntime, type ExtensionContext } from '@earendil-works/pi-coding-agent';

function parentOptions<T extends StreamOptions>(options: T) {
  const forwarded = { ...options };
  delete forwarded.apiKey;
  delete forwarded.env;
  delete forwarded.headers;
  return {
    ...forwarded,
    // Child attribution is a default; resolved parent headers, including deletions, take precedence.
    transformHeaders: (parent: ProviderHeaders) => {
      const merged: ProviderHeaders = { ...options.headers };
      for (const [name, value] of Object.entries(parent)) {
        for (const key of Object.keys(merged)) {
          if (key.toLowerCase() === name.toLowerCase()) delete merged[key];
        }
        merged[name] = value;
      }
      return merged;
    },
  };
}

export async function createDelegatedRuntime(
  model: NonNullable<ExtensionContext['model']>, registry: ExtensionContext['modelRegistry'], signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (model.api === 'pi-virtual') throw new Error('Select a physical model before Ren’Pi delegation; virtual model routing is not supported.');
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false, signal,
  });
  runtime.registerNativeProvider({
    id: model.provider, name: registry.getProviderDisplayName(model.provider),
    getModels: () => [model],
    getAllModels: () => [model],
    // Authentication stays in the parent runtime, including OAuth refresh and temporary API keys.
    auth: { apiKey: { name: 'Parent Pi session', resolve: async ({ signal }) => {
      signal.throwIfAborted();
      return { auth: {}, source: 'parent model registry' };
    } } },
    stream: (selected, context, options) => registry.stream(selected, context, options && parentOptions(options)),
    streamSimple: (selected, context, options) => registry.streamSimple(selected, context, options && parentOptions(options)),
  });
  signal?.throwIfAborted();
  return runtime;
}
