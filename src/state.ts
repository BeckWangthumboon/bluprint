import { ResultAsync } from 'neverthrow';
import { workspace } from './workspace.js';
import { exec } from './shell.js';

export interface TaskStatus {
  taskNumber: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'aborted';
  commitHash?: string;
}

export interface LoopState {
  version: string;
  status: 'planning' | 'executing' | 'completed' | 'failed' | 'aborted';
  currentTaskNumber: number;
  isRetry: boolean;
  maxIterations: number;
  maxTimeMinutes: number;
  startedAt?: string;
  iterationCount: number;
  tasks: TaskStatus[];
  parentRunId?: string;
  branch?: string;
}

const STATE_VERSION = '1.0.0';

const validateState = (data: unknown): data is LoopState => {
  if (typeof data !== 'object' || data === null) return false;

  const state = data as Partial<LoopState>;

  return (
    typeof state.version === 'string' &&
    (state.status === 'planning' ||
      state.status === 'executing' ||
      state.status === 'completed' ||
      state.status === 'failed' ||
      state.status === 'aborted') &&
    typeof state.currentTaskNumber === 'number' &&
    typeof state.isRetry === 'boolean' &&
    typeof state.maxIterations === 'number' &&
    typeof state.maxTimeMinutes === 'number' &&
    typeof state.iterationCount === 'number' &&
    Array.isArray(state.tasks) &&
    state.tasks.every(
      (task) =>
        typeof task.taskNumber === 'number' &&
        (task.status === 'pending' ||
          task.status === 'in_progress' ||
          task.status === 'completed' ||
          task.status === 'failed' ||
          task.status === 'aborted') &&
        (task.commitHash === undefined || typeof task.commitHash === 'string')
    ) &&
    (state.startedAt === undefined || typeof state.startedAt === 'string') &&
    (state.parentRunId === undefined || typeof state.parentRunId === 'string') &&
    (state.branch === undefined || typeof state.branch === 'string')
  );
};

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export const writeState = (state: LoopState): ResultAsync<void, Error> => {
  const json = JSON.stringify(state, null, 2);
  return workspace.cache.state
    .write(json)
    .mapErr((e) => new Error(`Failed to write state: ${e.message}`));
};

const parsePlanTasks = (planContent: string): ResultAsync<number[], Error> => {
  const taskNumberRegex = /^## (\d+) /gm;
  const taskNumbers: number[] = [];
  let match;

  while ((match = taskNumberRegex.exec(planContent)) !== null) {
    const matchedNumber = match[1];
    if (matchedNumber) {
      taskNumbers.push(parseInt(matchedNumber, 10));
    }
  }

  if (taskNumbers.length === 0) {
    return ResultAsync.fromSafePromise(Promise.reject(new Error('No tasks found in plan.md')));
  }

  // Validate sequential numbering starting from 1
  for (let i = 0; i < taskNumbers.length; i++) {
    const taskNum = taskNumbers[i];
    if (taskNum === undefined || taskNum !== i + 1) {
      return ResultAsync.fromSafePromise(
        Promise.reject(
          new Error(
            `Task numbers must be sequential starting from 1. Expected ${i + 1}, found ${taskNum}`
          )
        )
      );
    }
  }

  return ResultAsync.fromSafePromise(Promise.resolve(taskNumbers));
};

export const setParentRunId = (parentRunId: string): ResultAsync<void, Error> =>
  readState().andThen((state) => {
    const updatedState: LoopState = {
      ...state,
      parentRunId,
    };
    return writeState(updatedState);
  });

export const readState = (): ResultAsync<LoopState, Error> =>
  workspace.cache.state
    .read()
    .mapErr((e: Error) => new Error(`Failed to read state file: ${e.message}`))
    .andThen((content: string) => {
      try {
        const parsed: unknown = JSON.parse(content);
        if (!validateState(parsed)) {
          return ResultAsync.fromSafePromise(
            Promise.reject(new Error('Invalid state file structure'))
          );
        }
        return ResultAsync.fromSafePromise(Promise.resolve(parsed));
      } catch (e) {
        return ResultAsync.fromSafePromise(
          Promise.reject(new Error(`Failed to parse state JSON: ${toError(e).message}`))
        );
      }
    });

export const getCurrentTask = (): ResultAsync<TaskStatus, Error> =>
  readState().andThen((state) => {
    const task = state.tasks.find((t) => t.taskNumber === state.currentTaskNumber);
    if (!task) {
      return ResultAsync.fromSafePromise(
        Promise.reject(new Error(`Current task ${state.currentTaskNumber} not found in state`))
      );
    }
    return ResultAsync.fromSafePromise(Promise.resolve(task));
  });

export const isRetry = (): ResultAsync<boolean, Error> => readState().map((state) => state.isRetry);

export interface InitStateConfig {
  maxIterations: number;
  maxTimeMinutes: number;
}

