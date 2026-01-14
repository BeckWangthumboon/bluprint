import * as p from '@clack/prompts';
import type { ModelConfig, ModelPreset, ModelsConfig } from '../../../config/index.js';
import {
  configUtils,
  ensureConfigDir,
  formatModelConfig,
  modelConfigEquals,
} from '../../../config/index.js';
import type { Provider } from '../../../agent/opencodesdk.js';
import { exit } from '../../../exit.js';
import { findPresetsUsingModel, type SDKWithProviders } from '../utils.js';

const parseModelReference = (value: string): ModelConfig | null => {
  const parts = value
    .trim()
    .split('/')
    .map((part) => part.trim());
  if (parts.length !== 2) {
    return null;
  }
  const [providerID, modelID] = parts;
  if (!providerID || !modelID) {
    return null;
  }
  return { providerID, modelID };
};

/**
 * Parses CLI model arguments into model configs.
 *
 * @param values - Raw model arguments from the CLI.
 * @returns Parsed model configs and invalid values.
 */
const parseModelArgs = (values: string[]): { models: ModelConfig[]; invalid: string[] } => {
  const models: ModelConfig[] = [];
  const invalid: string[] = [];
  for (const value of values) {
    const parsed = parseModelReference(value);
    if (!parsed) {
      invalid.push(value);
    } else {
      models.push(parsed);
    }
  }
  return { models, invalid };
};

/**
 * Deduplicates models by provider/model key.
 *
 * @param models - Model configs to deduplicate.
 * @returns Unique model configs.
 */
const dedupeModels = (models: ModelConfig[]): ModelConfig[] => {
  const uniqueModels = new Map<string, ModelConfig>();
  for (const model of models) {
    uniqueModels.set(formatModelConfig(model), model);
  }
  return Array.from(uniqueModels.values());
};

/**
 * Builds a set of provider/model keys for models.
 *
 * @param models - Model configs to convert to keys.
 * @returns Set of formatted model keys.
 */
const buildModelKeySet = (models: ModelConfig[]): Set<string> => {
  return new Set(models.map((model) => formatModelConfig(model)));
};

/**
 * Reads models config for add operations, returning defaults if missing.
 *
 * @returns Models config or null when an error occurs.
 */
const readModelsConfigForAdd = async (): Promise<ModelsConfig | null> => {
  const configResult = await configUtils.models.read();
  if (configResult.isOk()) {
    return configResult.value;
  }
  if (configResult.error.type === 'CONFIG_FILE_MISSING') {
    return { models: [], presets: {} };
  }
  p.note('Failed to read models config', 'Error');
  await exit(1);
  return null;
};

/**
 * Builds selection options for model removals.
 *
 * @param models - Model configs to format for selection.
 * @returns Options suitable for a multiselect prompt.
 */
const buildRemovalOptions = (models: ModelConfig[]): Array<{ value: string; label: string }> => {
  return models
    .map((model) => formatModelConfig(model))
    .sort((firstValue, secondValue) => firstValue.localeCompare(secondValue))
    .map((formatted) => ({
      value: formatted,
      label: formatted,
    }));
};

/**
 * Runs interactive selection of models to add from providers.
 *
 * @param lib - OpenCode SDK library instance.
 * @param providers - Providers to choose from.
 * @param existingModels - Existing models in the pool.
 * @param options - Configuration options.
 * @param options.skipConfirmations - Skip confirmation prompts.
 * @returns Updated model list or null when cancelled.
 */
const selectModelsToAdd = async (
  lib: SDKWithProviders['lib'],
  providers: Provider[],
  existingModels: ModelConfig[],
  options: { skipConfirmations: boolean }
): Promise<ModelConfig[] | null> => {
  const currentModels = [...existingModels];
  const existingModelKeys = buildModelKeySet(existingModels);
  const providerModels = new Map<string, string[]>();

  for (const provider of providers) {
    const availableModels = provider.models ? Object.keys(provider.models).sort() : [];
    if (availableModels.length > 0) {
      providerModels.set(provider.id, availableModels);
    }
  }

  let continueEditing = true;

  while (continueEditing) {
    const providerOptions = [
      ...Array.from(providerModels.entries())
        .map(([providerID]) => ({
          value: providerID,
          label: providerID,
        }))
        .sort((firstOption, secondOption) => firstOption.label.localeCompare(secondOption.label)),
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
      p.note('No models available for this provider', 'Warning');
      continue;
    }

    const modelOptions = availableModels
      .filter((modelID) => !existingModelKeys.has(`${providerID}/${modelID}`))
      .map((modelID) => ({ value: modelID, label: modelID }));

    if (modelOptions.length === 0) {
      const continueResult = await p.confirm({
        message: `All models from ${providerID} are already in your pool. Add models from another provider?`,
        initialValue: true,
      });
      if (p.isCancel(continueResult) || !continueResult) {
        break;
      }
      continue;
    }

    const modelSelectResult = await p.multiselect({
      message: 'Select models to add',
      options: modelOptions,
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
      if (!validateResult.value) {
        p.note(`Model ${providerID}/${modelID} is not valid`, 'Error');
        await exit(1);
        return null;
      }
    }

    for (const modelID of selectedModelIDs) {
      currentModels.push({ providerID, modelID });
      existingModelKeys.add(`${providerID}/${modelID}`);
    }

    if (options.skipConfirmations) {
      continueEditing = true;
      continue;
    }

    const editAnotherResult = await p.confirm({
      message: 'Add models from another provider?',
    });

    if (p.isCancel(editAnotherResult)) {
      p.cancel('Operation cancelled');
      await exit(0);
      return null;
    }

    continueEditing = editAnotherResult === true;
  }

  return currentModels;
};

/**
 * Persists updated models to the config file.
 *
 * @param originalModels - Models before changes.
 * @param newModels - Models after changes.
 * @param presets - Existing presets for usage checks.
 * @param options - Configuration options.
 * @param options.skipConfirmations - Skip confirmation prompts.
 * @param options.confirmRemovals - Ask for removal confirmation.
 * @returns Resolves when the operation completes.
 */
const saveEditedModelsToConfig = async (
  originalModels: ModelConfig[],
  newModels: ModelConfig[],
  presets: Record<string, ModelPreset>,
  options: { skipConfirmations: boolean; confirmRemovals: boolean }
): Promise<void> => {
  const configDirResult = await ensureConfigDir();
  if (configDirResult.isErr()) {
    p.note('Failed to ensure config directory exists', 'Error');
    await exit(1);
    return;
  }

  const skipConfirmations = options.skipConfirmations;
  const confirmRemovals = options.confirmRemovals;

  const addedModels = newModels.filter(
    (model) => !originalModels.some((original) => modelConfigEquals(original, model))
  );
  const removedModels = originalModels.filter(
    (original) => !newModels.some((model) => modelConfigEquals(model, original))
  );

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

    if (!skipConfirmations) {
      const confirmResult = await p.confirm({
        message: 'Continue anyway?',
      });

      if (p.isCancel(confirmResult) || !confirmResult) {
        p.cancel('Operation cancelled');
        await exit(0);
        return;
      }
    }
  }

  if (confirmRemovals && removedModels.length > 0 && !skipConfirmations) {
    const confirmResult = await p.confirm({
      message: `Remove ${removedModels.length} model(s)?`,
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
};

export {
  buildModelKeySet,
  buildRemovalOptions,
  dedupeModels,
  parseModelArgs,
  readModelsConfigForAdd,
  saveEditedModelsToConfig,
  selectModelsToAdd,
};
