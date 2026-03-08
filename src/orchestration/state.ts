import { ResultAsync } from 'neverthrow';
import { z } from 'zod';
import { workspace } from '../workspace.js';
import { LoopStateSchema } from './types.js';
import type {
  InitStateConfig,
  LoopState,
  RunAttempt,
  StepState,
  StepStatus,
} from './types.js';

const STATE_VERSION = '2.0.0';
const LEGACY_RUN_ID = 'unknown';

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

const LEGACY_TASK_STATUS_VALUES = [
  'pending',
  'in_progress',
  'completed',
  'failed',
  'aborted',
] as const;
const LEGACY_LOOP_STATUS_VALUES = ['planning', 'executing', 'completed', 'failed', 'aborted'] as const;

const LegacyTaskStatusSchema = z.object({
  taskNumber: z.number(),
  status: z.enum(LEGACY_TASK_STATUS_VALUES),
  commitHash: z.string().optional(),
});

const LegacyLoopStateSchema = z.object({
  version: z.string(),
  status: z.enum(LEGACY_LOOP_STATUS_VALUES),
  currentTaskNumber: z.number(),
  isRetry: z.boolean(),
  maxIterations: z.number(),
  maxTimeMinutes: z.number(),
  startedAt: z.string().optional(),
  iterationCount: z.number(),
  tasks: z.array(LegacyTaskStatusSchema),
});

type LegacyLoopState = z.infer<typeof LegacyLoopStateSchema>;

const mapLegacyStepStatus = (status: LegacyLoopState['tasks'][number]['status']): StepStatus => {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'in_progress':
      return 'running';
    case 'completed':
      return 'done';
    case 'failed':
      return 'failed';
    case 'aborted':
      return 'failed';
  }
};

const mapLegacyAttemptStatus = (
  status: LegacyLoopState['status']
): RunAttempt['status'] => {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'aborted':
      return 'aborted';
    default:
      return 'in_progress';
  }
};

const mapLoopStatusToAttemptStatus = (status: LoopState['status']): RunAttempt['status'] => {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'aborted':
      return 'aborted';
    default:
      return 'aborted';
  }
};

const migrateLegacyState = (legacy: LegacyLoopState): LoopState => {
  const attemptStatus = mapLegacyAttemptStatus(legacy.status);
  const startedAt = legacy.startedAt ?? new Date().toISOString();
  const endedAt =
    attemptStatus === 'in_progress' ? undefined : legacy.startedAt ?? new Date().toISOString();

  return {
    version: STATE_VERSION,
    runId: LEGACY_RUN_ID,
    status: legacy.status,
    currentStepNumber: legacy.currentTaskNumber,
    isRetry: legacy.isRetry,
    maxIterations: legacy.maxIterations,
    maxTimeMinutes: legacy.maxTimeMinutes,
    iterationCount: legacy.iterationCount,
    attempts: [
      {
        attempt: 1,
        startedAt,
        endedAt,
        status: attemptStatus,
      },
    ],
    activeAttempt: 0,
    steps: legacy.tasks.map((task) => ({
      stepNumber: task.taskNumber,
      status: mapLegacyStepStatus(task.status),
      commitHash: task.commitHash,
    })),
  };
};

const writeState = (state: LoopState): ResultAsync<void, Error> => {
  const json = JSON.stringify(state, null, 2);
  return workspace.cache.state
    .write(json)
    .mapErr((e) => new Error(`Failed to write state: ${e.message}`));
};

const parsePlanSteps = (planContent: string): ResultAsync<number[], Error> => {
  const stepNumberRegex = /^## (\d+) /gm;
  const stepNumbers: number[] = [];
  let match;

  while ((match = stepNumberRegex.exec(planContent)) !== null) {
    const matchedNumber = match[1];
    if (matchedNumber) {
      stepNumbers.push(parseInt(matchedNumber, 10));
    }
  }

  if (stepNumbers.length === 0) {
    return ResultAsync.fromSafePromise(Promise.reject(new Error('No steps found in plan.md')));
  }

  // Validate sequential numbering starting from 1
  for (let i = 0; i < stepNumbers.length; i++) {
    const stepNum = stepNumbers[i];
    if (stepNum === undefined || stepNum !== i + 1) {
      return ResultAsync.fromSafePromise(
        Promise.reject(
          new Error(
            `Step numbers must be sequential starting from 1. Expected ${i + 1}, found ${stepNum}`
          )
        )
      );
    }
  }

  return ResultAsync.fromSafePromise(Promise.resolve(stepNumbers));
};

