import { ResultAsync } from 'neverthrow';
import { readFile } from '../fs.js';
import { join, dirname } from 'path';
import type { ModelConfig } from './types.js';

export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export const parseModelFromEnv = (envVarName: string): ModelConfig | null => {
  const modelEnv = process.env[envVarName];
  if (!modelEnv) return null;

  const [providerID, modelID] = modelEnv.split('/');
  if (!providerID || !modelID) {
    console.warn(
      `Invalid ${envVarName} format: "${modelEnv}". Expected "provider/model". Using default.`
    );
    return null;
  }

  return { providerID, modelID };
};

export const getModelConfig = (envVarName: string, defaultModel: ModelConfig): ModelConfig => {
  return parseModelFromEnv(envVarName) || defaultModel;
};

export const loadPromptFile = (promptFileName: string): ResultAsync<string, Error> => {
  const promptPath = join(dirname(new URL(import.meta.url).pathname), 'prompts', promptFileName);
  return readFile(promptPath).mapErr(
    (err) => new Error(`Failed to load ${promptFileName}: ${err.message}`)
  );
};

export async function validateModel(
  client: any,
  providerID: string,
  modelID: string
): Promise<boolean> {
  const providersResp = await client.provider.list({});
  const providers = providersResp.data?.all ?? [];
  const provider = providers.find((p: any) => p.id === providerID);

  if (!provider) {
    console.error(
      `Provider "${providerID}" not found. Known providers:`,
      providers.map((p: any) => p.id)
    );
    return false;
  }

  const models = provider.models ?? {};
  if (!models[modelID]) {
    console.error(
      `Model "${modelID}" not found for provider "${providerID}". Available:`,
      Object.keys(models)
    );
    return false;
  }

  return true;
}
