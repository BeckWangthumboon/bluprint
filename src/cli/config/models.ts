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
import {
  findPresetsUsingModel,
  fetchProvidersWithModels,
  requireModelsConfigOrExit,
  type SDKWithProviders,
} from './utils.js';

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
  const existingProviderIDs = new Set(existingModels.map((model) => model.providerID));
  const providerModels = new Map<string, string[]>();

  for (const provider of providers) {
    const availableModels = provider.models ? Object.keys(provider.models).sort() : [];
    if (availableModels.length > 0 || existingProviderIDs.has(provider.id)) {
      providerModels.set(provider.id, availableModels);
    }
  }

  for (const providerID of existingProviderIDs) {
    if (!providerModels.has(providerID)) {
      providerModels.set(providerID, []);
    }
  }

  let continueEditing = true;

  while (continueEditing) {
    const providerOptions = [
      ...Array.from(providerModels.entries())
        .map(([providerID, availableModels]) => ({
          value: providerID,
          label: providerID,
          hint: availableModels.length === 0 ? 'no models returned' : undefined,
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

    const providerID = providerSelectResult;

    const availableModels = providerModels.get(providerID) ?? [];

    if (availableModels.length === 0) {
      const existingForProvider = currentModels.filter((model) => model.providerID === providerID);
      if (existingForProvider.length > 0) {
        const removeResult = await p.confirm({
          message: `No valid models returned for ${providerID}. Remove existing models for this provider?`,
        });

        if (p.isCancel(removeResult)) {
          p.cancel('Operation cancelled');
          await exit(0);
          return null;
        }

        if (removeResult) {
          const modelsFromOtherProviders = currentModels.filter(
            (model) => model.providerID !== providerID
          );
          currentModels.length = 0;
          currentModels.push(...modelsFromOtherProviders);
        }
      } else {
        p.note('No models available for this provider', 'Warning');
      }
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
    const selectedModelIDs = modelSelectResult;

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
 * Validates models against the SDK and prompts to remove invalid ones.
 *
 * Checks each model in the provided list by validating it against the OpenCode SDK.
 * Models that fail validation or are not found are collected and displayed to the user
 * with a prompt to remove them from the pool. If the user cancels, returns null.
 *
 * @param lib - The OpenCode SDK library instance.
 * @param models - The array of model configs to validate.
 * @returns The array of valid models (with invalid ones removed if confirmed), or null if cancelled.
 */
async function promptRemoveInvalidModels(
  lib: Lib,
  models: ModelConfig[]
): Promise<ModelConfig[] | null> {
  if (models.length === 0) {
    return models;
  }

  const invalidModels: Array<{ model: ModelConfig; reason: string }> = [];
  for (const model of models) {
    const validateResult = await lib.provider.validate(model.providerID, model.modelID);
    if (validateResult.isErr()) {
      p.note('Failed to validate models in OpenCode', 'Error');
      await exit(1);
      return null;
    }
    if (!validateResult.value) {
      invalidModels.push({ model, reason: 'not found in OpenCode' });
    }
  }

  if (invalidModels.length === 0) {
    return models;
  }

  p.log.warn('Some models are not available in OpenCode:');
  for (const { model, reason } of invalidModels) {
    p.log.message(`  - ${formatModelConfig(model)} (${reason})`);
  }

  const removeResult = await p.confirm({
    message: 'Remove these models from the pool?',
  });

  if (p.isCancel(removeResult)) {
    p.cancel('Operation cancelled');
    await exit(0);
    return null;
  }

  if (removeResult) {
    return models.filter(
      (model) => !invalidModels.some((invalid) => modelConfigEquals(invalid.model, model))
    );
  }

  return models;
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
  if (openCodeProvidersAndModels.providers.length === 0 && originalModels.length === 0) {
    p.note('No providers available', 'Error');
    await exit(1);
    return;
  }

  const finalModels = await selectModelsFromProviders(
    openCodeProvidersAndModels.lib,
    openCodeProvidersAndModels.providers,
    originalModels
  );
  if (!finalModels) return;

  const cleanedModels = await promptRemoveInvalidModels(
    openCodeProvidersAndModels.lib,
    finalModels
  );
  if (!cleanedModels) return;

  if (cleanedModels.length === 0) {
    p.note('Model pool will be empty after this operation.', 'Info');
  }

  await saveEditedModelsToConfig(originalModels, cleanedModels, presets);
}

/**
 * Handles the "list models" command.
 *
 * Reads the config and prints all models in the pool, sorted alphabetically.
 *
 * @returns Resolves when the operation completes.
 */
export async function handleModelsList(): Promise<void> {
  const config = await requireModelsConfigOrExit({ usePrompts: false });
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
  const config = await requireModelsConfigOrExit({ usePrompts: false });
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
      } else {
        invalidModels.push({ model, reason: 'not found in OpenCode' });
        console.log(`  ✗ ${formatModelConfig(model)} (not found in OpenCode)`);
      }
    }
  }

  console.log(`\n${validModels.length} valid, ${invalidModels.length} invalid`);

  await exit(invalidModels.length > 0 ? 1 : 0);
}
