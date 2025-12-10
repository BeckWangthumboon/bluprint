import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ok, okAsync } from 'neverthrow';
import { gitUtils } from '../../../src/lib/git.js';
import { fsUtils } from '../../../src/lib/fs.js';
import { createTempDir } from '../../helpers/tempRepo.js';
import { configUtils } from '../../../src/lib/workspace/config.js';
import type { Plan } from '../../../src/types/tasks.js';
import type { ResultAsync } from 'neverthrow';
import type { AppError } from '../../../src/types/errors.js';
import type { SuccessInfo } from '../../../src/lib/exit.js';
import type { PlanArgs } from '../../../src/types/commands.js';
import type { Specification } from '../../../src/types/spec.js';
import type { RulesIndex } from '../../../src/types/rules.js';

const baseBranch = 'main';
let plan: (args: PlanArgs) => ResultAsync<SuccessInfo, AppError>;

describe('plan command (integration-ish)', () => {
  let repoRoot: string | null;

  beforeEach(async () => {
    vi.clearAllMocks();
    repoRoot = await createTempDir('plan-integration-');
    vi.spyOn(gitUtils, 'gitGetRepoRoot').mockReturnValue(okAsync(repoRoot));
  });

  afterEach(async () => {
    if (repoRoot) {
      await fsUtils.fsRemove(repoRoot, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it('generates a plan from workspace spec and rules index', async () => {
    // scaffold workspace config
    const config = configUtils.createDefaultConfig(baseBranch, repoRoot!);
    await configUtils.ensureWorkspace(config);
    const writeConfigResult = await configUtils.writeConfig(config);
    expect(writeConfigResult.isOk()).toBe(true);

    // create a workspace spec
    const spec: Specification = {
      overview: {
        summary: 'Test feature',
        goals: ['Implement test feature'],
      },
      acceptance_criteria: ['Feature works correctly'],
      scope: {
        include: ['src/**'],
      },
      constraints: ['Use existing patterns'],
    };

    const specPath = config.workspace.specPath;
    await fsUtils.fsWriteFile(specPath, JSON.stringify(spec, null, 2));

    // create a rules index
    const rulesIndex: RulesIndex = {
      rules: [
        {
          id: 'test-rule',
          description: 'Test rule description',
          path: '.agent/test.md',
          tags: ['test'],
        },
      ],
    };

    const indexPath = config.workspace.rules.indexPath;
    await fsUtils.fsWriteFile(indexPath, JSON.stringify(rulesIndex, null, 2));

    // stub plan agent to avoid network/LLM
    const planAgentModule = await import('../../../src/agent/agents/planAgent.js');
    const mockPlan: Plan = {
      id: 'test-plan',
      summary: 'Test plan summary',
      tasks: [
        {
          id: 'task-1',
          title: 'Test task',
          instructions: 'Do something',
          rules: [rulesIndex.rules[0]!],
        },
      ],
    };

    vi.spyOn(planAgentModule.planAgent, 'createPlanAgent').mockReturnValue(
      ok(() => okAsync(mockPlan)),
    );

    plan = (await import('../../../src/commands/plan.js')).plan;

    // run the command
    const result = await plan({
      json: true,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    expect(result.value).toEqual({
      command: 'plan',
      message: 'Generated plan with 1 task(s).',
      details: undefined, // json flag means no details
    });

    // verify plan was written to workspace
    const planContent = await fsUtils.fsReadFile(config.workspace.state.planPath);
    expect(planContent.isOk()).toBe(true);
    if (planContent.isErr()) return;

    const writtenPlan: Plan = JSON.parse(planContent.value);
    expect(writtenPlan).toEqual(mockPlan);
  });

  it('includes task titles when json flag is false', async () => {
    // scaffold workspace config
    const config = configUtils.createDefaultConfig(baseBranch, repoRoot!);
    await configUtils.ensureWorkspace(config);
    await configUtils.writeConfig(config);

    // create a workspace spec
    const spec: Specification = {
      overview: {
        summary: 'Test feature',
      },
      acceptance_criteria: ['Works'],
      scope: {
        include: ['src/**'],
      },
      constraints: ['Follow best practices'],
    };

    await fsUtils.fsWriteFile(config.workspace.specPath, JSON.stringify(spec, null, 2));

    // create a rules index
    const rulesIndex: RulesIndex = {
      rules: [
        {
          id: 'test-rule',
          description: 'Test rule',
          path: '.agent/test.md',
          tags: ['test'],
        },
      ],
    };

    await fsUtils.fsWriteFile(
      config.workspace.rules.indexPath,
      JSON.stringify(rulesIndex, null, 2),
    );

    // stub plan agent
    const planAgentModule = await import('../../../src/agent/agents/planAgent.js');
    const mockPlan: Plan = {
      id: 'test-plan',
      tasks: [
        {
          id: 'task-1',
          title: 'First task',
          instructions: 'Do first thing',
          rules: [rulesIndex.rules[0]!],
        },
        {
          id: 'task-2',
          title: 'Second task',
          instructions: 'Do second thing',
          rules: [rulesIndex.rules[0]!],
        },
      ],
    };

    vi.spyOn(planAgentModule.planAgent, 'createPlanAgent').mockReturnValue(
      ok(() => okAsync(mockPlan)),
    );

    plan = (await import('../../../src/commands/plan.js')).plan;

    // run the command with json: false
    const result = await plan({
      json: false,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    expect(result.value).toEqual({
      command: 'plan',
      message: 'Generated plan with 2 task(s).',
      details: ['First task', 'Second task'],
    });
  });

  it('fails when workspace spec is missing', async () => {
    // scaffold workspace config without spec
    const config = configUtils.createDefaultConfig(baseBranch, repoRoot!);
    await configUtils.ensureWorkspace(config);
    await configUtils.writeConfig(config);

    // create rules index but no spec
    const rulesIndex: RulesIndex = {
      rules: [
        {
          id: 'test-rule',
          description: 'Test rule',
          path: '.agent/test.md',
          tags: ['test'],
        },
      ],
    };

    await fsUtils.fsWriteFile(
      config.workspace.rules.indexPath,
      JSON.stringify(rulesIndex, null, 2),
    );

    plan = (await import('../../../src/commands/plan.js')).plan;

    const result = await plan({
      json: true,
    });

    expect(result.isErr()).toBe(true);
  });

  it('fails when rules index is missing', async () => {
    // scaffold workspace config without rules index
    const config = configUtils.createDefaultConfig(baseBranch, repoRoot!);
    await configUtils.ensureWorkspace(config);
    await configUtils.writeConfig(config);

    // create spec but no rules index
    const spec: Specification = {
      overview: {
        summary: 'Test feature',
      },
      acceptance_criteria: ['Works'],
      scope: {
        include: ['src/**'],
      },
      constraints: ['Be awesome'],
    };

    await fsUtils.fsWriteFile(config.workspace.specPath, JSON.stringify(spec, null, 2));

    plan = (await import('../../../src/commands/plan.js')).plan;

    const result = await plan({
      json: true,
    });

    expect(result.isErr()).toBe(true);
  });
});
