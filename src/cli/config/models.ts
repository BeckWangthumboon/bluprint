import * as p from '@clack/prompts';
import type { ModelConfig, ModelsConfig, ModelPreset } from '../../config/index.js';
import {
  configUtils,
  modelConfigEquals,
  formatModelConfig,
  ensureConfigDir,
} from '../../config/index.js';
import { getOpenCodeLib, type Provider, type Lib } from '../../agent/opencodesdk.js';
import { exit } from '../../exit.js';

/**
 * Finds all presets that reference a given model.
 *
 * Checks each preset's coding, master, plan, summarizer, and commit model slots.
 *
 * @param model - The model configuration to search for.
 * @param presets - The record of preset names to preset configurations.
 * @returns An array of preset names that use the specified model.
 */
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

/**
 * Parses a "providerID/modelID" string into a ModelConfig object.
 *
 * @param str - The string to parse in "providerID/modelID" format.
 * @returns The parsed ModelConfig, or null if the string is not in the expected format.
 */
function parseModelConfig(str: string): ModelConfig | null {
  const parts = str.split('/');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { providerID: parts[0], modelID: parts[1] };
  }
  return null;
}

/**
 * Reads the models config, exiting with an error if unavailable.
 *
 * Displays an error message and exits the process if the config file is missing or unreadable.
 * Use `usePrompts: true` for interactive commands (uses p.note), `false` for non-interactive (uses console.error).
 *
 * @param options - Configuration options.
 * @param options.usePrompts - Whether to use interactive prompts for error display.
 * @returns The models config, or null if an error occurred and the process is exiting.
 */
async function requireModelsConfig(options: { usePrompts: boolean }): Promise<ModelsConfig | null> {
  const result = await configUtils.models.read();
  if (result.isErr()) {
    const error = result.error;
    const missingMsg = "No models.json found. Run 'bluprint config models add' first.";
    const errorMsg = 'Failed to read models config';
    const msg = error.type === 'CONFIG_FILE_MISSING' ? missingMsg : errorMsg;

    if (options.usePrompts) {
      p.note(msg, 'Error');
    } else {
      console.error(msg);
    }
    await exit(1);
    return null;
  }
  return result.value;
}

interface SDKWithProviders {
  lib: Lib;
  providers: Provider[];
}

/**
 * Connects to the OpenCode SDK and fetches all providers that have models.
 *
 * Displays a spinner while fetching and exits the process if the connection fails
 * or no providers with models are available.
 *
 * @returns The SDK library instance and list of providers with models, or null if an error occurred.
 */
async function fetchProvidersWithModels(): Promise<SDKWithProviders | null> {
  const libResult = await getOpenCodeLib();
  if (libResult.isErr()) {
    p.note('Failed to connect to OpenCode SDK', 'Error');
    await exit(1);
    return null;
  }
  const lib = libResult.value;

  const s = p.spinner();
  s.start('Fetching providers...');
  const providersResult = await lib.provider.list();

  if (providersResult.isErr()) {
    s.stop('Failed to fetch providers', 1);
    p.note('Failed to list providers', 'Error');
    await exit(1);
    return null;
  }
  const providers = providersResult.value;
  s.stop('Providers fetched');

  const providersWithModels = providers.filter(
    (provider: Provider) => provider.models && Object.keys(provider.models).length > 0
  );

  if (providersWithModels.length === 0) {
    p.note('No providers available', 'Error');
    await exit(1);
    return null;
  }

  return { lib, providers: providersWithModels };
}

/**
 * Runs an interactive loop to select and validate models from providers.
 *
 * Prompts the user to select a provider, then models from that provider, validates them,
 * and optionally continues to add models from other providers. Exits the process if
 * validation fails or the user cancels.
 *
 * @param lib - The OpenCode SDK library instance.
 * @param providers - The list of available providers with models.
 * @returns The array of selected and validated model configs, or null if cancelled/errored.
 */
