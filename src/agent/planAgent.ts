import { join, dirname } from 'path';
import { ResultAsync } from 'neverthrow';
import { opencodeClient } from './session.js';
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
export const generatePlan = async (): Promise<void> => {
  const specResult = await workspace.spec.read();
  if (specResult.isErr()) {
    console.error(`Error: Could not read spec file at .duo/spec.md`);
    console.error(`${specResult.error.message}`);
    process.exit(1);
  }

  const spec = specResult.value;
  if (!spec.trim()) {
    console.error('Error: spec.md is empty. Please add a specification first.');
    process.exit(1);
  }

  const promptResult = await loadPlanAgentPrompt();
  if (promptResult.isErr()) {
    console.error(`Error: ${promptResult.error.message}`);
    process.exit(1);
  }

  const systemPrompt = promptResult.value;
  const model = getModelConfig();

  try {
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

    const messages = await opencodeClient.session.messages({
      path: { id: sessionId },
    });

    if (!messages.data || messages.data.length === 0) {
      throw new Error('Failed to retrieve plan: No messages in session');
    }

    const lastMessage = messages.data[messages.data.length - 1];
    if (!lastMessage) {
      throw new Error('Failed to retrieve plan: Last message is undefined');
    }

    const textParts = lastMessage.parts.filter((part) => part.type === 'text');

    if (textParts.length === 0) {
      throw new Error('Failed to retrieve plan: No text content in response');
    }

    const rawPlan = textParts.map((part) => (part as { text: string }).text).join('\n\n');

    const firstHeaderIndex = rawPlan.indexOf('##');
    const plan = firstHeaderIndex !== -1 ? rawPlan.slice(firstHeaderIndex) : rawPlan;

    const savePlanResult = await workspace.plan.write(plan);
    if (savePlanResult.isErr()) {
      console.error(`Error saving plan: ${savePlanResult.error.message}`);
      process.exit(1);
    }

    console.log('Plan saved to .duo/plan.md');

    await opencodeClient.session.delete({ path: { id: sessionId } });
  } catch (error) {
    console.error('Error generating plan:', error);
    if (error instanceof Error) {
      console.error(`${error.message}`);
    }
    process.exit(1);
  }
};
