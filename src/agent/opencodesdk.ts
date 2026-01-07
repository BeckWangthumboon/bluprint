import { ResultAsync, err, ok } from 'neverthrow';
import {
  createOpencode,
  type OpencodeClient,
  type Session as OpenCodeSDKSession,
} from '@opencode-ai/sdk';
import { getDebugLogger } from './logger.js';
import type { ModelConfig } from './types.js';
import { getAbortSignal } from '../exit.js';

const isObject = (data: unknown): data is Record<string, unknown> =>
  typeof data === 'object' && data !== null;

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/**
 * SDK error object structure (app-level errors embedded in 200 OK responses)
 */
type SdkError = {
  name: string;
  data?: { message?: string };
  message?: string;
};

/**
 * Prompt parameters (body only, path is handled by bound session)
 */
interface PromptParams {
  agent?: string;
  model?: ModelConfig;
  system?: string;
  parts: Array<{ type: 'text'; text: string }>;
}

/**
 * Message info structure from SDK
 */
interface MessageInfo {
  info: {
    id: string;
    role: string;
    error?: SdkError;
  };
  parts: Array<{ type: string; text?: string }>;
}

/**
 * Prompt response structure
 */
interface PromptResponse {
  info: {
    id: string;
    role: string;
    error?: SdkError;
  };
  parts: Array<{ type: string; text?: string }>;
}

/**
 * Provider info structure
 */
interface Provider {
  id: string;
  models?: Record<string, unknown>;
}

/**
 * Bound session object - all methods operate on the captured session ID
 */
interface Session {
  readonly id: string;
  prompt(params: PromptParams): ResultAsync<PromptResponse, Error>;
  abort(): ResultAsync<boolean, Error>;
  delete(): ResultAsync<void, Error>;
  messages(): ResultAsync<MessageInfo[], Error>;
  getData(): ResultAsync<OpenCodeSDKSession, Error>;
}

/**
 * Main wrapper interface
 */
interface Lib {
  session: {
    create(title: string): ResultAsync<Session, Error>;
  };
  provider: {
    list(): ResultAsync<Provider[], Error>;
    validate(providerID: string, modelID: string): ResultAsync<boolean, Error>;
  };
}

/**
 * Utilities for extracting and formatting errors from OpenCode SDK responses.
 */
const OpenCodeErrorUtils = {
  /**
   * Check if value looks like an SDK error object
   */
  isSdkError(value: unknown): value is SdkError {
    return isObject(value) && typeof value.name === 'string';
  },

  /**
   * Extract error from a message info object (if present)
   * Format: { error?: { name, data?, message? } }
   */
  fromInfo(info: unknown): SdkError | null {
    if (!isObject(info)) return null;
    if (!('error' in info) || info.error == null) return null;
    return OpenCodeErrorUtils.isSdkError(info.error) ? info.error : null;
  },

  /**
   * Extract error from session.prompt response
   * Format: { data: { info: { error? }, parts } }
   */
  fromPrompt(response: unknown): SdkError | null {
    if (!isObject(response)) return null;
    const { data } = response;
    if (!isObject(data) || !('info' in data)) return null;
    return OpenCodeErrorUtils.fromInfo(data.info);
  },

  /**
   * Extract first error from session.messages response
   * Format: { data: [{ info: { error? }, parts }] }
   */
  fromMessages(response: unknown): SdkError | null {
    if (!isObject(response)) return null;
    const { data } = response;
    if (!Array.isArray(data)) return null;

    for (const message of data) {
      if (isObject(message) && 'info' in message) {
        const error = OpenCodeErrorUtils.fromInfo(message.info);
        if (error) return error;
      }
    }
    return null;
  },

  /**
   * Format an SDK error into a human-readable string
   */
  format(error: SdkError): string {
    const name = error.name || 'UnknownError';
    const message =
      (isObject(error.data) ? error.data.message : null) || error.message || JSON.stringify(error);
    return `[${name}] ${message}`;
  },
} as const;

type Opencode = Awaited<ReturnType<typeof createOpencode>>;

let opencode: Opencode | null = null;

/**
 * Check if OpenCode has been initialized
 */
const isOpencodeInitialized = (): boolean => opencode !== null;

/**
 * Subscribe to SDK events and log them to debug.log
 * @param client - The OpenCode client
 * @param signal - Optional AbortSignal to cancel the event loop
 */
const subscribeToEvents = (
  client: OpencodeClient,
  signal?: AbortSignal
): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(client.event.subscribe(), toError).andThen((events) =>
    ResultAsync.fromPromise(
      (async () => {
        for await (const event of events.stream) {
          if (signal?.aborted) break;
          const logger = getDebugLogger();
          logger.debug('SDK_EVENT', {
            type: event.type,
            properties: event.properties,
          });
        }
      })(),
      toError
    )
  );

/**
 * Initialize the OpenCode
 */
const getOpencode = async (): Promise<Opencode> => {
  if (!opencode) {
    const result = await ResultAsync.fromPromise(createOpencode({ port: 4096 }), toError);

    if (result.isOk()) {
      opencode = result.value;
    } else {
      opencode = await createOpencode({ port: 0 });
    }
    subscribeToEvents(opencode.client, getAbortSignal()).mapErr(() => {});
  }
  return opencode;
};

