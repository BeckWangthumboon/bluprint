import { ResultAsync } from 'neverthrow';
import { workspace } from '../workspace.js';
import { exec } from '../shell.js';
import {
  abortLoop,
  checkLimits,
  completeCurrentTask,
  failLoop,
  incrementIteration,
  initializeState,
  markCurrentTaskAsRetry,
  readState,
  startExecution,
} from '../state.js';
import { executeCodingAgent } from './codingAgent.js';
import { createCommitForTask } from './commitAgent.js';
import { reviewAndGenerateTask } from './masterAgent.js';
import type { MasterAgentOutput } from './types.js';
import { isObject, toError } from './utils.js';
import { purgeAndInitLogger, type ManifestData } from './logger.js';
import { getAbortSignal } from '../exit.js';

const parseMasterOutput = (raw: string): MasterAgentOutput => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse master output JSON: ${toError(error).message}`);
  }

  if (!isObject(parsed)) {
    throw new Error('Master output must be a JSON object');
  }

  const decision = parsed.decision;
  const task = parsed.task;

  switch (decision) {
    case 'reject':
      if (typeof task !== 'string' || task.trim() === '') {
        throw new Error('Master output task must be a non-empty string when decision is "reject"');
      }
      return { decision, task };
    case 'accept':
      return { decision }; // On accept, task is not required
    default:
      throw new Error('Master output decision must be "accept" or "reject"');
  }
};

const unwrapOrThrow = async <T>(result: ResultAsync<T, Error>): Promise<T> => {
  const resolved = await result;
  if (resolved.isErr()) {
    throw resolved.error;
  }
  return resolved.value;
};

export const saveReport = (report: string): ResultAsync<void, Error> =>
  workspace.report.write(report).mapErr((e) => new Error(`Error saving report: ${e.message}`));

export const saveTaskMarkdown = (task: string): ResultAsync<void, Error> =>
  workspace.task.write(task).mapErr((e) => new Error(`Error saving task: ${e.message}`));

export const applyDecision = (
  decision: 'accept' | 'reject',
  commitHash?: string
): ResultAsync<void, Error> => {
  if (decision === 'accept') {
    // Allow empty commit hash for cases where there are no changes to commit
    return completeCurrentTask(commitHash ?? '');
  }
  return markCurrentTaskAsRetry();
};

/**
 * Main execution loop for the agent system.
 *
 * This function orchestrates the entire agent workflow:
 * 1. Reads and validates spec.md, plan.md, and summary.md files
 * 2. Initializes the execution state and starts the session
 * 3. Enters a continuous loop that:
 *    - Checks execution limits (iterations, tokens, etc.)
 *    - Executes the coding agent to work on the current task
 *    - Reviews the work and generates the next task via the master agent
 *    - Applies the decision (accept/reject) and creates commits if accepted
 *    - Increments the iteration counter
 *    - Exits when the plan is completed or limits are exceeded
 *
 * The loop handles errors gracefully by marking the state as failed
 * if an error occurs after initialization.
 *
 * @param sig - Optional AbortSignal to cancel the loop. Defaults to global abort signal.
 * @returns A ResultAsync that resolves when the loop completes successfully
 *          or rejects with an error if limits are exceeded or an error occurs
 */
export const runLoop = (sig?: AbortSignal): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(
    (async () => {
      const signal = sig ?? getAbortSignal();

      let stateInitialized = false;
      let loopFailed = false;
      let loopAborted = false;
      let iteration = 0;
      const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const startedAt = new Date();

      // Initialize manifest data for tracking
      const manifestData: ManifestData = {
        runId,
        startedAt,
        status: 'in_progress',
        totalIterations: 0,
        inputSizes: { spec: 0, plan: 0, summary: 0 },
        iterations: [],
      };

      // Purge old logs and initialize new logger
      const logger = await purgeAndInitLogger(runId);

      const writeManifestSafe = async (
        status: ManifestData['status'],
        error?: string
      ): Promise<void> => {
        manifestData.status = status;
        manifestData.endedAt = new Date();
        manifestData.totalIterations = iteration;
        if (error) manifestData.error = error;
        await logger.writeManifest(manifestData);
      };

      try {
        // Load inputs
        const [spec, plan, summary] = await unwrapOrThrow(
          ResultAsync.combine([
            workspace.spec.read().mapErr((e) => new Error(`Could not read spec.md: ${e.message}`)),
            workspace.plan.read().mapErr((e) => new Error(`Could not read plan.md: ${e.message}`)),
            workspace.summary
              .read()
              .mapErr((e) => new Error(`Could not read summary.md: ${e.message}`)),
          ])
        );

        manifestData.inputSizes = {
          spec: spec.length,
          plan: plan.length,
          summary: summary.length,
        };

        if (!spec.trim()) {
          throw new Error('spec.md is empty. Please add a specification first.');
        }

        if (!plan.trim()) {
          throw new Error('plan.md is empty. Please generate a plan first.');
        }

        if (!summary.trim()) {
          throw new Error('summary.md is empty. Please generate a summary first.');
        }

        // Initialize state
        await unwrapOrThrow(initializeState());
        stateInitialized = true;
        await unwrapOrThrow(startExecution());
        await unwrapOrThrow(workspace.task.write(''));
        await unwrapOrThrow(workspace.report.write(''));
        await logger.writeManifest(manifestData);

        // Check for abort before entering main loop
        if (signal.aborted) {
          loopAborted = true;
          await writeManifestSafe('aborted', 'Operation aborted before starting');
          await abortLoop();
          return;
        }

        // Main loop
        while (true) {
          if (signal.aborted) {
            loopAborted = true;
            await writeManifestSafe('aborted', 'Operation aborted');
            await abortLoop();
            return;
          }

          iteration += 1;

          // Get current plan step from state
          const currentState = await unwrapOrThrow(readState());
          const planStep = currentState.currentTaskNumber;

          const iterationData: ManifestData['iterations'][0] = { iteration, planStep };

          // Check limits
          const limits = await unwrapOrThrow(checkLimits());
          if (limits.exceeded) {
            await unwrapOrThrow(failLoop());
            loopFailed = true;
            throw new Error(limits.reason ?? 'Loop limits exceeded');
          }

          // Execute coding agent
          const codingStartedAt = Date.now();
          const report = await unwrapOrThrow(executeCodingAgent(iteration, signal));
          await unwrapOrThrow(saveReport(report));
          iterationData.codingDurationMs = Date.now() - codingStartedAt;

          await exec('git', ['restore', '--staged', '.']).unwrapOr(undefined);

          // Master review
          const reviewStartedAt = Date.now();
          const reviewRaw = await unwrapOrThrow(reviewAndGenerateTask(iteration, signal));
          const reviewOutput = parseMasterOutput(reviewRaw);
          iterationData.masterDurationMs = Date.now() - reviewStartedAt;
          iterationData.decision = reviewOutput.decision;

          // Handle decision
          if (reviewOutput.decision === 'accept') {
            const commitResult = await unwrapOrThrow(createCommitForTask(iteration, signal));
            if (commitResult) {
              iterationData.commit = {
                hash: commitResult.hash,
                message: commitResult.message,
              };
            }

            await unwrapOrThrow(applyDecision('accept', commitResult?.hash));

            // Track iteration
            manifestData.iterations.push(iterationData);
            manifestData.totalIterations = iteration;
            await logger.writeManifest(manifestData);

            await unwrapOrThrow(incrementIteration());

            // Check if all tasks are completed
            const state = await unwrapOrThrow(readState());
            if (state.status === 'completed') {
              await writeManifestSafe('completed');
              return;
            }

            await unwrapOrThrow(saveTaskMarkdown(''));
          } else {
            // On reject, save the correction instructions to task.md
            await unwrapOrThrow(saveTaskMarkdown(reviewOutput.task));
            await unwrapOrThrow(applyDecision('reject'));

            // Track iteration
            manifestData.iterations.push(iterationData);
            manifestData.totalIterations = iteration;
            await logger.writeManifest(manifestData);

            await unwrapOrThrow(incrementIteration());
          }
        }
      } catch (error) {
        const errorMessage = toError(error).message;
        const isAbortError = errorMessage === 'Operation aborted' || signal.aborted;

        if (isAbortError && !loopAborted) {
          loopAborted = true;
          await writeManifestSafe('aborted', 'Operation aborted');
          if (stateInitialized) {
            await abortLoop();
          }
          return;
        }

        await writeManifestSafe('failed', errorMessage);

        if (stateInitialized && !loopFailed && !loopAborted) {
          const failResult = await failLoop();
          if (failResult.isErr()) {
          }
        }
        throw error;
      }
    })(),
    toError
  );
