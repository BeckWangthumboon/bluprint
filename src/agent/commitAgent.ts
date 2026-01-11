import { ResultAsync, err, ok } from 'neverthrow';
import { exec } from '../shell.js';
import {
  parseTextResponse,
  toError,
  loadPromptFile,
  unwrapResultAsync,
  cleanupSession,
  withTimeout,
} from './utils.js';
import { readState } from '../state.js';
import { workspace } from '../workspace.js';
import { getPlanStep, extractPlanOutline } from './planUtils.js';
import { getOpenCodeLib, abortAndCleanup } from './opencodesdk.js';
import type { ModelConfig } from '../config/index.js';
import { graphite } from './graphite.js';

export interface CommitAgentConfig {
  model: ModelConfig;
  timeoutMs: number;
  graphite: boolean;
}

export interface CommitResult {
  hash: string;
  message: string;
}

/**
 * Stages all changes and retrieves git status and diff
 */
const stageAndGetGitInfo = (): ResultAsync<
  { gitStatus: string; gitDiff: string } | null,
  Error
> => {
  return exec('git', ['status', '--short'])
    .andThen((result) => {
      const gitStatus = result.stdout.trim();
      if (!gitStatus) {
        return ResultAsync.fromSafePromise(Promise.resolve(null));
      }

      return exec('git', ['add', '-A']).map(() => gitStatus);
    })
    .andThen((gitStatus) => {
      if (!gitStatus) {
        return ResultAsync.fromSafePromise(Promise.resolve(null));
      }

      return exec('git', ['diff', '--cached'])
        .map((diffResult) => ({
          gitStatus,
          gitDiff: diffResult.stdout,
        }))
        .orElse(() => ResultAsync.fromSafePromise(Promise.resolve({ gitStatus, gitDiff: '' })));
    });
};

/**
 * Generates a commit message using the commit agent
 */
const generateCommitMessage = (
  systemPrompt: string,
  currentStep: string,
  gitStatus: string,
  gitDiff: string,
  model: ModelConfig,
  iteration: number,
  signal: AbortSignal,
  timeoutMs: number
): ResultAsync<string, Error> => {
  // remove the "## N" header from plan step
  const stepContent = currentStep.replace(/^##\s+\d+\s+[^\n]*\n/, '').trim();

  const userPrompt = `# Current Plan Step (for context)
 ${stepContent}

# Git Status
 \`\`\`
 ${gitStatus}
 \`\`\`

# Git Diff (Staged Changes)
 \`\`\`diff
 ${gitDiff || '(no diff available)'}
 \`\`\`

Generate a commit message based on the CODE CHANGES shown in the diff.
The plan step is provided for context, but your commit message should describe what code changed, not the task itself.

If you need more context about any files, use your tools to read them.`;

  return getOpenCodeLib().andThen((lib) =>
    lib.session.create('Commit Message Generation').andThen((session) => {
      return ResultAsync.fromPromise(
        withTimeout(
          unwrapResultAsync(
            session.prompt({
              agent: 'plan',
              model,
              system: systemPrompt,
              parts: [
                {
                  type: 'text',
                  text: userPrompt,
                },
              ],
            })
          ),
          {
            ms: timeoutMs,
            label: `Commit agent prompt (iteration ${iteration})`,
            signal,
            onTimeout: () => abortAndCleanup(session),
            onAbort: () => abortAndCleanup(session),
          }
        ),
        toError
      )
        .andThen((promptResponse) =>
          parseTextResponse(
            { data: promptResponse },
            {
              invalidResponseMessage: 'Failed to generate commit message: No response from model',
              emptyResponseMessage: 'No text content in response',
              trim: true,
            }
          )
        )
        .andThen((commitMessage) =>
          cleanupSession(session, 'commitAgent', iteration).map(() => commitMessage)
        )
        .orElse((error) =>
          cleanupSession(session, 'commitAgent', iteration).andThen(() => err(error))
        );
    })
  );
};

/**
 * Commits the staged changes and returns the commit hash and cleaned message
 */
const performNormalCommit = (commitMessage: string): ResultAsync<CommitResult, Error> => {
  const cleanMessage = commitMessage
    .replace(/^```[^\n]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  return exec('git', ['commit', '-m', cleanMessage])
    .andThen(() => exec('git', ['rev-parse', 'HEAD']))
    .map((result) => ({
      hash: result.stdout.trim(),
      message: cleanMessage,
    }))
    .mapErr((error) => new Error(`Failed to commit: ${error.message}`));
};

/**
 * Creates a stacked branch via Graphite CLI.
 * Note: gt create automatically commits staged changes.
 *
 * Falls back to normal commit if Graphite fails.
 */
const performGraphiteCommit = (
  commitMessage: string,
  stepNumber: number,
  stepTitle: string
): ResultAsync<CommitResult, Error> => {
  const cleanMessage = commitMessage
    .replace(/^```[^\n]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  return graphite
    .createStackedBranchForStep(stepNumber, stepTitle, cleanMessage)
    .andThen((branchName) => {
      console.log(`[graphite] Created stacked branch: ${branchName}`);
      return exec('git', ['rev-parse', 'HEAD']).map((result) => ({
        hash: result.stdout.trim(),
        message: cleanMessage,
      }));
    })
    .orElse((error) => {
      console.warn(
        `[graphite] Failed to create stacked branch: ${error.message}. Falling back to normal commit.`
      );
      return performNormalCommit(commitMessage);
    });
};

/**
 * Creates a commit for the current task by reviewing uncommitted changes
 * and the current plan step. Returns the commit result with hash and message,
 * or null if there are no changes to commit.
 * @param iteration - The current loop iteration number
 * @param signal - AbortSignal to cancel the operation
 * @param config - Resolved runtime configuration containing model and timeout settings
 */
const createCommitForTask = (
  iteration: number,
  signal: AbortSignal,
  config: CommitAgentConfig
): ResultAsync<CommitResult | null, Error> => {
  const model = config.model;

  return stageAndGetGitInfo().andThen((gitInfo) => {
    if (!gitInfo) {
      return ok(null);
    }

    const { gitStatus, gitDiff } = gitInfo;

    return readState()
      .andThen((state) =>
        workspace.cache.plan
          .read()
          .mapErr((e) => new Error(`Could not read plan.md: ${e.message}`))
          .map((plan) => ({ state, plan }))
      )
      .andThen(({ state, plan }) =>
        getPlanStep(plan, state.currentTaskNumber, {
          missingStep: (stepNumber) => `Could not find task ${stepNumber} in plan.md`,
        }).map((currentStep) => ({ state, plan, currentStep }))
      )
      .andThen(({ state, plan, currentStep }) =>
        loadPromptFile('commitAgent.txt').map((systemPrompt) => ({
          state,
          plan,
          currentStep,
          systemPrompt,
        }))
      )
      .andThen(({ state, plan, currentStep, systemPrompt }) =>
        generateCommitMessage(
          systemPrompt,
          currentStep,
          gitStatus,
          gitDiff,
          model,
          iteration,
          signal,
          config.timeoutMs
        ).andThen((commitMessage) => {
          if (config.graphite) {
            const stepNumber = state.currentTaskNumber;
            const planOutline = extractPlanOutline(plan);
            const stepHeader = planOutline.find((h) => h.stepNumber === stepNumber);
            const stepTitle = stepHeader?.title ?? `step-${stepNumber}`;
            return performGraphiteCommit(commitMessage, stepNumber, stepTitle);
          }
          return performNormalCommit(commitMessage);
        })
      );
  });
};

export { createCommitForTask };
