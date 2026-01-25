import { ResultAsync, errAsync } from 'neverthrow';
import { fsUtils } from '../fs.js';
import { join, dirname } from 'path';
import type { Session } from '../sdk/index.js';
import { logSessionData } from '../logging/index.js';

export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

type TimeoutOptions = {
  ms: number;
  label: string;
  signal?: AbortSignal;
  onTimeout?: () => void;
  onTimeoutError?: (error: Error) => void;
  onAbort?: () => void;
  onAbortError?: (error: Error) => void;
};

/**
 * Wrap a promise with a timeout
 * Clears the timeout when the promise resolves/rejects to avoid leaks.
 * Optionally calls onTimeout (e.g., to abort a running session) when timeout occurs.
 */
export const withTimeout = async <T>(promise: Promise<T>, options: TimeoutOptions): Promise<T> => {
  const { ms, label, signal, onTimeout, onTimeoutError, onAbort, onAbortError } = options;

  if (signal?.aborted) {
    try {
      const result = onAbort?.();
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch((err) => {
          try {
            onAbortError?.(toError(err));
          } catch (handlerErr) {
            console.error('onAbortError handler failed:', handlerErr);
          }
        });
      }
    } catch (err) {
      try {
        onAbortError?.(toError(err));
      } catch (handlerErr) {
        console.error('onAbortError handler failed:', handlerErr);
      }
    }
    throw new Error('Operation aborted');
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
  let abortHandler: (() => void) | undefined = undefined;

  const handleTimeoutError = (err: unknown): void => {
    const error = toError(err);
    try {
      onTimeoutError?.(error);
    } catch (handlerErr) {
      console.error('onTimeoutError handler failed:', handlerErr);
    }
  };

  const handleAbortError = (err: unknown): void => {
    const error = toError(err);
    try {
      onAbortError?.(error);
    } catch (handlerErr) {
      console.error('onAbortError handler failed:', handlerErr);
    }
  };

  const cleanup = (): void => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    if (abortHandler && signal) {
      signal.removeEventListener('abort', abortHandler);
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

  const abortPromise = signal
    ? new Promise<never>((_, reject) => {
        abortHandler = () => {
          try {
            const result = onAbort?.();
            if (result && typeof (result as Promise<unknown>).catch === 'function') {
              (result as Promise<unknown>).catch(handleAbortError);
            }
          } catch (err) {
            handleAbortError(err);
          }
          reject(new Error('Operation aborted'));
        };
        signal.addEventListener('abort', abortHandler, { once: true });
      })
    : null;

  const racers: Promise<T>[] = [promise, timeoutPromise as Promise<T>];
  if (abortPromise) {
    racers.push(abortPromise);
  }

  return Promise.race(racers).finally(cleanup);
};

export const isObject = (data: unknown): data is Record<string, unknown> =>
  typeof data === 'object' && data !== null;

export const loadPromptFile = (promptFileName: string): ResultAsync<string, Error> => {
  const promptPath = join(dirname(new URL(import.meta.url).pathname), 'prompts', promptFileName);
  return fsUtils
    .readFile(promptPath)
    .mapErr((err) => new Error(`Failed to load ${promptFileName}: ${err.message}`));
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