const getActiveAttempt = (state: LoopState): RunAttempt | undefined =>
  state.attempts[state.activeAttempt];

const updateActiveAttempt = (
  state: LoopState,
  updates: Partial<RunAttempt>
): RunAttempt[] => {
  if (state.activeAttempt < 0 || state.activeAttempt >= state.attempts.length) {
    return state.attempts;
  }

  return state.attempts.map((attempt, index) =>
    index === state.activeAttempt ? { ...attempt, ...updates } : attempt
  );
};

const closeActiveAttempt = (
  state: LoopState,
  status: RunAttempt['status']
): RunAttempt[] => {
  const activeAttempt = getActiveAttempt(state);
  if (!activeAttempt || activeAttempt.endedAt) {
    return state.attempts;
  }

  const endedAt = new Date().toISOString();
  return updateActiveAttempt(state, { status, endedAt });
};

const ensureActiveAttempt = (
  state: LoopState
): { attempts: RunAttempt[]; activeAttempt: number } => {
  if (
    state.attempts.length > 0 &&
    state.activeAttempt >= 0 &&
    state.activeAttempt < state.attempts.length
  ) {
    return { attempts: state.attempts, activeAttempt: state.activeAttempt };
  }

  const attempt: RunAttempt = {
    attempt: 1,
    startedAt: new Date().toISOString(),
    status: 'in_progress',
  };

  return { attempts: [attempt], activeAttempt: 0 };
};

const appendAttempt = (attempts: RunAttempt[]): { attempts: RunAttempt[]; activeAttempt: number } => {
  const lastAttempt = attempts[attempts.length - 1];
  const nextAttemptNumber = lastAttempt ? lastAttempt.attempt + 1 : 1;
  const newAttempt: RunAttempt = {
    attempt: nextAttemptNumber,
    startedAt: new Date().toISOString(),
    status: 'in_progress',
  };

  return {
    attempts: [...attempts, newAttempt],
    activeAttempt: attempts.length,
  };
};

const normalizeStepsForResume = (steps: StepState[]): StepState[] =>
  steps.map((step) => (step.status === 'running' ? { ...step, status: 'failed' } : step));

const findNextStepToRun = (steps: StepState[]): StepState | undefined =>
  steps.find((step) => step.status === 'pending' || step.status === 'failed');

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
        if (validation.success) {
          return ResultAsync.fromSafePromise(Promise.resolve(validation.data));
        }

        const legacyValidation = LegacyLoopStateSchema.safeParse(parsed);
        if (legacyValidation.success) {
          return ResultAsync.fromSafePromise(Promise.resolve(migrateLegacyState(legacyValidation.data)));
        }

        const legacyMessage = legacyValidation.error.message;
        return ResultAsync.fromSafePromise(
          Promise.reject(
            new Error(
              `Invalid state file structure: ${validation.error.message}; legacy parse error: ${legacyMessage}`
            )
          )
        );
      } catch (e) {
        return ResultAsync.fromSafePromise(
          Promise.reject(new Error(`Failed to parse state JSON: ${toError(e).message}`))
        );
      }
    });

/**
 * Get the current step number from the loop state.
 * @returns A ResultAsync with the current step number.
 */
const getCurrentStepNumber = (): ResultAsync<number, Error> =>
  readState().map((state) => state.currentStepNumber);

/**
 * Get the current loop status from the loop state.
 * @returns A ResultAsync with the current loop status.
 */
const getLoopStatus = (): ResultAsync<LoopState['status'], Error> =>
  readState().map((state) => state.status);

/**
 * Get plan progress details from the loop state.
 * @returns A ResultAsync with current step number and total step count.
 */
const getPlanProgress = (): ResultAsync<{ currentStepNumber: number; totalSteps: number }, Error> =>
  readState().map((state) => ({
    currentStepNumber: state.currentStepNumber,
    totalSteps: state.steps.length,
  }));

/**
 * Get the current loop context for decision logic.
 * @returns A ResultAsync with step number, total steps, and retry flag.
 */
const getLoopContext = (): ResultAsync<
  { currentStepNumber: number; totalSteps: number; isRetry: boolean },
  Error
> =>
  readState().map((state) => ({
    currentStepNumber: state.currentStepNumber,
    totalSteps: state.steps.length,
    isRetry: state.isRetry,
  }));

