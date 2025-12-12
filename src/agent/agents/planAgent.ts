import { errAsync, ok, Result, ResultAsync } from 'neverthrow';
import { createAgentRuntime } from '../runtime/index.js';
import { toolRegistry } from '../tools/index.js';
import { createSubmitPlanTool, planSchema } from '../tools/submitPlan.js';
import type { Plan } from '../../types/tasks.js';
import type { Specification } from '../../types/spec.js';
import type { RulesIndex } from '../../types/rules.js';
import type { AppError } from '../../types/errors.js';
import { createAppError } from '../../types/errors.js';

type PlanAgentInput = {
  spec: Specification;
  rulesIndex: RulesIndex;
};

type PlanAgent = (input: PlanAgentInput) => ResultAsync<Plan, AppError>;

/**
 * Generates a deterministic spec ID by hashing the specification content.
 */
const generateSpecId = (spec: Specification): string => {
  const content = JSON.stringify(spec);
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `plan-${Math.abs(hash).toString(16)}`;
};

/**
 * Builds the system prompt instructing the LLM on plan generation.
 */
const buildSystemPrompt =
  (): string => `You are a technical planning agent that breaks down specifications into actionable tasks.

WORKFLOW:
1. First, use the viewFile tool to explore the codebase and understand the current architecture.
2. Review the specification and rules index provided in the user message.
3. Use lookupRules only if a rule's description is ambiguous and you need more detail.
4. When you are ready to submit your final plan, use the submitPlan tool.

IMPORTANT - TOOL USAGE:
- Use viewFile and lookupRules freely to gather context before planning.
- The submitPlan tool is ONLY for your FINAL answer. Do not call it until you have fully analyzed the codebase and are ready to submit your complete plan.

PLAN REQUIREMENTS:
- Every task MUST have at least one rule assigned from the rules index.
- Rules serve as "context engineering" for downstream coding agents.
- Rules should be copied exactly from the rules index (id, description, path, tags).
- Tasks should be ordered by dependencies (independent tasks first).
- Each task needs: id, title, instructions, and at least one rule.

PLAN SCHEMA (for submitPlan):
{
  "id": "<generated-id>",
  "summary": "Brief description of what the plan accomplishes",
  "notes": ["Optional notes about the plan"],
  "tasks": [
    {
      "id": "task-1",
      "title": "Brief task title",
      "instructions": "Detailed implementation instructions",
      "kind": "feature|refactor|bugfix|chore|other",
      "scope": {
        "files": ["optional/file/paths.ts"],
        "includeGlobs": ["optional/globs/**"],
        "excludeGlobs": ["optional/exclude/**"]
      },
      "rules": [
        {
          "id": "rule-id",
          "description": "rule description",
          "path": "rule/path",
          "tags": ["tag1", "tag2"]
        }
      ],
      "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
      "dependencies": ["optional-task-id-this-depends-on"]
    }
  ]
}`;

/**
 * Formats the specification and rules index into a structured message for the LLM.
 */
const formatInputForLLM = (spec: Specification, rulesIndex: RulesIndex): string => {
  const specSection = `## SPECIFICATION

### Overview
Summary: ${spec.overview.summary}
${spec.overview.goals ? `Goals:\n${spec.overview.goals.map((g) => `- ${g}`).join('\n')}` : ''}

${spec.motivation ? `### Motivation\n${spec.motivation.problem ? `Problem: ${spec.motivation.problem}` : ''}\n${spec.motivation.context ? `Context:\n${spec.motivation.context.map((c) => `- ${c}`).join('\n')}` : ''}` : ''}

${spec.constraints ? `### Constraints\n${spec.constraints.map((c) => `- ${c}`).join('\n')}` : ''}

${spec.implementation_patterns ? `### Implementation Patterns\n${spec.implementation_patterns.guidelines ? spec.implementation_patterns.guidelines.map((g) => `- ${g}`).join('\n') : ''}` : ''}

### Acceptance Criteria
${spec.acceptance_criteria.map((c) => `- ${c}`).join('\n')}

${spec.edge_cases ? `### Edge Cases\n${spec.edge_cases.map((e) => `- ${e.name}: ${e.result} (${e.handling})`).join('\n')}` : ''}

### Scope
Include: ${spec.scope.include.join(', ')}
${spec.scope.exclude ? `Exclude: ${spec.scope.exclude.join(', ')}` : ''}`;

  const rulesSection = `## RULES INDEX

${rulesIndex.rules.map((r) => `- [${r.id}] ${r.description} (tags: ${r.tags.join(', ')}) - path: ${r.path}`).join('\n')}`;

  return `${specSection}\n\n${rulesSection}`;
};

/**
 * Creates a plan generation agent that uses LLM with tools to break down specifications.
 *
 * The agent uses step-based detection to capture when the model calls submitPlan.
 *
 * @returns Result containing a PlanAgent function or AppError when runtime creation fails.
 */
const createPlanAgent = (): Result<PlanAgent, AppError> =>
  createAgentRuntime().map((runtime) => (input) => {
    // Track submitted plan
    let submittedPlan: Plan | null = null;

    // Get exploration tools
    const explorationTools = toolRegistry.pick(['lookupRules', 'viewFile']);
    
    // Create submitPlan tool (no callback needed anymore)
    const submitPlanTool = createSubmitPlanTool(() => {
      // This callback is never called with the new approach
    });

    const tools = [...explorationTools, submitPlanTool];

    return runtime
      .generateText({
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(),
          },
          {
            role: 'user',
            content: formatInputForLLM(input.spec, input.rulesIndex),
          },
        ],
        temperature: 0.3,
        tools,
        // No maxSteps limit - let the model explore as needed
        onStepFinish: (step) => {
          // Check each tool call in this step
          for (const toolCall of step.toolCalls) {
            if (toolCall.name === 'submitPlan') {
              // Validate and extract the plan from tool call args
              const validation = planSchema.safeParse(toolCall.args);
              if (validation.success) {
                submittedPlan = validation.data as Plan;
              }
            }
          }
        },
      })
      .andThen((result) => {
        if (submittedPlan === null) {
          return errAsync(
            createAppError(
              'LLM_ERROR',
              `Plan agent did not submit a plan within ${result.steps.length} step(s). The model should call submitPlan with the final plan.`,
            ),
          );
        }

        return ResultAsync.fromSafePromise(Promise.resolve(submittedPlan));
      });
  });

export const planAgent = {
  createPlanAgent,
  generateSpecId,
};
