import { join, dirname } from 'path';
import { ResultAsync, err } from 'neverthrow';
import { createSession, deleteSession } from './sessionManager.js';
import { workspace } from '../workspace.js';
import { readFile } from '../fs.js';

const SUMMARIZER_AGENT_PROMPT_FILE = join(
  dirname(new URL(import.meta.url).pathname),
  'prompts',
  'summarizerAgent.txt'
);

const DEFAULT_MODEL = {
  providerID: 'google',
  modelID: 'gemini-3-flash',
};

interface ModelConfig {
  providerID: string;
  modelID: string;
}

const parseModelFromEnv = (): ModelConfig | null => {
  const modelEnv = process.env.SUMMARIZER_AGENT_MODEL;
  if (!modelEnv) return null;

  const [providerID, modelID] = modelEnv.split('/');
  if (!providerID || !modelID) {
    console.warn(
      `Invalid SUMMARIZER_AGENT_MODEL format: "${modelEnv}". Expected "provider/model". Using default.`
    );
    return null;
  }

  return { providerID, modelID };
};

const getModelConfig = (): ModelConfig => {
  return parseModelFromEnv() || DEFAULT_MODEL;
};

const loadSummarizerAgentPrompt = (): ResultAsync<string, Error> =>
  readFile(SUMMARIZER_AGENT_PROMPT_FILE).mapErr(
    (err) => new Error(`Failed to load summarizer agent prompt: ${err.message}`)
  );

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

const generateSummary = (): ResultAsync<void, Error> => {
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
      return loadSummarizerAgentPrompt().map((systemPrompt) => ({ spec, plan, systemPrompt }));
    })
    .andThen(({ spec, plan, systemPrompt }) => {
      const model = getModelConfig();

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
            console.log(promptResponse);
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
          .andThen((summary) => deleteSession(session).map(() => summary))
          .orElse((error) => deleteSession(session).andThen(() => err(error)))
      );
    })
    .andThen((summary) =>
      workspace.summary
        .write(summary)
        .mapErr((e: Error) => new Error(`Error saving summary: ${e.message}`))
    );
};

export { generateSummary };
