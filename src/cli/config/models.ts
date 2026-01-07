import * as p from '@clack/prompts';
import { ResultAsync, ok, err } from 'neverthrow';
import type { ModelConfig, ModelsConfig, ModelPreset } from '../../config/index.js';
import {
  configUtils,
  modelConfigEquals,
  formatModelConfig,
  ensureConfigDir,
} from '../../config/index.js';
import { getOpenCodeLib, type Provider } from '../../agent/opencodesdk.js';
import { exit } from '../../exit.js';

function findPresetsUsingModel(model: ModelConfig, presets: Record<string, ModelPreset>): string[] {
  const matchingPresets: string[] = [];
  for (const [presetName, preset] of Object.entries(presets)) {
    if (
      modelConfigEquals(preset.coding, model) ||
      modelConfigEquals(preset.master, model) ||
      modelConfigEquals(preset.plan, model) ||
      modelConfigEquals(preset.summarizer, model) ||
      modelConfigEquals(preset.commit, model)
    ) {
      matchingPresets.push(presetName);
    }
  }
  return matchingPresets;
}

export async function handleModelsAdd(): Promise<void> {
  p.intro('Add models to the pool');

  const libResult = await getOpenCodeLib();
  if (libResult.isErr()) {
    p.note('Failed to connect to OpenCode SDK', 'Error');
    await exit(1);
    return;
  }
  const lib = libResult._unsafeUnwrap();

  const s = p.spinner();
  s.start('Fetching providers...');
  const providersResult = await lib.provider.list();

  if (providersResult.isErr()) {
    s.stop('Failed to fetch providers', 1);
    p.note('Failed to list providers', 'Error');
    await exit(1);
    return;
  }
  const providers = providersResult._unsafeUnwrap();
  s.stop('Providers fetched');

  const providersWithModels = providers.filter(
    (provider: Provider) => provider.models && Object.keys(provider.models).length > 0
  );

  if (providersWithModels.length === 0) {
    p.note('No providers available', 'Error');
    await exit(1);
    return;
  }

  const allSelectedModels: ModelConfig[] = [];
  let continueAdding = true;

  while (continueAdding) {
    const providerOptions = providersWithModels.map((provider: Provider) => ({
      value: provider.id,
      label: provider.id,
    }));

    const providerSelectResult = await p.select({
      message: 'Select a provider',
      options: providerOptions,
    });

    if (p.isCancel(providerSelectResult)) {
      p.cancel('Operation cancelled');
      await exit(0);
      return;
    }
    const providerID = providerSelectResult as string;

    const selectedProvider = providersWithModels.find(
      (provider: Provider) => provider.id === providerID
    );
    const availableModels = selectedProvider?.models
      ? Object.keys(selectedProvider.models).sort()
      : [];

    if (availableModels.length === 0) {
      p.note('No models available for this provider', 'Warning');
      continue;
    }

    const modelOptions = availableModels.map((model: string) => ({ value: model, label: model }));
    const modelSelectResult = await p.multiselect({
      message: 'Select models',
      options: modelOptions,
      required: false,
    });

    if (p.isCancel(modelSelectResult)) {
      p.cancel('Operation cancelled');
      await exit(0);
      return;
    }
    const selectedModelIDs = modelSelectResult as string[];

    if (selectedModelIDs.length === 0) {
      p.note('No models selected', 'Warning');
      continue;
    }

    const validModels: ModelConfig[] = [];
    for (const modelID of selectedModelIDs) {
      const validateResult = await lib.provider.validate(providerID, modelID);
      if (validateResult.isErr()) {
        p.note(`Failed to validate ${providerID}/${modelID}`, 'Error');
        await exit(1);
        return;
      }
      const isValid = validateResult._unsafeUnwrap();
      if (!isValid) {
        p.note(`Model ${providerID}/${modelID} is not valid`, 'Error');
        await exit(1);
        return;
      }
      validModels.push({ providerID, modelID });
    }

    allSelectedModels.push(...validModels);

    const addAnotherResult = await p.confirm({
      message: 'Add models from another provider?',
    });

    if (p.isCancel(addAnotherResult)) {
      p.cancel('Operation cancelled');
      await exit(0);
      return;
    }

    continueAdding = addAnotherResult === true;
  }

  const configDirResult = await ensureConfigDir();
  if (configDirResult.isErr()) {
    p.note('Failed to ensure config directory exists', 'Error');
    await exit(1);
    return;
  }

  const configResult = await configUtils.models.read();
  if (configResult.isErr()) {
    const error = configResult.error;
    if (error.type === 'CONFIG_FILE_MISSING') {
      const newConfig: ModelsConfig = { models: [...allSelectedModels], presets: {} };
      const writeResult = await configUtils.models.write(newConfig);
      if (writeResult.isErr()) {
        p.note('Failed to write config', 'Error');
        await exit(1);
        return;
      }
      p.outro(`Added ${allSelectedModels.length} models to the pool`);
      return;
    }
    p.note('Failed to read models config', 'Error');
    await exit(1);
    return;
  }

  const config = configResult._unsafeUnwrap();
  const existingModels = config.models;

  const newModels: ModelConfig[] = [];
  const duplicateModels: ModelConfig[] = [];

  for (const model of allSelectedModels) {
    const isDuplicate = existingModels.some((existing: ModelConfig) =>
      modelConfigEquals(existing, model)
    );
    if (isDuplicate) {
      duplicateModels.push(model);
    } else {
      newModels.push(model);
    }
  }

  if (newModels.length === 0 && duplicateModels.length > 0) {
    p.note('All selected models already exist in the pool', 'Warning');
    duplicateModels.forEach((model: ModelConfig) => {
      p.log.message(`  ${formatModelConfig(model)} (already in pool)`);
    });
    await exit(0);
    return;
  }

  const updatedConfig: ModelsConfig = {
    ...config,
    models: [...existingModels, ...newModels],
  };

  const writeResult = await configUtils.models.write(updatedConfig);
  if (writeResult.isErr()) {
    p.note('Failed to write config', 'Error');
    await exit(1);
    return;
  }

  p.log.message(`Added ${newModels.length} models to the pool:`);
  newModels.forEach((model: ModelConfig) => {
    p.log.message(`  ${formatModelConfig(model)}`);
  });

  if (duplicateModels.length > 0) {
    duplicateModels.forEach((model: ModelConfig) => {
      p.log.message(`  ${formatModelConfig(model)} (already in pool)`);
    });
  }

  await exit(0);
}

export async function handleModelsRemove(): Promise<void> {}

export async function handleModelsList(): Promise<void> {}

export async function handleModelsValidate(): Promise<void> {}
