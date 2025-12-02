import { err, ok, Result, ResultAsync } from 'neverthrow';
import { fsUtils } from '../fs.js';
import { createAppError, type AppError } from '../../types/errors.js';
import type { RuleReference, RulesIndex } from '../../types/rules.js';
import type { BluprintConfig } from './config.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

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

    const hasName = entry.name !== undefined;
    if (hasName && typeof entry.name !== 'string') {
      return err(
        createAppError(
          'CONFIG_PARSE_ERROR',
          `${sourcePath} entries must include a string name when provided`,
          { path: sourcePath },
        ),
      );
    }

    const id = entry.id.trim();
    const description = entry.description.trim();
    const rulePath = entry.path.trim();
    const name = hasName ? (entry.name as string).trim() : undefined;

    if (name !== undefined && name.length === 0) {
      return err(
        createAppError(
          'CONFIG_PARSE_ERROR',
          `${sourcePath} entries must not include empty name values`,
          { path: sourcePath },
        ),
      );
    }

    rules.push({
      id,
      description,
      path: rulePath,
      name,
    });
  }

  return ok({ rules });
};

/**
 * Reads and parses the workspace rules index according to the provided configuration.
 *
 * @param config - Parsed Bluprint configuration supplying the rules index location.
 * @returns ResultAsync containing the parsed RulesIndex; AppError when missing or invalid.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const loadRulesIndex = (config: BluprintConfig): ResultAsync<RulesIndex, AppError> => {
  const indexPath = config.workspace.rules.indexPath;

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
};

/**
 * Writes the workspace rules index JSON with stable formatting.
 *
 * @param config - Parsed Bluprint configuration supplying the rules index location.
 * @param rulesIndex - RulesIndex payload to serialize.
 * @returns ResultAsync resolving to void on success; AppError when write fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const writeRulesIndex = (
  config: BluprintConfig,
  rulesIndex: RulesIndex,
): ResultAsync<void, AppError> =>
  fsUtils.fsWriteFile(config.workspace.rules.indexPath, JSON.stringify(rulesIndex, null, 2));

export const workspaceRules = {
  loadRulesIndex,
  parseRulesIndex,
  writeRulesIndex,
};
export type { RulesIndex };
