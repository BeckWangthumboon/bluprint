import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { errAsync, okAsync } from 'neverthrow';
import { readFile } from 'fs/promises';
import { init } from '../../src/commands/init.js';
import { gitUtils } from '../../src/lib/git.js';
import { createAppError } from '../../src/types/errors.js';
import { initGitRepo, readJsonFile, writeSpecFile } from '../helpers/tempRepo.js';

const baseBranch = 'main';

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('init command (integration)', () => {
  it('scaffolds .bluprint with config and moved spec on success', async () => {
    const repoRoot = await initGitRepo(baseBranch);
    const specPath = await writeSpecFile(repoRoot, 'spec.md', '# Spec');

    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
    vi.spyOn(gitUtils, 'gitFetchPrune').mockReturnValue(
      okAsync({ stdout: '', stderr: '', exitCode: 0 }),
    );
    vi.spyOn(gitUtils, 'gitCheckBranchExists').mockReturnValue(okAsync(true));

    const result = await init({ spec: specPath, base: baseBranch });

    expect(result.isOk()).toBe(true);

    const bluprintDir = path.join(repoRoot, '.bluprint');
    const configPath = path.join(bluprintDir, 'config.json');
    const movedSpecPath = path.join(bluprintDir, 'spec.md');

    const config = await readJsonFile<{ base: string; specPath: string }>(configPath);
    expect(config.base).toBe(baseBranch);
    expect(config.specPath).toBe('.bluprint/spec.md');

    const movedSpec = await readFile(movedSpecPath, 'utf8');
    expect(movedSpec).toContain('# Spec');
  });

  it('fails when the spec file does not exist', async () => {
    const repoRoot = await initGitRepo(baseBranch);

    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
    vi.spyOn(gitUtils, 'gitFetchPrune').mockReturnValue(
      okAsync({ stdout: '', stderr: '', exitCode: 0 }),
    );
    vi.spyOn(gitUtils, 'gitCheckBranchExists').mockReturnValue(okAsync(true));

    const result = await init({ spec: path.join(repoRoot, 'missing.md'), base: baseBranch });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('FS_NOT_FOUND');
    }
  });

  it('fails when the base branch is missing', async () => {
    const repoRoot = await initGitRepo(baseBranch);
    const specPath = await writeSpecFile(repoRoot, 'spec.md', '# Spec');

    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
    vi.spyOn(gitUtils, 'gitFetchPrune').mockReturnValue(
      okAsync({ stdout: '', stderr: '', exitCode: 0 }),
    );
    vi.spyOn(gitUtils, 'gitCheckBranchExists').mockReturnValue(okAsync(false));

    const result = await init({ spec: specPath, base: 'feature/nope' });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('GIT_ERROR');
    }
  });

  it('fails when not inside a git repository', async () => {
    const repoRoot = await initGitRepo(baseBranch);
    const specPath = await writeSpecFile(repoRoot, 'spec.md', '# Spec');

    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(
      errAsync(createAppError('GIT_NOT_REPO', 'Not inside a git repository')),
    );

    const result = await init({ spec: specPath, base: baseBranch });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('GIT_NOT_REPO');
    }
  });
});
