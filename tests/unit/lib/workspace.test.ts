import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { EventEmitter } from 'events';
import path from 'path';
import { okAsync } from 'neverthrow';
import { createTempDir } from '../../helpers/tempRepo.js';

vi.mock('child_process', async () => {
  const actual = await import('node:child_process');
  return { ...actual, spawn: vi.fn() };
});
const childProcess = await import('child_process');
const spawnMock = childProcess.spawn as unknown as Mock;

let workspaceUtils: (typeof import('../../../src/lib/workspace.js'))['workspaceUtils'];
let gitUtils: (typeof import('../../../src/lib/git.js'))['gitUtils'];
let repoRoot: string;

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
  ({ workspaceUtils } = await import('../../../src/lib/workspace.js'));
  ({ gitUtils } = await import('../../../src/lib/git.js'));
  repoRoot = await createTempDir();
  vi.clearAllMocks();
  spawnMock.mockReset();
  spawnMock.mockImplementation(() => {
    throw new Error('spawn not mocked for this test');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('workspaceUtils.listWorkspaceFiles', () => {
  it('returns repo-relative files including untracked by default', async () => {
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
    mockSpawnSequence([{ stdout: 'tracked.txt\0nested/file.ts\0' }]);

    const result = await workspaceUtils.listWorkspaceFiles();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(['tracked.txt', 'nested/file.ts']);
    }

    expect(spawnMock).toHaveBeenCalledWith(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      expect.objectContaining({ cwd: repoRoot }),
    );
  });

  it('returns absolute paths and honors exclude patterns', async () => {
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
    mockSpawnSequence([{ stdout: 'src/app.ts\0' }]);

    const result = await workspaceUtils.listWorkspaceFiles({
      absolute: true,
      includeUntracked: false,
      extraExcludes: ['dist/**'],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toContain(path.join(repoRoot, 'src/app.ts'));
    }

    expect(spawnMock).toHaveBeenCalledWith(
      'git',
      ['ls-files', '-z', '--cached', '--exclude-standard', '--', ':!dist/**'],
      expect.objectContaining({ cwd: repoRoot }),
    );
  });

  it('rejects invalid exclude patterns', async () => {
    const result = await workspaceUtils.listWorkspaceFiles({ extraExcludes: ['valid', ''] });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('GIT_ERROR');
    }
  });

  it('surfaces git command failures', async () => {
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
    mockSpawnSequence([{ stderr: 'fatal error', exitCode: 1 }]);

    const result = await workspaceUtils.listWorkspaceFiles();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('GIT_COMMAND_FAILED');
      expect(result.error.message).toContain('fatal error');
    }
  });
});
