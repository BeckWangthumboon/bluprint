import { err, ok, Result, ResultAsync, okAsync } from 'neverthrow';
import { fsUtils } from '../fs.js';
import { createAppError, type AppError } from '../../types/errors.js';
import type { CodebaseFileEntry, CodebaseIndex } from '../../types/codebase.js';
import type { BluprintConfig } from './config.js';
import { configUtils } from './config.js';
import { isRecord } from '../utils.js';

/**
 * Parses the codebase index JSON into a structured CodebaseIndex without throwing.
 *
 * @param raw - Raw JSON string read from the index file.
 * @param sourcePath - Path used for error messaging to guide remediation.
 * @returns Parsed CodebaseIndex containing file entries; AppError when parse or validation fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const parseCodebaseIndex = (raw: string, sourcePath: string): Result<CodebaseIndex, AppError> => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return err(
      createAppError(
        'CONFIG_PARSE_ERROR',
        `Unable to parse codebase index at ${sourcePath}: ${(error as Error).message}`,
      ),
    );
  }

  if (!isRecord(parsed)) {
    return err(
      createAppError('CONFIG_PARSE_ERROR', `Codebase index at ${sourcePath} must be a JSON object`),
    );
  }

  // Validate generatedAt field
  if (typeof parsed.generatedAt !== 'string' || !parsed.generatedAt.trim()) {
    return err(
      createAppError(
        'CONFIG_PARSE_ERROR',
        `Codebase index at ${sourcePath} must include a non-empty generatedAt string`,
        { path: sourcePath },
      ),
    );
  }

  // Validate files array
  const filesValue = parsed.files ?? [];

  if (!Array.isArray(filesValue)) {
    return err(
      createAppError(
        'CONFIG_PARSE_ERROR',
        `files at ${sourcePath} must be an array when provided`,
        { path: sourcePath },
      ),
    );
  }

  const files: CodebaseFileEntry[] = [];

  for (const entry of filesValue) {
    if (
      !isRecord(entry) ||
      typeof entry.path !== 'string' ||
      typeof entry.description !== 'string' ||
      !entry.path.trim()
    ) {
      return err(
        createAppError(
          'CONFIG_PARSE_ERROR',
          `${sourcePath} entries must include non-empty path string and description string`,
          { path: sourcePath },
        ),
      );
    }

    files.push({
      path: entry.path.trim(),
      description: entry.description.trim(),
    });
  }

  return ok({
    generatedAt: parsed.generatedAt.trim(),
    files,
  });
};

/**
 * Reads and parses the codebase index according to the provided or loaded configuration.
 *
 * @param config - Optional Bluprint configuration. If not provided, loads from workspace.
 * @returns ResultAsync containing the parsed CodebaseIndex; AppError when missing or invalid.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const loadCodebaseIndex = (config?: BluprintConfig): ResultAsync<CodebaseIndex, AppError> => {
  const configResult = config ? okAsync(config) : configUtils.loadConfig();

  return configResult.andThen((cfg) => {
    const indexPath = cfg.workspace.codebase.semanticIndexPath;

    return fsUtils
      .fsReadFile(indexPath)
      .mapErr((error) => {
        if (error.code === 'FS_NOT_FOUND') {
          return createAppError(
            'CONFIG_NOT_FOUND',
            `Codebase index missing at ${indexPath}. Run 'bluprint index' to create it.`,
            { path: indexPath },
          );
        }
        return error;
      })
      .andThen((contents) => parseCodebaseIndex(contents, indexPath));
  });
};

/**
 * Writes the codebase index JSON with stable formatting.
 *
 * @param codebaseIndex - CodebaseIndex payload to serialize.
 * @param config - Optional Bluprint configuration. If not provided, loads from workspace.
 * @returns ResultAsync resolving to void on success; AppError when write fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const writeCodebaseIndex = (
  codebaseIndex: CodebaseIndex,
  config?: BluprintConfig,
): ResultAsync<void, AppError> => {
  const configResult = config ? okAsync(config) : configUtils.loadConfig();

  return configResult.andThen((cfg) =>
    fsUtils.fsWriteFile(
      cfg.workspace.codebase.semanticIndexPath,
      JSON.stringify(codebaseIndex, null, 2),
    ),
  );
};

export const workspaceCodebase = {
  loadCodebaseIndex,
  parseCodebaseIndex,
  writeCodebaseIndex,
};
export type { CodebaseIndex };
