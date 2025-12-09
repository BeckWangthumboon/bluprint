import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { lookupRulesTool } from '../../../../src/agent/tools/lookupRules.js';
import { gitUtils, gitTestHelpers } from '../../../../src/lib/git.js';
import { configUtils } from '../../../../src/lib/workspace/config.js';
import { workspaceRules } from '../../../../src/lib/workspace/rules.js';
import { fsUtils } from '../../../../src/lib/fs.js';
import type { RuleReference } from '../../../../src/types/rules.js';
import { createTempDir } from '../../../helpers/tempRepo.js';

const writeConfigAndRules = async (repoRoot: string, rules: RuleReference[]) => {
  const config = configUtils.createDefaultConfig('main', repoRoot);

  const ensureResult = await configUtils.ensureWorkspace(config);
  if (ensureResult.isErr()) {
    throw new Error(`Failed to scaffold workspace: ${ensureResult.error.message}`);
  }

  const writeConfigResult = await configUtils.writeConfig(config);
  if (writeConfigResult.isErr()) {
    throw new Error(`Failed to write config: ${writeConfigResult.error.message}`);
  }

  const writeRulesResult = await workspaceRules.writeRulesIndex(config, { rules });
  if (writeRulesResult.isErr()) {
    throw new Error(`Failed to write rules index: ${writeRulesResult.error.message}`);
  }
};

describe('lookupRules tool', () => {
  let repoRoot: string;

  beforeEach(async () => {
    gitTestHelpers.resetRepoRootCache();
    vi.restoreAllMocks();
    repoRoot = await createTempDir('lookup-rules-');
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
  });

  afterEach(async () => {
    await fsUtils.fsRemove(repoRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
    gitTestHelpers.resetRepoRootCache();
  });

  it('returns the matching rule when present in the index', async () => {
    const rule: RuleReference = {
      id: 'rule-123',
      description: 'sample rule',
      path: 'rules/rule.md',
      tags: ['tag'],
    };
    await writeConfigAndRules(repoRoot, [rule]);

    const result = await lookupRulesTool.call({ ruleId: rule.id });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(rule);
    }
  });

  it('returns NOT_FOUND when the rule is missing', async () => {
    await writeConfigAndRules(repoRoot, []);

    const result = await lookupRulesTool.call({ ruleId: 'missing-rule' });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('returns IO_ERROR when the config file is missing', async () => {
    await fsUtils.fsRemove(path.join(repoRoot, '.bluprint'), { recursive: true, force: true });

    const result = await lookupRulesTool.call({ ruleId: 'anything' });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('IO_ERROR');
    }
  });
});
