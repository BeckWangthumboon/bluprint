import * as p from '@clack/prompts';
import type { ModelConfig } from '../../../config/index.js';
import { formatModelConfig } from '../../../config/index.js';
import { exit } from '../../../exit.js';
import { connectToOpenCodeOrExit, requireModelsConfigOrExit } from '../utils.js';
import { saveEditedModelsToConfig } from './utils.js';

enum ModelValidationErrorReason {
  ValidationFailed = 'validation_failed',
  NotFound = 'not_found',
}

const validationReasonLabels: Record<ModelValidationErrorReason, string> = {
  [ModelValidationErrorReason.ValidationFailed]: 'validation failed',
  [ModelValidationErrorReason.NotFound]: 'not found in OpenCode',
};

/**
 * Handles the "models validate" command.
 *
 * @param options - Command options.
 * @param options.json - Output as JSON.
 * @param options.verbose - Show all models, not just invalid ones.
 * @returns Resolves when the operation completes.
 */
const handleModelsValidate = async (options: {
  json: boolean;
  verbose: boolean;
}): Promise<void> => {
  const usePrompts = !options.json;
  const config = await requireModelsConfigOrExit({ usePrompts });
  if (!config) return;

  const sortedModels = [...config.models].sort((firstModel, secondModel) => {
    const firstFormatted = formatModelConfig(firstModel);
    const secondFormatted = formatModelConfig(secondModel);
    return firstFormatted.localeCompare(secondFormatted);
  });

  if (sortedModels.length === 0) {
    if (options.json) {
      console.log('[]');
    } else {
      console.log('No models added.');
    }
    await exit(0);
    return;
  }

  const lib = await connectToOpenCodeOrExit(usePrompts);
  if (!lib) return;

  if (options.json) {
    const payload: Array<{
      providerID: string;
      modelID: string;
      valid: boolean;
      reason?: ModelValidationErrorReason;
    }> = [];
    let hasInvalid = false;

    for (const model of sortedModels) {
      const validateResult = await lib.provider.validate(model.providerID, model.modelID);
      if (validateResult.isErr()) {
        hasInvalid = true;
        payload.push({
          providerID: model.providerID,
          modelID: model.modelID,
          valid: false,
          reason: ModelValidationErrorReason.ValidationFailed,
        });
        continue;
      }
      if (!validateResult.value) {
        hasInvalid = true;
        payload.push({
          providerID: model.providerID,
          modelID: model.modelID,
          valid: false,
          reason: ModelValidationErrorReason.NotFound,
        });
        continue;
      }
      payload.push({
        providerID: model.providerID,
        modelID: model.modelID,
        valid: true,
      });
    }

    console.log(JSON.stringify(payload, null, 2));
    await exit(hasInvalid ? 1 : 0);
    return;
  }

  console.log(`Validating ${sortedModels.length} models...\n`);

  let validCount = 0;
  const invalidModels: Array<{ model: ModelConfig; reason: ModelValidationErrorReason }> = [];
  const invalidModelKeys = new Set<string>();

  for (const model of sortedModels) {
    const modelKey = formatModelConfig(model);
    const validateResult = await lib.provider.validate(model.providerID, model.modelID);
    if (validateResult.isErr()) {
      invalidModels.push({ model, reason: ModelValidationErrorReason.ValidationFailed });
      invalidModelKeys.add(modelKey);
      console.log(
        `  ✗ ${modelKey} (${validationReasonLabels[ModelValidationErrorReason.ValidationFailed]})`
      );
    } else {
      const isValid = validateResult.value;
      if (isValid) {
        validCount += 1;
        if (options.verbose) {
          console.log(`  ✓ ${modelKey}`);
        }
      } else {
        invalidModels.push({ model, reason: ModelValidationErrorReason.NotFound });
        invalidModelKeys.add(modelKey);
        console.log(
          `  ✗ ${modelKey} (${validationReasonLabels[ModelValidationErrorReason.NotFound]})`
        );
      }
    }
  }

  console.log(`\n${validCount} valid, ${invalidModels.length} invalid`);

  if (usePrompts && invalidModels.length > 0) {
    const removeResult = await p.confirm({
      message: `Remove ${invalidModels.length} invalid model(s) from the pool?`,
    });

    if (p.isCancel(removeResult)) {
      p.cancel('Operation cancelled');
      await exit(0);
      return;
    }

    if (removeResult) {
      const remainingModels = config.models.filter(
        (model) => !invalidModelKeys.has(formatModelConfig(model))
      );

      await saveEditedModelsToConfig(config.models, remainingModels, config.presets, {
        skipConfirmations: false,
        confirmRemovals: false,
      });
      return;
    }
  }

  await exit(invalidModels.length > 0 ? 1 : 0);
};

export { handleModelsValidate };
