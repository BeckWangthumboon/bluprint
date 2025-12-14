import { z } from 'zod';
import { RuleReferenceSchema } from './rules.js';

const TaskScopeSchema = z.object({
  files: z.array(z.string()).optional(),
  includeGlobs: z.array(z.string()).optional(),
  excludeGlobs: z.array(z.string()).optional(),
});

const TodoTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  instructions: z.string().min(1),
  kind: z.enum(['feature', 'refactor', 'bugfix', 'chore', 'other']).optional(),
  scope: TaskScopeSchema.optional(),
  rules: z.array(RuleReferenceSchema).min(1), // At least one rule required
  acceptanceCriteria: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  metaData: z.record(z.string(), z.unknown()).optional(),
});

const PlanSchema = z.object({
  id: z.string().min(1),
  summary: z.string().optional(),
  notes: z.array(z.string()).optional(),
  tasks: z.array(TodoTaskSchema),
});

type TaskKind = z.infer<typeof TodoTaskSchema>['kind'];
type TaskScope = z.infer<typeof TaskScopeSchema>;
type TodoTask = z.infer<typeof TodoTaskSchema>;
type Plan = z.infer<typeof PlanSchema>;

export type { TaskKind, TaskScope, TodoTask, Plan };
export { RuleReferenceSchema, TaskScopeSchema, TodoTaskSchema, PlanSchema };
