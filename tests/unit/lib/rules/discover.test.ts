import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { ruleDiscovery } from '../../../../src/lib/rules/discover.js';
import { gitUtils } from '../../../../src/lib/git.js';
import { shellUtils } from '../../../../src/lib/shell.js';
import { configUtils } from '../../../../src/lib/workspace/config.js';
import { fsUtils } from '../../../../src/lib/fs.js';
import { createTempDir } from '../../../helpers/tempRepo.js';

describe('ruleDiscovery.discoverRules', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await createTempDir('rules-disc-');
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
    vi.spyOn(shellUtils, 'findByName').mockReturnValue(okAsync([]));
  });

  afterEach(async () => {
    await fsUtils.fsRemove(repoRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('discovers rules from provided embedded files only', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);

    const embeddedPath = path.join('AGENTS.md');
    await fsUtils.fsWriteFile(embeddedPath, '# agents\n');
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

    const rulesDir = path.join('.cursor', 'rules');
    await fsUtils.fsMkdir(rulesDir);
    await fsUtils.fsWriteFile(path.join(rulesDir, 'rule-a.md'), '# rule a\n');
    await fsUtils.fsWriteFile(path.join(rulesDir, 'rule-b.mdc'), '# rule b\n');
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
