import { resolve } from 'path';
import { workspace, workspaceConstants, getRunFilePaths, hydrateCacheFromRun } from '../workspace.js';
import { fsUtils } from '../fs.js';
import { generatePlan, type PlanAgentConfig } from '../agent/planAgent.js';
import { runLoop } from '../orchestration/index.js';
import {
  resolveRuntimeConfig,
  getTimeoutMs,
  formatResolveError,
  configUtils,
  DEFAULT_GENERAL_CONFIG,
} from '../config/index.js';
import { exit } from '../exit.js';
import { graphite } from '../git/index.js';
import { exec } from '../shell.js';

export interface RunOptions {
  spec?: string;
  planOnly: boolean;
  buildOnly: boolean;
  preset?: string;
  graphite?: boolean;
  resume?: string;
}

/**
 * Resolves the spec file path based on CLI flag or config.
 *
 * Priority:
 * 1. CLI --spec flag (if provided)
 * 2. Config specFile value (defaults to 'spec.md' if not configured)
 *
 * @param cliSpec - Optional spec path from CLI flag
 * @returns The resolved absolute path to the spec file
 */
async function resolveSpecPath(cliSpec?: string): Promise<string> {
  if (cliSpec) {
    return resolve(cliSpec);
  }

  const configResult = await configUtils.bluprint.read();
  const specFile = configResult.isOk()
    ? configResult.value.specFile
    : DEFAULT_GENERAL_CONFIG.specFile;

  return resolve(specFile);
}

const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const isValidRunId = (runId: string): boolean =>
  runId.trim() === runId &&
  runId !== '' &&
  runId !== '.' &&
  runId !== '..' &&
  RUN_ID_PATTERN.test(runId);

const ensureResumeFiles = async (runId: string): Promise<Error | null> => {
  const runFiles = getRunFilePaths(runId);
  const requiredFiles = [
    { name: 'spec.md', path: runFiles.spec },
    { name: 'plan.md', path: runFiles.plan },
    { name: 'summary.md', path: runFiles.summary },
    { name: 'state.json', path: runFiles.state },
  ];

  const missing: string[] = [];
  for (const file of requiredFiles) {
    const existsResult = await fsUtils.fileExists(file.path);
    if (existsResult.isErr()) {
      return new Error(`Could not access ${file.name}: ${existsResult.error.message}`);
    }
    if (!existsResult.value) {
      missing.push(file.name);
    }
  }

  if (missing.length > 0) {
    return new Error(`Run ${runId} is missing: ${missing.join(', ')}`);
  }

  return null;
};

const resetWorktree = async (): Promise<Error | null> => {
  const restoreStagedResult = await exec('git', ['restore', '--staged', '.']);
  if (restoreStagedResult.isErr()) {
    return new Error(`git restore --staged failed: ${restoreStagedResult.error.message}`);
  }

  const restoreResult = await exec('git', ['restore', '.']);
  if (restoreResult.isErr()) {
    return new Error(`git restore failed: ${restoreResult.error.message}`);
  }

  const cleanResult = await exec('git', ['clean', '-fd']);
  if (cleanResult.isErr()) {
    return new Error(`git clean -fd failed: ${cleanResult.error.message}`);
  }

  return null;
};

/**
 * Handles the unified "run" CLI command.
 *
 * This function:
 * 1. Resolves the spec file path (CLI flag > config)
 * 2. Moves the spec file into the cache directory
 * 3. Runs the plan phase (unless --build-only)
 * 4. Runs the build phase (unless --plan-only)
 *
 * @param options - Command options
 */
export async function handleRun(options: RunOptions): Promise<void> {
  const resumeRunId = options.resume?.trim();
  const isResume = options.resume !== undefined;

  if (isResume && (options.spec || options.planOnly || options.buildOnly)) {
    console.error('Error: --resume cannot be used with --spec, --plan, or --build.');
    await exit(1);
    return;
  }

  if (isResume && (!resumeRunId || !isValidRunId(resumeRunId))) {
    console.error('Error: --resume requires a valid run ID (alphanumeric start, then alphanumeric/._-).');
    await exit(1);
    return;
  }

  const configResult = await resolveRuntimeConfig(options.preset);
  if (configResult.isErr()) {
    console.error('Error:', formatResolveError(configResult.error));
    await exit(1);
    return;
  }
  const resolved = configResult.value;
  const graphiteEnabled = options.graphite ?? resolved.graphite.enabled;

  if (!options.planOnly && graphiteEnabled) {
    const gtAvailableResult = await graphite.isGraphiteAvailable();
    if (gtAvailableResult.isErr() || !gtAvailableResult.value) {
      console.error('Error: Graphite CLI (gt) is required but not available.');
      console.error('Please install Graphite CLI or disable the --graphite flag.');
      await exit(1);
      return;
    }
  }

  if (isResume) {
    const ensureResult = await ensureResumeFiles(resumeRunId!);
    if (ensureResult) {
      console.error(`Error: ${ensureResult.message}`);
      await exit(1);
      return;
    }

    const hydrateResult = await hydrateCacheFromRun(resumeRunId!);
    if (hydrateResult.isErr()) {
      console.error(`Error: Could not hydrate cache: ${hydrateResult.error.message}`);
      await exit(1);
      return;
    }

    const clearTaskResult = await workspace.cache.task.write('');
    if (clearTaskResult.isErr()) {
      console.error(`Error: Could not clear task.md: ${clearTaskResult.error.message}`);
      await exit(1);
      return;
    }

    const clearReportResult = await workspace.cache.report.write('');
    if (clearReportResult.isErr()) {
      console.error(`Error: Could not clear report.md: ${clearReportResult.error.message}`);
      await exit(1);
      return;
    }

    const resetResult = await resetWorktree();
    if (resetResult) {
      console.error(`Error: Could not reset worktree: ${resetResult.message}`);
      await exit(1);
      return;
    }
  } else if (!options.buildOnly) {
    const specPath = await resolveSpecPath(options.spec);

    const readResult = await fsUtils.readFile(specPath);
    if (readResult.isErr()) {
      console.error(`Error: Could not read spec file at ${specPath}: ${readResult.error.message}`);
      await exit(1);
      return;
    }

    if (!readResult.value.trim()) {
      console.error(`Error: Spec file at ${specPath} is empty.`);
      await exit(1);
      return;
    }

    const moveResult = await fsUtils.moveFile(specPath, workspaceConstants.SPEC_FILE);
    if (moveResult.isErr()) {
      console.error(`Error: Could not move spec to cache: ${moveResult.error.message}`);
      await exit(1);
      return;
    }
  }

  if (!isResume && !options.buildOnly) {
    const planConfig: PlanAgentConfig = {
      planModel: resolved.preset.plan,
      planTimeoutMs: getTimeoutMs(resolved.timeouts, 'plan'),
      summarizerModel: resolved.preset.summarizer,
      summarizerTimeoutMs: getTimeoutMs(resolved.timeouts, 'summarizer'),
    };
    const planResult = await generatePlan(planConfig);
    if (planResult.isErr()) {
      console.error('Error:', planResult.error.message);
      await exit(1);
      return;
    }
  }

  if (!options.planOnly) {
    const buildResult = await runLoop({
      config: {
        preset: options.preset,
        graphite: graphiteEnabled,
      },
      resume: isResume ? { runId: resumeRunId! } : undefined,
    });
    if (buildResult.isErr()) {
      console.error('Error:', buildResult.error.message);
      await exit(1);
      return;
    }
  }

  await exit(0);
}
