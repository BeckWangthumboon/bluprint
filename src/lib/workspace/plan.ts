import { err, ok, Result, ResultAsync, okAsync } from 'neverthrow';
import { fsUtils } from '../fs.js';
import { createAppError, type AppError } from '../../types/errors.js';
import type { Plan } from '../../types/tasks.js';
import type { BluprintConfig } from './config.js';
import { configUtils } from './config.js';
import { isRecord, safeJsonParse } from '../utils.js';

/**
 * Parses the workspace plan JSON into a structured Plan without throwing.
 *
 * @param raw - Raw JSON string read from the plan file.
 * @param sourcePath - Path used for error messaging to guide remediation.
 * @returns Parsed Plan; AppError when parse or validation fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const parsePlan = (raw: string, sourcePath: string): Result<Plan, AppError> => {
  const parseResult = safeJsonParse(raw);

  if (parseResult.isErr()) {
    return err(
      createAppError(
        'CONFIG_PARSE_ERROR',
        `Unable to parse plan at ${sourcePath}: ${parseResult.error.message}`,
      ),
    );
  }

  const parsed = parseResult.value;

  if (!isRecord(parsed)) {
    return err(createAppError('CONFIG_PARSE_ERROR', `Plan at ${sourcePath} must be a JSON object`));
  }

  // Validate required fields
  if (typeof parsed.id !== 'string' || !parsed.id.trim()) {
    return err(
      createAppError('CONFIG_PARSE_ERROR', `Plan at ${sourcePath} must have a non-empty id string`),
    );
  }

  if (!Array.isArray(parsed.tasks)) {
    return err(
      createAppError('CONFIG_PARSE_ERROR', `Plan at ${sourcePath} must have a tasks array`),
    );
  }

  // Construct Plan object with validated fields
  const plan: Plan = {
    id: parsed.id.trim(),
    tasks: parsed.tasks as Plan['tasks'],
  };

  if (parsed.summary && typeof parsed.summary === 'string') {
    plan.summary = parsed.summary;
  }

  if (Array.isArray(parsed.notes)) {
    plan.notes = parsed.notes as string[];
  }

  return ok(plan);
};

/**
 * Reads and parses the workspace plan according to the provided or loaded configuration.
 *
 * @param config - Optional Bluprint configuration. If not provided, loads from workspace.
 * @returns ResultAsync containing the parsed Plan; AppError when missing or invalid.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const loadPlan = (config?: BluprintConfig): ResultAsync<Plan, AppError> => {
  const configResult = config ? okAsync(config) : configUtils.loadConfig();

  return configResult.andThen((cfg) => {
    const planPath = cfg.workspace.state.planPath;

    return fsUtils
      .fsReadFile(planPath)
      .mapErr((error) => {
        if (error.code === 'FS_NOT_FOUND') {
          return createAppError(
            'CONFIG_NOT_FOUND',
            `Plan missing at ${planPath}. Run 'bluprint plan' to generate a plan.`,
            { path: planPath },
          );
        }
        return error;
      })
      .andThen((contents) => parsePlan(contents, planPath));
  });
};

/**
 * Writes the workspace plan JSON with stable formatting.
 *
 * @param plan - Plan payload to serialize.
 * @param config - Optional Bluprint configuration. If not provided, loads from workspace.
 * @returns ResultAsync resolving to void on success; AppError when write fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const writePlan = (plan: Plan, config?: BluprintConfig): ResultAsync<void, AppError> => {
  const configResult = config ? okAsync(config) : configUtils.loadConfig();

  return configResult.andThen((cfg) =>
    fsUtils.fsWriteFile(cfg.workspace.state.planPath, JSON.stringify(plan, null, 2)),
  );
};

export const workspacePlan = {
  loadPlan,
  writePlan,
};
