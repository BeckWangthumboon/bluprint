import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { okAsync } from 'neverthrow';
import { workspacePlan } from '../../../../src/lib/workspace/plan.js';
import { gitUtils } from '../../../../src/lib/git.js';
import { configUtils } from '../../../../src/lib/workspace/config.js';
import { fsUtils } from '../../../../src/lib/fs.js';
import { createTempDir } from '../../../helpers/tempRepo.js';

describe('workspacePlan.loadPlan', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await createTempDir('plan-');
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
  });

  afterEach(async () => {
    await fsUtils.fsRemove(repoRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('loads a plan from disk', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);
    await configUtils.ensureWorkspace(config);

    const planPath = config.workspace.state.planPath;
    await fsUtils.fsMkdir(path.dirname(planPath));
    await fsUtils.fsWriteFile(
      planPath,
      JSON.stringify({
        id: 'plan-1',
        summary: 'Test plan',
        tasks: [
          {
            id: 'task-1',
            title: 'Test task',
            instructions: 'Do something',
            rules: [],
          },
        ],
      }),
    );

    const result = await workspacePlan.loadPlan(config);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.id).toBe('plan-1');
      expect(result.value.summary).toBe('Test plan');
      expect(result.value.tasks).toHaveLength(1);
      expect(result.value.tasks[0]?.id).toBe('task-1');
    }
  });

  it('returns CONFIG_NOT_FOUND when plan is missing', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);

    const result = await workspacePlan.loadPlan(config);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('CONFIG_NOT_FOUND');
    }
  });

  it('fails when plan is missing required id field', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);
    await configUtils.ensureWorkspace(config);

    const planPath = config.workspace.state.planPath;
    await fsUtils.fsWriteFile(
      planPath,
      JSON.stringify({
        tasks: [],
      }),
    );

    const result = await workspacePlan.loadPlan(config);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('CONFIG_PARSE_ERROR');
    }
  });

  it('fails when plan is missing tasks array', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);
    await configUtils.ensureWorkspace(config);

    const planPath = config.workspace.state.planPath;
    await fsUtils.fsWriteFile(
      planPath,
      JSON.stringify({
        id: 'plan-1',
      }),
    );

    const result = await workspacePlan.loadPlan(config);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('CONFIG_PARSE_ERROR');
    }
  });

  it('fails when plan is not a JSON object', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);
    await configUtils.ensureWorkspace(config);

    const planPath = config.workspace.state.planPath;
    await fsUtils.fsWriteFile(planPath, JSON.stringify('not-an-object'));

    const result = await workspacePlan.loadPlan(config);

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe('CONFIG_PARSE_ERROR');
    }
  });
});

describe('workspacePlan.writePlan', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await createTempDir('plan-write-');
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
  });

  afterEach(async () => {
    await fsUtils.fsRemove(repoRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('writes a plan to disk', async () => {
    const config = configUtils.createDefaultConfig('main', repoRoot);
    await configUtils.ensureWorkspace(config);

    const plan = {
      id: 'plan-1',
      summary: 'Test plan',
      tasks: [
        {
          id: 'task-1',
          title: 'Test task',
          instructions: 'Do something',
          rules: [],
        },
      ],
    };

    const writeResult = await workspacePlan.writePlan(config, plan);
    expect(writeResult.isOk()).toBe(true);

    // Verify it was written correctly
    const loadResult = await workspacePlan.loadPlan(config);
    expect(loadResult.isOk()).toBe(true);
    if (loadResult.isOk()) {
      expect(loadResult.value).toEqual(plan);
    }
  });
});
