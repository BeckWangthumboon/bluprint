import { ResultAsync, err, ok } from 'neverthrow';
import { createSession, deleteSession, type OpencodeClient } from './sessionManager.js';
import { workspace } from '../workspace.js';
import {
  parseTextResponse,
  toError,
  getModelConfig,
  loadPromptFile,
  validateModel,
  withTimeout,
  getTimeoutMs,
  getOpenCodeError,
} from './utils.js';
import { getOpencodeClient } from './session.js';
import { readState } from '../state.js';
import { exec } from '../shell.js';
import { findPlanStep, getPlanStep } from './planUtils.js';
import { getLogger } from './logger.js';
import type { ModelConfig, MasterAgentOutput, FirstIterationOutput } from './types.js';
import { isObject } from './utils.js';

const MASTER_DEFAULT_MODEL: ModelConfig = {
  providerID: 'google',
  modelID: 'claude-sonnet-4-5',
};

const MAX_REPAIR_ATTEMPTS = 2;

/**
 * Validates the master agent output against the expected schema
 * On accept: task is not required
 * On reject: task is required and must be non-empty
 */
const validateMasterOutput = (
  data: unknown
): { ok: true; value: MasterAgentOutput } | { ok: false; reason: string } => {
  if (!isObject(data)) {
    return { ok: false, reason: 'Output must be a JSON object' };
  }

  const { decision, task } = data;

  switch (decision) {
    case 'reject':
      if (typeof task !== 'string' || task.trim() === '') {
        return { ok: false, reason: 'task must be a non-empty string when decision is "reject"' };
      }
      return { ok: true, value: { decision, task } };
    case 'accept':
      return { ok: true, value: { decision } }; // on accept, ignore task
    default:
      return { ok: false, reason: 'decision must be exactly "accept" or "reject"' };
  }
};

/**
 * Validates the first iteration output against the expected schema
 */
const validateFirstIterationOutput = (
  data: unknown
): { ok: true; value: FirstIterationOutput } | { ok: false; reason: string } => {
  if (!isObject(data)) {
    return { ok: false, reason: 'Output must be a JSON object' };
  }

  const { task } = data;

  if (typeof task !== 'string' || task.trim() === '') {
    return { ok: false, reason: 'task must be a non-empty string' };
  }

  return { ok: true, value: { task } };
};

/**
 * Generates a repair prompt for invalid JSON output
 */
const createRepairPrompt = (
  validationError: string,
  originalPrompt: string,
  invalidOutput: string
): string => {
  return `Your previous output was invalid. Error: ${validationError}

You MUST output ONLY valid JSON in one of these formats:

If accepting (work is complete):
{"decision":"accept"}

If rejecting (work needs fixes):
{"decision":"reject","task":"<correction instructions here>"}

Rules:
- Output ONLY the JSON object
- No markdown code blocks
- No additional text or explanation
- "decision" must be exactly "accept" or "reject" (lowercase)
- "task" is required ONLY when decision is "reject" and must be a non-empty string

Here is the full original review context:

${originalPrompt}

Here is your invalid output to repair:

${invalidOutput}

Now output ONLY valid JSON:`;
};

/**
 * Generates a repair prompt for invalid first iteration JSON output
 */
