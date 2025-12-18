import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { ResultAsync } from 'neverthrow';

const DUO_DIR = join(process.cwd(), '.duo');
const LOG_FILE = join(DUO_DIR, 'logs.md');
const MASTER_INSTRUCTION_FILE = join(DUO_DIR, 'master_instruction.md');
const CODER_REPORT_FILE = join(DUO_DIR, 'coder_report.md');

const toError = (err: unknown): Error =>
  err instanceof Error ? err : new Error(String(err));

export const appendLog = (entry: string): ResultAsync<void, Error> => {
  const normalized = entry.endsWith('\n') ? entry : `${entry}\n`;

  return ResultAsync.fromPromise(
    (async () => {
      await fs.mkdir(DUO_DIR, { recursive: true });
      await fs.appendFile(LOG_FILE, normalized, { encoding: 'utf8' });
    })(),
    toError,
  );
};

export const writeMasterInstruction = (
  content: string,
): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(
    (async () => {
      await fs.mkdir(DUO_DIR, { recursive: true });
      await fs.writeFile(MASTER_INSTRUCTION_FILE, content, {
        encoding: 'utf8',
      });
    })(),
    toError,
  );

export const writeCoderReport = (
  content: string,
): ResultAsync<void, Error> =>
  ResultAsync.fromPromise(
    (async () => {
      await fs.mkdir(DUO_DIR, { recursive: true });
      await fs.writeFile(CODER_REPORT_FILE, content, { encoding: 'utf8' });
    })(),
    toError,
  );