/**
 * Retrieve the current step state from the loop state.
 * @returns A ResultAsync with the current step state.
 */
const getCurrentStep = (): ResultAsync<StepState, Error> =>
  readState().andThen((state) => {
    const step = state.steps.find((s) => s.stepNumber === state.currentStepNumber);
    if (!step) {
      return ResultAsync.fromSafePromise(
        Promise.reject(new Error(`Current step ${state.currentStepNumber} not found in state`))
      );
    }
    return ResultAsync.fromSafePromise(Promise.resolve(step));
  });

/**
 * Check whether the current iteration is a retry.
 * @returns A ResultAsync with the retry flag.
 */
const isRetry = (): ResultAsync<boolean, Error> => readState().map((state) => state.isRetry);

/**
 * Get the current iteration count from the loop state.
 * @returns A ResultAsync with the iteration count.
 */
const getIterationCount = (): ResultAsync<number, Error> =>
  readState().map((state) => state.iterationCount);

/**
 * Initialize the loop state based on the plan file and limits.
 * @param config - Limits for the loop state initialization.
 * @returns A ResultAsync that resolves when state is written.
 */
const initializeState = (config: InitStateConfig): ResultAsync<void, Error> =>
  workspace.cache.plan
    .read()
    .mapErr((e) => new Error(`Could not read plan file: ${e.message}`))
    .andThen(parsePlanSteps)
    .andThen((stepNumbers) => {
      const initialAttempt: RunAttempt = {
        attempt: 1,
        startedAt: new Date().toISOString(),
        status: 'in_progress',
      };

      const initialState: LoopState = {
        version: STATE_VERSION,
        runId: config.runId,
        status: 'planning',
        currentStepNumber: stepNumbers[0] ?? 1,
        isRetry: false,
        maxIterations: config.maxIterations,
        maxTimeMinutes: config.maxTimeMinutes,
        iterationCount: 0,
        attempts: [initialAttempt],
        activeAttempt: 0,
        steps: stepNumbers.map((stepNumber) => ({
          stepNumber,
          status: 'pending',
        })),
      };

      return writeState(initialState);
    });

/**
 * Transition the loop state into execution mode and mark the first step as running.
 * @returns A ResultAsync that resolves when state is updated.
 */
const startExecution = (): ResultAsync<void, Error> =>
  readState().andThen((state) => {
    const ensured = ensureActiveAttempt(state);
    const updatedSteps = state.steps.map((step, index) =>
      index === 0 ? { ...step, status: 'running' } : step
    );
    const updatedState: LoopState = {
      ...state,
      status: 'executing',
      currentStepNumber: updatedSteps[0]?.stepNumber ?? state.currentStepNumber,
      attempts: ensured.attempts,
      activeAttempt: ensured.activeAttempt,
      steps: updatedSteps,
    };
    return writeState(updatedState);
  });

/**
 * Resume execution using an existing state file.
 * @param runId - The run identifier to resume
 * @returns A ResultAsync that resolves when state is updated.
 */
