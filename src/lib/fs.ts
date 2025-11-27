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
};

type MkdirOptions = MakeDirectoryOptions & {
  recursive?: boolean;
};

/**
 * Normalize a path to the repo root and reject traversal outside of it.
 *
 * @param target - Path provided by caller. Accepts absolute or relative input.
 * @returns ResultAsync containing an absolute path inside the repo root when valid; AppError otherwise.
 * @throws Never throws; errors are returned as AppError.
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

export const fsUtils: FsUtils = {
  fsMkdir,
  fsMove,
  fsCheckAccess,
  fsStat,
  fsReadFile,
  fsWriteFile,
};
