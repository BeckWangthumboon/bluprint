import path from 'path';
import { Result, ResultAsync, err, errAsync, ok, okAsync } from 'neverthrow';
import type { AppError } from '../../types/errors.js';
import { createAppError } from '../../types/errors.js';
import { fsUtils } from '../fs.js';

const DEFAULT_WORKSPACE_ROOT = '.bluprint';
const CONFIG_FILE_PATH = path.join(DEFAULT_WORKSPACE_ROOT, 'config.json');
const WORKSPACE_VERSION = '0.0.0';

type WorkspaceRulesPaths = {
  root: string;
  indexPath: string;
};

type WorkspaceStatePaths = {
  root: string;
  planPath: string;
  evaluationsRoot: string;
  latestEvaluationPath: string;
};

type WorkspacePaths = {
  root: string;
  specPath: string;
  rules: WorkspaceRulesPaths;
  state: WorkspaceStatePaths;
};

type BluprintConfig = {
  base: string;
  version: string;
  workspace: WorkspacePaths;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// Validates a required string field and returns its trimmed value.
const parseRequiredStringField = (value: unknown, fieldName: string): Result<string, AppError> => {
  if (typeof value !== 'string') {
    return err(
      createAppError(
        'CONFIG_PARSE_ERROR',
        `${CONFIG_FILE_PATH} is missing required string field ${fieldName}`,
      ),
    );
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return err(
      createAppError(
        'CONFIG_PARSE_ERROR',
        `${CONFIG_FILE_PATH} has an empty value for ${fieldName}`,
      ),
    );
  }

  return ok(trimmed);
};

// Validates a required path field and returns its trimmed value.
const parsePathField = (value: unknown, fieldName: string): Result<string, AppError> => {
  if (typeof value !== 'string') {
    return err(
      createAppError(
        'CONFIG_PARSE_ERROR',
        `${CONFIG_FILE_PATH} is missing required string field ${fieldName}`,
      ),
    );
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return err(
      createAppError(
        'CONFIG_PARSE_ERROR',
        `${CONFIG_FILE_PATH} has an empty value for ${fieldName}`,
      ),
    );
  }

  return ok(trimmed);
};

// Derives default workspace-relative paths for rules, state, and spec storage.
const deriveWorkspaceDefaults = (root: string): WorkspacePaths => {
  const rulesRoot = path.join(root, 'rules');
  const stateRoot = path.join(root, 'state');
  const evaluationsRoot = path.join(stateRoot, 'evaluations');
  const specPath = path.join(root, 'spec', 'spec.yaml');

  return {
    root,
    specPath,
    rules: {
      root: rulesRoot,
      indexPath: path.join(rulesRoot, 'index.json'),
    },
    state: {
      root: stateRoot,
      planPath: path.join(stateRoot, 'plan.json'),
      evaluationsRoot,
      latestEvaluationPath: path.join(evaluationsRoot, 'last.json'),
    },
  };
};

// Parses the workspace.rules section with defaults applied.
const parseWorkspaceRules = (
  input: unknown,
  defaults: WorkspaceRulesPaths,
): Result<WorkspaceRulesPaths, AppError> => {
  if (input !== undefined && !isRecord(input)) {
    return err(
      createAppError('CONFIG_PARSE_ERROR', `${CONFIG_FILE_PATH} workspace.rules must be an object`),
    );
  }

  const data = isRecord(input) ? input : {};
  const root = data.root ? parsePathField(data.root, 'workspace.rules.root') : ok(defaults.root);
  if (root.isErr()) {
    return err(root.error);
  }

  const indexPath = data.indexPath
    ? parsePathField(data.indexPath, 'workspace.rules.indexPath')
    : ok(path.join(root.value, 'index.json'));
  if (indexPath.isErr()) {
    return err(indexPath.error);
  }

  return ok({
    root: root.value,
    indexPath: indexPath.value,
  });
};

// Parses the workspace.state section with defaults applied.
const parseWorkspaceState = (
  input: unknown,
  defaults: WorkspaceStatePaths,
): Result<WorkspaceStatePaths, AppError> => {
  if (input !== undefined && !isRecord(input)) {
    return err(
      createAppError('CONFIG_PARSE_ERROR', `${CONFIG_FILE_PATH} workspace.state must be an object`),
    );
  }

  const data = isRecord(input) ? input : {};

  const root = data.root ? parsePathField(data.root, 'workspace.state.root') : ok(defaults.root);
  if (root.isErr()) {
    return err(root.error);
  }

  const planPath = data.planPath
    ? parsePathField(data.planPath, 'workspace.state.planPath')
    : ok(path.join(root.value, 'plan.json'));
  if (planPath.isErr()) {
    return err(planPath.error);
  }

  const evaluationsRoot = data.evaluationsRoot
    ? parsePathField(data.evaluationsRoot, 'workspace.state.evaluationsRoot')
    : ok(path.join(root.value, 'evaluations'));
  if (evaluationsRoot.isErr()) {
    return err(evaluationsRoot.error);
  }

  const latestEvaluationPath = data.latestEvaluationPath
    ? parsePathField(data.latestEvaluationPath, 'workspace.state.latestEvaluationPath')
    : ok(path.join(evaluationsRoot.value, 'last.json'));
  if (latestEvaluationPath.isErr()) {
    return err(latestEvaluationPath.error);
  }

  return ok({
    root: root.value,
    planPath: planPath.value,
    evaluationsRoot: evaluationsRoot.value,
    latestEvaluationPath: latestEvaluationPath.value,
  });
};

// Parses the workspace section, anchoring paths to the provided root.
const parseWorkspaceSection = (workspace: unknown): Result<WorkspacePaths, AppError> => {
  if (workspace !== undefined && !isRecord(workspace)) {
    return err(
      createAppError('CONFIG_PARSE_ERROR', `${CONFIG_FILE_PATH} workspace must be an object`),
    );
  }

  const workspaceData = isRecord(workspace) ? workspace : {};
  const rootResult = workspaceData.root
    ? parsePathField(workspaceData.root, 'workspace.root')
    : ok(DEFAULT_WORKSPACE_ROOT);
  if (rootResult.isErr()) {
    return err(rootResult.error);
  }

  const root = rootResult.value;
  const defaults = deriveWorkspaceDefaults(root);

  const specPathResult = workspaceData.specPath
    ? parsePathField(workspaceData.specPath, 'workspace.specPath')
    : ok(defaults.specPath);
  if (specPathResult.isErr()) {
    return err(specPathResult.error);
  }

  const rulesResult = parseWorkspaceRules(workspaceData.rules, defaults.rules);
  if (rulesResult.isErr()) {
    return err(rulesResult.error);
  }

  const stateResult = parseWorkspaceState(workspaceData.state, defaults.state);
  if (stateResult.isErr()) {
    return err(stateResult.error);
  }

  return ok({
    root,
    specPath: specPathResult.value,
    rules: rulesResult.value,
    state: stateResult.value,
  });
};

// Validates the workspace version string against the current release.
const parseVersion = (value: unknown): Result<string, AppError> => {
  if (value === undefined) {
    return ok(WORKSPACE_VERSION);
  }

  if (typeof value !== 'string' || !value.trim()) {
    return err(
      createAppError(
        'CONFIG_PARSE_ERROR',
        `${CONFIG_FILE_PATH} field version must be a non-empty string when provided`,
      ),
    );
  }

  const trimmed = value.trim();

  if (trimmed !== WORKSPACE_VERSION) {
    return err(
      createAppError(
        'CONFIG_PARSE_ERROR',
        `${CONFIG_FILE_PATH} version must be ${WORKSPACE_VERSION} for the current release`,
        { version: trimmed },
      ),
    );
  }

  return ok(trimmed);
};

/**
 * Parses raw Bluprint configuration JSON into a structured BluprintConfig without throwing.
 *
 * @param raw - Raw JSON string read from the config file.
 * @returns Parsed BluprintConfig with workspace defaults applied; AppError when parse or validation fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
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

  if (!isRecord(parsed)) {
    return err(
      createAppError('CONFIG_PARSE_ERROR', `${CONFIG_FILE_PATH} must contain a JSON object`),
    );
  }

  const baseResult = parseRequiredStringField(parsed.base, 'base');
  if (baseResult.isErr()) {
    return err(baseResult.error);
  }

  const workspaceResult = parseWorkspaceSection(parsed.workspace);
  if (workspaceResult.isErr()) {
    return err(workspaceResult.error);
  }

  const versionResult = parseVersion(parsed.version);
  if (versionResult.isErr()) {
    return err(versionResult.error);
  }

  return ok({
    base: baseResult.value,
    workspace: workspaceResult.value,
    version: versionResult.value,
  });
};

/**
 * Creates a BluprintConfig populated with current workspace defaults for new installations.
 *
 * @param base - Base git branch used as the comparison target; trimmed but otherwise unvalidated.
 * @param repoRoot - Optional repository root to anchor workspace-relative paths.
 * @returns BluprintConfig seeded with the workspace version and default path layout. Never throws.
 */
const createDefaultConfig = (base: string, repoRoot?: string): BluprintConfig => {
  const workspaceRoot =
    repoRoot === undefined
      ? DEFAULT_WORKSPACE_ROOT
      : path.relative(repoRoot, path.join(repoRoot, DEFAULT_WORKSPACE_ROOT)) ||
        DEFAULT_WORKSPACE_ROOT;

  return {
    base: base.trim(),
    workspace: deriveWorkspaceDefaults(workspaceRoot),
    version: WORKSPACE_VERSION,
  };
};

/**
 * Loads the Bluprint configuration from disk and parses it into a BluprintConfig.
 *
 * @returns ResultAsync containing the parsed configuration; AppError when missing or invalid.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const loadConfig = (): ResultAsync<BluprintConfig, AppError> =>
  fsUtils
    .fsReadFile(CONFIG_FILE_PATH)
    .mapErr((error) => {
      if (error.code === 'FS_NOT_FOUND') {
        return createAppError(
          'CONFIG_NOT_FOUND',
          'Bluprint configuration missing. Run `bluprint init` to create .bluprint/.',
          { path: CONFIG_FILE_PATH },
        );
      }
      return error;
    })
    .andThen((contents) => parseConfig(contents));

/**
 * Ensures the workspace folder structure and placeholder files exist according to the config.
 *
 * @param config - Parsed Bluprint configuration controlling workspace locations.
 * @returns ResultAsync resolving to the normalized workspace paths when scaffolding succeeds; AppError otherwise.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const ensureWorkspace = (config: BluprintConfig): ResultAsync<WorkspacePaths, AppError> => {
  const { workspace } = config;

  const ensureFile = (target: string, defaultContent: string): ResultAsync<void, AppError> =>
    fsUtils
      .fsCheckAccess(target)
      .map(() => undefined)
      .orElse((error) => {
        if (error.code !== 'FS_NOT_FOUND') {
          return errAsync(error);
        }
        return fsUtils.fsWriteFile(target, defaultContent);
      });

  return fsUtils
    .fsMkdir(workspace.root)
    .andThen(() => fsUtils.fsMkdir(path.dirname(workspace.specPath)))
    .andThen(() => fsUtils.fsMkdir(workspace.rules.root))
    .andThen(() => fsUtils.fsMkdir(workspace.state.root))
    .andThen(() => fsUtils.fsMkdir(workspace.state.evaluationsRoot))
    .andThen(() => ensureFile(workspace.rules.indexPath, JSON.stringify({ rules: [] }, null, 2)))
    .andThen(() => ensureFile(workspace.state.planPath, '{}\n'))
    .andThen(() => ensureFile(workspace.state.latestEvaluationPath, '{}\n'))
    .andThen(() => okAsync(workspace));
};

/**
 * Writes the Bluprint configuration back to disk using the canonical workspace path.
 *
 * @param config - Bluprint configuration to serialize.
 * @returns ResultAsync resolving to void on success; AppError when write fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const writeConfig = (config: BluprintConfig): ResultAsync<void, AppError> =>
  fsUtils.fsWriteFile(CONFIG_FILE_PATH, JSON.stringify(config, null, 2));

export const configUtils = {
  createDefaultConfig,
  ensureWorkspace,
  loadConfig,
  writeConfig,
};
export type { BluprintConfig, WorkspacePaths, WorkspaceRulesPaths, WorkspaceStatePaths };
