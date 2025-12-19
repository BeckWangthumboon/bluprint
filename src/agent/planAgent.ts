import { join, dirname } from 'path';
import { ResultAsync } from 'neverthrow';
import { getOpencodeClient } from './session.js';
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
export const generatePlan = (): ResultAsync<void, Error> => {
  return ResultAsync.fromPromise(
    (async () => {
      const specResult = await workspace.spec.read();
      if (specResult.isErr()) {
        throw new Error(`Could not read spec file at .duo/spec.md: ${specResult.error.message}`);
      }

      const spec = specResult.value;
      if (!spec.trim()) {
        throw new Error('spec.md is empty. Please add a specification first.');
      }

      const promptResult = await loadPlanAgentPrompt();
      if (promptResult.isErr()) {
        throw promptResult.error;
      }

      const systemPrompt = promptResult.value;
      const model = getModelConfig();

      const opencodeClient = await getOpencodeClient();

      const sessionResponse = await opencodeClient.session.create({
        body: { title: 'Plan Generation' },
      });

      if (!sessionResponse.data) {
        throw new Error('Failed to create session: No data returned');
      }

      const sessionId = sessionResponse.data.id;

      const promptResponse = await opencodeClient.session.prompt({
        path: { id: sessionId },
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
      });

      if (!promptResponse.data) {
        throw new Error('Failed to generate plan: No response from model');
      }

      const textParts = promptResponse.data.parts.filter((part) => part.type === 'text');

      if (textParts.length === 0) {
        throw new Error('No text content in response');
      }

      const rawPlan = textParts.map((part) => (part as { text: string }).text).join('\n\n');

      const firstHeaderIndex = rawPlan.indexOf('##');
      const plan = firstHeaderIndex !== -1 ? rawPlan.slice(firstHeaderIndex) : rawPlan;

      const savePlanResult = await workspace.plan.write(plan);
      if (savePlanResult.isErr()) {
        throw new Error(`Error saving plan: ${savePlanResult.error.message}`);
      }

      console.log('Plan saved to .duo/plan.md');

      await opencodeClient.session.delete({ path: { id: sessionId } });
    })(),
    (error) => {
      if (error instanceof Error) {
        return error;
      }
      return new Error(String(error));
    }
  );
};
