import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { ruleNormalize, type RuleSummarizer } from '../../../../src/lib/rules/normalize.js';
import { gitUtils } from '../../../../src/lib/git.js';
import { fsUtils } from '../../../../src/lib/fs.js';
import { createTempDir } from '../../../helpers/tempRepo.js';

describe('ruleNormalize.buildRuleId', () => {
  it('creates a stable slug with hashed suffix', () => {
    const id = ruleNormalize.buildRuleId('rules/auth/login.yaml');
    expect(id.startsWith('login-')).toBe(true);
    expect(id.length).toBeGreaterThan('login-'.length);
  });
});

describe('ruleNormalize.buildRuleReference', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await createTempDir('rules-norm-');
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
  });

  afterEach(async () => {
    await fsUtils.fsRemove(repoRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('creates a RuleReference using a provided summarizer', async () => {
    const rulePath = path.join('rules', 'feature.md');
    await fsUtils.fsMkdir(path.dirname(rulePath));
    await fsUtils.fsWriteFile(rulePath, '# Feature rules\nDetails');

    const summarizer: RuleSummarizer = () =>
      okAsync({ description: 'Feature summary', tags: ['feature', 'ui'] });

    const result = await ruleNormalize.buildRuleReference({ path: rulePath }, summarizer);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toMatchObject({
        path: rulePath,
        description: 'Feature summary',
        tags: ['feature', 'ui'],
      });
      expect(result.value.id).toContain('feature');
    }
  });
});
