import fs from 'fs/promises';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ok, okAsync } from 'neverthrow';
import { gitUtils } from '../../../src/lib/git.js';
import { createTempDir } from '../../helpers/tempRepo.js';
import { configUtils } from '../../../src/lib/workspace/config.js';
import type { RulesIndex } from '../../../src/types/rules.js';
import type { ResultAsync } from 'neverthrow';
import type { AppError } from '../../../src/types/errors.js';
import type { SuccessInfo } from '../../../src/lib/exit.js';
import type { RulesArgs } from '../../../src/types/commands.js';

const baseBranch = 'main';
let rules: (args: RulesArgs) => ResultAsync<SuccessInfo, AppError>;

describe('rules command (integration-ish)', () => {
  let repoRoot: string | null;

  beforeEach(async () => {
    vi.clearAllMocks();
    repoRoot = await createTempDir('rules-integration-');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (repoRoot) {
      await fs.rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('discovers rules from a directory source and writes the index', async () => {
    // mock repo root
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));

    // scaffold workspace config
    const config = configUtils.createDefaultConfig(baseBranch, repoRoot);
    await configUtils.ensureWorkspace(config);
    const writeConfigResult = await configUtils.writeConfig(config);
    expect(writeConfigResult.isOk()).toBe(true);

    // create a rule file under a directory
    const rulesDir = path.join(repoRoot, '.agent');
    await fs.mkdir(rulesDir, { recursive: true });
    const rulePath = path.join(rulesDir, 'AGENTS.md');
    await fs.writeFile(rulePath, '# agent rules', 'utf8');

    // stub summarizer to avoid network/LLM
    const summarizerModule = await import('../../../src/agent/agents/ruleSummarizer.js');
    vi.spyOn(summarizerModule.ruleSummarizer, 'createModelSummarizer').mockReturnValue(
      ok(() => okAsync({ description: 'desc', tags: ['test'] })),
    );
    rules = (await import('../../../src/commands/rules.js')).rules;

    // run the command
    const result = await rules({
      rulesSource: 'directory',
      rulesDir: '.agent',
      json: true,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    const index: RulesIndex = JSON.parse(
      await fs.readFile(path.join(repoRoot, config.workspace.rules.indexPath), 'utf8'),
    );

    expect(index.rules).toEqual([
      {
        id: expect.stringContaining('agents'),
        description: 'desc',
        path: '.agent/AGENTS.md',
        tags: ['test'],
      },
    ]);
  });

  it('fails when required directory arg is missing', async () => {
    rules = (await import('../../../src/commands/rules.js')).rules;

    const result = await rules({
      rulesSource: 'directory',
      json: true,
    } as never);

    expect(result.isErr()).toBe(true);
  });
});