export const initializeState = (config: InitStateConfig): ResultAsync<void, Error> =>
  workspace.cache.plan
    .read()
    .mapErr((e) => new Error(`Could not read plan file: ${e.message}`))
    .andThen(parsePlanTasks)
    .andThen((taskNumbers) => {
      const initialState: LoopState = {
        version: STATE_VERSION,
        status: 'planning',
        currentTaskNumber: 1,
        isRetry: false,
        maxIterations: config.maxIterations,
        maxTimeMinutes: config.maxTimeMinutes,
        iterationCount: 0,
        tasks: taskNumbers.map((taskNumber) => ({
          taskNumber,
          status: 'pending',
        })),
      };

      return writeState(initialState);
    });

export const startExecution = (): ResultAsync<void, Error> =>
  exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
    .map((result) => result.stdout.trim())
    .orElse(() => {
      return ResultAsync.fromSafePromise(Promise.resolve(''));
    })
    .andThen((branch) =>
      readState().andThen((state) => {
        const updatedState: LoopState = {
          ...state,
          status: 'executing',
          startedAt: new Date().toISOString(),
          branch,
          tasks: state.tasks.map((task, index) =>
            index === 0 ? { ...task, status: 'in_progress' } : task
          ),
        };
        return writeState(updatedState);
      })
    );

export const incrementIteration = (): ResultAsync<void, Error> =>
  readState().andThen((state) => {
    const updatedState: LoopState = {
      ...state,
      iterationCount: state.iterationCount + 1,
    };
    return writeState(updatedState);
  });

export const markCurrentTaskAsRetry = (): ResultAsync<void, Error> =>
  readState().andThen((state) => {
    const updatedState: LoopState = {
      ...state,
      isRetry: true,
    };
    return writeState(updatedState);
  });

export const completeCurrentTask = (commitHash: string): ResultAsync<void, Error> =>
  readState().andThen((state) => {
    const currentTaskIndex = state.tasks.findIndex((t) => t.taskNumber === state.currentTaskNumber);

    if (currentTaskIndex === -1) {
      return ResultAsync.fromSafePromise(
        Promise.reject(new Error(`Current task ${state.currentTaskNumber} not found`))
      );
    }

    // Mark current task as completed
    const updatedTasks = [...state.tasks];
    const currentTask = updatedTasks[currentTaskIndex]!;

    updatedTasks[currentTaskIndex] = {
      taskNumber: currentTask.taskNumber,
      status: 'completed',
      commitHash,
    };

    // Check if there are more tasks
    const hasMoreTasks = currentTaskIndex < state.tasks.length - 1;

    if (hasMoreTasks) {
      const nextTaskIndex = currentTaskIndex + 1;
      const nextTask = updatedTasks[nextTaskIndex]!;

      updatedTasks[nextTaskIndex] = {
        taskNumber: nextTask.taskNumber,
        status: 'in_progress',
        commitHash: nextTask.commitHash,
      };

      const updatedState: LoopState = {
        ...state,
        currentTaskNumber: state.currentTaskNumber + 1,
        isRetry: false,
        tasks: updatedTasks,
      };
      return writeState(updatedState);
    } else {
      // All tasks completed
      const updatedState: LoopState = {
        ...state,
        status: 'completed',
        tasks: updatedTasks,
      };
      return writeState(updatedState);
    }
  });

export const checkLimits = (): ResultAsync<{ exceeded: boolean; reason?: string }, Error> =>
  readState().map((state) => {
    // Check iteration limit
    if (state.iterationCount >= state.maxIterations) {
      return {
        exceeded: true,
        reason: `Iteration limit exceeded (${state.iterationCount}/${state.maxIterations})`,
      };
    }

    // Check time limit
    if (state.startedAt) {
      const startTime = new Date(state.startedAt).getTime();
      const currentTime = new Date().getTime();
      const elapsedMinutes = (currentTime - startTime) / 1000 / 60;

      if (elapsedMinutes >= state.maxTimeMinutes) {
        return {
          exceeded: true,
          reason: `Time limit exceeded (${Math.floor(elapsedMinutes)}/${state.maxTimeMinutes} minutes)`,
        };
      }
    }

    return { exceeded: false };
  });

export const failLoop = (): ResultAsync<void, Error> =>
  readState().andThen((state) => {
    const updatedTasks = state.tasks.map((task) =>
      task.taskNumber === state.currentTaskNumber ? { ...task, status: 'failed' as const } : task
    );

    const updatedState: LoopState = {
      ...state,
      status: 'failed',
      tasks: updatedTasks,
    };

    return writeState(updatedState);
  });

export const abortLoop = (): ResultAsync<void, Error> =>
  readState().andThen((state) => {
    const updatedTasks = state.tasks.map((task) =>
      task.taskNumber === state.currentTaskNumber ? { ...task, status: 'aborted' as const } : task
    );

    const updatedState: LoopState = {
      ...state,
      status: 'aborted',
      tasks: updatedTasks,
    };

    return writeState(updatedState);
  });
