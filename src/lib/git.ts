import { spawn } from 'child_process';
import { err, ok, okAsync, ResultAsync } from 'neverthrow';
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
};

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
      createAppError(
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
 * @throws Never throws; errors are returned as AppError.
 */
const gitRun = (args: string[], options?: GitRunOptions) =>
  gitGetRepoRoot().andThen((repoRoot) =>
    gitRunRaw(args, {
      ...options,
      cwd: options?.cwd ?? repoRoot,
    }),
  );

const gitFetchPrune = () => gitRun(['fetch', '--prune']);

const ensureInsideGitRepo = () => gitGetRepoRoot().map(() => true);

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
 * @throws Never throws; errors are returned as AppError.
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
        return err(createAppError('GIT_NOT_REPO', 'Not inside a git repository', { originalError: e }));
      }
      return err(
        createAppError('GIT_ERROR', `Unable to resolve git repository root: ${e.message}`, {
          originalError: e,
        }),
      );
    });
};

export const gitUtils: GitUtils = {
  gitFetchPrune,
  ensureInsideGitRepo,
  gitCheckBranchExists,
  gitGetRepoRoot,
};
