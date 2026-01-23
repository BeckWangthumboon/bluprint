import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { ResultAsync } from 'neverthrow';
import type { LoopState } from '../../../src/orchestration/types.js';
import { createWorkspaceFixture, createWorkspaceModule } from '../../helpers/workspace.js';
import type { WorkspaceFixture } from '../../helpers/workspace.js';

describe('orchestration/state', () => {
  let fixture: WorkspaceFixture;
  let stateUtils: typeof import('../../../src/orchestration/state.js').stateUtils;

  const expectOk = async <T>(result: ResultAsync<T, Error>): Promise<T> => {
    const resolved = await result;
    if (resolved.isErr()) {
      throw resolved.error;
    }
    return resolved.value;
  };

  const expectError = async <T>(result: ResultAsync<T, Error>, message: string): Promise<void> => {
    try {
      const resolved = await result;
      if (resolved.isErr()) {
        expect(resolved.error.message).toContain(message);
        return;
      }
      throw new Error('Expected error result');
    } catch (error) {
      expect((error as Error).message).toContain(message);
    }
  };

  const readState = async (): Promise<LoopState> => {
    const raw = await fixture.readCacheFile('state.json');
    return JSON.parse(raw) as LoopState;
  };

  const writePlan = async (content: string): Promise<void> => {
    await fixture.writeCacheFile('plan.md', content);
  };

  const buildState = (overrides: Partial<LoopState> = {}): LoopState => ({
    version: '1.0.0',
    status: 'executing',
    currentTaskNumber: 1,
    isRetry: false,
    maxIterations: 5,
    maxTimeMinutes: 10,
    iterationCount: 0,
    tasks: [{ taskNumber: 1, status: 'in_progress' }],
    ...overrides,
  });

  beforeAll(async () => {
    fixture = await createWorkspaceFixture();
    await mock.module('../../../src/workspace.js', () => createWorkspaceModule(fixture.paths));

    const mod = await import('../../../src/orchestration/state.js');
    stateUtils = mod.stateUtils;
  });

  beforeEach(async () => {
    await fixture.reset();
  });

  afterAll(async () => {
    mock.restore();
    await fixture.cleanup();
  });

  it('initializes state from sequential plan tasks', async () => {
    await writePlan('## 1 First task\n\n## 2 Second task\n');
    const result = await stateUtils.initializeState({ maxIterations: 3, maxTimeMinutes: 15 });

    expect(result.isOk()).toBe(true);

    const state = await readState();
    expect(state.status).toBe('planning');
    expect(state.currentTaskNumber).toBe(1);
    expect(state.isRetry).toBe(false);
    expect(state.maxIterations).toBe(3);
    expect(state.maxTimeMinutes).toBe(15);
    expect(state.iterationCount).toBe(0);
    expect(state.tasks).toEqual([
      { taskNumber: 1, status: 'pending' },
      { taskNumber: 2, status: 'pending' },
    ]);
  });

  it('fails when plan has no tasks', async () => {
    await writePlan('# Plan\n- Do something\n');
    await expectError(
      stateUtils.initializeState({ maxIterations: 2, maxTimeMinutes: 10 }),
      'No tasks'
    );
  });

  it('fails when plan tasks are not sequential', async () => {
    await writePlan('## 1 First task\n\n## 3 Third task\n');
    await expectError(
      stateUtils.initializeState({ maxIterations: 2, maxTimeMinutes: 10 }),
      'Task numbers must be sequential'
    );
  });

  it('startExecution marks the first task in progress', async () => {
    await writePlan('## 1 First task\n\n## 2 Second task\n');
    await expectOk(stateUtils.initializeState({ maxIterations: 2, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());

    const state = await readState();
    expect(state.status).toBe('executing');
    expect(state.startedAt).toBeTruthy();
    expect(state.tasks[0]?.status).toBe('in_progress');
    expect(state.tasks[1]?.status).toBe('pending');
  });

  it('returns loop context and task info', async () => {
    await writePlan('## 1 First task\n\n## 2 Second task\n');
    await expectOk(stateUtils.initializeState({ maxIterations: 2, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());
    await expectOk(stateUtils.markCurrentTaskAsRetry());

    const currentTaskNumber = await expectOk(stateUtils.getCurrentTaskNumber());
    const loopStatus = await expectOk(stateUtils.getLoopStatus());
    const planProgress = await expectOk(stateUtils.getPlanProgress());
    const loopContext = await expectOk(stateUtils.getLoopContext());
    const isRetry = await expectOk(stateUtils.isRetry());
    const currentTask = await expectOk(stateUtils.getCurrentTask());

    expect(currentTaskNumber).toBe(1);
    expect(loopStatus).toBe('executing');
    expect(planProgress).toEqual({ currentTaskNumber: 1, totalTasks: 2 });
    expect(loopContext).toEqual({ currentTaskNumber: 1, totalTasks: 2, isRetry: true });
    expect(isRetry).toBe(true);
    expect(currentTask).toEqual({ taskNumber: 1, status: 'in_progress' });
  });

  it('getCurrentTask errors when the current task is missing', async () => {
    const state = buildState({
      currentTaskNumber: 99,
      tasks: [{ taskNumber: 1, status: 'pending' }],
    });
    await fixture.writeCacheFile('state.json', JSON.stringify(state, null, 2));

    await expectError(stateUtils.getCurrentTask(), 'Current task 99 not found');
  });

  it('completeCurrentTask advances to the next task when available', async () => {
    await writePlan('## 1 First task\n\n## 2 Second task\n');
    await expectOk(stateUtils.initializeState({ maxIterations: 2, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());
    await expectOk(stateUtils.markCurrentTaskAsRetry());
    await expectOk(stateUtils.completeCurrentTask('abc123'));

    const state = await readState();
    expect(state.currentTaskNumber).toBe(2);
    expect(state.isRetry).toBe(false);
    expect(state.tasks).toEqual([
      { taskNumber: 1, status: 'completed', commitHash: 'abc123' },
      { taskNumber: 2, status: 'in_progress' },
    ]);
  });

  it('completeCurrentTask completes the loop on the final task', async () => {
    await writePlan('## 1 Only task\n');
    await expectOk(stateUtils.initializeState({ maxIterations: 1, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());
    await expectOk(stateUtils.completeCurrentTask('done'));

    const state = await readState();
    expect(state.status).toBe('completed');
    expect(state.tasks).toEqual([{ taskNumber: 1, status: 'completed', commitHash: 'done' }]);
  });

  it('checkLimits reports iteration limit exceeded', async () => {
    await writePlan('## 1 Only task\n');
    await expectOk(stateUtils.initializeState({ maxIterations: 1, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());
    await expectOk(stateUtils.incrementIteration());

    const result = await stateUtils.checkLimits();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.exceeded).toBe(true);
      expect(result.value.reason).toContain('Iteration limit exceeded');
    }
  });

  it('checkLimits reports time limit exceeded', async () => {
    const startedAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const state = buildState({ maxTimeMinutes: 1, startedAt });
    await fixture.writeCacheFile('state.json', JSON.stringify(state, null, 2));

    const result = await stateUtils.checkLimits();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.exceeded).toBe(true);
      expect(result.value.reason).toContain('Time limit exceeded');
    }
  });

  it('failLoop marks the loop failed and current task failed', async () => {
    await writePlan('## 1 First task\n\n## 2 Second task\n');
    await expectOk(stateUtils.initializeState({ maxIterations: 2, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());
    await expectOk(stateUtils.failLoop());

    const state = await readState();
    expect(state.status).toBe('failed');
    expect(state.tasks[0]?.status).toBe('failed');
    expect(state.tasks[1]?.status).toBe('pending');
  });

  it('abortLoop marks the loop aborted and current task aborted', async () => {
    await writePlan('## 1 First task\n\n## 2 Second task\n');
    await expectOk(stateUtils.initializeState({ maxIterations: 2, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());
    await expectOk(stateUtils.abortLoop());

    const state = await readState();
    expect(state.status).toBe('aborted');
    expect(state.tasks[0]?.status).toBe('aborted');
    expect(state.tasks[1]?.status).toBe('pending');
  });

  it('incrementIteration increments the iteration count', async () => {
    await writePlan('## 1 Only task\n');
    await expectOk(stateUtils.initializeState({ maxIterations: 2, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());
    await expectOk(stateUtils.incrementIteration());

    const state = await readState();
    expect(state.iterationCount).toBe(1);
  });
});
