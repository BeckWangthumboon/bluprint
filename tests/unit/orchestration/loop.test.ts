import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { ResultAsync } from 'neverthrow';
import type { CommitResult } from '../../../src/agent/commitAgent.js';
import type { ResolvedConfig } from '../../../src/config/schemas.js';
import type { LoopState } from '../../../src/orchestration/types.js';
import { createWorkspaceFixture, createWorkspaceModule } from '../../helpers/workspace.js';
import type { WorkspaceFixture } from '../../helpers/workspace.js';

describe('orchestration/loop', () => {
  let fixture: WorkspaceFixture;
  let runLoop: typeof import('../../../src/orchestration/loop.js').runLoop;
  let applyDecision: typeof import('../../../src/orchestration/loop.js').applyDecision;
  let saveReport: typeof import('../../../src/orchestration/loop.js').saveReport;
  let saveTaskMarkdown: typeof import('../../../src/orchestration/loop.js').saveTaskMarkdown;
  let stateUtils: typeof import('../../../src/orchestration/state.js').stateUtils;

  const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));
  const okAsync = <T>(value: T): ResultAsync<T, Error> =>
    ResultAsync.fromPromise(Promise.resolve(value), toError);

  const model = { providerID: 'openai', modelID: 'gpt-4' };
  const buildRuntimeConfig = (overrides: Partial<ResolvedConfig> = {}): ResolvedConfig => ({
    limits: { maxIterations: 5, maxTimeMinutes: 30 },
    timeouts: {
      codingAgentMin: 1,
      masterAgentMin: 1,
      planAgentMin: 1,
      summarizerAgentMin: 1,
      commitAgentMin: 1,
    },
    preset: {
      coding: model,
      master: model,
      plan: model,
      summarizer: model,
      commit: model,
    },
    presetName: 'test',
    graphite: { enabled: false },
    ...overrides,
  });

  let runtimeConfig = buildRuntimeConfig();
  let codingReports: string[] = [];
  let masterResponses: string[] = [];
  let commitResults: Array<CommitResult | null> = [];

  const resolveRuntimeConfigMock = mock(() => okAsync(runtimeConfig));
  const formatResolveErrorMock = mock((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  );
  const execMock = mock(() => okAsync({ stdout: '', stderr: '' }));
  const executeCodingAgentMock = mock(() => okAsync(codingReports.shift() ?? ''));
  const reviewAndGenerateTaskMock = mock(() =>
    okAsync(masterResponses.shift() ?? '{"decision":"accept"}')
  );
  const createCommitForTaskMock = mock(() => okAsync(commitResults.shift() ?? null));
  const initRunTrackerMock = mock(() => ({
    writeManifest: () => okAsync(undefined),
  }));
  const initLoggerMock = mock(() => undefined);

  const writeLoopInputs = async (planContent: string): Promise<void> => {
    await fixture.writeCacheFile('spec.md', 'Spec content');
    await fixture.writeCacheFile('plan.md', planContent);
    await fixture.writeCacheFile('summary.md', 'Summary content');
  };

  const readState = async (): Promise<LoopState> => {
    const raw = await fixture.readCacheFile('state.json');
    return JSON.parse(raw) as LoopState;
  };

  beforeAll(async () => {
    fixture = await createWorkspaceFixture();

    await mock.module('../../../src/workspace.js', () => createWorkspaceModule(fixture.paths));
    const realConfig = await import('../../../src/config/index.js');
    await mock.module('../../../src/config/index.js', () => ({
      ...realConfig,
      resolveRuntimeConfig: resolveRuntimeConfigMock,
      formatResolveError: formatResolveErrorMock,
    }));
    await mock.module('../../../src/shell.js', () => ({ exec: execMock }));
    await mock.module('../../../src/agent/codingAgent.js', () => ({
      executeCodingAgent: executeCodingAgentMock,
    }));
    await mock.module('../../../src/agent/masterAgent.js', () => ({
      reviewAndGenerateTask: reviewAndGenerateTaskMock,
    }));
    await mock.module('../../../src/agent/commitAgent.js', () => ({
      createCommitForTask: createCommitForTaskMock,
    }));
    await mock.module('../../../src/telemetry/index.js', () => ({
      initRunTracker: initRunTrackerMock,
    }));
    await mock.module('../../../src/logging/index.js', () => ({
      initLogger: initLoggerMock,
      getDebugLogger: mock(() => ({ debug: () => {} })),
      getLogger: mock(() => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} })),
      logSessionData: mock(() => undefined),
      Logger: class {},
      loggingIO: { read: mock(() => ({})), write: mock(() => {}) },
      createLoggingIO: mock(() => ({ read: mock(() => ({})), write: mock(() => {}) })),
      RUNS_DIR: '.bluprint/runs',
    }));

    const loopModule = await import('../../../src/orchestration/loop.js');
    runLoop = loopModule.runLoop;
    applyDecision = loopModule.applyDecision;
    saveReport = loopModule.saveReport;
    saveTaskMarkdown = loopModule.saveTaskMarkdown;

    const stateModule = await import('../../../src/orchestration/state.js');
    stateUtils = stateModule.stateUtils;
  });

  beforeEach(async () => {
    await fixture.reset();
    runtimeConfig = buildRuntimeConfig();
    codingReports = [];
    masterResponses = [];
    commitResults = [];
    mock.clearAllMocks();
  });

  afterAll(async () => {
    mock.restore();
    await fixture.cleanup();
  });

  it('saveReport writes the report content', async () => {
    const result = await saveReport('Report body');
    expect(result.isOk()).toBe(true);
    expect(await fixture.readCacheFile('report.md')).toBe('Report body');
  });

  it('saveTaskMarkdown writes the task content', async () => {
    const result = await saveTaskMarkdown('Fix the issue');
    expect(result.isOk()).toBe(true);
    expect(await fixture.readCacheFile('task.md')).toBe('Fix the issue');
  });

  it('applyDecision accepts and completes the current task', async () => {
    await writeLoopInputs('## 1 Only task\n');
    const initResult = await stateUtils.initializeState({ maxIterations: 2, maxTimeMinutes: 10 });
    const startResult = await stateUtils.startExecution();
    expect(initResult.isOk()).toBe(true);
    expect(startResult.isOk()).toBe(true);

    const result = await applyDecision('accept', 'abc123');
    expect(result.isOk()).toBe(true);

    const state = await readState();
    expect(state.status).toBe('completed');
    expect(state.tasks).toEqual([{ taskNumber: 1, status: 'completed', commitHash: 'abc123' }]);
  });

  it('applyDecision rejects and marks retry', async () => {
    await writeLoopInputs('## 1 Only task\n');
    const initResult = await stateUtils.initializeState({ maxIterations: 2, maxTimeMinutes: 10 });
    const startResult = await stateUtils.startExecution();
    expect(initResult.isOk()).toBe(true);
    expect(startResult.isOk()).toBe(true);

    const result = await applyDecision('reject');
    expect(result.isOk()).toBe(true);

    const state = await readState();
    expect(state.isRetry).toBe(true);
  });

  it('runLoop completes when the master accepts', async () => {
    await writeLoopInputs('## 1 Only task\n');
    codingReports = ['report-1'];
    masterResponses = ['{"decision":"accept"}'];
    commitResults = [{ hash: 'abc123', message: 'Done' }];

    const result = await runLoop({
      signal: new AbortController().signal,
      config: { graphite: false },
    });
    expect(result.isOk()).toBe(true);

    const state = await readState();
    expect(state.status).toBe('completed');
    expect(state.iterationCount).toBe(1);
    expect(state.tasks[0]).toEqual({ taskNumber: 1, status: 'completed', commitHash: 'abc123' });
    expect(await fixture.readCacheFile('report.md')).toBe('report-1');
  });

  it('runLoop saves reject instructions and continues to accept', async () => {
    await writeLoopInputs('## 1 Only task\n');
    codingReports = ['report-1', 'report-2'];
    masterResponses = ['{"decision":"reject","task":"Fix the tests"}', '{"decision":"accept"}'];
    commitResults = [{ hash: 'def456', message: 'Fixed' }];

    const result = await runLoop({
      signal: new AbortController().signal,
      config: { graphite: false },
    });
    expect(result.isOk()).toBe(true);

    expect(await fixture.readCacheFile('task.md')).toBe('Fix the tests');
    expect(await fixture.readCacheFile('report.md')).toBe('report-2');

    const state = await readState();
    expect(state.status).toBe('completed');
    expect(state.tasks[0]).toEqual({ taskNumber: 1, status: 'completed', commitHash: 'def456' });
  });

  it('runLoop fails on invalid master output', async () => {
    await writeLoopInputs('## 1 Only task\n');
    codingReports = ['report-1'];
    masterResponses = ['not-json'];

    const result = await runLoop({
      signal: new AbortController().signal,
      config: { graphite: false },
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('Failed to parse master output JSON');
    }

    const state = await readState();
    expect(state.status).toBe('failed');
    expect(state.tasks[0]?.status).toBe('failed');
  });

  it('runLoop aborts before entering the main loop when signal is already aborted', async () => {
    await writeLoopInputs('## 1 Only task\n');
    const controller = new AbortController();
    controller.abort();

    const result = await runLoop({ signal: controller.signal, config: { graphite: false } });
    expect(result.isOk()).toBe(true);

    const state = await readState();
    expect(state.status).toBe('aborted');
    expect(state.tasks[0]?.status).toBe('aborted');
  });
});
