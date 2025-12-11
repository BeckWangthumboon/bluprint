import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { okAsync } from 'neverthrow';
import { index } from '../../../src/commands/index.js';
import { configUtils } from '../../../src/lib/workspace/config.js';
import { codebaseIndexer } from '../../../src/lib/codebase/build.js';
import { workspaceCodebase } from '../../../src/lib/workspace/codebase.js';
import type { CodebaseIndex } from '../../../src/types/codebase.js';

describe('index command', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes index to file when no --json flag', async () => {
    const mockConfig = {
      workspace: { codebase: { semanticIndexPath: '.bluprint/codebase/semantic_index.json' } },
    };
    const mockIndex: CodebaseIndex = {
      generatedAt: '2025-12-10T00:00:00.000Z',
      files: [{ path: 'src/index.ts', description: 'Main' }],
    };

    vi.spyOn(configUtils, 'loadConfig').mockReturnValue(okAsync(mockConfig as any));
    vi.spyOn(codebaseIndexer, 'buildCodebaseIndex').mockReturnValue(okAsync(mockIndex));
    vi.spyOn(workspaceCodebase, 'writeCodebaseIndex').mockReturnValue(okAsync(undefined));

    const result = await index({ json: false });

    expect(result.isOk()).toBe(true);
    expect(workspaceCodebase.writeCodebaseIndex).toHaveBeenCalledWith(mockIndex);
  });

  it('outputs JSON to stdout with --json flag', async () => {
    const mockConfig = {
      workspace: { codebase: { semanticIndexPath: '.bluprint/codebase/semantic_index.json' } },
    };
    const mockIndex: CodebaseIndex = {
      generatedAt: '2025-12-10T00:00:00.000Z',
      files: [{ path: 'src/index.ts', description: 'Main' }],
    };

    vi.spyOn(configUtils, 'loadConfig').mockReturnValue(okAsync(mockConfig as any));
    vi.spyOn(codebaseIndexer, 'buildCodebaseIndex').mockReturnValue(okAsync(mockIndex));

    const result = await index({ json: true });

    expect(result.isOk()).toBe(true);
    expect(console.log).toHaveBeenCalledWith(JSON.stringify(mockIndex, null, 2));
  });

  it('passes directory parameter to indexer', async () => {
    const mockConfig = {
      workspace: { codebase: { semanticIndexPath: '.bluprint/codebase/semantic_index.json' } },
    };
    const mockIndex: CodebaseIndex = {
      generatedAt: '2025-12-10T00:00:00.000Z',
      files: [],
    };

    vi.spyOn(configUtils, 'loadConfig').mockReturnValue(okAsync(mockConfig as any));
    vi.spyOn(codebaseIndexer, 'buildCodebaseIndex').mockReturnValue(okAsync(mockIndex));
    vi.spyOn(workspaceCodebase, 'writeCodebaseIndex').mockReturnValue(okAsync(undefined));

    await index({ directory: 'src' });

    expect(codebaseIndexer.buildCodebaseIndex).toHaveBeenCalledWith('src');
  });

  it('returns error when config not found', async () => {
    const error = { code: 'CONFIG_NOT_FOUND', message: 'Config missing' };
    const { errAsync } = require('neverthrow');
    vi.spyOn(configUtils, 'loadConfig').mockReturnValue(errAsync(error));

    const result = await index({ json: false });

    expect(result.isErr()).toBe(true);
  });
});