const resumeExecution = (runId: string): ResultAsync<void, Error> =>
  readState().andThen((state) => {
    if (state.status === 'completed') {
      return ResultAsync.fromSafePromise(
        Promise.reject(new Error('Cannot resume a completed run.'))
      );
    }

    if (state.runId !== runId && state.runId !== LEGACY_RUN_ID) {
      return ResultAsync.fromSafePromise(
        Promise.reject(new Error(`Run ID mismatch. State has ${state.runId}, expected ${runId}.`))
      );
    }

    const updatedSteps = normalizeStepsForResume(state.steps);
    const nextStep = findNextStepToRun(updatedSteps);
    if (!nextStep) {
      return ResultAsync.fromSafePromise(
        Promise.reject(new Error('No pending or failed steps remain to resume.'))
      );
    }

    const attemptStatus = mapLoopStatusToAttemptStatus(state.status);
    const closedAttempts = closeActiveAttempt(state, attemptStatus);
    const nextAttempts = appendAttempt(closedAttempts);

    const stepsWithRunning = updatedSteps.map((step) =>
      step.stepNumber === nextStep.stepNumber ? { ...step, status: 'running' } : step
    );

    const updatedState: LoopState = {
      ...state,
      runId: state.runId === LEGACY_RUN_ID ? runId : state.runId,
      status: 'executing',
      currentStepNumber: nextStep.stepNumber,
      isRetry: false,
      attempts: nextAttempts.attempts,
      activeAttempt: nextAttempts.activeAttempt,
      steps: stepsWithRunning,
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
 * Mark the current step as a retry attempt.
 * @returns A ResultAsync that resolves when state is updated.
 */
const markCurrentStepAsRetry = (): ResultAsync<void, Error> =>
  readState().andThen((state) => {
    const updatedState: LoopState = {
      ...state,
      isRetry: true,
    };
    return writeState(updatedState);
  });

/**
 * Mark the current step as completed and advance to the next step if available.
 * @param commitHash - Commit hash associated with the step completion.
 * @returns A ResultAsync that resolves when state is updated.
 */
const completeCurrentStep = (commitHash: string): ResultAsync<void, Error> =>
  readState().andThen((state) => {
    const currentStepIndex = state.steps.findIndex(
      (step) => step.stepNumber === state.currentStepNumber
    );

    if (currentStepIndex === -1) {
      return ResultAsync.fromSafePromise(
        Promise.reject(new Error(`Current step ${state.currentStepNumber} not found`))
      );
    }

    const updatedSteps = [...state.steps];
    const currentStep = updatedSteps[currentStepIndex]!;

    updatedSteps[currentStepIndex] = {
      stepNumber: currentStep.stepNumber,
      status: 'done',
      commitHash,
    };

    const hasMoreSteps = currentStepIndex < state.steps.length - 1;

    if (hasMoreSteps) {
      const nextStepIndex = currentStepIndex + 1;
      const nextStep = updatedSteps[nextStepIndex]!;

      updatedSteps[nextStepIndex] = {
        stepNumber: nextStep.stepNumber,
        status: 'running',
        commitHash: nextStep.commitHash,
      };

      const updatedState: LoopState = {
        ...state,
        currentStepNumber: nextStep.stepNumber,
        isRetry: false,
        steps: updatedSteps,
      };
      return writeState(updatedState);
    }

    const completedAttempts = closeActiveAttempt(state, 'completed');
    const updatedState: LoopState = {
      ...state,
      status: 'completed',
      isRetry: false,
      attempts: completedAttempts,
      steps: updatedSteps,
    };
    return writeState(updatedState);
  });

/**
 * Check whether loop limits have been exceeded.
 * @returns A ResultAsync with limit status and optional reason.
 */
const checkLimits = (): ResultAsync<{ exceeded: boolean; reason?: string }, Error> =>
  readState().map((state) => {
    if (state.iterationCount >= state.maxIterations) {
      return {
        exceeded: true,
        reason: `Iteration limit exceeded (${state.iterationCount}/${state.maxIterations})`,
      };
    }

    const activeAttempt = getActiveAttempt(state);
    if (activeAttempt) {
      const startTime = new Date(activeAttempt.startedAt).getTime();
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
 * Mark the loop and current step as failed.
 * @returns A ResultAsync that resolves when state is updated.
 */
const failLoop = (): ResultAsync<void, Error> =>
  readState().andThen((state) => {
    const updatedSteps = state.steps.map((step) =>
      step.stepNumber === state.currentStepNumber ? { ...step, status: 'failed' as const } : step
    );

    const updatedState: LoopState = {
      ...state,
      status: 'failed',
      attempts: closeActiveAttempt(state, 'failed'),
      steps: updatedSteps,
    };

    return writeState(updatedState);
  });

/**
 * Mark the loop and current step as aborted.
 * @returns A ResultAsync that resolves when state is updated.
 */
const abortLoop = (): ResultAsync<void, Error> =>
  readState().andThen((state) => {
    const updatedSteps = state.steps.map((step) =>
      step.stepNumber === state.currentStepNumber ? { ...step, status: 'failed' as const } : step
    );

    const updatedState: LoopState = {
      ...state,
      status: 'aborted',
      attempts: closeActiveAttempt(state, 'aborted'),
      steps: updatedSteps,
    };

    return writeState(updatedState);
  });

const stateUtils = {
  getCurrentStepNumber,
  getLoopStatus,
  getPlanProgress,
  getLoopContext,
  getCurrentStep,
  isRetry,
  getIterationCount,
  initializeState,
  startExecution,
  resumeExecution,
  incrementIteration,
  markCurrentStepAsRetry,
  completeCurrentStep,
  checkLimits,
  failLoop,
  abortLoop,
};

export { stateUtils };
