import { spawn } from 'child_process';
import { err, okAsync, ResultAsync } from 'neverthrow';
import { createAppError, type AppError } from '../types/errors.js';
import { gitUtils } from './git.js';

interface ShellRunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

interface ShellRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type ShellUtils = {
  findByName: (fileName: string, targetType?: 'file' | 'directory' | 'both') => ResultAsync<string[], AppError>;
};

/**
 * Executes a shell command while capturing stdout/stderr and exit code.
 *
 * @param command - Executable name to invoke; must be resolvable in PATH unless cwd/env override it.
 * @param args - Arguments to pass to the command in order.
 * @param options - Optional overrides for cwd/env; falls back to current process context when omitted.
 * @returns ResultAsync containing stdout/stderr/exitCode; AppError on spawn failure or non-zero exit.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const runShellRaw = (
  command: string,
  args: string[],
  options?: ShellRunOptions,
): ResultAsync<ShellRunResult, AppError> =>
  ResultAsync.fromPromise(
    new Promise<ShellRunResult>((resolve, reject) => {
      const child = spawn(command, args, {
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

      child.on('error', (error) => {
        reject(
          createAppError(
            'SHELL_ERROR',
            `Command failed (${command} ${args.join(' ')}): ${(error as Error).message}`,
            { command, args, options },
          ),
        );
      });

      child.on('close', (code) => {
        const exitCode = code ?? 0;
        if (exitCode === 0) {
          resolve({ stdout, stderr, exitCode });
          return;
        }

        reject(
          createAppError(
            'SHELL_ERROR',
            stderr || `${command} ${args.join(' ')} exited with code ${exitCode}`,
            { command, args, exitCode, stdout, stderr, options },
          ),
        );
      });
    }),
    (error) =>
      createAppError(
        'SHELL_ERROR',
        `Command failed (${command} ${args.join(' ')}): ${(error as Error).message}`,
        { command, args, options },
      ),
  );

/**
 * Finds files by name starting from the repository root.
 *
 * @param fileName - Target file name to locate; rejects path segments to keep the search scoped to the repo.
 * @param targetType - Restricts results to files, directories, or both; defaults to both to mirror the raw find behavior.
 * @returns ResultAsync containing matching paths from the repo root; AppError when find fails or input is invalid.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const findByName = (
  fileName: string,
  targetType: 'file' | 'directory' | 'both' = 'both',
): ResultAsync<string[], AppError> => {
  const normalized = fileName.trim();
  if (!normalized) {
    return okAsync<string[]>([]).andThen(() =>
      err(createAppError('SHELL_ERROR', 'File name is required to run find', { fileName })),
    );
  }

  if (normalized.includes('/') || normalized.includes('\\')) {
    return okAsync<string[]>([]).andThen(() =>
      err(
        createAppError('SHELL_ERROR', 'findByName accepts only file names without path segments', {
          fileName,
        }),
      ),
    );
  }

  if (!['file', 'directory', 'both'].includes(targetType)) {
    return okAsync<string[]>([]).andThen(() =>
      err(
        createAppError('SHELL_ERROR', 'Invalid target type for findByName', {
          targetType,
        }),
      ),
    );
  }

  const typeArgs =
    targetType === 'file'
      ? ['-type', 'f']
      : targetType === 'directory'
        ? ['-type', 'd']
        : [];

  return gitUtils.gitGetRepoRoot().andThen((repoRoot) =>
    runShellRaw('find', [repoRoot, ...typeArgs, '-name', normalized], { cwd: repoRoot }).map((result) =>
      result.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  );
};

export const shellUtils: ShellUtils = {
  findByName,
};

export const shellTestHelpers = {
  runShellRaw,
};
