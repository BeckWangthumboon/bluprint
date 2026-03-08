import { z } from 'zod';

const STEP_STATUS_VALUES = ['pending', 'running', 'done', 'failed', 'skipped'] as const;
const LOOP_STATUS_VALUES = ['planning', 'executing', 'completed', 'failed', 'aborted'] as const;
const ATTEMPT_STATUS_VALUES = ['in_progress', 'completed', 'failed', 'aborted'] as const;

const StepStatusSchema = z.enum(STEP_STATUS_VALUES);

const StepStateSchema = z.object({
  stepNumber: z.number(),
  status: StepStatusSchema,
  commitHash: z.string().optional(),
});

const RunAttemptSchema = z.object({
  attempt: z.number(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  status: z.enum(ATTEMPT_STATUS_VALUES),
  reason: z.string().optional(),
});

const LoopStateSchema = z.object({
  version: z.literal('2.0.0'),
  runId: z.string(),
  status: z.enum(LOOP_STATUS_VALUES),
  currentStepNumber: z.number(),
  isRetry: z.boolean(),
  maxIterations: z.number(),
  maxTimeMinutes: z.number(),
  iterationCount: z.number(),
  attempts: z.array(RunAttemptSchema),
  activeAttempt: z.number(),
  steps: z.array(StepStateSchema),
});

const InitStateConfigSchema = z.object({
  runId: z.string(),
  maxIterations: z.number(),
  maxTimeMinutes: z.number(),
});

type StepStatus = z.infer<typeof StepStatusSchema>;
type StepState = z.infer<typeof StepStateSchema>;
type RunAttempt = z.infer<typeof RunAttemptSchema>;
type LoopState = z.infer<typeof LoopStateSchema>;
type InitStateConfig = z.infer<typeof InitStateConfigSchema>;

export { StepStatusSchema, StepStateSchema, RunAttemptSchema, LoopStateSchema, InitStateConfigSchema };
export type { StepStatus, StepState, RunAttempt, LoopState, InitStateConfig };
