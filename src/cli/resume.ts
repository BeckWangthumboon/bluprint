import { join } from 'path';
import * as p from '@clack/prompts';
import { ResultAsync } from 'neverthrow';
import type { LoopState, TaskStatus } from '../state.js';
import { exit } from '../exit.js';
import { fsUtils } from '../fs.js';
import { workspaceConstants } from '../workspace.js';
import { runLoop } from '../agent/loop.js';
import { exec } from '../shell.js';

export interface ResumeOptions {
  interactive: boolean;
  from?: string;
}

export interface ResumableRun {
  runId: string;
  status: LoopState['status'];
  startedAt: string;
  title: string;
  branch: string;
  completedTasks: number;
  totalTasks: number;
  statePath: string;
  specPath: string;
  planPath: string;
  summaryPath: string;
}

export interface RunSelection {
  runId: string;
  title: string;
}

const toError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

const getRunDir = (runId: string): string => join(workspaceConstants.RUNS_DIR, runId);

const formatTimeAgo = (isoDate: string): string => {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return `${diffSecs} seconds ago`;
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  }
};

export const loadRunState = (runId: string): ResultAsync<LoopState, Error> => {
  const runDir = getRunDir(runId);
  const statePath = join(runDir, 'state.json');

  return fsUtils.readFile(statePath).andThen((content) => {
    try {
      const parsed: unknown = JSON.parse(content);
      const state = parsed as Partial<LoopState>;

      if (typeof state !== 'object' || state === null) {
        return ResultAsync.fromSafePromise(
          Promise.reject(new Error('State file is not an object'))
        );
      }

      if (typeof state.version !== 'string') {
        return ResultAsync.fromSafePromise(Promise.reject(new Error('State file missing version')));
      }

      if (
        state.status !== 'planning' &&
        state.status !== 'executing' &&
        state.status !== 'completed' &&
        state.status !== 'failed' &&
        state.status !== 'aborted'
      ) {
        return ResultAsync.fromSafePromise(
          Promise.reject(new Error('State file has invalid status'))
        );
      }

      if (typeof state.currentTaskNumber !== 'number') {
        return ResultAsync.fromSafePromise(
          Promise.reject(new Error('State file missing currentTaskNumber'))
        );
      }

      if (!Array.isArray(state.tasks)) {
        return ResultAsync.fromSafePromise(
          Promise.reject(new Error('State file missing or invalid tasks array'))
        );
      }

      if (!validateTaskStatusArray(state.tasks)) {
        return ResultAsync.fromSafePromise(
          Promise.reject(new Error('State file has invalid task status array'))
        );
      }

      return ResultAsync.fromSafePromise(Promise.resolve(state as LoopState));
    } catch (e) {
      return ResultAsync.fromSafePromise(
        Promise.reject(new Error(`Failed to parse state JSON: ${toError(e).message}`))
      );
    }
  });
};

export const checkRequiredFiles = (runId: string): ResultAsync<boolean, Error> => {
  const runDir = getRunDir(runId);
  const statePath = join(runDir, 'state.json');
  const planPath = join(runDir, 'plan.md');
  const specPath = join(runDir, 'spec.md');
  const summaryPath = join(runDir, 'summary.md');

  return ResultAsync.combine([
    fsUtils.fileExists(statePath),
    fsUtils.fileExists(planPath),
    fsUtils.fileExists(specPath),
    fsUtils.fileExists(summaryPath),
  ]).map(([stateExists, planExists, specExists, summaryExists]) => {
    return stateExists && planExists && specExists && summaryExists;
  });
};

export const isRunResumable = (state: LoopState): { resumable: boolean; reason?: string } => {
  if (state.status !== 'aborted' && state.status !== 'failed') {
    return {
      resumable: false,
      reason: `Run status is '${state.status}', only 'aborted' or 'failed' runs can be resumed`,
    };
  }

  const pendingOrInProgressTasks = state.tasks.filter(
    (t) => t.status === 'pending' || t.status === 'in_progress'
  );

  if (pendingOrInProgressTasks.length === 0) {
    return {
      resumable: false,
      reason: 'No pending or in-progress tasks found',
    };
  }

  return { resumable: true };
};

