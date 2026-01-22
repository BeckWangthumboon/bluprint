import { ResultAsync } from 'neverthrow';
import { workspace } from '../workspace.js';
import { LoopStateSchema } from './types.js';
import type { InitStateConfig, LoopState, TaskStatus } from './types.js';

const STATE_VERSION = '1.0.0';

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

const writeState = (state: LoopState): ResultAsync<void, Error> => {
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

/**
 * Read and validate the loop state from disk.
 * @returns A ResultAsync with the parsed loop state.
 */
const readState = (): ResultAsync<LoopState, Error> =>
  workspace.cache.state
    .read()
    .mapErr((e: Error) => new Error(`Failed to read state file: ${e.message}`))
    .andThen((content: string) => {
      try {
        const parsed: unknown = JSON.parse(content);
        const validation = LoopStateSchema.safeParse(parsed);
        if (!validation.success) {
          return ResultAsync.fromSafePromise(
            Promise.reject(new Error(`Invalid state file structure: ${validation.error.message}`))
          );
        }
        return ResultAsync.fromSafePromise(Promise.resolve(validation.data));
      } catch (e) {
        return ResultAsync.fromSafePromise(
          Promise.reject(new Error(`Failed to parse state JSON: ${toError(e).message}`))
        );
      }
    });

/**
 * Get the current task number from the loop state.
 * @returns A ResultAsync with the current task number.
 */
const getCurrentTaskNumber = (): ResultAsync<number, Error> =>
  readState().map((state) => state.currentTaskNumber);

/**
 * Get the current loop status from the loop state.
 * @returns A ResultAsync with the current loop status.
 */
const getLoopStatus = (): ResultAsync<LoopState['status'], Error> =>
  readState().map((state) => state.status);

/**
 * Get plan progress details from the loop state.
 * @returns A ResultAsync with current task number and total task count.
 */
const getPlanProgress = (): ResultAsync<{ currentTaskNumber: number; totalTasks: number }, Error> =>
  readState().map((state) => ({
    currentTaskNumber: state.currentTaskNumber,
    totalTasks: state.tasks.length,
  }));

/**
 * Get the current task context for decision logic.
 * @returns A ResultAsync with task number, total tasks, and retry flag.
 */
const getLoopContext = (): ResultAsync<
  { currentTaskNumber: number; totalTasks: number; isRetry: boolean },
  Error
> =>
  readState().map((state) => ({
    currentTaskNumber: state.currentTaskNumber,
    totalTasks: state.tasks.length,
    isRetry: state.isRetry,
  }));

/**
 * Retrieve the current task status from the loop state.
 * @returns A ResultAsync with the current task status.
 */
const getCurrentTask = (): ResultAsync<TaskStatus, Error> =>
  readState().andThen((state) => {
    const task = state.tasks.find((t) => t.taskNumber === state.currentTaskNumber);
    if (!task) {
      return ResultAsync.fromSafePromise(
        Promise.reject(new Error(`Current task ${state.currentTaskNumber} not found in state`))
      );
    }
    return ResultAsync.fromSafePromise(Promise.resolve(task));
  });

/**
 * Check whether the current iteration is a retry.
 * @returns A ResultAsync with the retry flag.
 */
const isRetry = (): ResultAsync<boolean, Error> => readState().map((state) => state.isRetry);

/**
 * Initialize the loop state based on the plan file and limits.
 * @param config - Limits for the loop state initialization.
 * @returns A ResultAsync that resolves when state is written.
 */
const initializeState = (config: InitStateConfig): ResultAsync<void, Error> =>
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

/**
 * Transition the loop state into execution mode and mark the first task in progress.
 * @returns A ResultAsync that resolves when state is updated.
 */
const startExecution = (): ResultAsync<void, Error> =>
  readState().andThen((state) => {
    const updatedState: LoopState = {
      ...state,
      status: 'executing',
      startedAt: new Date().toISOString(),
      tasks: state.tasks.map((task, index) =>
        index === 0 ? { ...task, status: 'in_progress' } : task
      ),
    };
    return writeState(updatedState);
  });

/**
 * Increment the loop iteration counter.
 * @returns A ResultAsync that resolves when state is updated.
 */
const incrementIteration = (): ResultAsync<void, Error> =>
  readState().andThen((state) => {
    const updatedState: LoopState = {
      ...state,
      iterationCount: state.iterationCount + 1,
    };
    return writeState(updatedState);
  });

/**
 * Mark the current task as a retry attempt.
 * @returns A ResultAsync that resolves when state is updated.
 */
const markCurrentTaskAsRetry = (): ResultAsync<void, Error> =>
  readState().andThen((state) => {
    const updatedState: LoopState = {
      ...state,
      isRetry: true,
    };
    return writeState(updatedState);
  });

/**
 * Mark the current task as completed and advance to the next task if available.
 * @param commitHash - Commit hash associated with the task completion.
 * @returns A ResultAsync that resolves when state is updated.
 */
const completeCurrentTask = (commitHash: string): ResultAsync<void, Error> =>
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
    }

    // All tasks completed
    const updatedState: LoopState = {
      ...state,
      status: 'completed',
      tasks: updatedTasks,
    };
    return writeState(updatedState);
  });

/**
 * Check whether loop limits have been exceeded.
 * @returns A ResultAsync with limit status and optional reason.
 */
const checkLimits = (): ResultAsync<{ exceeded: boolean; reason?: string }, Error> =>
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

/**
 * Mark the loop and current task as failed.
 * @returns A ResultAsync that resolves when state is updated.
 */
const failLoop = (): ResultAsync<void, Error> =>
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

/**
 * Mark the loop and current task as aborted.
 * @returns A ResultAsync that resolves when state is updated.
 */
const abortLoop = (): ResultAsync<void, Error> =>
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

const stateUtils = {
  getCurrentTaskNumber,
  getLoopStatus,
  getPlanProgress,
  getLoopContext,
  getCurrentTask,
  isRetry,
  initializeState,
  startExecution,
  incrementIteration,
  markCurrentTaskAsRetry,
  completeCurrentTask,
  checkLimits,
  failLoop,
  abortLoop,
};

export { stateUtils };
