import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import { writeFile } from 'fs/promises';
import { okAsync } from 'neverthrow';
import { initGitRepo, createTempDir, runGit } from '../../helpers/tempRepo.js';
import { resetRepoRootCache } from '../../helpers/gitCache.js';

let gitUtils: (typeof import('../../../src/lib/git.js'))['gitUtils'];
let repoRoot: string;
let originalEnv: NodeJS.ProcessEnv;
const baseBranch = 'main';

beforeEach(async () => {
  ({ gitUtils } = await import('../../../src/lib/git.js'));
  resetRepoRootCache();
  repoRoot = await initGitRepo('main');
  originalEnv = { ...process.env };
  vi.restoreAllMocks();
});

afterEach(() => {
  Object.keys(process.env).forEach((key) => {
    delete process.env[key];
  });
  Object.assign(process.env, originalEnv);
  vi.restoreAllMocks();
});

describe('gitUtils', () => {
  it('returns true when a branch exists', async () => {
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));

    const result = await gitUtils.gitCheckBranchExists('main');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(true);
    }
  });

  it('returns false when a branch does not exist', async () => {
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));

    const result = await gitUtils.gitCheckBranchExists('missing-branch');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(false);
    }
  });

  it('returns repo root when git environment points to a repository', async () => {
    process.env.GIT_DIR = path.join(repoRoot, '.git');
    process.env.GIT_WORK_TREE = repoRoot;

    const result = await gitUtils.gitGetRepoRoot();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(path.resolve(result.value)).toBe(path.resolve(repoRoot));
    }
  });

  it('returns an error when git environment is not a repository', async () => {
    const tempDir = await createTempDir();
    process.env.GIT_DIR = path.join(tempDir, '.git');
    process.env.GIT_WORK_TREE = tempDir;

    const result = await gitUtils.gitGetRepoRoot();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(['GIT_NOT_REPO', 'GIT_ERROR']).toContain(result.error.code);
    }
  });

  it('returns a diff between the base branch and HEAD', async () => {
    const repoRoot = await initGitRepo(baseBranch);
    await runGit(repoRoot, ['checkout', '-b', 'feature/check-diff']);
    const filePath = path.join(repoRoot, 'README.md');
    await writeFile(filePath, '# updated\n', 'utf8');
    await runGit(repoRoot, ['add', 'README.md']);
    await runGit(repoRoot, ['commit', '-m', 'docs: update readme']);

    process.env.GIT_DIR = path.join(repoRoot, '.git');
    process.env.GIT_WORK_TREE = repoRoot;
    resetRepoRootCache();

    const diffResult = await gitUtils.gitGetDiffAgainst(baseBranch);

    expect(diffResult.isOk()).toBe(true);
    if (diffResult.isOk()) {
      expect(diffResult.value).toContain('# updated');
      expect(diffResult.value).toContain('README.md');
    }
  });

  it('fails when base reference is missing', async () => {
    const result = await gitUtils.gitGetDiffAgainst('  ');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('GIT_ERROR');
    }
  });
});
