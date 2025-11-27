import { spawn } from 'child_process';
import { err, ok, ResultAsync } from 'neverthrow';
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
  gitRun: (args: string[], options?: GitRunOptions) => ResultAsync<GitRunResult, AppError>;
  gitFetchPrune: () => ResultAsync<GitRunResult, AppError>;
  ensureInsideGitRepo: () => ResultAsync<boolean, AppError>;
  gitCheckBranchExists: (branch: string) => ResultAsync<boolean, AppError>;
};

const gitRun = (args: string[], options?: GitRunOptions) =>
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

const gitFetchPrune = () => gitRun(['fetch', '--prune']);

const ensureInsideGitRepo = () =>
  gitRun(['rev-parse', '--is-inside-work-tree'])
    .andThen((result) => {
      const stdout = result.stdout;
      const inside = stdout.trim() === 'true';
      return inside ? ok(true) : err(createAppError('GIT_NOT_REPO', 'Not inside a git worktree'));
    })
    .mapErr((e) =>
      createAppError('GIT_ERROR', `Unable to check git worktree: ${e.message}`, {
        originalError: e,
      }),
    );

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

export const gitUtils: GitUtils = {
  gitRun,
  gitFetchPrune,
  ensureInsideGitRepo,
  gitCheckBranchExists,
};
