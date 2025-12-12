import { okAsync, type ResultAsync } from 'neverthrow';
import { z } from 'zod';
import { makeTool, type Tool } from './types.js';
import { createToolError, type ToolError } from './errors.js';
import type { Plan, TodoTask } from '../../types/tasks.js';
import type { RuleReference } from '../../types/rules.js';

// Zod schemas matching the Plan structure
const ruleReferenceSchema = z.object({
  id: z.string().min(1, 'rule id is required'),
  description: z.string().min(1, 'rule description is required'),
  path: z.string().min(1, 'rule path is required'),
  tags: z.array(z.string()),
});

const taskScopeSchema = z
  .object({
    files: z.array(z.string()).optional(),
    includeGlobs: z.array(z.string()).optional(),
    excludeGlobs: z.array(z.string()).optional(),
  })
  .optional();

const todoTaskSchema = z.object({
  id: z.string().min(1, 'task id is required'),
  title: z.string().min(1, 'task title is required'),
  instructions: z.string().min(1, 'task instructions are required'),
  kind: z.enum(['feature', 'refactor', 'bugfix', 'chore', 'other']).optional(),
  scope: taskScopeSchema,
  rules: z.array(ruleReferenceSchema).min(1, 'each task must have at least one rule'),
  acceptanceCriteria: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  metaData: z.record(z.string(), z.unknown()).optional(),
});

const planSchema = z.object({
  id: z.string().min(1, 'plan id is required'),
  summary: z.string().optional(),
  notes: z.array(z.string()).optional(),
  tasks: z.array(todoTaskSchema).min(1, 'plan must have at least one task'),
});

type PlanInput = z.infer<typeof planSchema>;

/**
 * Creates a submitPlan tool that validates and stores the final plan.
 *
 * The tool acts as a "terminal" tool - it's how the agent signals completion
 * and submits its structured output rather than returning raw JSON text.
 *
 * @param onSubmit - Callback invoked with the validated plan when submission succeeds.
 * @returns Tool definition for submitPlan.
 */
const createSubmitPlanTool = (
  onSubmit: (plan: Plan) => void,
): Tool<PlanInput, { success: boolean; message: string }> =>
  makeTool({
    name: 'submitPlan',
    description:
      'Submit the final execution plan. Use this ONLY after you have finished analyzing the codebase and are ready to submit your final plan. Each task must have at least one rule assigned.',
    inputSchema: planSchema,
    handler: (input): ResultAsync<{ success: boolean; message: string }, ToolError> => {
      // Additional validation beyond Zod
      for (let i = 0; i < input.tasks.length; i++) {
        const task = input.tasks[i];
        if (!task) continue;

        if (task.rules.length === 0) {
          return okAsync({
            success: false,
            message: `Task "${task.id}" at index ${i} must have at least one rule assigned.`,
          });
        }
      }

      // Convert to typed Plan
      const plan: Plan = {
        id: input.id,
        summary: input.summary,
        notes: input.notes,
        tasks: input.tasks.map(
          (t): TodoTask => ({
            id: t.id,
            title: t.title,
            instructions: t.instructions,
            kind: t.kind,
            scope: t.scope,
            rules: t.rules as RuleReference[],
            acceptanceCriteria: t.acceptanceCriteria,
            dependencies: t.dependencies,
            metaData: t.metaData as Record<string, unknown> | undefined,
          }),
        ),
      };

      // Store the plan via callback
      onSubmit(plan);

      return okAsync({
        success: true,
        message: `Plan "${plan.id}" with ${plan.tasks.length} task(s) submitted successfully.`,
      });
    },
  });

export { createSubmitPlanTool, planSchema };
