import { ResultAsync, err } from 'neverthrow';
import { createSession, deleteSession } from './sessionManager.js';
import { workspace } from '../workspace.js';
import { toError, getModelConfig, loadPromptFile } from './utils.js';
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
      return createSession('Summary Generation').andThen((session) =>
        ResultAsync.fromPromise(
          session.client.session.prompt({
            path: { id: session.id },
            body: {
              agent: 'build',
              model,
              system: systemPrompt,
              parts: [
                {
                  type: 'text',
                  text: `Here is the specification:\n\n${spec}\n\nHere is the implementation plan:\n\n${plan}\n\nPlease create a concise summary following the format in your instructions.`,
                },
              ],
            },
          }),
          toError
        )
          .andThen((promptResponse) => {
            if (!promptResponse.data || !promptResponse.data.parts) {
              return err(new Error('Failed to generate summary: No response from model'));
            }

            const textParts = promptResponse.data.parts.filter(
              (part: { type: string }) => part.type === 'text'
            );

            if (textParts.length === 0) {
              return err(new Error('No text content in response'));
            }

            const summary = textParts
              .map((part: { type: string; text?: string }) => part.text ?? '')
              .join('\n\n')
              .trim();

            return ResultAsync.fromSafePromise<string, Error>(Promise.resolve(summary));
          })
          .andThen((summary) =>
            deleteSession(session, { agent: 'summarizerAgent' }).map(() => summary)
          )
          .orElse((error) =>
            deleteSession(session, { agent: 'summarizerAgent' }).andThen(() => err(error))
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
