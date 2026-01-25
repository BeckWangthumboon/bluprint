import { ResultAsync, ok } from 'neverthrow';
import type { Session, OpenCodeSDKSession } from '../sdk/index.js';
import { loggingIO } from './io.js';
import type { LoggingIO } from './io.js';

class Logger {
  private runId: string;
  private io: LoggingIO;

  constructor(runId: string, io: LoggingIO = loggingIO) {
    this.runId = runId;
    this.io = io;
  }

  /**
   * Log a debug event with optional data (fire and forget)
   */
  debug(event: string, data?: Record<string, unknown>): void {
    const entry = {
      ts: new Date().toISOString(),
      event,
      ...data,
    };
    this.io.appendDebugLog(this.runId, JSON.stringify(entry) + '\n').mapErr(() => {});
  }

  /**
   * Log a full session object as JSON
   */
  async logSession(
    sessionId: string,
    sessionData: OpenCodeSDKSession,
    meta: { agent: string; iteration?: number }
  ): Promise<void> {
    const prefix = String(meta.iteration ?? 0).padStart(3, '0');
    const agentShort = meta.agent.replace('Agent', '');
    const filename = `${prefix}-${agentShort}-${sessionId}.json`;
    await this.io.writeSessionFile(this.runId, filename, JSON.stringify(sessionData, null, 2));
  }
}

let currentLogger: Logger | null = null;

const noopLogger = { debug: () => {} } as Pick<Logger, 'debug'>;

/**
 * Get the current logger instance. Throws if not initialized.
 * @returns Current Logger instance
 */
const getLogger = (): Logger => {
  if (!currentLogger) {
    throw new Error('Logger not initialized - call initLogger() first');
  }
  return currentLogger;
};

/**
 * Get a debug-only logger that returns a no-op if not initialized.
 * Safe to call before initLogger().
 * @returns Debug logger with a debug method
 */
const getDebugLogger = (): Pick<Logger, 'debug'> => currentLogger ?? noopLogger;

/**
 * Initialize a new logger
 * @param runId - The run identifier
 * @returns Initialized Logger instance
 */
const initLogger = (runId: string): Logger => {
  currentLogger = new Logger(runId);
  return currentLogger;
};

type SessionMetaData = {
  agent: string;
  iteration?: number;
};

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/**
 * Log session data before cleanup.
 * Fetches session data and messages, logs them, and handles errors gracefully.
 * @param session - OpenCode session to log
 * @param meta - Metadata for log naming
 * @returns ResultAsync resolving to void
 */
const logSessionData = (session: Session, meta: SessionMetaData): ResultAsync<void, Error> =>
  ResultAsync.combine([session.getData(), session.messages()])
    .andThen(([sessionData, messages]) => {
      const logger = currentLogger;
      if (!logger) {
        return ok(undefined);
      }
      return ResultAsync.fromThrowable(
        async () =>
          logger.logSession(session.id, { ...sessionData, messages } as OpenCodeSDKSession, meta),
        toError
      )();
    })
    .orElse((error) => {
      console.warn(`[logger] Failed to log session ${session.id}: ${error.message}`);
      return ok(undefined);
    });

export type { SessionMetaData };
export { Logger, getLogger, getDebugLogger, initLogger, logSessionData };
