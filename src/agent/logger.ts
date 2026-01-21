import { join } from 'path';
import { ResultAsync, ok } from 'neverthrow';
import { fsUtils } from '../fs.js';
import { workspaceConstants } from '../workspace.js';
import type { Session, OpenCodeSDKSession } from './opencodesdk.js';

const { RUNS_DIR } = workspaceConstants;

class Logger {
  private runDir: string;
  private sessionsDir: string;
  private debugLogPath: string;

  constructor(runId: string) {
    this.runDir = join(RUNS_DIR, runId);
    this.sessionsDir = join(this.runDir, 'sessions');
    this.debugLogPath = join(this.runDir, 'debug.log');
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
    fsUtils.appendFile(this.debugLogPath, JSON.stringify(entry) + '\n').mapErr(() => {});
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
    const filepath = join(this.sessionsDir, filename);
    await fsUtils.writeFile(filepath, JSON.stringify(sessionData, null, 2));
  }
}

let currentLogger: Logger | null = null;

const noopLogger = { debug: () => {} } as Pick<Logger, 'debug'>;

/**
 * Get the current logger instance. Throws if not initialized.
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
 */
const getDebugLogger = (): Pick<Logger, 'debug'> => currentLogger ?? noopLogger;

/**
 * Initialize a new logger
 */
const initLogger = (runId: string): Logger => {
  currentLogger = new Logger(runId);
  return currentLogger;
};

interface SessionMetaData {
  agent: string;
  iteration?: number;
}

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/**
 * Log session data before cleanup.
 * Fetches session data and messages, logs them, and handles errors gracefully.
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
export { Logger, getLogger, getDebugLogger, initLogger, logSessionData, RUNS_DIR };
