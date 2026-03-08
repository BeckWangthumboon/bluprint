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
    version: '2.0.0',
    runId: 'test-run',
    status: 'executing',
    currentStepNumber: 1,
    isRetry: false,
    maxIterations: 5,
    maxTimeMinutes: 10,
    iterationCount: 0,
    attempts: [{ attempt: 1, startedAt: new Date().toISOString(), status: 'in_progress' }],
    activeAttempt: 0,
    steps: [{ stepNumber: 1, status: 'running' }],
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
    const result = await stateUtils.initializeState({
      runId: 'test-run',
      maxIterations: 3,
      maxTimeMinutes: 15,
    });

    expect(result.isOk()).toBe(true);

    const state = await readState();
    expect(state.version).toBe('2.0.0');
    expect(state.runId).toBe('test-run');
    expect(state.status).toBe('planning');
    expect(state.currentStepNumber).toBe(1);
    expect(state.isRetry).toBe(false);
    expect(state.maxIterations).toBe(3);
    expect(state.maxTimeMinutes).toBe(15);
    expect(state.iterationCount).toBe(0);
    expect(state.attempts).toHaveLength(1);
    expect(state.activeAttempt).toBe(0);
    expect(state.attempts[0]).toEqual(
      expect.objectContaining({ attempt: 1, status: 'in_progress' })
    );
    expect(state.steps).toEqual([
      { stepNumber: 1, status: 'pending' },
      { stepNumber: 2, status: 'pending' },
    ]);
  });

  it('fails when plan has no steps', async () => {
    await writePlan('# Plan\n- Do something\n');
    await expectError(
      stateUtils.initializeState({ runId: 'test-run', maxIterations: 2, maxTimeMinutes: 10 }),
      'No steps'
    );
  });

  it('fails when plan steps are not sequential', async () => {
    await writePlan('## 1 First task\n\n## 3 Third task\n');
    await expectError(
      stateUtils.initializeState({ runId: 'test-run', maxIterations: 2, maxTimeMinutes: 10 }),
      'Step numbers must be sequential'
    );
  });

  it('startExecution marks the first step as running', async () => {
    await writePlan('## 1 First task\n\n## 2 Second task\n');
    await expectOk(stateUtils.initializeState({ runId: 'test-run', maxIterations: 2, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());

    const state = await readState();
    expect(state.status).toBe('executing');
    expect(state.steps[0]?.status).toBe('running');
    expect(state.steps[1]?.status).toBe('pending');
    expect(state.attempts[0]?.status).toBe('in_progress');
  });

  it('resumeExecution closes prior attempt and starts a new one', async () => {
    await writePlan('## 1 First task\n\n## 2 Second task\n');
    await expectOk(stateUtils.initializeState({ runId: 'test-run', maxIterations: 3, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());

    await expectOk(stateUtils.resumeExecution('test-run'));

    const state = await readState();
    expect(state.status).toBe('executing');
    expect(state.currentStepNumber).toBe(1);
    expect(state.steps[0]?.status).toBe('running');
    expect(state.steps[1]?.status).toBe('pending');
    expect(state.attempts).toHaveLength(2);
    expect(state.attempts[0]).toEqual(expect.objectContaining({ status: 'aborted' }));
    expect(state.attempts[0]?.endedAt).toBeTruthy();
    expect(state.attempts[1]).toEqual(expect.objectContaining({ attempt: 2, status: 'in_progress' }));
    expect(state.activeAttempt).toBe(1);
  });

  it('resumeExecution errors on run ID mismatch', async () => {
    await writePlan('## 1 First task\n');
    await expectOk(stateUtils.initializeState({ runId: 'test-run', maxIterations: 2, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());

    await expectError(stateUtils.resumeExecution('different-run'), 'Run ID mismatch');
  });

  it('returns loop context and step info', async () => {
    await writePlan('## 1 First task\n\n## 2 Second task\n');
    await expectOk(stateUtils.initializeState({ runId: 'test-run', maxIterations: 2, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());
    await expectOk(stateUtils.markCurrentStepAsRetry());

    const currentStepNumber = await expectOk(stateUtils.getCurrentStepNumber());
    const loopStatus = await expectOk(stateUtils.getLoopStatus());
    const planProgress = await expectOk(stateUtils.getPlanProgress());
    const loopContext = await expectOk(stateUtils.getLoopContext());
    const isRetry = await expectOk(stateUtils.isRetry());
    const currentStep = await expectOk(stateUtils.getCurrentStep());

    expect(currentStepNumber).toBe(1);
    expect(loopStatus).toBe('executing');
    expect(planProgress).toEqual({ currentStepNumber: 1, totalSteps: 2 });
    expect(loopContext).toEqual({ currentStepNumber: 1, totalSteps: 2, isRetry: true });
    expect(isRetry).toBe(true);
    expect(currentStep).toEqual({ stepNumber: 1, status: 'running' });
  });

  it('getCurrentStep errors when the current step is missing', async () => {
    const state = buildState({
      currentStepNumber: 99,
      steps: [{ stepNumber: 1, status: 'pending' }],
    });
    await fixture.writeCacheFile('state.json', JSON.stringify(state, null, 2));

    await expectError(stateUtils.getCurrentStep(), 'Current step 99 not found');
  });

  it('completeCurrentStep advances to the next step when available', async () => {
    await writePlan('## 1 First task\n\n## 2 Second task\n');
    await expectOk(stateUtils.initializeState({ runId: 'test-run', maxIterations: 2, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());
    await expectOk(stateUtils.markCurrentStepAsRetry());
    await expectOk(stateUtils.completeCurrentStep('abc123'));

    const state = await readState();
    expect(state.currentStepNumber).toBe(2);
    expect(state.isRetry).toBe(false);
    expect(state.steps).toEqual([
      { stepNumber: 1, status: 'done', commitHash: 'abc123' },
      { stepNumber: 2, status: 'running' },
    ]);
  });

  it('completeCurrentStep completes the loop on the final step', async () => {
    await writePlan('## 1 Only step\n');
    await expectOk(stateUtils.initializeState({ runId: 'test-run', maxIterations: 1, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());
    await expectOk(stateUtils.completeCurrentStep('done'));

    const state = await readState();
    expect(state.status).toBe('completed');
    expect(state.steps).toEqual([{ stepNumber: 1, status: 'done', commitHash: 'done' }]);
    expect(state.attempts[0]?.status).toBe('completed');
    expect(state.attempts[0]?.endedAt).toBeTruthy();
  });

  it('resumeExecution fails for completed runs', async () => {
    await writePlan('## 1 Only step\n');
    await expectOk(stateUtils.initializeState({ runId: 'test-run', maxIterations: 1, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());
    await expectOk(stateUtils.completeCurrentStep('done'));

    await expectError(stateUtils.resumeExecution('test-run'), 'Cannot resume a completed run');
  });

  it('checkLimits reports iteration limit exceeded', async () => {
    await writePlan('## 1 Only step\n');
    await expectOk(stateUtils.initializeState({ runId: 'test-run', maxIterations: 1, maxTimeMinutes: 10 }));
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
    const state = buildState({
      maxTimeMinutes: 1,
      attempts: [{ attempt: 1, startedAt, status: 'in_progress' }],
    });
    await fixture.writeCacheFile('state.json', JSON.stringify(state, null, 2));

    const result = await stateUtils.checkLimits();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.exceeded).toBe(true);
      expect(result.value.reason).toContain('Time limit exceeded');
    }
  });

  it('failLoop marks the loop failed and current step failed', async () => {
    await writePlan('## 1 First task\n\n## 2 Second task\n');
    await expectOk(stateUtils.initializeState({ runId: 'test-run', maxIterations: 2, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());
    await expectOk(stateUtils.failLoop());

    const state = await readState();
    expect(state.status).toBe('failed');
    expect(state.steps[0]?.status).toBe('failed');
    expect(state.steps[1]?.status).toBe('pending');
    expect(state.attempts[0]?.status).toBe('failed');
    expect(state.attempts[0]?.endedAt).toBeTruthy();
  });

  it('abortLoop marks the loop aborted and current step failed', async () => {
    await writePlan('## 1 First task\n\n## 2 Second task\n');
    await expectOk(stateUtils.initializeState({ runId: 'test-run', maxIterations: 2, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());
    await expectOk(stateUtils.abortLoop());

    const state = await readState();
    expect(state.status).toBe('aborted');
    expect(state.steps[0]?.status).toBe('failed');
    expect(state.steps[1]?.status).toBe('pending');
    expect(state.attempts[0]?.status).toBe('aborted');
    expect(state.attempts[0]?.endedAt).toBeTruthy();
  });

  it('incrementIteration increments the iteration count', async () => {
    await writePlan('## 1 Only step\n');
    await expectOk(stateUtils.initializeState({ runId: 'test-run', maxIterations: 2, maxTimeMinutes: 10 }));
    await expectOk(stateUtils.startExecution());
    await expectOk(stateUtils.incrementIteration());

    const state = await readState();
    expect(state.iterationCount).toBe(1);
  });
});
