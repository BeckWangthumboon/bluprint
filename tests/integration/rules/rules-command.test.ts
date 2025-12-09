import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ok, okAsync } from 'neverthrow';
import { gitUtils } from '../../../src/lib/git.js';
import { fsUtils } from '../../../src/lib/fs.js';
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
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
  });

  afterEach(async () => {
    if (repoRoot) {
      await fsUtils.fsRemove(repoRoot, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('discovers rules from a directory source and writes the index', async () => {
    // scaffold workspace config
    const config = configUtils.createDefaultConfig(baseBranch, repoRoot!);
    await configUtils.ensureWorkspace(config);
    const writeConfigResult = await configUtils.writeConfig(config);
    expect(writeConfigResult.isOk()).toBe(true);

    // create a rule file under a directory
    const rulesDir = '.agent';
    await fsUtils.fsMkdir(rulesDir);
    const rulePath = path.join(rulesDir, 'AGENTS.md');
    await fsUtils.fsWriteFile(rulePath, '# agent rules');

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

    const indexContent = await fsUtils.fsReadFile(config.workspace.rules.indexPath);
    expect(indexContent.isOk()).toBe(true);
    if (indexContent.isErr()) return;
    const index: RulesIndex = JSON.parse(indexContent.value);

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
