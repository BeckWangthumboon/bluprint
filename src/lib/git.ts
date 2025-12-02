import { spawn } from 'child_process';
import { err, errAsync, ok, okAsync, ResultAsync } from 'neverthrow';
import { createAppError, type AppError } from '../types/errors.js';

interface GitRunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

interface GitRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type GitUtils = {
  gitFetchPrune: () => ResultAsync<GitRunResult, AppError>;
  ensureInsideGitRepo: () => ResultAsync<boolean, AppError>;
  gitCheckBranchExists: (branch: string) => ResultAsync<boolean, AppError>;
  gitGetRepoRoot: () => ResultAsync<string, AppError>;
  gitGetDiffAgainst: (baseRef: string, headRef?: string) => ResultAsync<string, AppError>;
};

/**
 * Runs a git command with provided args and options, capturing stdout/stderr.
 *
 * @param args - Git arguments to execute; passed directly to the git CLI.
 * @param options - Optional overrides for cwd/env; defaults to process context.
 * @returns ResultAsync containing stdout/stderr/exitCode from the git invocation.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const gitRunRaw = (args: string[], options?: GitRunOptions) =>
  ResultAsync.fromPromise<GitRunResult, AppError>(
    new Promise((resolve, reject) => {
      const child = spawn('git', args, {
        cwd: options?.cwd ?? process.cwd(),
        env: { ...process.env, ...options?.env },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        reject(
          createAppError(
            'GIT_ERROR',
            `Git command failed (git ${args.join(' ')}): ${err.message}`,
            { args, error: err },
          ),
        );
      });

      child.on('close', (code) => {
        const exitCode = code ?? 0;
        if (exitCode === 0) {
          resolve({ stdout, stderr, exitCode });
        } else {
          reject(
            createAppError(
              'GIT_COMMAND_FAILED',
              stderr || `git ${args.join(' ')} exited with code ${exitCode}`,
              { args, exitCode, stdout, stderr },
            ),
          );
        }
      });
    }),
    (error) =>
      error && typeof error === 'object' && 'code' in error
        ? (error as AppError)
        : createAppError(
            'GIT_ERROR',
            `Git command failed (git ${args.join(' ')}): ${(error as Error).message}`,
            { args },
          ),
  );

let cachedRepoRoot: string | null = null;

/**
 * Run a git command scoped to the repository root by default.
 *
 * @param args - Arguments passed to git.
 * @param options - Optional overrides; provided cwd wins over repo root.
 * @returns ResultAsync containing stdout/stderr/exitCode.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const gitRun = (args: string[], options?: GitRunOptions) =>
  gitGetRepoRoot().andThen((repoRoot) =>
    gitRunRaw(args, {
      ...options,
      cwd: options?.cwd ?? repoRoot,
    }),
  );

/**
 * Fetches remote refs and prunes stale branches.
 *
 * @returns ResultAsync with git stdout/stderr/exitCode on success; AppError on failure.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const gitFetchPrune = () => gitRun(['fetch', '--prune']);

/**
 * Confirms the current working directory resides inside a git repository.
 *
 * @returns ResultAsync resolving to true when inside a repository; AppError otherwise.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const ensureInsideGitRepo = () => gitGetRepoRoot().map(() => true);

/**
 * Checks whether a given branch exists in the repository.
 *
 * @param branch - Branch name to verify.
 * @returns ResultAsync resolving to true when the branch exists, false when it does not, or AppError on git failure.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const gitCheckBranchExists = (branch: string) =>
  gitRun(['rev-parse', '--verify', '--quiet', branch])
    .map(() => true)
    .orElse((e) => {
      if (/exit(ed)? with code (1|128)/i.test(e.message)) return ok(false);
      return err(
        createAppError('GIT_ERROR', `Unable to check branch ${branch}: ${e.message}`, {
          branch,
          originalError: e,
        }),
      );
    });

/**
 * Resolve the absolute path to the current git repository root.
 *
 * @returns ResultAsync that contains the repo root path when inside a git repository, or an AppError when not.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const gitGetRepoRoot = () => {
  if (cachedRepoRoot) return okAsync(cachedRepoRoot);

  return gitRunRaw(['rev-parse', '--show-toplevel'])
    .map((result) => {
      cachedRepoRoot = result.stdout.trim();
      return cachedRepoRoot;
    })
    .orElse((e) => {
      if (e.code === 'GIT_COMMAND_FAILED' && /not a git repository/i.test(e.message)) {
        return err(
          createAppError('GIT_NOT_REPO', 'Not inside a git repository', { originalError: e }),
        );
      }
      return err(
        createAppError('GIT_ERROR', `Unable to resolve git repository root: ${e.message}`, {
          originalError: e,
        }),
      );
    });
};

/**
 * Collects a unified diff between the provided base ref and the current HEAD (or custom head).
 *
 * @param baseRef - Branch or commit to compare against; required.
 * @param headRef - Optional head reference; defaults to HEAD to include working tree state.
 * @returns ResultAsync containing the diff text; AppError when git fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const gitGetDiffAgainst = (baseRef: string, headRef = 'HEAD') => {
  if (!baseRef || !baseRef.trim()) {
    return errAsync(
      createAppError('GIT_ERROR', 'Base reference is required to compute a diff', { baseRef }),
    );
  }

  const normalizedBase = baseRef.trim();
  const normalizedHead = headRef.trim() || 'HEAD';

  return gitRun(['diff', '--no-color', '--unified=5', `${normalizedBase}...${normalizedHead}`]).map(
    (result) => result.stdout,
  );
};

export const gitUtils: GitUtils = {
  gitFetchPrune,
  ensureInsideGitRepo,
  gitCheckBranchExists,
  gitGetRepoRoot,
  gitGetDiffAgainst,
};

/**
 * Internal helper exposed for tests to reset cached git state.
 */
const resetRepoRootCache = () => {
  cachedRepoRoot = null;
};

export const gitTestHelpers = {
  resetRepoRootCache,
};
