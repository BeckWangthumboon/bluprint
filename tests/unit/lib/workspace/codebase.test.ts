import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { workspaceCodebase } from '../../../../src/lib/workspace/codebase.js';
import { gitUtils } from '../../../../src/lib/git.js';
import { configUtils } from '../../../../src/lib/workspace/config.js';
import { fsUtils } from '../../../../src/lib/fs.js';
import { createTempDir } from '../../../helpers/tempRepo.js';

describe('workspaceCodebase.parseCodebaseIndex', () => {
  it('parses valid index with files', () => {
    const raw = JSON.stringify({
      generatedAt: '2025-12-10T00:00:00.000Z',
      files: [
        { path: 'src/index.ts', description: 'Main entry point' },
        { path: 'src/utils.ts', description: 'Utility functions' },
      ],
    });

    const result = workspaceCodebase.parseCodebaseIndex(raw, 'semantic_index.json');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.generatedAt).toBe('2025-12-10T00:00:00.000Z');
      expect(result.value.files).toEqual([
        { path: 'src/index.ts', description: 'Main entry point' },
        { path: 'src/utils.ts', description: 'Utility functions' },
      ]);
    }
  });

  it('trims whitespace from fields', () => {
    const raw = JSON.stringify({
      generatedAt: ' 2025-12-10T00:00:00.000Z ',
      files: [{ path: ' src/index.ts ', description: ' Main entry point ' }],
    });

    const result = workspaceCodebase.parseCodebaseIndex(raw, 'semantic_index.json');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.generatedAt).toBe('2025-12-10T00:00:00.000Z');
      expect(result.value.files[0].path).toBe('src/index.ts');
      expect(result.value.files[0].description).toBe('Main entry point');
    }
  });

  it('fails when generatedAt is missing', () => {
    const raw = JSON.stringify({
      files: [],
    });

    const result = workspaceCodebase.parseCodebaseIndex(raw, 'semantic_index.json');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('CONFIG_PARSE_ERROR');
    }
  });

  it('fails when files is not an array', () => {
    const raw = JSON.stringify({
      generatedAt: '2025-12-10T00:00:00.000Z',
      files: 'not-array',
    });

    const result = workspaceCodebase.parseCodebaseIndex(raw, 'semantic_index.json');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('CONFIG_PARSE_ERROR');
    }
  });

  it('fails when file entry missing path', () => {
    const raw = JSON.stringify({
      generatedAt: '2025-12-10T00:00:00.000Z',
      files: [{ description: 'test' }],
    });

    const result = workspaceCodebase.parseCodebaseIndex(raw, 'semantic_index.json');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('CONFIG_PARSE_ERROR');
    }
  });
});

describe('workspaceCodebase.loadCodebaseIndex', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await createTempDir('codebase-index-');
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
  });

  afterEach(async () => {
    await fsUtils.fsRemove(repoRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('loads codebase index from disk', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);
    await configUtils.ensureWorkspace(config);

    const indexPath = config.workspace.codebase.semanticIndexPath;
    await fsUtils.fsMkdir(path.dirname(indexPath));
    await fsUtils.fsWriteFile(
      indexPath,
      JSON.stringify({
        generatedAt: '2025-12-10T00:00:00.000Z',
        files: [{ path: 'src/index.ts', description: 'Main entry' }],
      }),
    );

    const result = await workspaceCodebase.loadCodebaseIndex(config);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.files[0]).toEqual({
        path: 'src/index.ts',
        description: 'Main entry',
      });
    }
  });

  it('returns CONFIG_NOT_FOUND when index is missing', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);

    const result = await workspaceCodebase.loadCodebaseIndex(config);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('CONFIG_NOT_FOUND');
    }
  });
});

describe('workspaceCodebase.writeCodebaseIndex', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await createTempDir('codebase-write-');
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
  });

  afterEach(async () => {
    await fsUtils.fsRemove(repoRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('writes index to disk with pretty formatting', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);
    await configUtils.ensureWorkspace(config);

    const index = {
      generatedAt: '2025-12-10T00:00:00.000Z',
      files: [{ path: 'src/index.ts', description: 'Main' }],
    };

    const result = await workspaceCodebase.writeCodebaseIndex(index, config);

    expect(result.isOk()).toBe(true);

    const written = await fsUtils.fsReadFile(config.workspace.codebase.semanticIndexPath);
    expect(written.isOk()).toBe(true);
    if (written.isOk()) {
      const parsed = JSON.parse(written.value);
      expect(parsed).toEqual(index);
    }
  });
});
