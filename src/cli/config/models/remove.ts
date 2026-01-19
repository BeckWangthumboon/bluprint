import * as p from '@clack/prompts';
import { formatModelConfig } from '../../../config/index.js';
import { exit } from '../../../exit.js';
import { requireModelsConfigOrExit } from '../utils.js';
import {
  buildModelKeySet,
  buildRemovalOptions,
  dedupeModels,
  parseModelArgs,
  reportError,
  reportWarning,
  saveEditedModelsToConfig,
} from './utils.js';

/**
 * Handles the "models remove" command.
 *
 * @param options - Command options.
 * @param options.models - Optional model references.
 * @param options.flags - Flag values for this command.
 * @param options.flags.all - Remove all models.
 * @param options.flags.yes - Skip confirmation prompts.
 * @returns Resolves when the operation completes.
 */
const handleModelsRemove = async (options: {
  models: string[] | undefined;
  flags: Record<string, boolean>;
}): Promise<void> => {
  const modelArgs = options.models ?? [];
  const flags = {
    all: options.flags.all ?? false,
    yes: options.flags.yes ?? false,
  };
  const hasSelectionArgs = flags.all || modelArgs.length > 0;
  const usePrompts = !hasSelectionArgs || !flags.yes;

  if (usePrompts) {
    p.intro('Remove models');
  }

  if (flags.all && modelArgs.length > 0) {
    reportError(usePrompts, 'Cannot use --all with --model.');
    await exit(1);
    return;
  }

  const config = await requireModelsConfigOrExit({ usePrompts });
  if (!config) return;

  const originalModels = config.models;
  const presets = config.presets;

  if (originalModels.length === 0) {
    reportWarning(usePrompts, 'No models added.');
    await exit(0);
    return;
  }

  if (flags.all) {
    await saveEditedModelsToConfig(originalModels, [], presets, {
      skipConfirmations: flags.yes,
      confirmRemovals: true,
      usePrompts,
    });
    return;
  }

  if (modelArgs.length > 0) {
    const parsedModels = parseModelArgs(modelArgs);
    if (parsedModels.invalid.length > 0) {
      reportError(usePrompts, `Invalid model format: ${parsedModels.invalid.join(', ')}`);
      await exit(1);
      return;
    }

    const uniqueModels = dedupeModels(parsedModels.models);
    const poolKeys = buildModelKeySet(originalModels);
    const missingModels = uniqueModels.filter((model) => !poolKeys.has(formatModelConfig(model)));

    if (missingModels.length > 0) {
      reportError(
        usePrompts,
        `Model(s) not in pool: ${missingModels.map((model) => formatModelConfig(model)).join(', ')}`
      );
      await exit(1);
      return;
    }

    const removeKeys = new Set(uniqueModels.map((model) => formatModelConfig(model)));
    const remainingModels = originalModels.filter(
      (model) => !removeKeys.has(formatModelConfig(model))
    );

    await saveEditedModelsToConfig(originalModels, remainingModels, presets, {
      skipConfirmations: flags.yes,
      confirmRemovals: true,
      usePrompts,
    });
    return;
  }

  const removalOptions = buildRemovalOptions(originalModels);
  const selectedModelResult = await p.multiselect({
    message: 'Select models to remove',
    options: removalOptions,
    required: false,
  });

  if (p.isCancel(selectedModelResult)) {
    p.cancel('Operation cancelled');
    await exit(0);
    return;
  }

  const selectedModelKeys = new Set(selectedModelResult);
  const remainingModels = originalModels.filter(
    (model) => !selectedModelKeys.has(formatModelConfig(model))
  );

  await saveEditedModelsToConfig(originalModels, remainingModels, presets, {
    skipConfirmations: flags.yes,
    confirmRemovals: true,
    usePrompts,
  });
};

export { handleModelsRemove };
