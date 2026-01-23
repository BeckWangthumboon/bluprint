import { ResultAsync, err, ok } from 'neverthrow';
import {
  parseTextResponse,
  toError,
  loadPromptFile,
  unwrapResultAsync,
  cleanupSession,
  withTimeout,
} from './utils.js';
import { stateUtils } from '../orchestration/index.js';
import { workspace } from '../workspace.js';
import { getPlanStep, extractPlanOutline } from './planUtils.js';
import { getOpenCodeLib, abortAndCleanup } from './opencodesdk.js';
import type { ModelConfig } from '../config/index.js';
import {
  stageAndGetGitInfo,
  performNormalCommit,
  performGraphiteCommit,
  type CommitResult,
} from '../git/index.js';

export interface CommitAgentConfig {
  model: ModelConfig;
  timeoutMs: number;
  graphite: boolean;
}

export type { CommitResult };

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

    return stateUtils
      .getCurrentTaskNumber()
      .andThen((currentTaskNumber) =>
        workspace.cache.plan
          .read()
          .mapErr((e) => new Error(`Could not read plan.md: ${e.message}`))
          .map((plan) => ({ currentTaskNumber, plan }))
      )
      .andThen(({ currentTaskNumber, plan }) =>
        getPlanStep(plan, currentTaskNumber, {
          missingStep: (stepNumber) => `Could not find task ${stepNumber} in plan.md`,
        }).map((currentStep) => ({ currentTaskNumber, plan, currentStep }))
      )
      .andThen(({ currentTaskNumber, plan, currentStep }) =>
        loadPromptFile('commitAgent.txt').map((systemPrompt) => ({
          currentTaskNumber,
          plan,
          currentStep,
          systemPrompt,
        }))
      )
      .andThen(({ currentTaskNumber, plan, currentStep, systemPrompt }) =>
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
            const stepNumber = currentTaskNumber;
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
