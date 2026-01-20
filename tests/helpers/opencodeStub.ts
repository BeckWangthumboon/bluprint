import { ResultAsync } from 'neverthrow';
import type {
  Lib,
  Provider,
  Session,
  PromptResponse,
  MessageInfo,
  OpenCodeSDKSession,
} from '../../src/agent/opencodesdk.js';

const TEST_PROVIDERS_ENV = 'BLUPRINT_TEST_OPENCODE_PROVIDERS';

const DEFAULT_PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['gpt-4', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-opus', 'claude-3-haiku'],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const loadProviderModels = (): Record<string, string[]> => {
  const raw = process.env[TEST_PROVIDERS_ENV];
  if (!raw) {
    return DEFAULT_PROVIDER_MODELS;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return DEFAULT_PROVIDER_MODELS;
    }
    const result: Record<string, string[]> = {};
    for (const [providerID, models] of Object.entries(parsed)) {
      if (Array.isArray(models) && models.every((model) => typeof model === 'string' && model)) {
        result[providerID] = models as string[];
      }
    }
    return Object.keys(result).length > 0 ? result : DEFAULT_PROVIDER_MODELS;
  } catch {
    return DEFAULT_PROVIDER_MODELS;
  }
};

const buildProviders = (providerModels: Record<string, string[]>): Provider[] => {
  return Object.entries(providerModels).map(([providerID, models]) => ({
    id: providerID,
    models: Object.fromEntries(models.map((modelID) => [modelID, {}])),
  }));
};

const rejectSession = <T>(): ResultAsync<T, Error> => {
  return ResultAsync.fromPromise(
    Promise.reject(new Error('OpenCode test stub does not support sessions')),
    (err) => (err instanceof Error ? err : new Error(String(err)))
  );
};

const createSession = (): Session => ({
  id: 'test-session',
  prompt: () => rejectSession<PromptResponse>(),
  abort: () => rejectSession<boolean>(),
  delete: () => rejectSession<void>(),
  messages: () => rejectSession<MessageInfo[]>(),
  getData: () => rejectSession<OpenCodeSDKSession>(),
});

const createOpenCodeLib = (): Lib => {
  const providerModels = loadProviderModels();
  const providers = buildProviders(providerModels);

  return {
    session: {
      create: (title: string) => {
        void title;
        return ResultAsync.fromPromise(Promise.resolve(createSession()), (err) =>
          err instanceof Error ? err : new Error(String(err))
        );
      },
    },
    provider: {
      list: () =>
        ResultAsync.fromPromise(Promise.resolve(providers), (err) =>
          err instanceof Error ? err : new Error(String(err))
        ),
      validate: (providerID: string, modelID: string) => {
        const models = providerModels[providerID] ?? [];
        return ResultAsync.fromPromise(Promise.resolve(models.includes(modelID)), (err) =>
          err instanceof Error ? err : new Error(String(err))
        );
      },
    },
  };
};

export { createOpenCodeLib };
