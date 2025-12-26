import { ResultAsync } from 'neverthrow';
import { workspace } from '../workspace.js';
import {
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

  if (decision !== 'accept' && decision !== 'reject') {
    throw new Error('Master output decision must be "accept" or "reject"');
  }

  if (typeof task !== 'string' || task.trim() === '') {
    throw new Error('Master output task must be a non-empty string');
  }

  return { decision, task };
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
 * @returns A ResultAsync that resolves when the loop completes successfully
 *          or rejects with an error if limits are exceeded or an error occurs
 */
export const runLoop = (): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(
    (async () => {
      let stateInitialized = false;
      let loopFailed = false;

      try {
        const [spec, plan, summary] = await unwrapOrThrow(
          ResultAsync.combine([
            workspace.spec.read().mapErr((e) => new Error(`Could not read spec.md: ${e.message}`)),
            workspace.plan.read().mapErr((e) => new Error(`Could not read plan.md: ${e.message}`)),
            workspace.summary
              .read()
              .mapErr((e) => new Error(`Could not read summary.md: ${e.message}`)),
          ])
        );

        if (!spec.trim()) {
          throw new Error('spec.md is empty. Please add a specification first.');
        }

        if (!plan.trim()) {
          throw new Error('plan.md is empty. Please generate a plan first.');
        }

        if (!summary.trim()) {
          throw new Error('summary.md is empty. Please generate a summary first.');
        }

        await unwrapOrThrow(initializeState());
        stateInitialized = true;
        await unwrapOrThrow(startExecution());
        await unwrapOrThrow(workspace.task.write(''));
        await unwrapOrThrow(workspace.report.write(''));

        const seedRaw = await unwrapOrThrow(reviewAndGenerateTask());
        const seedOutput = parseMasterOutput(seedRaw);
        await unwrapOrThrow(saveTaskMarkdown(seedOutput.task));

        while (true) {
          const limits = await unwrapOrThrow(checkLimits());
          if (limits.exceeded) {
            await unwrapOrThrow(failLoop());
            loopFailed = true;
            throw new Error(limits.reason ?? 'Loop limits exceeded');
          }

          const report = await unwrapOrThrow(executeCodingAgent());
          await unwrapOrThrow(saveReport(report));

          const reviewRaw = await unwrapOrThrow(reviewAndGenerateTask());
          const reviewOutput = parseMasterOutput(reviewRaw);
          await unwrapOrThrow(saveTaskMarkdown(reviewOutput.task));

          if (reviewOutput.decision === 'accept') {
            const commitHash = await unwrapOrThrow(createCommitForTask());
            await unwrapOrThrow(applyDecision('accept', commitHash));
          } else {
            await unwrapOrThrow(applyDecision('reject'));
          }

          await unwrapOrThrow(incrementIteration());

          const state = await unwrapOrThrow(readState());
          if (state.status === 'completed') {
            return;
          }
        }
      } catch (error) {
        if (stateInitialized && !loopFailed) {
          const failResult = await failLoop();
          if (failResult.isErr()) {
            console.error('Failed to mark loop as failed:', failResult.error.message);
          }
        }
        throw error;
      }
    })(),
    toError
  );
