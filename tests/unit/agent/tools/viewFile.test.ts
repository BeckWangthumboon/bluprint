import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { viewFileTool } from '../../../../src/agent/tools/viewFile.js';
import { gitUtils, gitTestHelpers } from '../../../../src/lib/git.js';
import { fsUtils } from '../../../../src/lib/fs.js';
import { createTempDir } from '../../../helpers/tempRepo.js';

describe('viewFile tool', () => {
  let repoRoot: string;

  beforeEach(async () => {
    gitTestHelpers.resetRepoRootCache();
    vi.restoreAllMocks();
    repoRoot = await createTempDir('view-file-');
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
  });

  afterEach(async () => {
    await fsUtils.fsRemove(repoRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
    gitTestHelpers.resetRepoRootCache();
  });

  it('returns repo-relative path and file contents on success', async () => {
    const targetPath = path.join(repoRoot, 'docs', 'note.txt');
    await fsUtils.fsMkdir(path.dirname(targetPath));
    await fsUtils.fsWriteFile(targetPath, 'hello world');

    const result = await viewFileTool.call({ path: targetPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.path).toBe(path.join('docs', 'note.txt'));
      expect(result.value.contents).toBe('hello world');
    }
  });

  it('returns IO_ERROR when the file is missing', async () => {
    const missingPath = path.join(repoRoot, 'missing.txt');

    const result = await viewFileTool.call({ path: missingPath });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('IO_ERROR');
      expect(result.error.message).toContain('Unable to read file');
    }
  });

  it('returns INVALID_ARGS when the path escapes the repo', async () => {
    const outsidePath = path.join(repoRoot, '..', 'outside.txt');

    const result = await viewFileTool.call({ path: outsidePath });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('INVALID_ARGS');
    }
  });
});
