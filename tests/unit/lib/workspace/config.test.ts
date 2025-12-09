import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { configUtils } from '../../../../src/lib/workspace/config.js';
import { gitUtils } from '../../../../src/lib/git.js';
import { fsUtils } from '../../../../src/lib/fs.js';
import { createTempDir } from '../../../helpers/tempRepo.js';

describe('workspace config', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await createTempDir('workspace-config-');
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
  });

  afterEach(async () => {
    await fsUtils.fsRemove(repoRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('creates default config anchored to the repo root', () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);

    expect(config.workspace.root).toBe('.bluprint');
    expect(config.workspace.specPath).toBe('.bluprint/spec/spec.yaml');
    expect(config.workspace.rules.indexPath).toBe('.bluprint/rules/index.json');
    expect(config.workspace.state.planPath).toBe('.bluprint/state/plan.json');
  });

  it('scaffolds the workspace tree and seed files', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);

    const result = await configUtils.ensureWorkspace(config);

    expect(result.isOk()).toBe(true);

    const specDir = path.join(repoRoot, '.bluprint', 'spec');
    const rulesIndex = path.join(repoRoot, '.bluprint', 'rules', 'index.json');
    const planPath = path.join(repoRoot, '.bluprint', 'state', 'plan.json');
    const lastEvalPath = path.join(repoRoot, '.bluprint', 'state', 'evaluations', 'last.json');

    const specDirStat = await fsUtils.fsStat(specDir);
    expect(specDirStat.isOk()).toBe(true);

    const rulesIndexContent = await fsUtils.fsReadFile(rulesIndex);
    expect(rulesIndexContent.isOk()).toBe(true);
    if (rulesIndexContent.isOk()) {
      expect(rulesIndexContent.value).toContain('"rules": []');
    }

    const planContent = await fsUtils.fsReadFile(planPath);
    expect(planContent.isOk()).toBe(true);
    if (planContent.isOk()) {
      expect(planContent.value).toBe('{}\n');
    }

    const lastEvalContent = await fsUtils.fsReadFile(lastEvalPath);
    expect(lastEvalContent.isOk()).toBe(true);
    if (lastEvalContent.isOk()) {
      expect(lastEvalContent.value).toBe('{}\n');
    }
  });

  it('loads config from disk via loadConfig', async () => {
    const config = configUtils.createDefaultConfig('develop', repoRoot);
    await configUtils.ensureWorkspace(config);
    await configUtils.writeConfig(config);

    const result = await configUtils.loadConfig();

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.base).toBe('develop');
      expect(result.value.workspace.specPath).toBe('.bluprint/spec/spec.yaml');
    }
  });
});
