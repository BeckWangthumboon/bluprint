import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

type RunCliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type RunCliOptions = {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
};

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OPENCODE_STUB_PATH = fileURLToPath(new URL('./opencodeStub.ts', import.meta.url));

const buildEnv = (env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  return {
    ...process.env,
    BLUPRINT_OPENCODE_PROVIDER_MODULE: OPENCODE_STUB_PATH,
    ...env,
  };
};

/**
 * Runs the Bluprint CLI with the provided arguments.
 *
 * @param args - CLI arguments (excluding the binary and index.ts).
 * @param options - Execution options.
 * @returns Captured exit code and output.
 */
const runCli = (args: string[], options: RunCliOptions): RunCliResult => {
  const result = spawnSync('bun', ['run', join(PROJECT_ROOT, 'index.ts'), ...args], {
    cwd: options.cwd,
    env: buildEnv(options.env),
    input: options.input,
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  const exitCode = result.status ?? (result.signal ? 1 : 0);
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';

  return {
    exitCode,
    stdout,
    stderr,
  };
};

export type { RunCliOptions, RunCliResult };
export { runCli };
