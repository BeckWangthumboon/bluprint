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
    const missingMsg = "No models.json found. Run 'bluprint config models edit' first.";
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
 * and optionally continues to edit models from other providers. Models already in the pool
 * are pre-selected. When a provider is visited, all its models are replaced by the new selection.
 * Models from unvisited providers remain unchanged.
 *
 * @param lib - The OpenCode SDK library instance.
 * @param providers - The list of available providers with models.
 * @param existingModels - The current models in the pool (used for pre-selection).
 * @returns The final array of model configs after edits, or null if cancelled/errored.
 */
async function selectModelsFromProviders(
  lib: SDKWithProviders['lib'],
  providers: Provider[],
  existingModels: ModelConfig[]
): Promise<ModelConfig[] | null> {
  const currentModels = [...existingModels];
  let continueEditing = true;

  while (continueEditing) {
    const providerOptions = [
      ...providers
        .map((provider: Provider) => ({
          value: provider.id,
          label: provider.id,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      { value: '__exit__', label: 'done' },
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

    const initialValues = availableModels.filter((modelID) =>
      currentModels.some((m) => m.providerID === providerID && m.modelID === modelID)
    );

    const modelOptions = availableModels.map((model: string) => ({ value: model, label: model }));
    const modelSelectResult = await p.multiselect({
      message: 'Select models (toggle to add/remove)',
      options: modelOptions,
      initialValues,
      required: false,
    });

    if (p.isCancel(modelSelectResult)) {
      p.cancel('Operation cancelled');
      await exit(0);
      return null;
    }
    const selectedModelIDs = modelSelectResult as string[];

    const newlySelectedIDs = selectedModelIDs.filter(
      (modelID) => !currentModels.some((m) => m.providerID === providerID && m.modelID === modelID)
    );

    for (const modelID of newlySelectedIDs) {
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
    }

    const modelsFromOtherProviders = currentModels.filter((m) => m.providerID !== providerID);
    const newModelsForProvider = selectedModelIDs.map((modelID) => ({ providerID, modelID }));
    currentModels.length = 0;
    currentModels.push(...modelsFromOtherProviders, ...newModelsForProvider);

    const editAnotherResult = await p.confirm({
      message: 'Edit models from another provider?',
    });

    if (p.isCancel(editAnotherResult)) {
      p.cancel('Operation cancelled');
      await exit(0);
      return null;
    }

    continueEditing = editAnotherResult === true;
  }

  return currentModels;
}

/**
 * Saves the edited models to the config file.
 *
 * Computes the diff between original and new models, warns if removed models are used
 * in presets, and writes the final config. Exits the process on completion or error.
 *
 * @param originalModels - The models that were in the pool before editing.
 * @param newModels - The final array of models after editing.
 * @param presets - The existing presets config (for warning about removed models).
 * @returns Resolves when the operation completes (process exits).
 */
async function saveEditedModelsToConfig(
  originalModels: ModelConfig[],
  newModels: ModelConfig[],
  presets: Record<string, ModelPreset>
): Promise<void> {
  const configDirResult = await ensureConfigDir();
  if (configDirResult.isErr()) {
    p.note('Failed to ensure config directory exists', 'Error');
    await exit(1);
    return;
  }

  const addedModels = newModels.filter(
    (m) => !originalModels.some((orig) => modelConfigEquals(orig, m))
  );
  const removedModels = originalModels.filter(
    (orig) => !newModels.some((m) => modelConfigEquals(orig, m))
  );

  // Check if any removed models are used in presets
  const presetUsages: Array<{ model: ModelConfig; presetNames: string[] }> = [];
  for (const model of removedModels) {
    const presetNames = findPresetsUsingModel(model, presets);
    if (presetNames.length > 0) {
      presetUsages.push({ model, presetNames });
    }
  }

  if (presetUsages.length > 0) {
    p.log.warn('The following models to be removed are used in presets:');
    for (const { model, presetNames } of presetUsages) {
      p.log.message(`  - ${formatModelConfig(model)}`);
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

  if (addedModels.length === 0 && removedModels.length === 0) {
    p.outro('No changes made');
    await exit(0);
    return;
  }

  const updatedConfig: ModelsConfig = {
    models: newModels,
    presets,
  };

  const writeResult = await configUtils.models.write(updatedConfig);
  if (writeResult.isErr()) {
    p.note('Failed to write config', 'Error');
    await exit(1);
    return;
  }

  if (addedModels.length > 0) {
    p.log.message(`Added ${addedModels.length} model(s):`);
    addedModels.forEach((model) => {
      p.log.message(`  + ${formatModelConfig(model)}`);
    });
  }

  if (removedModels.length > 0) {
    p.log.message(`Removed ${removedModels.length} model(s):`);
    removedModels.forEach((model) => {
      p.log.message(`  - ${formatModelConfig(model)}`);
    });
  }

  p.outro('Done!');
  await exit(0);
}

/**
 * Handles the interactive "edit models" command.
 *
 * Loads existing models from config, fetches available providers, prompts the user
 * to select/deselect models with pre-selection of existing ones, and saves the
 * final selection to the config file. All changes are atomic - only written at the end.
 *
 * @returns Resolves when the operation completes.
 */
export async function handleModelsEdit(): Promise<void> {
  p.intro('Edit model pool');

  const configResult = await configUtils.models.read();
  let originalModels: ModelConfig[] = [];
  let presets: Record<string, ModelPreset> = {};

  if (configResult.isOk()) {
    originalModels = configResult.value.models;
    presets = configResult.value.presets;
  } else if (configResult.error.type !== 'CONFIG_FILE_MISSING') {
    p.note('Failed to read models config', 'Error');
    await exit(1);
    return;
  }

  const openCodeProvidersAndModels = await fetchProvidersWithModels();
  if (!openCodeProvidersAndModels) return;

  const finalModels = await selectModelsFromProviders(
    openCodeProvidersAndModels.lib,
    openCodeProvidersAndModels.providers,
    originalModels
  );
  if (!finalModels) return;

  if (finalModels.length === 0) {
    p.note('Model pool will be empty after this operation.', 'Info');
  }

  await saveEditedModelsToConfig(originalModels, finalModels, presets);
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
