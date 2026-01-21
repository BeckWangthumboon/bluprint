import { join } from 'path';
import { ResultAsync } from 'neverthrow';
import { fsUtils } from '../fs.js';
import { workspaceConstants } from '../workspace.js';

const { RUNS_DIR } = workspaceConstants;

/**
 * Get the paths for a run's telemetry files.
 * @param runId - The unique identifier for the run
 * @returns Object containing runDir, agentsDir, and manifestPath
 */
const getRunPaths = (runId: string) => ({
  runDir: join(RUNS_DIR, runId),
  agentsDir: join(RUNS_DIR, runId, 'agents'),
  manifestPath: join(RUNS_DIR, runId, 'manifest.md'),
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

const telemetryIO = {
  getRunPaths,
  writeAgentCallFile,
  writeManifestFile,
};

export { telemetryIO, RUNS_DIR };