const createFirstIterationRepairPrompt = (
  validationError: string,
  originalPrompt: string,
  invalidOutput: string
): string => {
  return `Your previous output was invalid. Error: ${validationError}

You MUST output ONLY valid JSON in this exact format:

{"task":"<task prompt here>"}

Rules:
- Output ONLY the JSON object
- No markdown code blocks
- No additional text or explanation
- "task" must be a non-empty string

Here is the full original context:

${originalPrompt}

Here is your invalid output to repair:

${invalidOutput}

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
): ResultAsync<{ output: MasterAgentOutput; rawResponse: string }, Error> => {
  const timeoutMs = getTimeoutMs('MASTER_AGENT_TIMEOUT_MS');

  return ResultAsync.fromPromise(
    withTimeout(
      client.session.prompt({
        path: { id: sessionId },
        body: {
          agent: 'plan',
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
      {
        ms: timeoutMs,
        label: `Master agent prompt (attempt ${attemptNumber})`,
        onTimeout: () => client.session.abort({ path: { id: sessionId } }),
      }
    ),
    toError
  ).andThen((promptResponse: unknown) => {
    const error = getOpenCodeError(promptResponse, 'Master agent failed');
    if (error) return err(error);

    return parseTextResponse(promptResponse, {
      invalidResponseMessage:
        'Failed to get response from master agent: Invalid response structure',
      emptyResponseMessage: 'No text content in master agent response',
      trim: true,
    }).andThen((rawOutput) => {
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
        const repairPrompt = createRepairPrompt(
          `Invalid JSON: ${toError(e).message}`,
          userPrompt,
          rawOutput
        );
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
        const repairPrompt = createRepairPrompt(validation.reason, userPrompt, rawOutput);
        return callModelWithRepair(
          sessionId,
          client,
          model,
          systemPrompt,
          repairPrompt,
          attemptNumber + 1
        );
      }

      return ok({
        output: validation.value,
        rawResponse: rawOutput,
      });
    });
  });
};

/**
 * Main master agent function that reviews code changes and generates next task
 * @param iteration - The current loop iteration number
 */
export const reviewAndGenerateTask = (iteration: number): ResultAsync<string, Error> => {
  const model = getModelConfig('MASTER_AGENT_MODEL', MASTER_DEFAULT_MODEL);

  return ResultAsync.fromPromise(getOpencodeClient(), toError).andThen((client) =>
    ResultAsync.fromPromise(
      validateModel(client, model.providerID, model.modelID),
      toError
    ).andThen((isValid) => {
      if (!isValid) {
        return err(new Error(`Invalid master model: ${model.providerID}/${model.modelID}`));
      }

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
        .andThen(({ state, spec, plan }) =>
          getPlanStep(plan, state.currentTaskNumber, {
            missingStep: (stepNumber) => `Could not find task ${stepNumber} in plan.md`,
          }).map((currentStep) => ({ state, spec, plan, currentStep }))
        )
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
            return ResultAsync.fromSafePromise(
              Promise.resolve(JSON.stringify(rejectOutput, null, 2))
            );
          }

          // Get git diff and git status
          return exec('git', ['diff', 'HEAD'])
            .map((result) => result.stdout)
            .orElse(() => ResultAsync.fromSafePromise(Promise.resolve(''))) // If git diff fails, treat as no changes
            .andThen((gitDiff) => {
              return exec('git', ['status', '--porcelain'])
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
            .andThen(
              ({ state, spec, plan, currentStep, report, gitDiff, gitStatus, systemPrompt }) => {
                // Determine if there's a next step
                const hasNextStep = state.currentTaskNumber < state.tasks.length;
                const nextStepNumber = state.currentTaskNumber + 1;
                let nextStepContent = '';

                if (hasNextStep) {
                  const nextStep = findPlanStep(plan, nextStepNumber);
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

                const startedAt = new Date();
                const planStep = state.currentTaskNumber;

                // Call model with repair capability
                return createSession('Master Agent Review').andThen((session) =>
                  callModelWithRepair(session.id, session.client, model, systemPrompt, userPrompt)
                    .andThen(({ output, rawResponse }) => {
                      // Log the agent call
                      const endedAt = new Date();
                      const logger = getLogger();
                      return ResultAsync.fromPromise(
                        logger.logAgentCall({
                          agent: 'masterAgent',
                          iteration,
                          planStep,
                          model,
                          sessionId: session.id,
                          startedAt,
                          endedAt,
                          response: rawResponse,
                          decision: output.decision,
                        }),
                        toError
                      ).map(() => output);
                    })
                    .andThen((output) => deleteSession(session).map(() => output))
                    .orElse((error) => {
                      // Log error case
                      const endedAt = new Date();
                      const logger = getLogger();
                      logger
                        .logAgentCall({
                          agent: 'masterAgent',
                          iteration,
                          planStep,
                          model,
                          sessionId: session.id,
                          startedAt,
                          endedAt,
                          response: '',
                          error: error.message,
                        })
                        .catch(() => {});
                      return deleteSession(session).andThen(() => err(error));
                    })
                    .map((output) => JSON.stringify(output, null, 2))
                );
              }
            );
        });
    })
  );
};

/**
 * Calls the model for first iteration and attempts to repair invalid output
 */
const callFirstIterationModelWithRepair = (
  sessionId: string,
  client: OpencodeClient,
  model: ModelConfig,
  systemPrompt: string,
  userPrompt: string,
  attemptNumber = 1
): ResultAsync<{ output: FirstIterationOutput; rawResponse: string }, Error> => {
  const timeoutMs = getTimeoutMs('MASTER_AGENT_TIMEOUT_MS');

  return ResultAsync.fromPromise(
    withTimeout(
      client.session.prompt({
        path: { id: sessionId },
        body: {
          agent: 'plan',
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
      {
        ms: timeoutMs,
        label: `Master agent first iteration prompt (attempt ${attemptNumber})`,
        onTimeout: () => client.session.abort({ path: { id: sessionId } }),
      }
    ),
    toError
  ).andThen((promptResponse: unknown) => {
    const error = getOpenCodeError(promptResponse, 'Master agent failed');
    if (error) return err(error);

    return parseTextResponse(promptResponse, {
      invalidResponseMessage:
        'Failed to get response from master agent: Invalid response structure',
      emptyResponseMessage: 'No text content in master agent response',
      trim: true,
    }).andThen((rawOutput) => {
      // Try to parse JSON
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawOutput);
      } catch (e) {
        if (attemptNumber >= MAX_REPAIR_ATTEMPTS) {
          return err(
            new Error(
              `Failed to parse first iteration output after ${MAX_REPAIR_ATTEMPTS} attempts: ${toError(e).message}`
            )
          );
        }

        // Attempt repair
        const repairPrompt = createFirstIterationRepairPrompt(
          `Invalid JSON: ${toError(e).message}`,
          userPrompt,
          rawOutput
        );
        return callFirstIterationModelWithRepair(
          sessionId,
          client,
          model,
          systemPrompt,
          repairPrompt,
          attemptNumber + 1
        );
      }

      // Validate schema
      const validation = validateFirstIterationOutput(parsed);
      if (!validation.ok) {
        if (attemptNumber >= MAX_REPAIR_ATTEMPTS) {
          return err(
            new Error(
              `First iteration output validation failed after ${MAX_REPAIR_ATTEMPTS} attempts: ${validation.reason}`
            )
          );
        }

        // Attempt repair
        const repairPrompt = createFirstIterationRepairPrompt(
          validation.reason,
          userPrompt,
          rawOutput
        );
        return callFirstIterationModelWithRepair(
          sessionId,
          client,
          model,
          systemPrompt,
          repairPrompt,
          attemptNumber + 1
        );
      }

      return ok({
        output: validation.value,
        rawResponse: rawOutput,
      });
    });
  });
};

/**
 * Generates the initial task for a plan step (iteration 0).
 * This is called before the coding agent runs for the first time on a step.
 * Uses a simpler prompt that just asks to generate task instructions.
 */
export const generateInitialTask = (): ResultAsync<string, Error> => {
  const model = getModelConfig('MASTER_AGENT_MODEL', MASTER_DEFAULT_MODEL);

  return ResultAsync.fromPromise(getOpencodeClient(), toError).andThen((client) =>
    ResultAsync.fromPromise(
      validateModel(client, model.providerID, model.modelID),
      toError
    ).andThen((isValid) => {
      if (!isValid) {
        return err(new Error(`Invalid master model: ${model.providerID}/${model.modelID}`));
      }

      // Read required context files
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
        .andThen(({ state, spec, plan }) =>
          getPlanStep(plan, state.currentTaskNumber, {
            missingStep: (stepNumber) => `Could not find task ${stepNumber} in plan.md`,
          }).map((currentStep) => ({ state, spec, plan, currentStep }))
        )
        .andThen(({ state, spec, plan, currentStep }) => {
          return loadPromptFile('masterAgentFirstIteration.txt').map((systemPrompt) => ({
            state,
            spec,
            plan,
            currentStep,
            systemPrompt,
          }));
        })
        .andThen(({ state, spec, plan, currentStep, systemPrompt }) => {
          // Build user prompt - simpler than review prompt
          const userPrompt = `# Task Generation Context

## Specification (spec.md)
${spec}

## Full Implementation Plan (plan.md)
${plan}

## Current Plan Step to Implement (Task ${state.currentTaskNumber})
${currentStep}

## Status Information
- Current task number: ${state.currentTaskNumber}
- Total tasks: ${state.tasks.length}

---

Generate detailed task instructions for the coding agent to implement this plan step. Output ONLY valid JSON.`;

          const startedAt = new Date();
          const planStep = state.currentTaskNumber;

          // Call model with repair capability
          return createSession('Master Agent First Iteration').andThen((session) =>
            callFirstIterationModelWithRepair(
              session.id,
              session.client,
              model,
              systemPrompt,
              userPrompt
            )
              .andThen(({ output, rawResponse }) => {
                // Log the agent call
                const endedAt = new Date();
                const logger = getLogger();
                return ResultAsync.fromPromise(
                  logger.logAgentCall({
                    agent: 'masterAgent',
                    iteration: 0,
                    planStep,
                    model,
                    sessionId: session.id,
                    startedAt,
                    endedAt,
                    response: rawResponse,
                  }),
                  toError
                ).map(() => output);
              })
              .andThen((output) => deleteSession(session).map(() => output))
              .orElse((error) => {
                // Log error case
                const endedAt = new Date();
                const logger = getLogger();
                logger
                  .logAgentCall({
                    agent: 'masterAgent',
                    iteration: 0,
                    planStep,
                    model,
                    sessionId: session.id,
                    startedAt,
                    endedAt,
                    response: '',
                    error: error.message,
                  })
                  .catch(() => {});
                return deleteSession(session).andThen(() => err(error));
              })
              .map((output) => output.task)
          );
        });
    })
  );
};
