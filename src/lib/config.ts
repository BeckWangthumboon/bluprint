import { Result, err, ok, ResultAsync } from 'neverthrow';
import type { AppError } from '../types/errors.js';
import { createAppError } from '../types/errors.js';
import { fsUtils } from '../lib/fs.js';
import { loadSpecification } from '../lib/spec.js';

const CONFIG_FILE_PATH = '.bluprint/config.json';

type BluprintConfig = {
  base: string;
  specPath: string;
};

const parseConfig = (raw: string): Result<BluprintConfig, AppError> => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return err(
      createAppError(
        'CONFIG_PARSE_ERROR',
        `Unable to parse ${CONFIG_FILE_PATH}: ${(error as Error).message}`,
      ),
    );
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    typeof (parsed as Record<string, unknown>).base !== 'string' ||
    typeof (parsed as Record<string, unknown>).specPath !== 'string'
  ) {
    return err(
      createAppError(
        'CONFIG_PARSE_ERROR',
        `${CONFIG_FILE_PATH} must include string base and specPath fields`,
      ),
    );
  }

  const base = (parsed as Record<string, unknown>).base as string;
  const specPath = (parsed as Record<string, unknown>).specPath as string;

  if (!base.trim()) {
    return err(
      createAppError('CONFIG_PARSE_ERROR', `${CONFIG_FILE_PATH} has an empty base branch value`),
    );
  }

  if (!specPath.trim()) {
    return err(
      createAppError('CONFIG_PARSE_ERROR', `${CONFIG_FILE_PATH} has an empty specPath value`),
    );
  }

  return ok({ base: base.trim(), specPath: specPath.trim() });
};

const loadConfig = (): ResultAsync<BluprintConfig, AppError> =>
  fsUtils
    .fsReadFile(CONFIG_FILE_PATH)
    .mapErr((error) => {
      if (error.code === 'FS_NOT_FOUND') {
        return createAppError(
          'CONFIG_NOT_FOUND',
          'Bluprint configuration missing. Run `bluprint init` first.',
          { path: CONFIG_FILE_PATH },
        );
      }
      return error;
    })
    .andThen((contents) => parseConfig(contents));

const loadSpec = (specPath: string) =>
  loadSpecification(specPath).mapErr((error) => {
    if (error.code === 'FS_NOT_FOUND') {
      return createAppError(
        'CONFIG_NOT_FOUND',
        `Specification file '${specPath}' is missing. Run 'bluprint init' to recreate it.`,
        { specPath },
      );
    }
    return error;
  });
