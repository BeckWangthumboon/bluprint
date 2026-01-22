import { join } from 'path';
import { ResultAsync } from 'neverthrow';
import { fsUtils } from '../fs.js';
import { workspaceConstants } from '../workspace.js';

const { RUNS_DIR } = workspaceConstants;

/**
 * Create telemetry IO functions with a custom base directory.
 * Useful for testing with temporary directories.
 * @param baseDir - The base directory for runs (defaults to RUNS_DIR)
 * @returns Object containing telemetry IO functions
 */
const createTelemetryIO = (baseDir: string) => {
  /**
   * Get the paths for a run's telemetry files.
   * @param runId - The unique identifier for the run
   * @returns Object containing runDir, agentsDir, and manifestPath
   */
  const getRunPaths = (runId: string) => ({
    runDir: join(baseDir, runId),
    agentsDir: join(baseDir, runId, 'agents'),
    manifestPath: join(baseDir, runId, 'manifest.md'),
  });

  /**
   * Write an agent call log file to the agents directory.
   * @param runId - The unique identifier for the run
   * @param filename - The name of the file to write
   * @param content - The content to write to the file
   * @returns ResultAsync resolving to void on success
   */
  const writeAgentCallFile = (
    runId: string,
    filename: string,
    content: string
  ): ResultAsync<void, Error> => {
    const { agentsDir } = getRunPaths(runId);
    return fsUtils.writeFile(join(agentsDir, filename), content);
  };

  /**
   * Write the manifest file for a run.
   * @param runId - The unique identifier for the run
   * @param content - The manifest content to write
   * @returns ResultAsync resolving to void on success
   */
  const writeManifestFile = (runId: string, content: string): ResultAsync<void, Error> => {
    const { manifestPath } = getRunPaths(runId);
    return fsUtils.writeFile(manifestPath, content);
  };

  return {
    getRunPaths,
    writeAgentCallFile,
    writeManifestFile,
  };
};

// Default instance using the workspace RUNS_DIR
const telemetryIO = createTelemetryIO(RUNS_DIR);

export { telemetryIO, createTelemetryIO, RUNS_DIR };
