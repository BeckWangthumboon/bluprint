import { resolve } from 'path';
import { workspaceConstants } from '../workspace.js';
import { fsUtils } from '../fs.js';
import { generatePlan, type PlanAgentConfig } from '../agent/planAgent.js';
import { runLoop } from '../agent/loop.js';
import {
  resolveRuntimeConfig,
  getTimeoutMs,
  formatResolveError,
  configUtils,
  DEFAULT_GENERAL_CONFIG,
} from '../config/index.js';
import { exit } from '../exit.js';
import { graphite } from '../agent/graphite.js';

export interface RunOptions {
  spec?: string;
  planOnly: boolean;
  buildOnly: boolean;
  preset?: string;
  graphite?: boolean;
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

  if (!options.buildOnly) {
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

  if (!options.buildOnly) {
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
    });
    if (buildResult.isErr()) {
      console.error('Error:', buildResult.error.message);
      await exit(1);
      return;
    }
  }

  await exit(0);
}
