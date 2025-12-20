import { join, dirname } from 'path';
import { ResultAsync, err } from 'neverthrow';
import { createSession, deleteSession } from './sessionManager.js';
import { workspace } from '../workspace.js';
import { readFile } from '../fs.js';

const PLAN_AGENT_PROMPT_FILE = join(
  dirname(new URL(import.meta.url).pathname),
  'prompts',
  'planAgent.txt'
);

const DEFAULT_MODEL = {
  providerID: 'google',
  modelID: 'claude-sonnet-4-5',
};

interface ModelConfig {
  providerID: string;
  modelID: string;
}

const parseModelFromEnv = (): ModelConfig | null => {
  const modelEnv = process.env.PLAN_AGENT_MODEL;
  if (!modelEnv) return null;

  const [providerID, modelID] = modelEnv.split('/');
  if (!providerID || !modelID) {
    console.warn(
      `Invalid PLAN_AGENT_MODEL format: "${modelEnv}". Expected "provider/model". Using default.`
    );
    return null;
  }

  return { providerID, modelID };
};

const getModelConfig = (): ModelConfig => {
  return parseModelFromEnv() || DEFAULT_MODEL;
};

const loadPlanAgentPrompt = (): ResultAsync<string, Error> =>
  readFile(PLAN_AGENT_PROMPT_FILE).mapErr(
    (err) => new Error(`Failed to load plan agent prompt: ${err.message}`)
  );

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export const generatePlan = (): ResultAsync<void, Error> => {
  return workspace.spec
    .read()
    .mapErr((e) => new Error(`Could not read spec file at .duo/spec.md: ${e.message}`))
    .andThen((spec) => {
      if (!spec.trim()) {
        return err(new Error('spec.md is empty. Please add a specification first.'));
      }
      return loadPlanAgentPrompt().map((systemPrompt) => ({ spec, systemPrompt }));
    })
    .andThen(({ spec, systemPrompt }) => {
      const model = getModelConfig();

      return createSession('Plan Generation').andThen((session) =>
        ResultAsync.fromPromise(
          session.client.session.prompt({
            path: { id: session.id },
            body: {
              agent: 'plan',
              model,
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
        .map(() => {
          console.log('Plan saved to .duo/plan.md');
        })
    );
};
