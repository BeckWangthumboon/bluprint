import fs from 'fs/promises';
import path from 'path';
import { ResultAsync } from 'neverthrow';
import type { MakeDirectoryOptions } from 'fs';
import { constants } from 'fs';
import { createAppError, type AppError } from '../types/errors.js';
import type { Stats } from 'fs';

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

const fsMkdir = (target: string, options: MkdirOptions = { recursive: true }) =>
  ResultAsync.fromPromise(
    fs.mkdir(target, { recursive: true, ...options }).then(() => undefined),
    (error) =>
      createAppError(
        'FS_ERROR',
        `Unable to create directory at ${target}: ${(error as Error).message}`,
        { path: target, options },
      ),
  );

const fsMove = (from: string, to: string) =>
  ResultAsync.fromPromise(
    (async () => {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.rename(from, to);
    })(),
    (error) =>
      createAppError('FS_ERROR', `Unable to move ${from} to ${to}: ${(error as Error).message}`, {
        from,
        to,
      }),
  );

const fsCheckAccess = (path: string) =>
  ResultAsync.fromPromise(
    fs.access(path, constants.F_OK).then(() => true),
    (error) =>
      createAppError('FS_NOT_FOUND', `Unable to access ${path}: ${(error as Error).message}`, {
        path,
      }),
  );

const fsStat = (path: string) =>
  ResultAsync.fromPromise(fs.stat(path), (err) =>
    createAppError('FS_NOT_FOUND', `Unable to get stats for ${path}: ${(err as Error).message}`, {
      path,
    }),
  );

const fsReadFile = (target: string) =>
  ResultAsync.fromPromise(fs.readFile(target, 'utf8'), (error) =>
    createAppError(
      'FS_NOT_FOUND',
      `Unable to read file at ${target}: ${(error as Error).message}`,
      { path: target },
    ),
  );

const fsWriteFile = (target: string, data: string) =>
  ResultAsync.fromPromise(fs.writeFile(target, data, 'utf8'), (error) =>
    createAppError('FS_ERROR', `Unable to write file at ${target}: ${(error as Error).message}`, {
      path: target,
    }),
  );

export const fsUtils: FsUtils = {
  fsMkdir,
  fsMove,
  fsCheckAccess,
  fsStat,
  fsReadFile,
  fsWriteFile,
};
