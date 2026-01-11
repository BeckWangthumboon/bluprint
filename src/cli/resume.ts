import { join } from 'path';
import { ResultAsync } from 'neverthrow';
import type { LoopState, TaskStatus } from '../state.js';
import { fsUtils } from '../fs.js';
import { workspaceConstants } from '../workspace.js';

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
    const branch = state.branch !== undefined ? state.branch : 'unknown';

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

export async function handleResume(_options: ResumeOptions): Promise<void> {
  console.log('Resume not implemented yet');
}
