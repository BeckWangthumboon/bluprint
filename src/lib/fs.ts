import fs from 'fs/promises';
import path from 'path';
import { ResultAsync } from 'neverthrow';
import type { MakeDirectoryOptions } from 'fs';
import { constants } from 'fs';

type MkdirOptions = MakeDirectoryOptions & {
  recursive?: boolean;
};

const fsMkdir = (target: string, options: MkdirOptions = { recursive: true }) =>
  ResultAsync.fromPromise(
    fs.mkdir(target, { recursive: true, ...options }),
    (error) => new Error(`Unable to create directory at ${target}: ${(error as Error).message}`),
  );

const fsMove = (from: string, to: string) =>
  ResultAsync.fromPromise(
    (async () => {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.rename(from, to);
    })(),
    (error) => new Error(`Unable to move ${from} to ${to}: ${(error as Error).message}`),
  );

const fsCheckAccess = (path: string) =>
  ResultAsync.fromPromise(
    fs.access(path, constants.F_OK).then(() => true),
    (error) => new Error(`Unable to access ${path}: ${(error as Error).message}`),
  );

const fsStat = (path: string) =>
  ResultAsync.fromPromise(
    fs.stat(path),
    (err) => new Error(`Unable to stat ${path}: ${(err as Error).message}`),
  );

const fsReadFile = (target: string) =>
  ResultAsync.fromPromise(
    fs.readFile(target, 'utf8'),
    (error) => new Error(`Unable to read file at ${target}: ${(error as Error).message}`),
  );

const fsWriteFile = (target: string, data: string) =>
  ResultAsync.fromPromise(
    fs.writeFile(target, data, 'utf8'),
    (error) => new Error(`Unable to write file at ${target}: ${(error as Error).message}`),
  );

export const fsUtils = {
  fsMkdir,
  fsMove,
  fsCheckAccess,
  fsStat,
  fsReadFile,
  fsWriteFile,
};
