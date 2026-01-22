import { z } from 'zod';

const TASK_STATUS_VALUES = ['pending', 'in_progress', 'completed', 'failed', 'aborted'] as const;
const LOOP_STATUS_VALUES = ['planning', 'executing', 'completed', 'failed', 'aborted'] as const;

const TaskStatusSchema = z.object({
  taskNumber: z.number(),
  status: z.enum(TASK_STATUS_VALUES),
  commitHash: z.string().optional(),
});

const LoopStateSchema = z.object({
  version: z.string(),
  status: z.enum(LOOP_STATUS_VALUES),
  currentTaskNumber: z.number(),
  isRetry: z.boolean(),
  maxIterations: z.number(),
  maxTimeMinutes: z.number(),
  startedAt: z.string().optional(),
  iterationCount: z.number(),
  tasks: z.array(TaskStatusSchema),
});

const InitStateConfigSchema = z.object({
  maxIterations: z.number(),
  maxTimeMinutes: z.number(),
});

type TaskStatus = z.infer<typeof TaskStatusSchema>;
type LoopState = z.infer<typeof LoopStateSchema>;
type InitStateConfig = z.infer<typeof InitStateConfigSchema>;

export { TaskStatusSchema, LoopStateSchema, InitStateConfigSchema };
export type { TaskStatus, LoopState, InitStateConfig };
