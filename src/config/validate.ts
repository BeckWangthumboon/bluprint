import { ResultAsync, err, ok } from 'neverthrow';
import type { ModelPreset, ModelConfig, ResolvedConfig } from './schemas.js';
import { AGENT_TYPES } from './schemas.js';
import type { ConfigValidationError } from './types.js';
import { readBluprintConfig, readModelsConfig, modelConfigEquals } from './io.js';

export const validatePreset = (
  preset: ModelPreset,
  models: ModelConfig[],
  presetName: string
): ConfigValidationError | null => {
  for (const agentType of AGENT_TYPES) {
    const modelConfig = preset[agentType];
    const isInPool = models.some((poolModel) => modelConfigEquals(poolModel, modelConfig));

    if (!isInPool) {
      return {
        type: 'MODEL_NOT_IN_POOL',
        presetName,
        agentType,
        model: modelConfig,
      };
    }
  }

  return null;
};

export const resolveConfig = (): ResultAsync<ResolvedConfig, ConfigValidationError> => {
  return ResultAsync.combine([readBluprintConfig(), readModelsConfig()]).andThen(
    ([bluprintConfig, modelsConfig]) => {
      const { defaultPreset, limits, timeouts } = bluprintConfig;
      const preset = modelsConfig.presets[defaultPreset];

      if (!preset) {
        return err({
          type: 'PRESET_NOT_FOUND',
          presetName: defaultPreset,
        } as const);
      }

      const validationError = validatePreset(preset, modelsConfig.models, defaultPreset);
      if (validationError) {
        return err(validationError);
      }

      return ok({
        limits,
        timeouts,
        preset,
        presetName: defaultPreset,
      });
    }
  );
};
