import { ResultAsync } from 'neverthrow';
import { exec } from '../shell.js';
import { graphite } from './graphite.js';
import type { CommitResult } from './types.js';

/**
 * Cleans a commit message by stripping markdown code block wrappers.
 *
 * @param message - The raw commit message (may have ```...``` wrappers)
 * @returns The cleaned commit message
 */
const cleanCommitMessage = (message: string): string =>
  message
    .replace(/^```[^\n]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

/**
 * Stages all changes and retrieves git status and diff.
 *
 * @returns ResultAsync resolving to git info, or null if no changes
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
 * Commits the staged changes and returns the commit hash and cleaned message.
 *
 * @param commitMessage - The commit message (may include markdown code blocks)
 * @returns ResultAsync resolving to the commit result
 */
const performNormalCommit = (commitMessage: string): ResultAsync<CommitResult, Error> => {
  const cleanMessage = cleanCommitMessage(commitMessage);

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
 *
 * @param commitMessage - The commit message (may include markdown code blocks)
 * @param stepNumber - The plan step number
 * @param stepTitle - The plan step title
 * @returns ResultAsync resolving to the commit result
 */
const performGraphiteCommit = (
  commitMessage: string,
  stepNumber: number,
  stepTitle: string
): ResultAsync<CommitResult, Error> => {
  const cleanMessage = cleanCommitMessage(commitMessage);

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

export { stageAndGetGitInfo, performNormalCommit, performGraphiteCommit, cleanCommitMessage };