async function selectModelsFromProviders(
  lib: SDKWithProviders['lib'],
  providers: Provider[]
): Promise<ModelConfig[] | null> {
  const allSelectedModels: ModelConfig[] = [];
  let continueAdding = true;

  while (continueAdding) {
    const providerOptions = [
      ...providers
        .map((provider: Provider) => ({
          value: provider.id,
          label: provider.id,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      { value: '__exit__', label: 'exit/skip' },
    ];

    const providerSelectResult = await p.select({
      message: 'Select a provider',
      options: providerOptions,
    });

    if (p.isCancel(providerSelectResult)) {
      p.cancel('Operation cancelled');
      await exit(0);
      return null;
    }

    if (providerSelectResult === '__exit__') {
      break;
    }

    const providerID = providerSelectResult as string;

    const selectedProvider = providers.find((provider: Provider) => provider.id === providerID);
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
      return null;
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
        return null;
      }
      const isValid = validateResult.value;
      if (!isValid) {
        p.note(`Model ${providerID}/${modelID} is not valid`, 'Error');
        await exit(1);
        return null;
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
      return null;
    }

    continueAdding = addAnotherResult === true;
  }

  return allSelectedModels;
}

/**
 * Saves the selected models to the config file.
 *
 * Creates a new config if one doesn't exist, deduplicates models against existing ones,
 * and reports which models were added vs already present. Exits the process on completion or error.
 *
 * @param selectedModels - The array of model configs to save.
 * @returns Resolves when the operation completes (process exits).
 */
async function saveNewModelsToConfig(selectedModels: ModelConfig[]): Promise<void> {
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
      const newConfig: ModelsConfig = { models: [...selectedModels], presets: {} };
      const writeResult = await configUtils.models.write(newConfig);
      if (writeResult.isErr()) {
        p.note('Failed to write config', 'Error');
        await exit(1);
        return;
      }
      p.outro(`Added ${selectedModels.length} models to the pool`);
      await exit(0);
      return;
    }
    p.note('Failed to read models config', 'Error');
    await exit(1);
    return;
  }

  const config = configResult.value;
  const existingModels = config.models;

  const newModels: ModelConfig[] = [];
  const duplicateModels: ModelConfig[] = [];

  for (const model of selectedModels) {
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

  p.outro('Done!');
  await exit(0);
}

/**
 * Handles the interactive "add models" command.
 *
 * Fetches available providers, prompts the user to select models, validates them,
 * and saves the selection to the config file.
 *
 * @returns Resolves when the operation completes.
 */
export async function handleModelsAdd(): Promise<void> {
  p.intro('Add models to the pool');

  const openCodeProvidersAndModels = await fetchProvidersWithModels();
  if (!openCodeProvidersAndModels) return;

  const selectedModels = await selectModelsFromProviders(
    openCodeProvidersAndModels.lib,
    openCodeProvidersAndModels.providers
  );
  if (!selectedModels) return;

  if (selectedModels.length === 0) {
    p.outro('No models selected');
    await exit(0);
    return;
  }

  await saveNewModelsToConfig(selectedModels);
}

/**
 * Handles the interactive "remove models" command.
 *
 * Prompts the user to select models from the pool to remove, warns if any are used
 * in presets, and updates the config file.
 *
 * @returns Resolves when the operation completes.
 */
export async function handleModelsRemove(): Promise<void> {
  p.intro('Remove models from the pool');

  const config = await requireModelsConfig({ usePrompts: true });
  if (!config) return;

  const existingModels = config.models;

  if (existingModels.length === 0) {
    p.note('No models added.', 'Warning');
    await exit(0);
    return;
  }

  const modelOptions = existingModels.map((model) => ({
    value: formatModelConfig(model),
    label: formatModelConfig(model),
  }));

  const selectedModelsResult = await p.multiselect({
    message: 'Select models to remove',
    options: modelOptions,
    required: false,
  });

  if (p.isCancel(selectedModelsResult)) {
    p.cancel('Operation cancelled');
    await exit(0);
    return;
  }

  const selectedModels = selectedModelsResult as string[];

  if (selectedModels.length === 0) {
    p.note('No models selected', 'Warning');
    await exit(0);
    return;
  }

  const modelsToRemove: ModelConfig[] = [];
  for (const modelStr of selectedModels) {
    const parsed = parseModelConfig(modelStr);
    if (parsed) {
      modelsToRemove.push(parsed);
    }
  }

  const presetUsages: Array<{ model: ModelConfig; presetNames: string[] }> = [];
  for (const model of modelsToRemove) {
    const presetNames = findPresetsUsingModel(model, config.presets);
    if (presetNames.length > 0) {
      presetUsages.push({ model, presetNames });
    }
  }

  if (presetUsages.length > 0) {
    p.log.warn('The following models are used in presets:');
    for (const { model, presetNames } of presetUsages) {
      p.log.message(`  • ${formatModelConfig(model)}`);
      p.log.message(`    Used in: ${presetNames.join(', ')}`);
    }
    p.log.message('Removing them will make those presets invalid.');

    const confirmResult = await p.confirm({
      message: 'Continue anyway?',
    });

    if (p.isCancel(confirmResult) || !confirmResult) {
      p.cancel('Operation cancelled');
      await exit(0);
      return;
    }
  }

  const updatedModels = existingModels.filter(
    (existing: ModelConfig) =>
      !modelsToRemove.some((toRemove: ModelConfig) => modelConfigEquals(existing, toRemove))
  );

  const updatedConfig: ModelsConfig = {
    ...config,
    models: updatedModels,
  };

  const writeResult = await configUtils.models.write(updatedConfig);
  if (writeResult.isErr()) {
    p.note('Failed to write config', 'Error');
    await exit(1);
    return;
  }

  p.log.message(`Removed ${modelsToRemove.length} models from the pool:`);
  modelsToRemove.forEach((model: ModelConfig) => {
    p.log.message(`  ${formatModelConfig(model)}`);
  });

  p.outro('Done!');
  await exit(0);
}

/**
 * Handles the "list models" command.
 *
 * Reads the config and prints all models in the pool, sorted alphabetically.
 *
 * @returns Resolves when the operation completes.
 */
export async function handleModelsList(): Promise<void> {
  const config = await requireModelsConfig({ usePrompts: false });
  if (!config) return;

  const models = config.models;

  if (models.length === 0) {
    console.log('No models added.');
    await exit(0);
    return;
  }

  const sortedModels = [...models].sort((a, b) => {
    const aFormatted = formatModelConfig(a);
    const bFormatted = formatModelConfig(b);
    return aFormatted.localeCompare(bFormatted);
  });

  console.log(`Models in pool (${sortedModels.length}):`);
  for (const model of sortedModels) {
    console.log(`  • ${formatModelConfig(model)}`);
  }

  await exit(0);
}

/**
 * Handles the "validate models" command.
 *
 * Validates each model in the pool against the OpenCode SDK to check if it exists
 * and is accessible. Exits with code 1 if any models are invalid.
 *
 * @returns Resolves when the operation completes.
 */
export async function handleModelsValidate(): Promise<void> {
  const config = await requireModelsConfig({ usePrompts: false });
  if (!config) return;

  const models = config.models;

  if (models.length === 0) {
    console.log('No models added.');
    await exit(0);
    return;
  }

  const libResult = await getOpenCodeLib();
  if (libResult.isErr()) {
    console.error('Failed to connect to OpenCode SDK');
    await exit(1);
    return;
  }
  const lib = libResult.value;

  console.log(`Validating ${models.length} models...\n`);

  const validModels: ModelConfig[] = [];
  const invalidModels: Array<{ model: ModelConfig; reason: string }> = [];

  for (const model of models) {
    const validateResult = await lib.provider.validate(model.providerID, model.modelID);
    if (validateResult.isErr()) {
      invalidModels.push({ model, reason: 'Validation failed' });
      console.log(`  ✗ ${formatModelConfig(model)} (validation failed)`);
    } else {
      const isValid = validateResult.value;
      if (isValid) {
        validModels.push(model);
        console.log(`  ✓ ${formatModelConfig(model)}`);
      } else {
        invalidModels.push({ model, reason: 'not found in SDK' });
        console.log(`  ✗ ${formatModelConfig(model)} (not found in SDK)`);
      }
    }
  }

  console.log(`\n${validModels.length} valid, ${invalidModels.length} invalid`);

  await exit(invalidModels.length > 0 ? 1 : 0);
}
