import { execFile } from 'node:child_process';
import type { ExecFileOptions } from 'node:child_process';
import { promisify } from 'node:util';
import { ResultAsync } from 'neverthrow';

const execFileAsync = promisify(execFile);

const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

export type ExecResult = {
  stdout: string;
  stderr: string;
};

export const exec = (
  command: string,
  args: string[] = [],
  options?: ExecFileOptions
): ResultAsync<ExecResult, Error> =>
  ResultAsync.fromPromise(execFileAsync(command, args, { ...options }), toError).map(
    ({ stdout, stderr }) => ({
      stdout: typeof stdout === 'string' ? stdout : stdout.toString(),
      stderr: typeof stderr === 'string' ? stderr : stderr.toString(),
    })
  );
