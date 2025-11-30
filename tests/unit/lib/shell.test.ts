import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { okAsync } from 'neverthrow';
import { createTempDir } from '../../helpers/tempRepo.js';

let shellUtils: (typeof import('../../../src/lib/shell.js'))['shellUtils'];
let shellTestHelpers: (typeof import('../../../src/lib/shell.js'))['shellTestHelpers'];
let gitUtils: (typeof import('../../../src/lib/git.js'))['gitUtils'];
let repoRoot: string;

beforeEach(async () => {
  ({ shellUtils, shellTestHelpers } = await import('../../../src/lib/shell.js'));
  ({ gitUtils } = await import('../../../src/lib/git.js'));
  repoRoot = await createTempDir();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shellUtils.findByName', () => {
  it('returns matching files from the provided repo root', async () => {
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
    const targetPath = path.join(repoRoot, 'match.txt');
    await writeFile(targetPath, 'hello', 'utf8');
    await writeFile(path.join(repoRoot, 'other.log'), 'skip', 'utf8');

    const result = await shellUtils.findByName('match.txt');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toContain(targetPath);
    }
  });

  it('returns an empty array when no files match', async () => {
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));

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
    const dirPath = path.join(repoRoot, 'dirs', 'match');
    const filePath = path.join(repoRoot, 'files', 'match');
    await mkdir(dirPath, { recursive: true });
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(path.join(dirPath, 'keep.txt'), 'data', 'utf8');
    await writeFile(filePath, 'file content', 'utf8');

    const dirResult = await shellUtils.findByName('match', 'directory');
    const fileResult = await shellUtils.findByName('match', 'file');

    expect(dirResult.isOk()).toBe(true);
    expect(fileResult.isOk()).toBe(true);
    if (dirResult.isOk() && fileResult.isOk()) {
      expect(dirResult.value).toContain(dirPath);
      expect(dirResult.value).not.toContain(filePath);
      expect(fileResult.value).toContain(filePath);
      expect(fileResult.value).not.toContain(dirPath);
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
    const result = await shellTestHelpers.runShellRaw(process.execPath, [
      '-e',
      "console.log('shell-ok')",
    ]);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.stdout).toContain('shell-ok');
      expect(result.value.exitCode).toBe(0);
    }
  });

  it('returns an error when the command exits non-zero', async () => {
    const result = await shellTestHelpers.runShellRaw(process.execPath, [
      '-e',
      'process.exit(2)',
    ]);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('SHELL_ERROR');
      expect(result.error.message).toContain('exited with code 2');
    }
  });
});
