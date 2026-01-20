import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type TempDir = {
  path: string;
  cleanup: () => Promise<void>;
};

/**
 * Creates a temporary directory for tests.
 *
 * @returns TempDir with path and cleanup function.
 */
const createTempDir = async (): Promise<TempDir> => {
  const path = await mkdtemp(join(tmpdir(), 'bluprint-test-'));
  const cleanup = async (): Promise<void> => {
    await rm(path, { recursive: true, force: true });
  };
  return { path, cleanup };
};

export type { TempDir };
export { createTempDir };
