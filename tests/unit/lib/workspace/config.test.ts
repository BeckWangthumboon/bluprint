import path from 'path';
import fs from 'fs/promises';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { configUtils } from '../../../../src/lib/workspace/config.js';
import { gitUtils } from '../../../../src/lib/git.js';
import { createTempDir } from '../../../helpers/tempRepo.js';

describe('workspace config', () => {
  let repoRoot: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    repoRoot = await createTempDir('workspace-config-');
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(repoRoot, { recursive: true, force: true });
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

    await expect(fs.stat(specDir)).resolves.toBeDefined();
    await expect(fs.readFile(rulesIndex, 'utf8')).resolves.toContain('"rules": []');
    await expect(fs.readFile(planPath, 'utf8')).resolves.toBe('{}\n');
    await expect(fs.readFile(lastEvalPath, 'utf8')).resolves.toBe('{}\n');
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
