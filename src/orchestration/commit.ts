import { ResultAsync, ok } from 'neverthrow';
import type { CommitAgentConfig } from '../agent/commitAgent.js';
import type { CommitResult } from '../git/index.js';
import { stateUtils } from './index.js';
import { workspace } from '../workspace.js';
import { getPlanStep, extractPlanOutline } from '../agent/planUtils.js';
import { loadPromptFile } from '../agent/utils.js';
import { generateCommitMessage } from '../agent/commitAgent.js';
import { stageAndGetGitInfo, performNormalCommit, performGraphiteCommit } from '../git/index.js';

export interface CommitOrchestrationConfig extends CommitAgentConfig {
  graphite: boolean;
}

/**
 * Creates a commit for the current task by reviewing uncommitted changes
 * and the current plan step. Returns the commit result with hash and message,
 * or null if there are no changes to commit.
 * @param iteration - The current loop iteration number
 * @param signal - AbortSignal to cancel the operation
 * @param config - Resolved runtime configuration containing model and timeout settings
 */
export const createCommitForTask = (
  iteration: number,
  signal: AbortSignal,
  config: CommitOrchestrationConfig
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
        ).andThen((commitMessage: string) => {
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
