import { ResultAsync, errAsync } from 'neverthrow';
import { readFile } from '../fs.js';
import { join, dirname } from 'path';
import type { ModelConfig } from './types.js';

export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

// Default timeout: 5 minutes
const DEFAULT_PROMPT_TIMEOUT_MS = 300_000;

/**
 * Get timeout value from environment variable or use default
 */
export const getTimeoutMs = (envVarName: string): number => {
  const envValue = process.env[envVarName];
  if (!envValue) return DEFAULT_PROMPT_TIMEOUT_MS;

  const parsed = parseInt(envValue, 10);
  if (isNaN(parsed) || parsed <= 0) {
    console.warn(
      `Invalid ${envVarName} value: "${envValue}". Expected positive integer (ms). Using default.`
    );
    return DEFAULT_PROMPT_TIMEOUT_MS;
  }
  return parsed;
};

/**
 * Wrap a promise with a timeout
 */
export const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);

/**
 * Check if response is an OpenCode SDK error response
 * Error types: ProviderAuthError | UnknownError | MessageOutputLengthError | MessageAbortedError | ApiError
 */
const isOpenCodeError = (response: unknown): boolean =>
  isObject(response) && 'error' in response && response.error != null;

/**
 * Check if response is an OpenCode SDK error and return an Error if present
 * @param response - The response to check
 * @param context - Optional context message to prefix the error
 * @returns Error if response is an error, null otherwise
 */
export const getOpenCodeError = (response: unknown, context?: string): Error | null => {
  if (!isOpenCodeError(response)) return null;

  const err = (response as { error: unknown }).error;
  let message: string;
  if (isObject(err)) {
    const type = (err.type as string) ?? 'UnknownError';
    const msg = (err.message as string) ?? JSON.stringify(err);
    message = `[${type}] ${msg}`;
  } else {
    message = String(err);
  }

  return new Error(context ? `${context}: ${message}` : message);
};

export const parseModelFromEnv = (envVarName: string): ModelConfig | null => {
  const modelEnv = process.env[envVarName];
  if (!modelEnv) return null;

  const [providerID, modelID] = modelEnv.split('/');
  if (!providerID || !modelID) {
    console.warn(
      `Invalid ${envVarName} format: "${modelEnv}". Expected "provider/model". Using default.`
    );
    return null;
  }

  return { providerID, modelID };
};

export const getModelConfig = (envVarName: string, defaultModel: ModelConfig): ModelConfig => {
  return parseModelFromEnv(envVarName) || defaultModel;
};

export const loadPromptFile = (promptFileName: string): ResultAsync<string, Error> => {
  const promptPath = join(dirname(new URL(import.meta.url).pathname), 'prompts', promptFileName);
  return readFile(promptPath).mapErr(
    (err) => new Error(`Failed to load ${promptFileName}: ${err.message}`)
  );
};

type PromptTextResponse = { data: { parts: Array<{ type: string; text?: string }> } };

type TextResponseParseOptions = {
  invalidResponseMessage: string;
  emptyResponseMessage: string;
  trim?: boolean;
  onInvalidResponse?: (response: unknown) => void;
};

export const isObject = (data: unknown): data is Record<string, unknown> => {
  return typeof data === 'object' && data !== null;
};

export const hasValidResponseData = (response: unknown): response is PromptTextResponse => {
  if (!isObject(response)) return false;
  if (!isObject(response.data)) return false;
  if (!Array.isArray(response.data.parts)) return false;
  return true;
};

export const parseTextResponse = (
  response: unknown,
  options: TextResponseParseOptions
): ResultAsync<string, Error> => {
  if (!hasValidResponseData(response)) {
    if (options.onInvalidResponse) {
      options.onInvalidResponse(response);
    }
    return errAsync(new Error(options.invalidResponseMessage));
  }

  const textParts = response.data.parts.filter((part) => part.type === 'text');
  if (textParts.length === 0) {
    return errAsync(new Error(options.emptyResponseMessage));
  }

  const rawText = textParts.map((part) => part.text ?? '').join('\n\n');
  const text = options.trim === false ? rawText : rawText.trim();

  return ResultAsync.fromSafePromise(Promise.resolve(text));
};

export async function validateModel(
  client: any,
  providerID: string,
  modelID: string
): Promise<boolean> {
  const providersResp = await client.provider.list({});
  const providers = providersResp.data?.all ?? [];
  const provider = providers.find((p: any) => p.id === providerID);

  if (!provider) {
    console.error(
      `Provider "${providerID}" not found. Known providers:`,
      providers.map((p: any) => p.id)
    );
    return false;
  }

  const models = provider.models ?? {};
  if (!models[modelID]) {
    console.error(
      `Model "${modelID}" not found for provider "${providerID}". Available:`,
      Object.keys(models)
    );
    return false;
  }

  return true;
}
