import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createVertex } from '@ai-sdk/google-vertex';
import { createProviderRegistry, type LanguageModel, type ProviderRegistryProvider } from 'ai';
import type { ProviderV2 } from '@ai-sdk/provider';
import { err, ok, type Result } from 'neverthrow';
import { createAppError, type AppError } from '../../types/errors.js';

type ProviderName = 'openrouter' | 'zai' | 'vertex';

const MODEL_BY_PROVIDER: Record<ProviderName, `${ProviderName}:${string}`> = {
  openrouter: 'openrouter:amazon/nova-2-lite-v1:free',
  zai: 'zai:GLM-4.6',
  vertex: 'vertex:gemini-2.5-flash',
};

const API_KEY_ENV_BY_PROVIDER: Partial<Record<ProviderName, string>> = {
  openrouter: 'OPENROUTER_API_KEY',
  zai: 'ZAI_API_KEY',
};

type ProviderRegistry = ProviderRegistryProvider<Record<string, ProviderV2>>;

// get provider from env
const resolveProviderSelection = (): Result<ProviderName, AppError> => {
  const rawProvider = process.env.PROVIDER?.trim().toLowerCase();

  if (!rawProvider) return ok('openrouter');
  if (rawProvider === 'openrouter' || rawProvider === 'zai' || rawProvider === 'vertex')
    return ok(rawProvider);

  return err(
    createAppError('VALIDATION_ERROR', 'Unsupported provider value in PROVIDER env variable', {
      provider: rawProvider,
      allowedProviders: ['openrouter', 'zai', 'vertex'],
    }),
  );
};

/**
 * Reads the API key for providers that require one.
 *
 * @param provider - Provider name to get API key for.
 * @returns Result containing the API key or AppError if missing. Returns ok(undefined) for providers that don't need API keys.
 * @throws Never throws. Errors flow via AppError in Result.
 */
const readApiKeyForProvider = (provider: ProviderName): Result<string | undefined, AppError> => {
  const envKey = API_KEY_ENV_BY_PROVIDER[provider];

  if (!envKey) {
    return ok(undefined);
  }

  const apiKey = process.env[envKey]?.trim();

  if (!apiKey) {
    return err(
      createAppError('LLM_ERROR', `Missing API key for provider ${provider}. Set ${envKey}.`, {
        provider,
        envKey,
      }),
    );
  }

  return ok(apiKey);
};

/**
 * Creates a provider instance for the specified provider.
 *
 * @param provider - Provider name to instantiate.
 * @param apiKey - API key for providers that require one; undefined for providers using other auth methods.
 * @returns Result containing the provider instance or AppError on construction failure.
 * @throws Never throws. Errors flow via AppError in Result.
 */
const buildProvider = (
  provider: ProviderName,
  apiKey: string | undefined,
): Result<ProviderV2, AppError> => {
  try {
    if (provider === 'openrouter') {
      return ok(createOpenRouter({ apiKey: apiKey! }));
    }

    if (provider === 'vertex') {
      const project = process.env.GOOGLE_VERTEX_PROJECT?.trim();
      const location = process.env.GOOGLE_VERTEX_LOCATION?.trim();

      return ok(
        createVertex({
          project,
          location,
        }),
      );
    }

    return ok(
      createOpenAICompatible({
        name: 'zai',
        apiKey: apiKey!,
        baseURL: 'https://api.z.ai/api/coding/paas/v4',
      }),
    );
  } catch (error) {
    return err(
      createAppError(
        'LLM_ERROR',
        `Unable to configure provider ${provider}: ${(error as Error).message}`,
        {
          provider,
          error,
        },
      ),
    );
  }
};

// create registry
const buildRegistry = (
  provider: ProviderName,
  providerImpl: ProviderV2,
): Result<ProviderRegistry, AppError> => {
  try {
    return ok(createProviderRegistry({ [provider]: providerImpl }));
  } catch (error) {
    return err(
      createAppError(
        'LLM_ERROR',
        `Unable to initialize provider registry for ${provider}: ${(error as Error).message}`,
        { provider, error },
      ),
    );
  }
};

const getLanguageModel = (
  registry: ProviderRegistry,
  provider: ProviderName,
): Result<LanguageModel, AppError> => {
  const modelId = MODEL_BY_PROVIDER[provider];

  try {
    return ok(registry.languageModel(modelId));
  } catch (error) {
    return err(
      createAppError(
        'LLM_ERROR',
        `Model ${modelId} is not available for provider ${provider}: ${(error as Error).message}`,
        { provider, modelId, error },
      ),
    );
  }
};

/**
 * Resolves the configured language model for the selected provider.
 *
 * @returns Result containing a provider-ready language model or AppError when configuration fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const getModel = (): Result<LanguageModel, AppError> =>
  resolveProviderSelection().andThen((provider) =>
    readApiKeyForProvider(provider)
      .andThen((apiKey) => buildProvider(provider, apiKey))
      .andThen((providerImpl) => buildRegistry(provider, providerImpl))
      .andThen((registry) => getLanguageModel(registry, provider)),
  );

export { getModel };
