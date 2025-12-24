import { ResultAsync, err, errAsync } from 'neverthrow';
import { createSession, deleteSession } from './sessionManager.js';
import { workspace } from '../workspace.js';
import { readState } from '../state.js';
import { getOpencodeClient } from './session.js';
import { toError, getModelConfig, loadPromptFile, validateModel } from './utils.js';
import type { ModelConfig } from './types.js';

const CODING_DEFAULT_MODEL: ModelConfig = {
  providerID: 'google',
  modelID: 'claude-sonnet-4-5',
};

const isObject = (data: unknown): data is Record<string, unknown> => {
  return typeof data === 'object' && data !== null;
};

const hasValidResponseData = (
  response: unknown
): response is { data: { parts: Array<{ type: string; text?: string }> } } => {
  if (!isObject(response)) return false;
  if (!isObject(response.data)) return false;
  if (!Array.isArray(response.data.parts)) return false;
  return true;
};

/**
 * Extracts the current plan step section from plan.md based on the task number.
 * Returns the full section including heading and body until the next section or EOF.
 */
export const extractPlanStep = (
  planContent: string,
  stepNumber: number
): ResultAsync<string, Error> => {
  const lines = planContent.split('\n');
  const stepHeadingRegex = new RegExp(`^## ${stepNumber} `);

  // Find the start of the current step
  let startIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (stepHeadingRegex.test(lines[i] ?? '')) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) {
    return errAsync(
      new Error(`Plan step ${stepNumber} not found in plan.md. Expected heading: ## ${stepNumber} `)
    );
  }

  // Find the end of the current step (next ## heading or EOF)
  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (/^## \d+ /.test(lines[i] ?? '')) {
      endIndex = i;
      break;
    }
  }

  const stepContent = lines.slice(startIndex, endIndex).join('\n').trim();

  if (!stepContent) {
    return errAsync(new Error(`Plan step ${stepNumber} is empty`));
  }

  return ResultAsync.fromSafePromise<string, Error>(Promise.resolve(stepContent));
};

/**
 * Validates that the current task number is valid and exists in the plan.
 */
export const validateCurrentStep = (
  planContent: string,
  currentTaskNumber: number
): ResultAsync<void, Error> => {
  if (!Number.isInteger(currentTaskNumber) || currentTaskNumber < 1) {
    return errAsync(
      new Error(`Invalid current task number: ${currentTaskNumber}. Must be a positive integer.`)
    );
  }

  // Check if the step exists in the plan
  const stepHeadingRegex = new RegExp(`^## ${currentTaskNumber} `, 'm');
  if (!stepHeadingRegex.test(planContent)) {
    return errAsync(
      new Error(
        `Current task number ${currentTaskNumber} not found in plan.md. The plan may be out of sync with state.`
      )
    );
  }

  return ResultAsync.fromSafePromise<void, Error>(Promise.resolve());
};

/**
 * Executes the coding agent to implement the current plan step.
 * Reads task, summary, and current plan step, then runs the agent.
 * Returns the report content.
 */
export const executeCodingAgent = (): ResultAsync<string, Error> => {
  const codingModel = getModelConfig('CODING_AGENT_MODEL', CODING_DEFAULT_MODEL);

  return ResultAsync.fromPromise(getOpencodeClient(), toError)
    .andThen((client) =>
      ResultAsync.fromPromise(
        validateModel(client, codingModel.providerID, codingModel.modelID),
        toError
      ).andThen((isValid) => {
        if (!isValid) {
          return err(
            new Error(`Invalid coding model: ${codingModel.providerID}/${codingModel.modelID}`)
          );
        }

        // Read all required inputs in parallel
        return ResultAsync.combine([
          workspace.taskJson
            .read()
            .mapErr((e) => new Error(`Could not read task.json: ${e.message}`)),
          workspace.summary
            .read()
            .mapErr((e) => new Error(`Could not read summary.md: ${e.message}`)),
          workspace.plan.read().mapErr((e) => new Error(`Could not read plan.md: ${e.message}`)),
          readState().mapErr((e) => new Error(`Could not read state: ${e.message}`)),
          loadPromptFile('codingAgent.txt'),
        ]).andThen(([task, summary, plan, state, systemPrompt]) => {
          // Validate current step before extraction
          return validateCurrentStep(plan, state.currentTaskNumber)
            .andThen(() => extractPlanStep(plan, state.currentTaskNumber))
            .andThen((currentStep) => {
              // Construct the prompt with injected context
              const userPrompt = `# Task
${task}

# Plan Summary
${summary}

# Current Plan Step
${currentStep}

Please implement this step and provide a report following the format specified in your instructions.`;

              // Create session and run the agent
              return createSession('Coding Agent Execution').andThen((session) =>
                ResultAsync.fromPromise(
                  session.client.session.prompt({
                    path: { id: session.id },
                    body: {
                      agent: 'build',
                      model: codingModel,
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
                )
                  .andThen((promptResponse) => {
                    if (!hasValidResponseData(promptResponse)) {
                      console.error(
                        'Invalid response structure:',
                        JSON.stringify(promptResponse, null, 2)
                      );
                      return err(
                        new Error('Failed to execute coding agent: Invalid response structure')
                      );
                    }

                    const textParts = promptResponse.data.parts.filter(
                      (part: { type: string }) => part.type === 'text'
                    );

                    if (textParts.length === 0) {
                      return err(new Error('No text content in response'));
                    }

                    const report = textParts
                      .map((part: { type: string; text?: string }) => part.text ?? '')
                      .join('\n\n')
                      .trim();

                    return ResultAsync.fromSafePromise<string, Error>(Promise.resolve(report));
                  })
                  .andThen((report) => deleteSession(session).map(() => report))
                  .orElse((error) => deleteSession(session).andThen(() => err(error)))
              );
            });
        });
      })
    )
    .andThen((report) =>
      workspace.report
        .write(report)
        .mapErr((e) => new Error(`Error saving report: ${e.message}`))
        .map(() => report)
    );
};
