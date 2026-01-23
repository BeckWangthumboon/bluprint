import { ResultAsync, err } from 'neverthrow';
import {
  parseTextResponse,
  toError,
  unwrapResultAsync,
  cleanupSession,
  withTimeout,
} from './utils.js';
import { getOpenCodeLib, abortAndCleanup } from './opencodesdk.js';
import type { ModelConfig } from '../config/index.js';

export interface CommitAgentConfig {
  model: ModelConfig;
  timeoutMs: number;
}

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

export { generateCommitMessage };
