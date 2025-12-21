import { ResultAsync, err, ok } from 'neverthrow';
import { createSession, deleteSession, type OpencodeClient } from './sessionManager.js';
import { workspace } from '../workspace.js';
import { toError, getModelConfig, loadPromptFile } from './utils.js';
import { readState } from '../state.js';
import { exec } from '../shell.js';
import type { ModelConfig, MasterAgentOutput } from './types.js';

const MASTER_DEFAULT_MODEL: ModelConfig = {
  providerID: 'google',
  modelID: 'claude-sonnet-4-5',
};

const MAX_REPAIR_ATTEMPTS = 2;

/**
 * Type guard to check if data is a valid object
 */
const isObject = (data: unknown): data is Record<string, unknown> => {
  return typeof data === 'object' && data !== null;
};

/**
 * Type guard to check if response has valid data structure
 */
const hasValidResponseData = (
  response: unknown
): response is { data: { parts: Array<{ type: string; text?: string }> } } => {
  if (!isObject(response)) return false;
  if (!isObject(response.data)) return false;
  if (!Array.isArray(response.data.parts)) return false;
  return true;
};

/**
 * Validates the master agent output against the expected schema
 */
const validateMasterOutput = (
  data: unknown
): { ok: true; value: MasterAgentOutput } | { ok: false; reason: string } => {
  if (!isObject(data)) {
    return { ok: false, reason: 'Output must be a JSON object' };
  }

  const { decision, task } = data;

  if (decision !== 'accept' && decision !== 'reject') {
    return { ok: false, reason: 'decision must be exactly "accept" or "reject"' };
  }

  if (typeof task !== 'string' || task.trim() === '') {
    return { ok: false, reason: 'task must be a non-empty string' };
  }

  return { ok: true, value: { decision, task } };
};

/**
 * Extracts the current step content from the plan based on task number
 */
const extractCurrentStepFromPlan = (plan: string, taskNumber: number): string | null => {
  const stepRegex = new RegExp(`^## ${taskNumber} (.+?)(?=^## ${taskNumber + 1} |$)`, 'ms');
  const match = plan.match(stepRegex);

  if (!match) {
    return null;
  }

  return match[0].trim();
};

/**
 * Generates a repair prompt for invalid JSON output
 */
const createRepairPrompt = (validationError: string): string => {
  return `Your previous output was invalid. Error: ${validationError}

You MUST output ONLY valid JSON in this exact format:

{"decision":"accept","task":"<task prompt here>"}

OR

{"decision":"reject","task":"<task prompt here>"}

Rules:
- Output ONLY the JSON object
- No markdown code blocks
- No additional text or explanation
- "decision" must be exactly "accept" or "reject" (lowercase)
- "task" must be a non-empty string

Now output ONLY valid JSON:`;
};

/**
 * Calls the model and attempts to repair invalid output
 */
const callModelWithRepair = (
  sessionId: string,
  client: OpencodeClient,
  model: ModelConfig,
  systemPrompt: string,
  userPrompt: string,
  attemptNumber = 1
): ResultAsync<MasterAgentOutput, Error> => {
  return ResultAsync.fromPromise(
    client.session.prompt({
      path: { id: sessionId },
      body: {
        agent: 'master',
        model,
        system: systemPrompt,
        parts: [
          {
            type: 'text',
            text: userPrompt,
          },
        ],
      },
    }),
    toError
  ).andThen((promptResponse: unknown) => {
    if (!hasValidResponseData(promptResponse)) {
      return err(new Error('Failed to get response from master agent: Invalid response structure'));
    }

    const textParts = promptResponse.data.parts.filter(
      (part: { type: string }) => part.type === 'text'
    );

    if (textParts.length === 0) {
      return err(new Error('No text content in master agent response'));
    }

    const rawOutput = textParts
      .map((part: { type: string; text?: string }) => part.text ?? '')
      .join('\n\n')
      .trim();

    // Try to parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawOutput);
    } catch (e) {
      if (attemptNumber >= MAX_REPAIR_ATTEMPTS) {
        return err(
          new Error(
            `Failed to parse master agent output after ${MAX_REPAIR_ATTEMPTS} attempts: ${toError(e).message}`
          )
        );
      }

      // Attempt repair
      const repairPrompt = createRepairPrompt(`Invalid JSON: ${toError(e).message}`);
      return callModelWithRepair(
        sessionId,
        client,
        model,
        systemPrompt,
        repairPrompt,
        attemptNumber + 1
      );
    }

    // Validate schema
    const validation = validateMasterOutput(parsed);
    if (!validation.ok) {
      if (attemptNumber >= MAX_REPAIR_ATTEMPTS) {
        return err(
          new Error(
            `Master agent output validation failed after ${MAX_REPAIR_ATTEMPTS} attempts: ${validation.reason}`
          )
        );
      }

      // Attempt repair
      const repairPrompt = createRepairPrompt(validation.reason);
      return callModelWithRepair(
        sessionId,
        client,
        model,
        systemPrompt,
        repairPrompt,
        attemptNumber + 1
      );
    }

    return ok(validation.value);
  });
};

