import { ResultAsync, err, ok } from 'neverthrow';
import { createSession, deleteSession } from './sessionManager.js';
import { exec } from '../shell.js';
import { parseTextResponse, toError, getModelConfig, loadPromptFile } from './utils.js';
import { readState } from '../state.js';
import { workspace } from '../workspace.js';
import { getPlanStep } from './planUtils.js';
import type { ModelConfig } from './types.js';

const COMMIT_DEFAULT_MODEL: ModelConfig = {
  providerID: 'google',
  modelID: 'gemini-3-flash',
};

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
  model: ModelConfig
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

  return createSession('Commit Message Generation').andThen((session) =>
    ResultAsync.fromPromise(
      session.client.session.prompt({
        path: { id: session.id },
        body: {
          agent: 'plan',
          model,
          system: systemPrompt,
          parts: [
            {
              type: 'text',
              text: userPrompt,
            },
          ],
        },
      }),
      toError
    )
      .andThen((promptResponse) =>
        parseTextResponse(promptResponse, {
          invalidResponseMessage: 'Failed to generate commit message: No response from model',
          emptyResponseMessage: 'No text content in response',
          trim: true,
        })
      )
      .andThen((commitMessage) => deleteSession(session).map(() => commitMessage))
      .orElse((error) => deleteSession(session).andThen(() => err(error)))
  );
};

/**
 * Commits the staged changes and returns the commit hash
 */
const commitAndGetHash = (commitMessage: string): ResultAsync<string, Error> => {
  const cleanMessage = commitMessage
    .replace(/^```[^\n]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  return exec('git', ['commit', '-m', cleanMessage])
    .andThen(() => exec('git', ['rev-parse', 'HEAD']))
    .map((result) => result.stdout.trim())
    .mapErr((error) => new Error(`Failed to commit: ${error.message}`));
};

/**
 * Creates a commit for the current task by reviewing uncommitted changes
 * and the current plan step. Returns the commit hash, or empty string if
 * there are no changes to commit.
 */
const createCommitForTask = (): ResultAsync<string, Error> => {
  const model = getModelConfig('COMMIT_AGENT_MODEL', COMMIT_DEFAULT_MODEL);

  return stageAndGetGitInfo().andThen((gitInfo) => {
    if (!gitInfo) {
      return ok('');
    }

    const { gitStatus, gitDiff } = gitInfo;

    return readState()
      .andThen((state) =>
        workspace.plan
          .read()
          .mapErr((e) => new Error(`Could not read plan.md: ${e.message}`))
          .map((plan) => ({ state, plan }))
      )
      .andThen(({ state, plan }) =>
        getPlanStep(plan, state.currentTaskNumber, {
          missingStep: (stepNumber) => `Could not find task ${stepNumber} in plan.md`,
        }).map((currentStep) => ({ currentStep }))
      )
      .andThen(({ currentStep }) =>
        loadPromptFile('commitAgent.txt').map((systemPrompt) => ({
          currentStep,
          systemPrompt,
        }))
      )
      .andThen(({ currentStep, systemPrompt }) =>
        generateCommitMessage(systemPrompt, currentStep, gitStatus, gitDiff, model)
      )
      .andThen((commitMessage) => commitAndGetHash(commitMessage));
  });
};

export { createCommitForTask };
