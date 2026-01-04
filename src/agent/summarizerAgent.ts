import { ResultAsync, err } from 'neverthrow';
import { workspace } from '../workspace.js';
import {
  toError,
  getModelConfig,
  loadPromptFile,
  parseTextResponse,
  unwrapResultAsync,
  cleanupSession,
  withTimeout,
  getTimeoutMs,
} from './utils.js';
import { getOpenCodeLib, type Session } from './opencodesdk.js';
import type { ModelConfig } from './types.js';

export const SUMMARIZER_DEFAULT_MODEL: ModelConfig = {
  providerID: 'google',
  modelID: 'gemini-3-flash',
};

const generateSummary = (): ResultAsync<void, Error> => {
  const model = getModelConfig('SUMMARIZER_AGENT_MODEL', SUMMARIZER_DEFAULT_MODEL);

  return workspace.spec
    .read()
    .mapErr((e) => new Error(`Could not read spec file at .duo/spec.md: ${e.message}`))
    .andThen((spec) => {
      if (!spec.trim()) {
        return err(new Error('spec.md is empty. Please add a specification first.'));
      }
      return workspace.plan
        .read()
        .mapErr((e) => new Error(`Could not read plan file at .duo/plan.md: ${e.message}`))
        .map((plan) => ({ spec, plan }));
    })
    .andThen(({ spec, plan }) => {
      if (!plan.trim()) {
        return err(new Error('plan.md is empty. Please generate a plan first.'));
      }
      return loadPromptFile('summarizerAgent.txt').map((systemPrompt) => ({
        spec,
        plan,
        systemPrompt,
      }));
    })
    .andThen(({ spec, plan, systemPrompt }) => {
      const timeoutMs = getTimeoutMs('SUMMARIZER_AGENT_TIMEOUT_MS', 300_000);

      return getOpenCodeLib().andThen((lib) =>
        lib.session.create('Summary Generation').andThen((session) =>
          ResultAsync.fromPromise(
            withTimeout(
              unwrapResultAsync(
                session.prompt({
                  agent: 'build',
                  model,
                  system: systemPrompt,
                  parts: [
                    {
                      type: 'text',
                      text: `Here is the specification:\n\n${spec}\n\nHere is the implementation plan:\n\n${plan}\n\nPlease create a concise summary following the format in your instructions.`,
                    },
                  ],
                })
              ),
              {
                ms: timeoutMs,
                label: 'Summarizer agent prompt',
                onTimeout: () => session.abort(),
              }
            ),
            toError
          )
            .andThen((promptResponse) =>
              parseTextResponse(
                { data: promptResponse },
                {
                  invalidResponseMessage: 'Failed to generate summary: No response from model',
                  emptyResponseMessage: 'No text content in response',
                  trim: true,
                }
              )
            )
            .andThen((summary) => cleanupSession(session, 'summarizerAgent').map(() => summary))
            .orElse((error) => cleanupSession(session, 'summarizerAgent').andThen(() => err(error)))
        )
      );
    })
    .andThen((summary) =>
      workspace.summary
        .write(summary)
        .mapErr((e: Error) => new Error(`Error saving summary: ${e.message}`))
    );
};

export { generateSummary };