/**
 * Main master agent function that reviews code changes and generates next task
 */
export const reviewAndGenerateTask = (): ResultAsync<string, Error> => {
  const model = getModelConfig('MASTER_AGENT_MODEL', MASTER_DEFAULT_MODEL);

  // Read all required context files
  return readState()
    .andThen((state) => {
      return workspace.spec
        .read()
        .mapErr((e) => new Error(`Could not read spec.md: ${e.message}`))
        .andThen((spec) => {
          return workspace.plan
            .read()
            .mapErr((e) => new Error(`Could not read plan.md: ${e.message}`))
            .map((plan) => ({ state, spec, plan }));
        });
    })
    .andThen(({ state, spec, plan }) => {
      // Extract current step from plan
      const currentStep = extractCurrentStepFromPlan(plan, state.currentTaskNumber);

      if (!currentStep) {
        return err(new Error(`Could not find task ${state.currentTaskNumber} in plan.md`));
      }

      return ok({ state, spec, plan, currentStep });
    })
    .andThen(({ state, spec, plan, currentStep }) => {
      // Read report (allow empty)
      return workspace.report
        .read()
        .orElse(() => ResultAsync.fromSafePromise(Promise.resolve(''))) // Treat missing report as empty
        .map((report) => ({ state, spec, plan, currentStep, report }));
    })
    .andThen(({ state, spec, plan, currentStep, report }) => {
      // Check for coding agent failure: isRetry is true but report is empty
      if (state.isRetry && report.trim() === '') {
        const rejectOutput: MasterAgentOutput = {
          decision: 'reject',
          task: `The coding agent failed to produce a report on the retry attempt. This indicates an error or crash during execution.

Please check for:
1. Syntax errors in recently modified files
2. Runtime errors or exceptions
3. Build failures or linter errors
4. Missing dependencies

Fix any errors you find, then update report.md with:
- What errors you found
- How you fixed them
- Confirmation that the implementation now works

Current task you should be working on:
${currentStep}`,
        };
        return ResultAsync.fromSafePromise(Promise.resolve(JSON.stringify(rejectOutput, null, 2)));
      }

      // Get git diff and git status
      return exec('git', ['diff', 'HEAD'])
        .map((result) => result.stdout)
        .orElse(() => ResultAsync.fromSafePromise(Promise.resolve(''))) // If git diff fails, treat as no changes
        .andThen((gitDiff) => {
          return exec('git', ['status', '--short'])
            .map((result) => result.stdout)
            .orElse(() => ResultAsync.fromSafePromise(Promise.resolve('')))
            .map((gitStatus) => ({ gitDiff, gitStatus }));
        })
        .andThen(({ gitDiff, gitStatus }) => {
          return loadPromptFile('masterAgent.txt').map((systemPrompt) => ({
            state,
            spec,
            plan,
            currentStep,
            report,
            gitDiff,
            gitStatus,
            systemPrompt,
          }));
        })
        .andThen(({ state, spec, plan, currentStep, report, gitDiff, gitStatus, systemPrompt }) => {
          // Determine if there's a next step
          const hasNextStep = state.currentTaskNumber < state.tasks.length;
          const nextStepNumber = state.currentTaskNumber + 1;
          let nextStepContent = '';

          if (hasNextStep) {
            const nextStep = extractCurrentStepFromPlan(plan, nextStepNumber);
            if (nextStep) {
              nextStepContent = nextStep;
            }
          }

          // Build user prompt
          const userPrompt = `# Review Context

## Specification (spec.md)
${spec}

## Current Plan Step (Task ${state.currentTaskNumber})
${currentStep}

## Coding Agent Report (report.md)
${report || '(empty)'}

## Git Status
\`\`\`
${gitStatus || '(no changes)'}
\`\`\`

## Git Diff
\`\`\`diff
${gitDiff || '(no changes)'}
\`\`\`

## Status Information
- Current task number: ${state.currentTaskNumber}
- Is retry: ${state.isRetry}
- Total tasks: ${state.tasks.length}
- Has next step: ${hasNextStep}

${hasNextStep ? `## Next Plan Step (Task ${nextStepNumber})\n${nextStepContent}` : '## Note\nThis is the LAST task in the plan. After acceptance, the loop will complete.'}

---

Review the current task implementation and decide whether to accept or reject. Output ONLY valid JSON.`;

          // Call model with repair capability
          return createSession('Master Agent Review').andThen((session) =>
            callModelWithRepair(session.id, session.client, model, systemPrompt, userPrompt)
              .andThen((output) => deleteSession(session).map(() => output))
              .orElse((error) => deleteSession(session).andThen(() => err(error)))
              .map((output) => JSON.stringify(output, null, 2))
          );
        });
    });
};
