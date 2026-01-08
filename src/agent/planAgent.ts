import { ResultAsync, err } from 'neverthrow';
import { workspace } from '../workspace.js';
import { generateSummary } from './summarizerAgent.js';
import { getOpenCodeLib, type Session } from './opencodesdk.js';
import {
  parseTextResponse,
  toError,
  loadPromptFile,
  unwrapResultAsync,
  cleanupSession,
  withTimeout,
} from './utils.js';
import type { ModelConfig } from '../config/index.js';

export interface PlanAgentConfig {
  model: ModelConfig;
  timeoutMs: number;
  summaryModel: ModelConfig;
  summaryTimeoutMs: number;
}

export const generatePlan = (config: PlanAgentConfig): ResultAsync<void, Error> => {
  const planModel = config.model;
  const summaryModel = config.summaryModel;

  // Validate both models upfront before doing any work
  return getOpenCodeLib().andThen((lib) =>
    ResultAsync.combine([
      lib.provider.validate(planModel.providerID, planModel.modelID, { log: true }),
      lib.provider.validate(summaryModel.providerID, summaryModel.modelID, { log: true }),
    ]).andThen(([planValid, summaryValid]) => {
      if (!planValid) {
        return err(new Error(`Invalid plan model: ${planModel.providerID}/${planModel.modelID}`));
      }
      if (!summaryValid) {
        return err(
          new Error(`Invalid summary model: ${summaryModel.providerID}/${summaryModel.modelID}`)
        );
      }

      // Both models are valid, proceed with plan generation
      return workspace.cache.spec
        .read()
        .mapErr(
          (e) => new Error(`Could not read spec file at .bluprint/cache/spec.md: ${e.message}`)
        )
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
          const timeoutMs = config.timeoutMs;

          return lib.session.create('Plan Generation').andThen((session) =>
            ResultAsync.fromPromise(
              withTimeout(
                unwrapResultAsync(
                  session.prompt({
                    agent: 'plan',
                    model: planModel,
                    system: systemPrompt,
                    parts: [
                      {
                        type: 'text',
                        text: `Here is the specification to analyze:\n\n${spec}\n\nPlease create a detailed implementation plan following the format specified in your instructions.`,
                      },
                    ],
                  })
                ),
                {
                  ms: timeoutMs,
                  label: 'Plan agent prompt',
                  onTimeout: () => session.abort(),
                }
              ),
              toError
            )
              .andThen((promptResponse) =>
                parseTextResponse(
                  { data: promptResponse },
                  {
                    invalidResponseMessage: 'Failed to generate plan: No response from model',
                    emptyResponseMessage: 'No text content in response',
                    trim: false,
                  }
                ).map((rawPlan) => {
                  const firstHeaderIndex = rawPlan.indexOf('##');
                  return firstHeaderIndex !== -1 ? rawPlan.slice(firstHeaderIndex) : rawPlan;
                })
              )
              .andThen((plan) => cleanupSession(session, 'planAgent').map(() => plan))
              .orElse((error) => cleanupSession(session, 'planAgent').andThen(() => err(error)))
          );
        })
        .andThen((plan) =>
          workspace.cache.plan
            .write(plan)
            .mapErr((e) => new Error(`Error saving plan: ${e.message}`))
            .andThen(() =>
              generateSummary({
                model: config.summaryModel,
                timeoutMs: config.summaryTimeoutMs,
              })
            )
            .map(() => {
              console.log('Plan generated successfully');
            })
        );
    })
  );
};
