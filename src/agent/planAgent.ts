import { ResultAsync, err } from 'neverthrow';
import { createSession, deleteSession } from './sessionManager.js';
import { workspace } from '../workspace.js';
import { generateSummary, SUMMARIZER_DEFAULT_MODEL } from './summarizerAgent.js';
import { getOpencodeClient } from './session.js';
import { toError, getModelConfig, loadPromptFile, validateModel } from './utils.js';
import type { ModelConfig } from './types.js';

const PLAN_DEFAULT_MODEL: ModelConfig = {
  providerID: 'google',
  modelID: 'claude-sonnet-4-5',
};

export const generatePlan = (): ResultAsync<void, Error> => {
  // Get model configs for both plan and summary agents
  const planModel = getModelConfig('PLAN_AGENT_MODEL', PLAN_DEFAULT_MODEL);
  const summaryModel = getModelConfig('SUMMARIZER_AGENT_MODEL', SUMMARIZER_DEFAULT_MODEL);

  // Validate both models upfront before doing any work
  return ResultAsync.fromPromise(getOpencodeClient(), toError).andThen((client) =>
    ResultAsync.fromPromise(
      Promise.all([
        validateModel(client, planModel.providerID, planModel.modelID),
        validateModel(client, summaryModel.providerID, summaryModel.modelID),
      ]),
      toError
    ).andThen(([planValid, summaryValid]) => {
      if (!planValid) {
        return err(new Error(`Invalid plan model: ${planModel.providerID}/${planModel.modelID}`));
      }
      if (!summaryValid) {
        return err(
          new Error(`Invalid summary model: ${summaryModel.providerID}/${summaryModel.modelID}`)
        );
      }

      // Both models are valid, proceed with plan generation
      return workspace.spec
        .read()
        .mapErr((e) => new Error(`Could not read spec file at .duo/spec.md: ${e.message}`))
        .andThen((spec) => {
          if (!spec.trim()) {
            return err(new Error('spec.md is empty. Please add a specification first.'));
          }
          return loadPromptFile('planAgent.txt').map((systemPrompt) => ({
            spec,
            systemPrompt,
          }));
        })
        .andThen(({ spec, systemPrompt }) => {
          return createSession('Plan Generation').andThen((session) =>
            ResultAsync.fromPromise(
              session.client.session.prompt({
                path: { id: session.id },
                body: {
                  agent: 'plan',
                  model: planModel,
                  system: systemPrompt,
                  parts: [
                    {
                      type: 'text',
                      text: `Here is the specification to analyze:\n\n${spec}\n\nPlease create a detailed implementation plan following the format specified in your instructions.`,
                    },
                  ],
                },
              }),
              toError
            )
              .andThen((promptResponse) => {
                if (!promptResponse.data) {
                  return err(new Error('Failed to generate plan: No response from model'));
                }

                const textParts = promptResponse.data.parts.filter(
                  (part: { type: string }) => part.type === 'text'
                );

                if (textParts.length === 0) {
                  return err(new Error('No text content in response'));
                }

                const rawPlan = textParts
                  .map((part: { type: string; text?: string }) => part.text ?? '')
                  .join('\n\n');

                const firstHeaderIndex = rawPlan.indexOf('##');
                const plan = firstHeaderIndex !== -1 ? rawPlan.slice(firstHeaderIndex) : rawPlan;

                return ResultAsync.fromSafePromise<string, Error>(Promise.resolve(plan));
              })
              .andThen((plan) => deleteSession(session).map(() => plan))
              .orElse((error) => deleteSession(session).andThen(() => err(error)))
          );
        })
        .andThen((plan) =>
          workspace.plan
            .write(plan)
            .mapErr((e) => new Error(`Error saving plan: ${e.message}`))
            .andThen(() => generateSummary())
            .map(() => {
              console.log('Plan generated successfully');
            })
        );
    })
  );
};