/**
 * Format HTTP-level error from SDK response wrapper
 */
const formatHttpError = (error: unknown, context: string): Error => {
  if (isObject(error)) {
    if (typeof error.name === 'string') {
      const data = error.data as Record<string, unknown> | undefined;
      const message = data?.message ?? JSON.stringify(data ?? {});
      return new Error(`${context}: [${error.name}] ${message}`);
    }

    if (error.success === false) {
      return new Error(`${context}: [SDKError] ${JSON.stringify(error.error ?? error.data)}`);
    }

    return new Error(`${context}: ${JSON.stringify(error)}`);
  }

  return new Error(`${context}: ${String(error)}`);
};

/**
 * Wrap an SDK call with unified error handling
 * Handles both HTTP-level errors and app-level errors
 * @param errorExtractor - Optional function to extract app-level errors from response
 */
const wrapCall = <T>(
  fn: () => Promise<{ data?: T; error?: unknown }>,
  context: string,
  errorExtractor?: (response: unknown) => SdkError | null
): ResultAsync<T, Error> =>
  ResultAsync.fromPromise(fn(), toError).andThen((response) => {
    if (response.error != null) {
      return err(formatHttpError(response.error, context));
    }

    if (errorExtractor) {
      const appError = errorExtractor(response);
      if (appError) {
        return err(new Error(`${context}: ${OpenCodeErrorUtils.format(appError)}`));
      }
    }

    if (response.data === undefined) {
      return err(new Error(`${context}: No data returned`));
    }

    return ok(response.data);
  });

/**
 * Create a bound session object with all methods operating on the captured session ID
 */
const createSessionObject = (rawClient: OpencodeClient, sessionId: string): Session => ({
  id: sessionId,

  prompt: (params: PromptParams) =>
    wrapCall(
      () =>
        rawClient.session.prompt({
          path: { id: sessionId },
          body: params,
        }),
      `Session prompt`,
      OpenCodeErrorUtils.fromPrompt
    ),

  abort: () =>
    wrapCall(() => rawClient.session.abort({ path: { id: sessionId } }), `Session abort`),

  delete: () =>
    wrapCall(() => rawClient.session.delete({ path: { id: sessionId } }), `Session delete`).map(
      () => undefined
    ),

  messages: () =>
    wrapCall(
      () => rawClient.session.messages({ path: { id: sessionId } }),
      `Session messages`,
      OpenCodeErrorUtils.fromMessages
    ),

  getData: () => wrapCall(() => rawClient.session.get({ path: { id: sessionId } }), `Session get`),
});

/**
 * Create the OpenCodeLib wrapper
 */
const createOpenCodeLib = (rawClient: OpencodeClient): Lib => ({
  session: {
    create: (title: string) =>
      wrapCall(() => rawClient.session.create({ body: { title } }), 'Session create').map((data) =>
        createSessionObject(rawClient, data.id)
      ),
  },

  provider: {
    list: () =>
      wrapCall(() => rawClient.provider.list({}), 'Provider list').map(
        (data) => (data as { all?: Provider[] }).all ?? []
      ),

    validate: (providerID: string, modelID: string) =>
      wrapCall(() => rawClient.provider.list({}), 'Provider list').andThen((data) => {
        const providers = (data as { all?: Provider[] }).all ?? [];
        const provider = providers.find((p) => p.id === providerID);

        if (!provider) {
          console.error(
            `Provider "${providerID}" not found. Known providers:`,
            providers.map((p) => p.id)
          );
          return ok(false);
        }

        const models = provider.models ?? {};
        if (!models[modelID]) {
          console.error(
            `Model "${modelID}" not found for provider "${providerID}". Available:`,
            Object.keys(models)
          );
          return ok(false);
        }

        return ok(true);
      }),
  },
});

let cachedLib: Lib | null = null;

/**
 * Get the OpenCodeLib wrapper
 * This is the main entry point for all SDK interactions
 */
const getOpenCodeLib = (): ResultAsync<Lib, Error> =>
  ResultAsync.fromPromise(getOpencode(), toError).map((oc) => {
    if (!cachedLib) {
      cachedLib = createOpenCodeLib(oc.client);
    }
    return cachedLib;
  });

/**
 * Get the OpenCode server instance (for shutdown, etc.)
 */
const getOpencodeServer = async () => {
  const instance = await getOpencode();
  return instance.server;
};

/**
 * Abort a session and delete it to clean up
 */
const abortAndCleanup = (session: Session): void => {
  session
    .abort()
    .andThen(() => session.delete())
    .mapErr((err) => {
      const logger = getDebugLogger();
      logger.debug('ABORT_CLEANUP_ERROR', {
        sessionId: session.id,
        error: err.message,
      });
    });
};

export type { SdkError, PromptParams, MessageInfo, PromptResponse, Provider, Session, Lib };
export type { OpenCodeSDKSession };
export {
  OpenCodeErrorUtils,
  isOpencodeInitialized,
  getOpenCodeLib,
  getOpencodeServer,
  abortAndCleanup,
};
