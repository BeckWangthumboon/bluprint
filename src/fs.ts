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

export const fsUtils = { readFile, writeFile, appendFile, clearFile };
