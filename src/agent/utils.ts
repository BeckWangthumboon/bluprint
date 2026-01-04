import { ResultAsync, errAsync } from 'neverthrow';
import { readFile } from '../fs.js';
import { join, dirname } from 'path';
import type { ModelConfig } from './types.js';
import type { Session } from './opencodesdk.js';
import { logSessionData } from './logger.js';

export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/**
 * Get timeout value from environment variable or use provided default
 */
export const getTimeoutMs = (envVarName: string, defaultMs: number): number => {
  const envValue = process.env[envVarName];
  if (!envValue) return defaultMs;

  const parsed = parseInt(envValue, 10);
  if (isNaN(parsed) || parsed <= 0) {
    console.warn(
      `Invalid ${envVarName} value: "${envValue}". Expected positive integer (ms). Using default.`
    );
    return defaultMs;
  }
  return parsed;
};

type TimeoutOptions = {
  ms: number;
  label: string;
  onTimeout?: () => void;
  onTimeoutError?: (error: Error) => void;
};

/**
 * Wrap a promise with a timeout
 * Clears the timeout when the promise resolves/rejects to avoid leaks.
 * Optionally calls onTimeout (e.g., to abort a running session) when timeout occurs.
 */
export const withTimeout = async <T>(promise: Promise<T>, options: TimeoutOptions): Promise<T> => {
  const { ms, label, onTimeout, onTimeoutError } = options;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const handleTimeoutError = (err: unknown): void => {
    const error = toError(err);
    try {
      onTimeoutError?.(error);
    } catch (handlerErr) {
      console.error('onTimeoutError handler failed:', handlerErr);
    }
  };

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      try {
        const result = onTimeout?.();
        if (result && typeof (result as Promise<unknown>).catch === 'function') {
          (result as Promise<unknown>).catch(handleTimeoutError);
        }
      } catch (err) {
        handleTimeoutError(err);
      }
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
};

export const isObject = (data: unknown): data is Record<string, unknown> =>
  typeof data === 'object' && data !== null;

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

/**
 * Convert a ResultAsync to a Promise that throws on error
 */
export const unwrapResultAsync = async <T>(result: ResultAsync<T, Error>): Promise<T> => {
  const resolved = await result;
  if (resolved.isErr()) {
    throw resolved.error;
  }
  return resolved.value;
};

/**
 * Helper to log and delete a session
 */
export const cleanupSession = (
  session: Session,
  agent: string,
  iteration?: number
): ResultAsync<void, Error> =>
  logSessionData(session, { agent, iteration }).andThen(() => session.delete());
