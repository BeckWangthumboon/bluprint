import { join } from 'path';
import { ResultAsync } from 'neverthrow';
import { fsUtils } from '../fs.js';
import { workspaceConstants } from '../workspace.js';

const { RUNS_DIR } = workspaceConstants;

type LoggingIO = {
  getRunPaths: (runId: string) => {
    runDir: string;
    sessionsDir: string;
    debugLogPath: string;
  };
  appendDebugLog: (runId: string, content: string) => ResultAsync<void, Error>;
  writeSessionFile: (runId: string, filename: string, content: string) => ResultAsync<void, Error>;
};

/**
 * Create logging IO functions with a custom base directory.
 * Useful for testing with temporary directories.
 * @param baseDir - The base directory for runs (defaults to RUNS_DIR)
 * @returns Object containing logging IO functions
 */
const createLoggingIO = (baseDir: string): LoggingIO => {
  /**
   * Get the paths for a run's logging files.
   * @param runId - The unique identifier for the run
   * @returns Object containing runDir, sessionsDir, and debugLogPath
   */
  const getRunPaths = (runId: string) => ({
    runDir: join(baseDir, runId),
    sessionsDir: join(baseDir, runId, 'sessions'),
    debugLogPath: join(baseDir, runId, 'debug.log'),
  });

  /**
   * Append a line to the debug log for a run.
   * @param runId - The unique identifier for the run
   * @param content - The content to append to the debug log
   * @returns ResultAsync resolving to void on success
   */
  const appendDebugLog = (runId: string, content: string): ResultAsync<void, Error> => {
    const { debugLogPath } = getRunPaths(runId);
    return fsUtils.appendFile(debugLogPath, content);
  };

  /**
   * Write a session file to the sessions directory.
   * @param runId - The unique identifier for the run
   * @param filename - The name of the session file
   * @param content - The content to write to the session file
   * @returns ResultAsync resolving to void on success
   */
  const writeSessionFile = (
    runId: string,
    filename: string,
    content: string
  ): ResultAsync<void, Error> => {
    const { sessionsDir } = getRunPaths(runId);
    return fsUtils.writeFile(join(sessionsDir, filename), content);
  };

  return {
    getRunPaths,
    appendDebugLog,
    writeSessionFile,
  };
};

const loggingIO = createLoggingIO(RUNS_DIR);

export type { LoggingIO };
export { loggingIO, createLoggingIO, RUNS_DIR };
