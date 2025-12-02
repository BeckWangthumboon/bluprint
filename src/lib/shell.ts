import { spawn } from 'child_process';
import { err, errAsync, ResultAsync } from 'neverthrow';
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
  findByName: (
    fileName: string,
    targetType?: 'file' | 'directory' | 'both',
    options?: FindByNameOptions,
  ) => ResultAsync<string[], AppError>;
};

interface FindByNameOptions {
  includeHidden?: boolean;
  includeIgnored?: boolean;
}

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
    (error) => error as AppError,
  );

/**
 * Finds files by name using fd from the repository root while honoring gitignore by default.
 *
 * @param fileName - Target file name to locate; rejects path segments to keep the search scoped to the repo.
 * @param targetType - Restricts results to files, directories, or both; defaults to both to mirror fd's default.
 * @param options - includeHidden toggles hidden search (-H); includeIgnored toggles ignored search (-I).
 * @returns ResultAsync containing matching paths from the repo root; AppError when fd is missing, fd fails, or input is invalid. Never throws; errors flow via AppError.
 */
const findByName = (
  fileName: string,
  targetType: 'file' | 'directory' | 'both' = 'both',
  options: FindByNameOptions = {},
): ResultAsync<string[], AppError> => {
  const normalized = fileName.trim();
  if (!normalized) {
    return errAsync(
      createAppError('SHELL_ERROR', 'File name is required to run find', { fileName }),
    );
  }

  if (normalized.includes('/') || normalized.includes('\\')) {
    return errAsync(
      createAppError('SHELL_ERROR', 'findByName accepts only file names without path segments', {
        fileName,
      }),
    );
  }

  if (!['file', 'directory', 'both'].includes(targetType)) {
    return errAsync(
      createAppError('SHELL_ERROR', 'Invalid target type for findByName', {
        targetType,
      }),
    );
  }

  const includeHidden = options.includeHidden ?? false;
  const includeIgnored = options.includeIgnored ?? false;

  const typeArgs =
    targetType === 'file' ? ['-t', 'f'] : targetType === 'directory' ? ['-t', 'd'] : [];

  return gitUtils.gitGetRepoRoot().andThen((repoRoot) =>
    runShellRaw('fd', ['--version'], { cwd: repoRoot })
      .map(() => repoRoot)
      .orElse((error) => {
        if (/ENOENT|not found/i.test(error.message)) {
          return err(
            createAppError(
              'SHELL_ERROR',
              'fd is required for findByName; install fd (https://github.com/sharkdp/fd) and retry.',
              { originalError: error },
            ),
          );
        }
        return err(error);
      })
      .andThen((validatedRepoRoot) =>
        runShellRaw(
          'fd',
          [
            ...typeArgs,
            ...(includeHidden ? ['-H'] : []),
            ...(includeIgnored ? ['-I'] : []),
            '--glob',
            `**/${normalized}`,
            '--base-directory',
            validatedRepoRoot,
            '.',
          ],
          { cwd: validatedRepoRoot },
        ).map((result) =>
          result.stdout
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
        ),
      ),
  );
};

export const shellUtils: ShellUtils = {
  findByName,
};

export const shellTestHelpers = {
  runShellRaw,
};
