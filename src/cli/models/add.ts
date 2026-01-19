import * as p from '@clack/prompts';
import { formatModelConfig, modelConfigEquals } from '../../config/index.js';
import { exit } from '../../exit.js';
import { connectToOpenCodeOrExit, fetchProvidersWithModels } from '../shared/utils.js';
import {
  dedupeModels,
  parseModelArgs,
  readModelsConfigForAdd,
  reportError,
  reportInfo,
  reportWarning,
  saveEditedModelsToConfig,
  selectModelsToAdd,
} from './utils.js';

/**
 * Handles the "models add" command.
 *
 * @param options - Command options.
 * @param options.models - Optional model references.
 * @param options.yes - Skip confirmation prompts.
 * @returns Resolves when the operation completes.
 */
const handleModelsAdd = async (options: {
  models: string[] | undefined;
  yes: boolean;
}): Promise<void> => {
  const modelArgs = options.models ?? [];
  const usePrompts = modelArgs.length === 0;

  if (usePrompts) {
    p.intro('Add models');
  }

  const config = await readModelsConfigForAdd({ usePrompts });
  if (!config) return;

  const originalModels = config.models;
  const presets = config.presets;

  if (modelArgs.length > 0) {
    const parsedModels = parseModelArgs(modelArgs);
    if (parsedModels.invalid.length > 0) {
      reportError(usePrompts, `Invalid model format: ${parsedModels.invalid.join(', ')}`);
      await exit(1);
      return;
    }

    const uniqueModels = dedupeModels(parsedModels.models);
    const modelsToAdd = uniqueModels.filter(
      (model) => !originalModels.some((existing) => modelConfigEquals(existing, model))
    );

    const skippedCount = uniqueModels.length - modelsToAdd.length;
    if (skippedCount > 0) {
      reportWarning(usePrompts, `Skipping ${skippedCount} model(s) already in pool`);
    }

    if (modelsToAdd.length === 0) {
      reportInfo(usePrompts, 'All provided models are already in the pool');
      await exit(0);
      return;
    }

    const lib = await connectToOpenCodeOrExit(usePrompts);
    if (!lib) return;

    for (const model of modelsToAdd) {
      const validateResult = await lib.provider.validate(model.providerID, model.modelID);
      if (validateResult.isErr()) {
        reportError(usePrompts, `Failed to validate ${formatModelConfig(model)}`);
        await exit(1);
        return;
      }
      if (!validateResult.value) {
        reportError(usePrompts, `Model ${formatModelConfig(model)} is not valid`);
        await exit(1);
        return;
      }
    }

    const updatedModels = [...originalModels, ...modelsToAdd];
    await saveEditedModelsToConfig(originalModels, updatedModels, presets, {
      skipConfirmations: options.yes,
      confirmRemovals: false,
      usePrompts,
    });
    return;
  }

  const openCodeProvidersAndModels = await fetchProvidersWithModels();
  if (!openCodeProvidersAndModels) return;

  const providersWithModels = openCodeProvidersAndModels.providers.filter((provider) => {
    const availableModels = provider.models ? Object.keys(provider.models) : [];
    return availableModels.length > 0;
  });

  if (providersWithModels.length === 0) {
    p.note('No providers available', 'Error');
    await exit(1);
    return;
  }

  const finalModels = await selectModelsToAdd(
    openCodeProvidersAndModels.lib,
    providersWithModels,
    originalModels,
    { skipConfirmations: options.yes }
  );
  if (!finalModels) return;

  await saveEditedModelsToConfig(originalModels, finalModels, presets, {
    skipConfirmations: options.yes,
    confirmRemovals: false,
    usePrompts: true,
  });
};

export { handleModelsAdd };
