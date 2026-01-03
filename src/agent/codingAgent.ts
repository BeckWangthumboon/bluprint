import { ResultAsync, err } from 'neverthrow';
import { workspace } from '../workspace.js';
import { readState } from '../state.js';
import { getOpenCodeLib } from './opencodesdk.js';
import { getPlanStep, extractPlanOutline, formatStepHeader } from './planUtils.js';
import {
  parseTextResponse,
  toError,
  getModelConfig,
  loadPromptFile,
  withTimeout,
  getTimeoutMs,
  unwrapResultAsync,
  cleanupSession,
} from './utils.js';
import { getLogger } from './logger.js';
import type { ModelConfig } from './types.js';

const CODING_DEFAULT_MODEL: ModelConfig = {
  providerID: 'google',
  modelID: 'claude-sonnet-4-5-thinking',
};

/**
 * Executes the coding agent to implement the current plan step.
 * Reads feedback (from task.md), summary, and current plan step, then runs the agent.
 * Returns the report content.
 * @param iteration - The current loop iteration number
 */
export const executeCodingAgent = (iteration: number): ResultAsync<string, Error> => {
  const codingModel = getModelConfig('CODING_AGENT_MODEL', CODING_DEFAULT_MODEL);

  return getOpenCodeLib().andThen((lib) =>
    lib.provider.validate(codingModel.providerID, codingModel.modelID).andThen((isValid) => {
      if (!isValid) {
        return err(
          new Error(`Invalid coding model: ${codingModel.providerID}/${codingModel.modelID}`)
        );
      }

      // Read all required inputs in parallel
      return ResultAsync.combine([
        workspace.task
          .read()
          .mapErr((e) => new Error(`Could not read task.md: ${e.message}`))
          .map((content) => content.trim()),
        workspace.summary
          .read()
          .mapErr((e) => new Error(`Could not read summary.md: ${e.message}`)),
        workspace.plan.read().mapErr((e) => new Error(`Could not read plan.md: ${e.message}`)),
        readState().mapErr((e) => new Error(`Could not read state: ${e.message}`)),
        loadPromptFile('codingAgent.txt'),
      ]).andThen(([feedback, summary, plan, state, systemPrompt]) => {
        return getPlanStep(plan, state.currentTaskNumber, {
          invalidStepNumber: (stepNumber) =>
            `Invalid current task number: ${stepNumber}. Must be a positive integer.`,
          missingStep: (stepNumber) =>
            `Current task number ${stepNumber} not found in plan.md. The plan may be out of sync with state.`,
          emptyStep: (stepNumber) => `Plan step ${stepNumber} is empty`,
        }).andThen((currentStep) => {
          // Extract plan outline for context (only headers in range around current step)
          const currentStepNumber = state.currentTaskNumber;
          const totalSteps = state.tasks.length;
          const contextHeaders = extractPlanOutline(plan, {
            currentStep: currentStepNumber,
            range: 1,
          });

          // Find previous and next step headers from the filtered context
          const previousHeader = contextHeaders.find((h) => h.stepNumber === currentStepNumber - 1);
          const nextHeader = contextHeaders.find((h) => h.stepNumber === currentStepNumber + 1);

          // Format previous/next step context
          const previousStepText = previousHeader
            ? formatStepHeader(previousHeader)
            : 'None - this is the first step';
          const nextStepText = nextHeader
            ? formatStepHeader(nextHeader)
            : 'None - this is the final step';

          // Construct the prompt with new structure
          const userPrompt = `# Plan Summary
${summary}

# Plan Context
You are implementing step ${currentStepNumber} of ${totalSteps}.

## Previous Step (for context only - Completed)
${previousStepText}

## Current Step (Your Task)
${currentStep}

## Next Step (for context only - Do NOT Implement)
${nextStepText}

# Feedback 
${feedback || 'None'}

---
Implement ONLY the current step. If feedback is provided, address it first.`;

          return lib.session.create('Coding Agent Execution').andThen((session) => {
            const startedAt = new Date();
            const planStep = state.currentTaskNumber;
            const timeoutMs = getTimeoutMs('CODING_AGENT_TIMEOUT_MS');

            return ResultAsync.fromPromise(
              withTimeout(
                unwrapResultAsync(
                  session.prompt({
                    agent: 'build',
                    model: codingModel,
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
                  label: `Coding agent prompt (iteration ${iteration})`,
                  onTimeout: () => session.abort(),
                }
              ),
              toError
            )
              .andThen((promptResponse) => {
                return parseTextResponse(
                  { data: promptResponse },
                  {
                    invalidResponseMessage:
                      'Failed to execute coding agent: Invalid response structure',
                    emptyResponseMessage: 'No text content in response',
                    trim: true,
                  }
                );
              })
              .andThen((report) => {
                // Log the agent call
                const endedAt = new Date();
                const logger = getLogger();
                return ResultAsync.fromPromise(
                  logger.logAgentCall({
                    agent: 'codingAgent',
                    iteration,
                    planStep,
                    model: codingModel,
                    sessionId: session.id,
                    startedAt,
                    endedAt,
                    response: report,
                  }),
                  toError
                ).map(() => report);
              })
              .andThen((report) =>
                cleanupSession(session, 'codingAgent', iteration).map(() => report)
              )
              .orElse((error) => {
                // Log error case
                const endedAt = new Date();
                const logger = getLogger();
                logger
                  .logAgentCall({
                    agent: 'codingAgent',
                    iteration,
                    planStep,
                    model: codingModel,
                    sessionId: session.id,
                    startedAt,
                    endedAt,
                    response: '',
                    error: error.message,
                  })
                  .catch(() => {});
                return cleanupSession(session, 'codingAgent', iteration).andThen(() => err(error));
              });
          });
        });
      });
    })
  );
};
