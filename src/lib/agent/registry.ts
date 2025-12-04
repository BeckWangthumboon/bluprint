import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createProviderRegistry, type LanguageModel, type ProviderRegistryProvider } from 'ai';
import type { ProviderV2 } from '@ai-sdk/provider';
import { err, ok, type Result } from 'neverthrow';
import { createAppError, type AppError } from '../../types/errors.js';

type ProviderName = 'openrouter' | 'zai';

const MODEL_BY_PROVIDER: Record<ProviderName, `${ProviderName}:${string}`> = {
  openrouter: 'openrouter:amazon/nova-2-lite-v1:free',
  zai: 'zai:GLM-4.6',
};

const API_KEY_ENV_BY_PROVIDER: Record<ProviderName, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  zai: 'ZAI_API_KEY',
};

type ProviderRegistry = ProviderRegistryProvider<Record<string, ProviderV2>>;

// get provider from env
const resolveProviderSelection = (): Result<ProviderName, AppError> => {
  const rawProvider = process.env.PROVIDER?.trim().toLowerCase();

  if (!rawProvider) return ok('openrouter');
  if (rawProvider === 'openrouter' || rawProvider === 'zai') return ok(rawProvider);

  return err(
    createAppError('VALIDATION_ERROR', 'Unsupported provider value in PROVIDER env variable', {
      provider: rawProvider,
      allowedProviders: Object.keys(API_KEY_ENV_BY_PROVIDER),
    }),
  );
};

// get the api key for the provider
const readApiKeyForProvider = (provider: ProviderName): Result<string, AppError> => {
  const envKey = API_KEY_ENV_BY_PROVIDER[provider];
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

// create the provider instance
const buildProvider = (provider: ProviderName, apiKey: string): Result<ProviderV2, AppError> => {
  try {
    if (provider === 'openrouter') {
      return ok(createOpenRouter({ apiKey }));
    }

    return ok(
      createOpenAICompatible({
        name: 'zai',
        apiKey,
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
