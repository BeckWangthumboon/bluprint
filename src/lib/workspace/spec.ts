import { ResultAsync, okAsync } from 'neverthrow';
import { loadSpecification } from '../spec.js';
import { createAppError, type AppError } from '../../types/errors.js';
import type { BluprintConfig } from './config.js';
import { configUtils } from './config.js';
import type { Specification } from '../../types/spec.js';

/**
 * Loads the specification file referenced by the provided or loaded Bluprint configuration.
 *
 * @param config - Optional Bluprint configuration. If not provided, loads from workspace.
 * @returns ResultAsync containing the parsed Specification; AppError when the spec file is missing or invalid.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const loadWorkspaceSpec = (config?: BluprintConfig): ResultAsync<Specification, AppError> => {
  const configResult = config ? okAsync(config) : configUtils.loadConfig();

  return configResult.andThen((cfg) =>
    loadSpecification(cfg.workspace.specPath).mapErr((error) => {
      if (error.code === 'FS_NOT_FOUND') {
        return createAppError(
          'CONFIG_NOT_FOUND',
          `Specification file '${cfg.workspace.specPath}' is missing. Run 'bluprint init' to recreate it.`,
          { specPath: cfg.workspace.specPath },
        );
      }
      return error;
    }),
  );
};

export const workspaceSpecUtils = {
  loadWorkspaceSpec,
};
