import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { fsUtils } from '../../../src/lib/fs.js';
import { gitUtils } from '../../../src/lib/git.js';
import { createTempDir } from '../../helpers/tempRepo.js';

let repoRoot: string;

beforeEach(async () => {
  repoRoot = await createTempDir();
  vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fsUtils', () => {
  it('writes and reads a file inside the repo root', async () => {
    const relativeDir = 'nested';
    const relativePath = path.join(relativeDir, 'file.txt');

    await fsUtils.fsMkdir(relativeDir);
    const writeResult = await fsUtils.fsWriteFile(relativePath, 'hello');

    expect(writeResult.isOk()).toBe(true);

    const readResult = await fsUtils.fsReadFile(relativePath);
    expect(readResult.isOk()).toBe(true);
    if (readResult.isOk()) {
      expect(readResult.value).toBe('hello');
    }
  });

  it('moves a file within the repo root', async () => {
    const source = path.join('tmp', 'from.txt');
    const destination = path.join('tmp', 'sub', 'to.txt');

    await fsUtils.fsMkdir(path.dirname(source));
    await fsUtils.fsWriteFile(source, 'move me');
    await fsUtils.fsMkdir(path.dirname(destination));
    const moveResult = await fsUtils.fsMove(source, destination);

    expect(moveResult.isOk()).toBe(true);

    const readResult = await fsUtils.fsReadFile(destination);
    expect(readResult.isOk()).toBe(true);
    if (readResult.isOk()) {
      expect(readResult.value).toBe('move me');
    }
  });

  it('rejects paths that escape the repo root', async () => {
    const result = await fsUtils.fsWriteFile('../outside.txt', 'nope');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('FS_ERROR');
    }
  });

  it('returns not found when checking access for missing paths', async () => {
    const result = await fsUtils.fsCheckAccess('missing.txt');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('FS_NOT_FOUND');
    }
  });

  it('lists files recursively within the repo root', async () => {
    await fsUtils.fsMkdir(path.join('rules', 'nested'));
    await fsUtils.fsWriteFile(path.join('rules', 'root.md'), 'root');
    await fsUtils.fsWriteFile(path.join('rules', 'nested', 'child.yml'), 'child');

    const result = await fsUtils.fsListFilesRecursive('rules');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(2);
      expect(result.value).toEqual(
        expect.arrayContaining([
          path.join(repoRoot, 'rules', 'root.md'),
          path.join(repoRoot, 'rules', 'nested', 'child.yml'),
        ]),
      );
    }
  });

  it('rejects directory traversal outside the repo root', async () => {
    const result = await fsUtils.fsListFilesRecursive('../outside');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('FS_ERROR');
    }
  });

  it('removes files or directories within the repo root', async () => {
    await fsUtils.fsMkdir(path.join('tmp', 'remove'));
    await fsUtils.fsWriteFile(path.join('tmp', 'remove', 'file.txt'), 'content');

    const removeResult = await fsUtils.fsRemove(path.join('tmp', 'remove'));

    expect(removeResult.isOk()).toBe(true);

    const accessResult = await fsUtils.fsCheckAccess(path.join('tmp', 'remove'));
    expect(accessResult.isErr()).toBe(true);
    if (accessResult.isErr()) {
      expect(accessResult.error.code).toBe('FS_NOT_FOUND');
    }
  });

  it('returns not found when removing a missing path', async () => {
    const result = await fsUtils.fsRemove('missing.txt');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('FS_NOT_FOUND');
    }
  });
});
