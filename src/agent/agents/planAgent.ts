import { err, ok, Result, ResultAsync } from 'neverthrow';
import { createAgentRuntime } from '../runtime/index.js';
import { toolRegistry } from '../tools/index.js';
import type { Plan, TodoTask } from '../../types/tasks.js';
import type { Specification } from '../../types/spec.js';
import type { RulesIndex, RuleReference } from '../../types/rules.js';
import type { AppError } from '../../types/errors.js';
import { createAppError } from '../../types/errors.js';
import { isRecord, safeJsonParse, unwrapCodeFence } from '../../lib/utils.js';

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

AVAILABLE TOOLS:
- viewFile: Use this FIRST to scan the codebase and understand the current state before planning. Read relevant files to understand the architecture.
- lookupRules: Use this only when the rules index description is ambiguous and you need more detail about a specific rule.

YOUR TASK:
1. Review the specification and rules index provided.
2. Use viewFile to understand the current codebase structure relevant to the specification.
3. Break down the specification into actionable tasks in the format below.
4. Each task MUST have at least one rule assigned from the rules index. Rules serve as "context engineering" for downstream coding agents.

OUTPUT FORMAT:
Respond with a JSON object matching the Plan schema:
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
}

IMPORTANT:
- Every task MUST have at least one rule assigned
- Rules should be copied exactly from the rules index
- Tasks should be ordered by dependencies (independent tasks first)
- Return ONLY valid JSON, no markdown code fences`;

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
 * Validates a single task from the LLM response.
 */
const validateTask = (entry: unknown, index: number): Result<TodoTask, AppError> => {
  if (!isRecord(entry)) {
    return err(createAppError('LLM_ERROR', `Task at index ${index} must be an object`));
  }

  if (typeof entry.id !== 'string' || !entry.id.trim()) {
    return err(createAppError('LLM_ERROR', `Task at index ${index} must have a non-empty id`));
  }

  if (typeof entry.title !== 'string' || !entry.title.trim()) {
    return err(createAppError('LLM_ERROR', `Task at index ${index} must have a non-empty title`));
  }

  if (typeof entry.instructions !== 'string' || !entry.instructions.trim()) {
    return err(
      createAppError('LLM_ERROR', `Task at index ${index} must have non-empty instructions`),
    );
  }

  if (!Array.isArray(entry.rules) || entry.rules.length === 0) {
    return err(
      createAppError('LLM_ERROR', `Task at index ${index} must have at least one rule assigned`),
    );
  }

  const rules: RuleReference[] = [];
  for (const rule of entry.rules) {
    if (
      !isRecord(rule) ||
      typeof rule.id !== 'string' ||
      typeof rule.description !== 'string' ||
      typeof rule.path !== 'string' ||
      !Array.isArray(rule.tags)
    ) {
      return err(createAppError('LLM_ERROR', `Invalid rule in task at index ${index}`));
    }
    rules.push({
      id: rule.id,
      description: rule.description,
      path: rule.path,
      tags: rule.tags as string[],
    });
  }

  const task: TodoTask = {
    id: entry.id.trim(),
    title: entry.title.trim(),
    instructions: entry.instructions.trim(),
    rules,
  };

  if (entry.kind && typeof entry.kind === 'string') {
    task.kind = entry.kind as TodoTask['kind'];
  }

  if (isRecord(entry.scope)) {
    task.scope = {};
    if (Array.isArray(entry.scope.files)) {
      task.scope.files = entry.scope.files as string[];
    }
    if (Array.isArray(entry.scope.includeGlobs)) {
      task.scope.includeGlobs = entry.scope.includeGlobs as string[];
    }
    if (Array.isArray(entry.scope.excludeGlobs)) {
      task.scope.excludeGlobs = entry.scope.excludeGlobs as string[];
    }
  }

  if (Array.isArray(entry.acceptanceCriteria)) {
    task.acceptanceCriteria = entry.acceptanceCriteria as string[];
  }

  if (Array.isArray(entry.dependencies)) {
    task.dependencies = entry.dependencies as string[];
  }

  if (isRecord(entry.metaData)) {
    task.metaData = entry.metaData as Record<string, unknown>;
  }

  return ok(task);
};

/**
 * Validates and parses the LLM response into a Plan object.
 */
const validatePlanResponse = (raw: string, specId: string): Result<Plan, AppError> => {
  const normalized = unwrapCodeFence(raw);
  const parseResult = safeJsonParse(normalized);

  if (parseResult.isErr()) {
    return err(
      createAppError('LLM_ERROR', `Model response is not valid JSON: ${parseResult.error.message}`),
    );
  }

  const parsed = parseResult.value;

  if (!isRecord(parsed)) {
    return err(createAppError('LLM_ERROR', 'Model response must be a JSON object'));
  }

  if (!Array.isArray(parsed.tasks)) {
    return err(createAppError('LLM_ERROR', 'Model response must include a tasks array'));
  }

  const tasks: TodoTask[] = [];
  for (let i = 0; i < parsed.tasks.length; i++) {
    const taskResult = validateTask(parsed.tasks[i], i);
    if (taskResult.isErr()) {
      return err(taskResult.error);
    }
    tasks.push(taskResult.value);
  }

  const plan: Plan = {
    id: typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id.trim() : specId,
    tasks,
  };

  if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
    plan.summary = parsed.summary.trim();
  }

  if (Array.isArray(parsed.notes)) {
    plan.notes = parsed.notes.filter((n): n is string => typeof n === 'string' && n.trim() !== '');
  }

  return ok(plan);
};

/**
 * Creates a plan generation agent that uses LLM with tools to break down specifications.
 *
 * @returns Result containing a PlanAgent function or AppError when runtime creation fails.
 */
const createPlanAgent = (): Result<PlanAgent, AppError> =>
  createAgentRuntime().map((runtime) => (input) => {
    const tools = toolRegistry.pick(['lookupRules', 'viewFile']);
    const specId = generateSpecId(input.spec);

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
      })
      .andThen((text) => validatePlanResponse(text, specId));
  });

export const planAgent = {
  createPlanAgent,
  generateSpecId,
};
