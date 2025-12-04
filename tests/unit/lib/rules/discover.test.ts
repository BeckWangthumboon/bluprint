import fs from 'fs/promises';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { ruleDiscovery } from '../../../../src/lib/rules/discover.js';
import { gitUtils } from '../../../../src/lib/git.js';
import { shellUtils } from '../../../../src/lib/shell.js';
import { configUtils } from '../../../../src/lib/workspace/config.js';
import { createTempDir } from '../../../helpers/tempRepo.js';

describe('ruleDiscovery.discoverRules', () => {
  let repoRoot: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    repoRoot = await createTempDir('rules-disc-');
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
    vi.spyOn(shellUtils, 'findByName').mockReturnValue(okAsync([]));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it('discovers rules from provided embedded files only', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);

    const embeddedPath = path.join(repoRoot, 'AGENTS.md');
    await fs.writeFile(embeddedPath, '# agents\n', 'utf8');
    (shellUtils.findByName as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      okAsync(['AGENTS.md']),
    );

    const result = await ruleDiscovery.discoverRules(config, {
      embeddedRuleFile: 'AGENTS.md',
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([{ path: 'AGENTS.md' }]);
    }
  });

  it('discovers rules from provided centralized directories only', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);

    const rulesDir = path.join(repoRoot, '.cursor', 'rules');
    await fs.mkdir(rulesDir, { recursive: true });
    await fs.writeFile(path.join(rulesDir, 'rule-a.md'), '# rule a\n', 'utf8');
    await fs.writeFile(path.join(rulesDir, 'rule-b.mdc'), '# rule b\n', 'utf8');
    (shellUtils.findByName as unknown as ReturnType<typeof vi.fn>).mockReturnValue(okAsync([]));

    const result = await ruleDiscovery.discoverRules(config, {
      centralizedRuleDir: rulesDir,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(
        expect.arrayContaining([
          { path: path.join('.cursor', 'rules', 'rule-a.md') },
          { path: path.join('.cursor', 'rules', 'rule-b.mdc') },
        ]),
      );
      expect(result.value).toHaveLength(2);
    }
  });

  it('errors when both modes are provided', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);

    const result = await ruleDiscovery.discoverRules(config, {
      embeddedRuleFile: 'AGENTS.md',
      centralizedRuleDir: '.cursor/rules',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('errors when no inputs are provided', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);

    const result = await ruleDiscovery.discoverRules(config, {
      embeddedRuleFile: undefined,
      centralizedRuleDir: undefined,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });
});
