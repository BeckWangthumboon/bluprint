import { promises as fs } from 'fs';
import { dirname } from 'path';
import { ResultAsync } from 'neverthrow';

const DEFAULT_ENCODING: BufferEncoding = 'utf8';

const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

export const readFile = (
  filePath: string,
  encoding: BufferEncoding = DEFAULT_ENCODING
): ResultAsync<string, Error> =>
  ResultAsync.fromPromise(fs.readFile(filePath, { encoding }), toError);

export const writeFile = (
  filePath: string,
  data: string | Uint8Array,
  encoding: BufferEncoding = DEFAULT_ENCODING
): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(
    (async () => {
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, data, typeof data === 'string' ? { encoding } : undefined);
    })(),
    toError
  );

export const appendFile = (
  filePath: string,
  data: string,
  encoding: BufferEncoding = DEFAULT_ENCODING
): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(
    (async () => {
      await fs.mkdir(dirname(filePath), { recursive: true });
      await fs.appendFile(filePath, data, { encoding });
    })(),
    toError
  );

export const clearFile = (
  filePath: string,
  encoding: BufferEncoding = DEFAULT_ENCODING
): ResultAsync<void, Error> => writeFile(filePath, '', encoding);

export const removeDir = (dirPath: string): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(
    fs.rm(dirPath, { recursive: true, force: true }).catch(() => {}),
    toError
  );

export const moveFile = (src: string, dest: string): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(
    (async () => {
      await fs.mkdir(dirname(dest), { recursive: true });
      await fs.rename(src, dest);
    })(),
    toError
  );

export const removeFile = (filePath: string): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(
    fs.rm(filePath, { force: true }).catch(() => {}),
    toError
  );

export const fileExists = (filePath: string): ResultAsync<boolean, Error> =>
  ResultAsync.fromPromise(
    fs
      .access(filePath)
      .then(() => true)
      .catch(() => false),
    toError
  );

export const ensureDir = (dirPath: string): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(
    fs.mkdir(dirPath, { recursive: true }).then(() => undefined),
    toError
  );

export const fsUtils = {
  readFile,
  writeFile,
  appendFile,
  clearFile,
  removeDir,
  moveFile,
  removeFile,
  fileExists,
  ensureDir,
};
