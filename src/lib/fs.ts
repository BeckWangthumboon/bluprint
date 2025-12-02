import fs from 'fs/promises';
import path from 'path';
import { ok, err, ResultAsync } from 'neverthrow';
import type { MakeDirectoryOptions } from 'fs';
import { constants } from 'fs';
import { createAppError, type AppError } from '../types/errors.js';
import type { Stats } from 'fs';
import { gitUtils } from './git.js';

export type FsUtils = {
  fsMkdir: (target: string, options?: MkdirOptions) => ResultAsync<void, AppError>;
  fsMove: (from: string, to: string) => ResultAsync<void, AppError>;
  fsCheckAccess: (path: string) => ResultAsync<boolean, AppError>;
  fsStat: (path: string) => ResultAsync<Stats, AppError>;
  fsReadFile: (target: string) => ResultAsync<string, AppError>;
  fsWriteFile: (target: string, data: string) => ResultAsync<void, AppError>;
  fsListFilesRecursive: (targetDir: string) => ResultAsync<string[], AppError>;
};

type MkdirOptions = MakeDirectoryOptions & {
  recursive?: boolean;
};

/**
 * Normalize a path to the repo root and reject traversal outside of it.
 *
 * @param target - Path provided by caller. Accepts absolute or relative input.
 * @returns ResultAsync containing an absolute path inside the repo root when valid; AppError otherwise.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const resolvePathWithinRepo = (target: string) =>
  gitUtils.gitGetRepoRoot().andThen((repoRoot) => {
    const rootPath = path.resolve(repoRoot);
    const candidate = path.resolve(rootPath, target);
    const relative = path.relative(rootPath, candidate);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return err(
        createAppError('FS_ERROR', `Path ${target} is outside the repository root`, {
          target,
          repoRoot: rootPath,
          resolved: candidate,
        }),
      );
    }

    return ok(candidate);
  });

/**
 * Creates a directory within the repository, ensuring traversal stays inside the repo root.
 *
 * @param target - Directory path to create; absolute or relative to repo root.
 * @param options - Optional mkdir settings; recursive defaults to true.
 * @returns ResultAsync resolving to void when creation succeeds; AppError when creation fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const fsMkdir = (target: string, options: MkdirOptions = { recursive: true }) =>
  resolvePathWithinRepo(target).andThen((normalized) =>
    ResultAsync.fromPromise(
      fs.mkdir(normalized, { recursive: true, ...options }).then(() => undefined),
      (error) =>
        createAppError(
          'FS_ERROR',
          `Unable to create directory at ${normalized}: ${(error as Error).message}`,
          { path: normalized, options },
        ),
    ),
  );

/**
 * Moves a file or directory within the repository boundaries.
 *
 * @param from - Source path to move; validated against repo root.
 * @param to - Destination path; parent directories are created as needed.
 * @returns ResultAsync resolving to void on success; AppError on validation or move failure.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const fsMove = (from: string, to: string) =>
  resolvePathWithinRepo(from).andThen((normalizedFrom) =>
    resolvePathWithinRepo(to).andThen((normalizedTo) =>
      ResultAsync.fromPromise(
        (async () => {
          await fs.mkdir(path.dirname(normalizedTo), { recursive: true });
          await fs.rename(normalizedFrom, normalizedTo);
        })(),
        (error) =>
          createAppError(
            'FS_ERROR',
            `Unable to move ${normalizedFrom} to ${normalizedTo}: ${(error as Error).message}`,
            {
              from: normalizedFrom,
              to: normalizedTo,
            },
          ),
      ),
    ),
  );

/**
 * Checks whether a path exists and is accessible within the repository.
 *
 * @param path - Target path to validate; absolute or relative.
 * @returns ResultAsync resolving to true when accessible; AppError when inaccessible or invalid.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const fsCheckAccess = (path: string) =>
  resolvePathWithinRepo(path).andThen((normalized) =>
    ResultAsync.fromPromise(
      fs.access(normalized, constants.F_OK).then(() => true),
      (error) =>
        createAppError(
          'FS_NOT_FOUND',
          `Unable to access ${normalized}: ${(error as Error).message}`,
          {
            path: normalized,
          },
        ),
    ),
  );

/**
 * Reads filesystem metadata for a path inside the repository.
 *
 * @param path - Target path to stat; absolute or relative.
 * @returns ResultAsync resolving to Stats on success; AppError when stat fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const fsStat = (path: string) =>
  resolvePathWithinRepo(path).andThen((normalized) =>
    ResultAsync.fromPromise(fs.stat(normalized), (err) =>
      createAppError(
        'FS_NOT_FOUND',
        `Unable to get stats for ${normalized}: ${(err as Error).message}`,
        {
          path: normalized,
        },
      ),
    ),
  );

/**
 * Reads a UTF-8 file within the repository.
 *
 * @param target - File path to read; absolute or relative.
 * @returns ResultAsync resolving to file contents; AppError when read fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const fsReadFile = (target: string) =>
  resolvePathWithinRepo(target).andThen((normalized) =>
    ResultAsync.fromPromise(fs.readFile(normalized, 'utf8'), (error) =>
      createAppError(
        'FS_NOT_FOUND',
        `Unable to read file at ${normalized}: ${(error as Error).message}`,
        { path: normalized },
      ),
    ),
  );

/**
 * Writes UTF-8 data to a file within the repository.
 *
 * @param target - Destination path to write; absolute or relative.
 * @param data - Content to write.
 * @returns ResultAsync resolving to void on success; AppError when write fails.
 * @throws Never throws. Errors flow via AppError in Result/ResultAsync.
 */
const fsWriteFile = (target: string, data: string) =>
  resolvePathWithinRepo(target).andThen((normalized) =>
    ResultAsync.fromPromise(fs.writeFile(normalized, data, 'utf8'), (error) =>
      createAppError(
        'FS_ERROR',
        `Unable to write file at ${normalized}: ${(error as Error).message}`,
        {
          path: normalized,
        },
      ),
    ),
  );

/**
 * Recursively lists all files under a directory within the repository.
 *
 * @param targetDir - Directory to walk; absolute or relative to the repo root.
 * @returns ResultAsync resolving to absolute file paths discovered under the directory; AppError when traversal fails or escapes the repo root. Never throws; errors flow via AppError.
 */
const fsListFilesRecursive = (targetDir: string) =>
  resolvePathWithinRepo(targetDir).andThen((normalizedRoot) =>
    ResultAsync.fromPromise(
      (async () => {
        const files: string[] = [];
        const pending: string[] = [normalizedRoot];

        while (pending.length > 0) {
          const currentDir = pending.pop();
          if (!currentDir) continue;

          const entries = await fs.readdir(currentDir, { withFileTypes: true });
          entries.forEach((entry) => {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
              pending.push(fullPath);
            } else if (entry.isFile()) {
              files.push(fullPath);
            }
          });
        }

        return files;
      })(),
      (error) =>
        createAppError(
          'FS_ERROR',
          `Unable to list files under ${normalizedRoot}: ${(error as Error).message}`,
          { path: normalizedRoot },
        ),
    ),
  );

export const fsUtils: FsUtils = {
  fsMkdir,
  fsMove,
  fsCheckAccess,
  fsStat,
  fsReadFile,
  fsWriteFile,
  fsListFilesRecursive,
};
