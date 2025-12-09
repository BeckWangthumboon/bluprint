import { err, ok, Result, ResultAsync, okAsync } from 'neverthrow';
import { fsUtils } from '../fs.js';
import { createAppError, type AppError } from '../../types/errors.js';
import type { RuleReference, RulesIndex } from '../../types/rules.js';
import type { BluprintConfig } from './config.js';
import { configUtils } from './config.js';
import { isRecord } from '../utils.js';

/**
 * Parses the workspace rules index JSON into a structured RulesIndex without throwing.
 *
 * @param raw - Raw JSON string read from the rules index file.
 * @param sourcePath - Path used for error messaging to guide remediation.
 * @returns Parsed RulesIndex containing normalized rule references; AppError when parse or validation fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const parseRulesIndex = (raw: string, sourcePath: string): Result<RulesIndex, AppError> => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return err(
      createAppError(
        'CONFIG_PARSE_ERROR',
        `Unable to parse rules index at ${sourcePath}: ${(error as Error).message}`,
      ),
    );
  }

  if (!isRecord(parsed)) {
    return err(
      createAppError('CONFIG_PARSE_ERROR', `Rules index at ${sourcePath} must be a JSON object`),
    );
  }

  const rulesValue = parsed.rules ?? [];

  if (!Array.isArray(rulesValue)) {
    return err(
      createAppError(
        'CONFIG_PARSE_ERROR',
        `rules at ${sourcePath} must be an array when provided`,
        { path: sourcePath },
      ),
    );
  }

  const rules: RuleReference[] = [];

  for (const entry of rulesValue) {
    if (
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      typeof entry.description !== 'string' ||
      typeof entry.path !== 'string' ||
      !entry.id.trim() ||
      !entry.description.trim() ||
      !entry.path.trim()
    ) {
      return err(
        createAppError(
          'CONFIG_PARSE_ERROR',
          `${sourcePath} entries must include non-empty id, description, and path strings`,
          { path: sourcePath },
        ),
      );
    }

    if (!Array.isArray(entry.tags)) {
      return err(
        createAppError(
          'CONFIG_PARSE_ERROR',
          `${sourcePath} entries must include a tags array of strings`,
          { path: sourcePath },
        ),
      );
    }

    const tags: string[] = [];
    for (const tag of entry.tags) {
      if (typeof tag !== 'string') {
        return err(
          createAppError('CONFIG_PARSE_ERROR', `${sourcePath} tags must be strings when provided`, {
            path: sourcePath,
          }),
        );
      }

      const trimmedTag = tag.trim();
      if (!trimmedTag) {
        return err(
          createAppError('CONFIG_PARSE_ERROR', `${sourcePath} tags must not include empty values`, {
            path: sourcePath,
          }),
        );
      }

      tags.push(trimmedTag);
    }

    const id = entry.id.trim();
    const description = entry.description.trim();
    const rulePath = entry.path.trim();

    rules.push({
      id,
      description,
      path: rulePath,
      tags,
    });
  }

  return ok({ rules });
};

/**
 * Reads and parses the workspace rules index according to the provided or loaded configuration.
 *
 * @param config - Optional Bluprint configuration. If not provided, loads from workspace.
 * @returns ResultAsync containing the parsed RulesIndex; AppError when missing or invalid.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const loadRulesIndex = (config?: BluprintConfig): ResultAsync<RulesIndex, AppError> => {
  const configResult = config ? okAsync(config) : configUtils.loadConfig();

  return configResult.andThen((cfg) => {
    const indexPath = cfg.workspace.rules.indexPath;

    return fsUtils
      .fsReadFile(indexPath)
      .mapErr((error) => {
        if (error.code === 'FS_NOT_FOUND') {
          return createAppError(
            'CONFIG_NOT_FOUND',
            `Rules index missing at ${indexPath}. Run 'bluprint init' or recreate the workspace.`,
            { path: indexPath },
          );
        }
        return error;
      })
      .andThen((contents) => parseRulesIndex(contents, indexPath));
  });
};

/**
 * Writes the workspace rules index JSON with stable formatting.
 *
 * @param rulesIndex - RulesIndex payload to serialize.
 * @param config - Optional Bluprint configuration. If not provided, loads from workspace.
 * @returns ResultAsync resolving to void on success; AppError when write fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const writeRulesIndex = (
  rulesIndex: RulesIndex,
  config?: BluprintConfig,
): ResultAsync<void, AppError> => {
  const configResult = config ? okAsync(config) : configUtils.loadConfig();

  return configResult.andThen((cfg) =>
    fsUtils.fsWriteFile(cfg.workspace.rules.indexPath, JSON.stringify(rulesIndex, null, 2)),
  );
};

export const workspaceRules = {
  loadRulesIndex,
  parseRulesIndex,
  writeRulesIndex,
};
export type { RulesIndex };
