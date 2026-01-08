import { ResultAsync, err, errAsync, ok } from 'neverthrow';
import { workspace } from '../workspace.js';
import {
  parseTextResponse,
  toError,
  getModelConfig,
  loadPromptFile,
  withTimeout,
  getTimeoutMs,
  isObject,
  unwrapResultAsync,
  cleanupSession,
} from './utils.js';
import {
  getOpenCodeLib,
  abortAndCleanup,
  type Session,
  type PromptResponse,
} from './opencodesdk.js';
import { readState } from '../state.js';
import { exec } from '../shell.js';
import { findPlanStep, getPlanStep } from './planUtils.js';
import { getLogger } from './logger.js';
import type { ModelConfig, MasterAgentOutput } from './types.js';

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
 * Calls the model and attempts to repair invalid output
 */
const callModelWithRepair = (
  session: Session,
  model: ModelConfig,
  systemPrompt: string,
  userPrompt: string,
  attemptNumber = 1,
  signal: AbortSignal,
  onAbort: () => void
): ResultAsync<{ output: MasterAgentOutput; rawResponse: string }, Error> => {
  const timeoutMs = getTimeoutMs('MASTER_AGENT_TIMEOUT_MS', 300_000);

  return ResultAsync.fromPromise(
    withTimeout<PromptResponse>(
      unwrapResultAsync(
        session.prompt({
          agent: 'plan',
          model,
          system: systemPrompt,
          parts: [
            {
              type: 'text',
              text: userPrompt,
            },
          ],
        })
      ),
      {
        ms: timeoutMs,
        label: `Master agent prompt (attempt ${attemptNumber})`,
        signal,
        onTimeout: () => session.abort(),
        onAbort,
      }
    ),
    toError
  ).andThen((promptResponse: PromptResponse) => {
    // Wrap response for parseTextResponse compatibility
    return parseTextResponse(
      { data: promptResponse },
      {
        invalidResponseMessage:
          'Failed to get response from master agent: Invalid response structure',
        emptyResponseMessage: 'No text content in master agent response',
        trim: true,
      }
    ).andThen((rawOutput) => {
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
          session,
          model,
          systemPrompt,
          repairPrompt,
          attemptNumber + 1,
          signal,
          onAbort
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
          session,
          model,
          systemPrompt,
          repairPrompt,
          attemptNumber + 1,
          signal,
          onAbort
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
 * @param signal - AbortSignal to cancel the operation
 */
export const reviewAndGenerateTask = (
  iteration: number,
  signal: AbortSignal
): ResultAsync<string, Error> => {
  if (signal.aborted) {
    return errAsync(new Error('Operation aborted'));
  }

  const model = getModelConfig('MASTER_AGENT_MODEL', MASTER_DEFAULT_MODEL);

  return getOpenCodeLib().andThen((lib) =>
    lib.provider
      .validate(model.providerID, model.modelID, { log: true })
      .andThen((isValid) => {
      if (!isValid) {
        return err(new Error(`Invalid master model: ${model.providerID}/${model.modelID}`));
      }

      // Read all required context files
      return readState()
        .andThen((state) => {
          return workspace.cache.spec
            .read()
            .mapErr((e) => new Error(`Could not read spec.md: ${e.message}`))
            .andThen((spec) => {
              return workspace.cache.plan
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
          return workspace.cache.report
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
                return lib.session.create('Master Agent Review').andThen((session) => {
                  const abortSession = () => abortAndCleanup(session);

                  return callModelWithRepair(
                    session,
                    model,
                    systemPrompt,
                    userPrompt,
                    1,
                    signal,
                    abortSession
                  )
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
                    .andThen((output) =>
                      cleanupSession(session, 'masterAgent', iteration).map(() => output)
                    )
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
                      return cleanupSession(session, 'masterAgent', iteration).andThen(() =>
                        err(error)
                      );
                    })
                    .map((output) => JSON.stringify(output, null, 2));
                });
              }
            );
        });
    })
  );
};
