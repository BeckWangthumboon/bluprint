import { spawn } from 'child_process';
import path from 'path';
import { errAsync, ResultAsync } from 'neverthrow';
import { createAppError, type AppError } from '../types/errors.js';
import { gitUtils } from './git.js';

export type WorkspaceUtils = {
  listWorkspaceFiles: (options?: WorkspaceFileOptions) => ResultAsync<string[], AppError>;
};

interface WorkspaceFileOptions {
  includeUntracked?: boolean;
  absolute?: boolean;
  extraExcludes?: string[];
}

/**
 * Lists repository files while respecting gitignore to provide a safe workspace set.
 *
 * @param options - includeUntracked toggles untracked visibility; absolute returns absolute paths; extraExcludes appends git pathspec exclusions (e.g. dist/**).
 * @returns ResultAsync resolving to repo-relative or absolute file paths from git ls-files; AppError on git failures or invalid excludes.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const listWorkspaceFiles = (options: WorkspaceFileOptions = {}) => {
  const includeUntracked = options.includeUntracked ?? true;
  const absolute = options.absolute ?? false;
  const excludes = (options.extraExcludes ?? []).map((pattern) => pattern.trim());

  if (excludes.some((pattern) => !pattern)) {
    return errAsync(
      createAppError('GIT_ERROR', 'Exclude patterns must be non-empty strings', {
        excludes: options.extraExcludes,
      }),
    );
  }

  if (excludes.some((pattern) => pattern.includes('\0'))) {
    return errAsync(
      createAppError('GIT_ERROR', 'Exclude patterns cannot contain null characters', {
        excludes: options.extraExcludes,
      }),
    );
  }

  return gitUtils.gitGetRepoRoot().andThen((repoRoot) => {
    const args = ['ls-files', '-z', '--cached'];

    if (includeUntracked) {
      args.push('--others', '--exclude-standard');
    } else {
      args.push('--exclude-standard');
    }

    const excludePathspecs = excludes.map((pattern) => `:!${pattern}`);
    if (excludePathspecs.length > 0) {
      args.push('--', ...excludePathspecs);
    }

    return ResultAsync.fromPromise<string[], AppError>(
      new Promise((resolve, reject) => {
        const child = spawn('git', args, {
          cwd: repoRoot,
          env: process.env,
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', (error) => {
          reject(
            createAppError('GIT_ERROR', `git ls-files failed: ${(error as Error).message}`, {
              args,
              repoRoot,
              options,
            }),
          );
        });

        child.on('close', (code) => {
          const exitCode = code ?? 0;
          if (exitCode === 0) {
            const files = stdout
              .split('\0')
              .map((entry) => entry.trim())
              .filter(Boolean)
              .map((entry) => (absolute ? path.join(repoRoot, entry) : entry));

            resolve(files);
            return;
          }

          reject(
            createAppError(
              'GIT_COMMAND_FAILED',
              stderr || `git ls-files exited with code ${exitCode}`,
              { args, repoRoot, exitCode, stdout, stderr },
            ),
          );
        });
      }),
      (error) =>
        error && typeof error === 'object' && 'code' in error
          ? (error as AppError)
          : createAppError('GIT_ERROR', `git ls-files failed: ${(error as Error).message}`, {
              args,
              repoRoot,
              options,
            }),
    );
  });
};

export const workspaceUtils: WorkspaceUtils = {
  listWorkspaceFiles,
};