const validateTaskStatusArray = (tasks: unknown[]): tasks is TaskStatus[] => {
  return tasks.every(
    (task) =>
      typeof task === 'object' &&
      task !== null &&
      typeof (task as TaskStatus).taskNumber === 'number' &&
      typeof (task as TaskStatus).status === 'string' &&
      ['pending', 'in_progress', 'completed', 'failed', 'aborted'].includes(
        (task as TaskStatus).status
      ) &&
      ((task as TaskStatus).commitHash === undefined ||
        typeof (task as TaskStatus).commitHash === 'string')
  );
};

const extractTitleFromSpec = (specContent: string): string => {
  const lines = specContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim();
    }
  }
  console.warn('No h1 title (# ) found in spec.md');
  return 'Untitled Run';
};

const buildResumableRun = (runId: string, state: LoopState): ResultAsync<ResumableRun, Error> => {
  const runDir = getRunDir(runId);
  const statePath = join(runDir, 'state.json');
  const specPath = join(runDir, 'spec.md');
  const planPath = join(runDir, 'plan.md');
  const summaryPath = join(runDir, 'summary.md');

  const completedTasks = state.tasks.filter((t) => t.status === 'completed').length;
  const totalTasks = state.tasks.length;

  return fsUtils.readFile(specPath).andThen((specContent) => {
    const title = extractTitleFromSpec(specContent);
    const startedAt = state.startedAt !== undefined ? state.startedAt : new Date().toISOString();
    const branch = state.branch !== undefined ? state.branch : 'unknown branch';

    const resumableRun: ResumableRun = {
      runId,
      status: state.status,
      startedAt,
      title,
      branch,
      completedTasks,
      totalTasks,
      statePath,
      specPath,
      planPath,
      summaryPath,
    };

    return ResultAsync.fromSafePromise(Promise.resolve(resumableRun));
  });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const populateCacheFromRun = (sourceRunId: string, _newRunId: string): ResultAsync<void, Error> => {
  const sourceRunDir = getRunDir(sourceRunId);

  return (
    ResultAsync.combine([
      fsUtils.copyFile(
        join(sourceRunDir, 'spec.md'),
        join(workspaceConstants.CACHE_DIR, 'spec.md')
      ),
      fsUtils.copyFile(
        join(sourceRunDir, 'plan.md'),
        join(workspaceConstants.CACHE_DIR, 'plan.md')
      ),
      fsUtils.copyFile(
        join(sourceRunDir, 'summary.md'),
        join(workspaceConstants.CACHE_DIR, 'summary.md')
      ),
    ])
      .andThen(() =>
        exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
          .map((result) => result.stdout.trim())
          .orElse(() => ResultAsync.fromSafePromise(Promise.resolve('')))
      )
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .andThen((_currentBranch) =>
        fsUtils.readFile(join(sourceRunDir, 'state.json')).andThen((stateContent) => {
          try {
            const state: LoopState = JSON.parse(stateContent) as LoopState;

            const pendingOrInProgressTasks = state.tasks.filter(
              (t) => t.status === 'pending' || t.status === 'in_progress'
            );

            if (pendingOrInProgressTasks.length === 0) {
              return ResultAsync.fromSafePromise(
                Promise.reject(new Error(`Run '${sourceRunId}' has no pending tasks to resume`))
              );
            }

            const firstPendingTask = pendingOrInProgressTasks[0]!;

            const newTasks = state.tasks.map((task) => {
              if (task.taskNumber === firstPendingTask.taskNumber) {
                return {
                  taskNumber: task.taskNumber,
                  status: 'in_progress' as const,
                  commitHash: task.commitHash,
                };
              }
              return task;
            });

            const newState: LoopState = {
              version: state.version,
              status: 'executing',
              currentTaskNumber: firstPendingTask.taskNumber,
              isRetry: false,
              maxIterations: state.maxIterations,
              maxTimeMinutes: state.maxTimeMinutes,
              iterationCount: 0,
              tasks: newTasks,
              parentRunId: sourceRunId,
              branch: state.branch,
              startedAt: new Date().toISOString(),
            };

            const newStateContent = JSON.stringify(newState, null, 2);
            return fsUtils
              .writeFile(join(workspaceConstants.CACHE_DIR, 'state.json'), newStateContent)
              .map(() => undefined);
          } catch (e) {
            return ResultAsync.fromSafePromise(
              Promise.reject(new Error(`Failed to parse state JSON: ${toError(e).message}`))
            );
          }
        })
      )
      .mapErr((e) => new Error(`Failed to populate cache from run ${sourceRunId}: ${e.message}`))
  );
};

const checkUncommittedChanges = (): ResultAsync<boolean, Error> =>
  exec('git', ['status', '--porcelain']).map((result) => result.stdout.trim().length > 0);

const validatePlanHasTasks = (planPath: string): ResultAsync<boolean, Error> =>
  fsUtils.readFile(planPath).map((content) => {
    // Check for task headings like "## 1" or "## 2" etc.
    const taskHeadingPattern = /^## \d+/m;
    return taskHeadingPattern.test(content);
  });

export const scanResumableRuns = (): ResultAsync<ResumableRun[], Error> => {
  return fsUtils
    .fileExists(workspaceConstants.RUNS_DIR)
    .andThen((exists) => {
      if (!exists) {
        return ResultAsync.fromSafePromise(Promise.resolve([]));
      }

      return fsUtils.listDir(workspaceConstants.RUNS_DIR);
    })
    .andThen((entries) => {
      const scanResults = entries.map((runId) => {
        return checkRequiredFiles(runId)
          .andThen((filesExist) => {
            if (!filesExist) {
              return ResultAsync.fromSafePromise(Promise.resolve<ResumableRun | null>(null));
            }

            return loadRunState(runId).andThen((state) => {
              const validation = isRunResumable(state);
              if (!validation.resumable) {
                return ResultAsync.fromSafePromise(Promise.resolve<ResumableRun | null>(null));
              }
              return buildResumableRun(runId, state);
            });
          })
          .orElse((err) => {
            console.warn(`Failed to validate run ${runId}: ${err.message}`);
            return ResultAsync.fromSafePromise(Promise.resolve<ResumableRun | null>(null));
          });
      });

      return ResultAsync.combine(scanResults);
    })
    .map((results) => {
      const resumableRuns = results.filter((r): r is ResumableRun => r !== null);

      return resumableRuns.sort((a, b) => {
        const timeA = new Date(a.startedAt).getTime();
        const timeB = new Date(b.startedAt).getTime();
        return timeB - timeA;
      });
    });
};

const displayResumableRuns = async (runs: ResumableRun[]): Promise<RunSelection | null> => {
  p.intro('Resume a previous run');

  if (runs.length === 0) {
    p.log.message('No resumable runs found');
    p.outro('Nothing to resume');
    return null;
  }

  const selectOptions = runs.map((run) => {
    const timeAgo = formatTimeAgo(run.startedAt);
    const branch = run.branch;
    const status = run.status;
    const progress = `${run.completedTasks}/${run.totalTasks} tasks completed`;

    const label = [
      run.title,
      `  Run ID: ${run.runId}`,
      `  Branch: ${branch}`,
      `  Status: ${status}`,
      `  Started: ${timeAgo}`,
      `  Progress: ${progress}`,
    ].join('\n');

    return {
      value: run.runId,
      label,
    };
  });

  const selectedRunId = await p.select({
    message: 'Select a run to resume',
    options: selectOptions,
  });

  if (p.isCancel(selectedRunId)) {
    p.cancel('Resume cancelled');
    await exit(0);
    return null;
  }

  const selectedRun = runs.find((r) => r.runId === selectedRunId);
  if (selectedRun) {
    return { runId: selectedRun.runId, title: selectedRun.title };
  }

  return null;
};

export async function handleResume(options: ResumeOptions): Promise<void> {
  p.intro('Bluprint Resume');

  let selectedRunId: string | undefined;

  if (options.from) {
    selectedRunId = options.from;
  } else {
    const scanResult = await scanResumableRuns();
    if (scanResult.isErr()) {
      p.note(scanResult.error.message, 'Error');
      await exit(1);
      return;
    }

    const resumableRuns = scanResult.value;

    if (resumableRuns.length === 0) {
      p.log.message('No resumable runs found');
      p.outro('Nothing to resume');
      await exit(0);
      return;
    }

    if (options.interactive) {
      const selection = await displayResumableRuns(resumableRuns);
      if (!selection) {
        await exit(0);
        return;
      }
      selectedRunId = selection.runId;
    } else {
      p.log.message('No resumable runs found (use --interactive to see available runs)');
      p.outro('Nothing to resume');
      await exit(0);
      return;
    }
  }

  if (!selectedRunId) {
    p.note('No run ID specified', 'Error');
    await exit(1);
    return;
  }

  const runExistsResult = await fsUtils.fileExists(getRunDir(selectedRunId));
  if (runExistsResult.isErr()) {
    p.note(runExistsResult.error.message, 'Error');
    await exit(1);
    return;
  }

  if (!runExistsResult.value) {
    p.note(`Run '${selectedRunId}' not found in .bluprint/runs/`, 'Error');
    await exit(1);
    return;
  }

  const loadStateResult = await loadRunState(selectedRunId);
  if (loadStateResult.isErr()) {
    p.note(loadStateResult.error.message, 'Error');
    await exit(1);
    return;
  }

  const state = loadStateResult.value;
  const validation = isRunResumable(state);
  if (!validation.resumable) {
    if (state.status === 'completed') {
      p.note(`Run '${selectedRunId}' is already completed and cannot be resumed`, 'Error');
    } else {
      p.note(validation.reason ?? `Run '${selectedRunId}' cannot be resumed`, 'Error');
    }
    await exit(1);
    return;
  }

  const filesCheckResult = await checkRequiredFiles(selectedRunId);
  if (filesCheckResult.isErr()) {
    p.note(filesCheckResult.error.message, 'Error');
    await exit(1);
    return;
  }

  if (!filesCheckResult.value) {
    p.note(`Run '${selectedRunId}' is missing required files`, 'Error');
    await exit(1);
    return;
  }

  const newRunId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const currentBranchResult = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const currentBranch = currentBranchResult.isOk() ? currentBranchResult.value.stdout.trim() : '';

  if (currentBranch && state.branch && currentBranch !== state.branch) {
    p.note(`Resuming on branch '${currentBranch}' (was '${state.branch}')`, 'Branch Warning');
    const confirmContinue = await p.confirm({
      message: 'Continue anyway?',
      initialValue: false,
    });

    if (p.isCancel(confirmContinue) || !confirmContinue) {
      p.cancel('Resume cancelled');
      await exit(0);
      return;
    }
  }

  // Check for uncommitted changes (warning only)
  const uncommittedResult = await checkUncommittedChanges();
  if (uncommittedResult.isOk() && uncommittedResult.value) {
    p.log.warn('Warning: You have uncommitted changes. Proceeding anyway...');
  }

  // Validate plan has tasks
  const runDir = getRunDir(selectedRunId);
  const planPath = join(runDir, 'plan.md');
  const planValidResult = await validatePlanHasTasks(planPath);
  if (planValidResult.isErr()) {
    p.note(`Failed to validate plan: ${planValidResult.error.message}`, 'Error');
    await exit(1);
    return;
  }
  if (!planValidResult.value) {
    p.note(`Cannot resume run '${selectedRunId}' with no tasks in plan`, 'Error');
    await exit(1);
    return;
  }

  const populateResult = await populateCacheFromRun(selectedRunId, newRunId);
  if (populateResult.isErr()) {
    p.note(populateResult.error.message, 'Error');
    await exit(1);
    return;
  }

  p.log.message(`Resuming from run: ${selectedRunId}`);

  const loopResult = await runLoop({
    config: { preset: undefined, graphite: false, resume: true, runId: newRunId },
  });
  if (loopResult.isErr()) {
    p.note(loopResult.error.message, 'Error');
    await exit(1);
    return;
  }

  p.outro('Resume completed');
  await exit(0);
}
