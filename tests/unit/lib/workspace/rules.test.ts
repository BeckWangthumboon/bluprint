import fs from 'fs/promises';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { workspaceRules } from '../../../../src/lib/workspace/rules.js';
import { gitUtils } from '../../../../src/lib/git.js';
import { configUtils } from '../../../../src/lib/workspace/config.js';
import { createTempDir } from '../../../helpers/tempRepo.js';

describe('workspaceRules.parseRulesIndex', () => {
  it('parses and trims rule references', () => {
    const raw = JSON.stringify({
      rules: [
        { id: ' rule-1 ', name: ' Example ', description: ' desc ', path: ' rules/r1.md ' },
        { id: ' rule-2 ', description: ' desc2 ', path: ' rules/r2.md ' },
      ],
    });

    const result = workspaceRules.parseRulesIndex(raw, 'index.json');

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.rules).toEqual([
        { id: 'rule-1', name: 'Example', description: 'desc', path: 'rules/r1.md' },
        { id: 'rule-2', name: undefined, description: 'desc2', path: 'rules/r2.md' },
      ]);
    }
  });

  it('fails when rules are missing required fields', () => {
    const raw = JSON.stringify({ rules: [{ id: 'a', description: '', path: 'x' }] });

    const result = workspaceRules.parseRulesIndex(raw, 'index.json');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('CONFIG_PARSE_ERROR');
    }
  });

  it('fails when rules is not an array', () => {
    const raw = JSON.stringify({ rules: 'not-array' });

    const result = workspaceRules.parseRulesIndex(raw, 'index.json');

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('CONFIG_PARSE_ERROR');
    }
  });
});

describe('workspaceRules.loadRulesIndex', () => {
  let repoRoot: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    repoRoot = await createTempDir('rules-index-');
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('loads a rules index from disk', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);
    await configUtils.ensureWorkspace(config);

    const indexPath = path.join(repoRoot, config.workspace.rules.indexPath);
    await fs.mkdir(path.dirname(indexPath), { recursive: true });
    await fs.writeFile(
      indexPath,
      JSON.stringify({
        rules: [{ id: 'id-1', description: 'desc', path: 'rules/r1.md', name: 'Rule 1' }],
      }),
      'utf8',
    );

    const result = await workspaceRules.loadRulesIndex(config);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.rules[0]).toEqual({
        id: 'id-1',
        description: 'desc',
        path: 'rules/r1.md',
        name: 'Rule 1',
      });
    }
  });

  it('returns CONFIG_NOT_FOUND when index is missing', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);

    const result = await workspaceRules.loadRulesIndex(config);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('CONFIG_NOT_FOUND');
    }
  });
});
