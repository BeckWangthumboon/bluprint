import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { EventEmitter } from 'events';
import { okAsync } from 'neverthrow';
import { createTempDir } from '../../helpers/tempRepo.js';

let shellUtils: (typeof import('../../../src/lib/shell.js'))['shellUtils'];
let shellTestHelpers: (typeof import('../../../src/lib/shell.js'))['shellTestHelpers'];
let gitUtils: (typeof import('../../../src/lib/git.js'))['gitUtils'];
let repoRoot: string;

vi.mock('child_process', async () => {
  const actual = await import('node:child_process');
  return { ...actual, spawn: vi.fn() };
});
const childProcess = await import('child_process');
const spawnMock = childProcess.spawn as unknown as Mock;

const mockSpawnSequence = (
  runs: Array<{ stdout?: string; stderr?: string; exitCode?: number; error?: Error }>,
) => {
  spawnMock.mockImplementation(() => {
    const invocation = runs.shift();
    if (!invocation) throw new Error('Unexpected spawn invocation');

    const proc = new EventEmitter() as childProcess.ChildProcessWithoutNullStreams;
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    (proc as { stdout?: EventEmitter }).stdout = stdout;
    (proc as { stderr?: EventEmitter }).stderr = stderr;

    queueMicrotask(() => {
      if (invocation.error) {
        proc.emit('error', invocation.error);
        return;
      }

      if (invocation.stdout) stdout.emit('data', invocation.stdout);
      if (invocation.stderr) stderr.emit('data', invocation.stderr);
      proc.emit('close', invocation.exitCode ?? 0);
    });

    return proc;
  });
};

beforeEach(async () => {
  ({ shellUtils, shellTestHelpers } = await import('../../../src/lib/shell.js'));
  ({ gitUtils } = await import('../../../src/lib/git.js'));
  repoRoot = await createTempDir();
  vi.restoreAllMocks();
  spawnMock.mockReset();
  spawnMock.mockImplementation(() => {
    throw new Error('spawn not mocked for this test');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shellUtils.findByName', () => {
  it('returns matching files from the provided repo root', async () => {
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
    mockSpawnSequence([{ stdout: 'fd 8.7.0\n' }, { stdout: 'match.txt\nother.log\n' }]);

    const result = await shellUtils.findByName('match.txt');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toContain('match.txt');
    }
  });

  it('returns an empty array when no files match', async () => {
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
    mockSpawnSequence([{ stdout: 'fd 8.7.0\n' }, { stdout: '' }]);

    const result = await shellUtils.findByName('missing.txt');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
  });

  it('rejects blank file names', async () => {
    const result = await shellUtils.findByName('  ');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('SHELL_ERROR');
    }
  });

  it('rejects file names with path segments', async () => {
    const result = await shellUtils.findByName('nested/file.txt');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('SHELL_ERROR');
    }
  });

  it('filters by target type when requested', async () => {
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
    mockSpawnSequence([
      { stdout: 'fd 8.7.0\n' },
      { stdout: 'dirs/match\n' },
      { stdout: 'fd 8.7.0\n' },
      { stdout: 'files/match\n', exitCode: 0 },
    ]);

    const dirResult = await shellUtils.findByName('match', 'directory');
    const fileResult = await shellUtils.findByName('match', 'file');

    expect(dirResult.isOk()).toBe(true);
    expect(fileResult.isOk()).toBe(true);
    if (dirResult.isOk()) {
      expect(dirResult.value).toContain('dirs/match');
      expect(dirResult.value).not.toContain('files/match');
    }
    if (fileResult.isOk()) {
      expect(fileResult.value).toContain('files/match');
      expect(fileResult.value).not.toContain('dirs/match');
    }
  });

  it('fails when target type is invalid', async () => {
    const result = await shellUtils.findByName('match', 'invalid' as 'file');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('SHELL_ERROR');
    }
  });
});

describe('runShellRaw', () => {
  it('captures stdout for a successful command', async () => {
    mockSpawnSequence([{ stdout: 'shell-ok\n' }]);

    const result = await shellTestHelpers.runShellRaw('node', ['-v']);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.stdout).toContain('shell-ok');
      expect(result.value.exitCode).toBe(0);
    }
  });

  it('returns an error when the command exits non-zero', async () => {
    mockSpawnSequence([{ stderr: 'boom\n', exitCode: 2 }]);

    const result = await shellTestHelpers.runShellRaw('node', ['-v']);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('SHELL_ERROR');
      expect(result.error.message).toContain('boom');
    }
  });
});
