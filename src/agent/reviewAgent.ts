import { ResultAsync, err } from 'neverthrow';
import { createSession, deleteSession } from './sessionManager.js';
import { exec } from '../shell.js';
import { parseTextResponse, toError, getModelConfig, loadPromptFile } from './utils.js';
import type { ModelConfig } from './types.js';

const REVIEW_DEFAULT_MODEL: ModelConfig = {
  providerID: 'google',
  modelID: 'gemini-3-flash',
};

/**
 * Generates a commit message by reviewing uncommitted changes,
 * then stages and commits all changes with the generated message.
 */
const generateCommit = (): ResultAsync<void, Error> => {
  const model = getModelConfig('REVIEW_AGENT_MODEL', REVIEW_DEFAULT_MODEL);

  return exec('git', ['status', '--short'])
    .andThen((result) => {
      const gitStatus = result.stdout.trim();
      if (!gitStatus) {
        return err(new Error('No changes to commit'));
      }

      return exec('git', ['add', '-A']).map(() => gitStatus);
    })
    .andThen((gitStatus) => {
      return exec('git', ['diff', '--cached'])
        .map((diffResult) => ({
          gitStatus,
          gitDiff: diffResult.stdout,
        }))
        .orElse(() => ResultAsync.fromSafePromise(Promise.resolve({ gitStatus, gitDiff: '' })));
    })
    .andThen(({ gitStatus, gitDiff }) => {
      return loadPromptFile('reviewAgent.txt').map((systemPrompt) => ({
        gitStatus,
        gitDiff,
        systemPrompt,
      }));
    })
    .andThen(({ gitStatus, gitDiff, systemPrompt }) => {
      const userPrompt = `# Git Status
\`\`\`
${gitStatus}
\`\`\`

# Git Diff (Staged Changes)
\`\`\`diff
${gitDiff || '(no diff available)'}
\`\`\`

Review these changes and generate a commit message following the Conventional Commits format specified in your instructions.

If you need more context about any files, use your tools to read them.`;

      return createSession('Commit Message Generation').andThen((session) =>
        ResultAsync.fromPromise(
          session.client.session.prompt({
            path: { id: session.id },
            body: {
              agent: 'ask',
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
    })
    .andThen((commitMessage) => {
      const cleanMessage = commitMessage
        .replace(/^```[^\n]*\n?/, '')
        .replace(/\n?```$/, '')
        .trim();

      const displayMessage =
        cleanMessage.length > 60 ? cleanMessage.slice(0, 60) + '...' : cleanMessage;
      console.log(`Generated commit message: "${displayMessage}"`);

      return exec('git', ['commit', '-m', cleanMessage])
        .map((result) => {
          console.log(result.stdout.trim());
        })
        .mapErr((error) => new Error(`Failed to commit: ${error.message}`));
    });
};

export { generateCommit };
