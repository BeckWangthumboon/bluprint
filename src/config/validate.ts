import { Result, ResultAsync, err, ok } from 'neverthrow';
import type { ModelPreset, ModelConfig, ResolvedConfig } from './schemas.js';
import { AGENT_TYPES } from './schemas.js';
import type { ConfigValidationError } from './types.js';
import { configUtils, modelConfigEquals } from './io.js';

/**
 * Validates a model preset. Check if all models are in model pool,
 *
 * @param preset      The ModelPreset to validate
 * @param models      The array of available models in the pool
 * @param presetName  The name of the preset being validated
 * @returns           Result<void, ConfigValidationError> - ok if validation passes, err if validation fails
 */
export const validatePresetPool = (
  preset: ModelPreset,
  models: ModelConfig[],
  presetName: string
): Result<void, ConfigValidationError> => {
  for (const agentType of AGENT_TYPES) {
    const modelConfig = preset[agentType];
    const isInPool = models.some((poolModel) => modelConfigEquals(poolModel, modelConfig));

    if (!isInPool) {
      return err({
        type: 'MODEL_NOT_IN_POOL',
        presetName,
        agentType,
        model: modelConfig,
      });
    }
  }

  return ok();
};

/**
 * Resolves and validates the configuration, ensuring the default model preset exists and is valid.
 *
 * @returns ResultAsync containing the resolved configuration or a ConfigValidationError
 */
export const resolveConfig = (): ResultAsync<ResolvedConfig, ConfigValidationError> => {
  return ResultAsync.combine([configUtils.bluprint.read(), configUtils.models.read()]).andThen(
    ([bluprintConfig, modelsConfig]) => {
      const { defaultPreset, limits, timeouts } = bluprintConfig;
      const preset = modelsConfig.presets[defaultPreset];

      if (!preset) {
        return err({
          type: 'PRESET_NOT_FOUND',
          presetName: defaultPreset,
        } as const);
      }

      return validatePresetPool(preset, modelsConfig.models, defaultPreset).map(() => {
        const resolvedConfig: ResolvedConfig = {
          limits,
          timeouts,
          preset,
          presetName: defaultPreset,
        };
        return resolvedConfig;
      });
    }
  );
};
