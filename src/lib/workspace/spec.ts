import { ResultAsync } from 'neverthrow';
import { loadSpecification } from '../spec.js';
import { createAppError, type AppError } from '../../types/errors.js';
import type { BluprintConfig } from './config.js';
import type { Specification } from '../../types/spec.js';

/**
 * Loads the specification file referenced by the provided Bluprint configuration.
 *
 * @param config - Parsed Bluprint configuration specifying the spec path.
 * @returns ResultAsync containing the parsed Specification; AppError when the spec file is missing or invalid.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const loadWorkspaceSpec = (config: BluprintConfig): ResultAsync<Specification, AppError> =>
  loadSpecification(config.workspace.specPath).mapErr((error) => {
    if (error.code === 'FS_NOT_FOUND') {
      return createAppError(
        'CONFIG_NOT_FOUND',
        `Specification file '${config.workspace.specPath}' is missing. Run 'bluprint init' to recreate it.`,
        { specPath: config.workspace.specPath },
      );
    }
    return error;
  });

export const workspaceSpecUtils = {
  loadWorkspaceSpec,
};
