import { Result, ResultAsync, err, ok } from 'neverthrow';
import type { ModelPreset, ModelConfig, ResolvedConfig } from './schemas.js';
import { AGENT_TYPES } from './schemas.js';
import type { ConfigValidationError } from './types.js';
import { configUtils, modelConfigEquals, formatModelConfig } from './io.js';

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
 * Gets the default preset name from the bluprint config.
 *
 * @returns ResultAsync containing the default preset name (or undefined if not set) or a ConfigValidationError
 */
export const getDefaultPresetName = (): ResultAsync<string | undefined, ConfigValidationError> => {
  return configUtils.bluprint.read().map((config) => config.defaultPreset);
};

/**
 * Resolves and validates the configuration with a specific preset.
 *
 * @param presetName - The name of the preset to use
 * @returns ResultAsync containing the resolved configuration or a ConfigValidationError
 */
export const resolveConfigWithPreset = (
  presetName: string
): ResultAsync<ResolvedConfig, ConfigValidationError> => {
  return ResultAsync.combine([configUtils.bluprint.read(), configUtils.models.read()]).andThen(
    ([bluprintConfig, modelsConfig]) => {
      const { limits, timeouts } = bluprintConfig;

      const preset = modelsConfig.presets[presetName];

      if (!preset) {
        return err({
          type: 'PRESET_NOT_FOUND',
          presetName,
        } as const);
      }

      return validatePresetPool(preset, modelsConfig.models, presetName).map(() => {
        const resolvedConfig: ResolvedConfig = {
          limits,
          timeouts,
          preset,
          presetName,
        };
        return resolvedConfig;
      });
    }
  );
};

/**
 * Formats a configuration error into a user-friendly message.
 *
 * @param error - The ConfigValidationError to format
 * @returns A string describing the error
 */
export const formatConfigError = (error: ConfigValidationError): string => {
  switch (error.type) {
    case 'CONFIG_FILE_MISSING':
      return `Configuration file not found: ${error.file}`;
    case 'CONFIG_FILE_READ_ERROR':
      return `Failed to read configuration file ${error.file}: ${error.message}`;
    case 'CONFIG_FILE_INVALID_JSON':
      return `Invalid JSON in ${error.file}: ${error.message}`;
    case 'CONFIG_SCHEMA_INVALID':
      return `Invalid configuration in ${error.file}: ${error.message}`;
    case 'PRESET_NOT_FOUND':
      return `Model preset "${error.presetName}" not found in models.json`;
    case 'MODEL_NOT_IN_POOL':
      return `Preset "${error.presetName}" uses model ${formatModelConfig(error.model)} for ${error.agentType}, but it's not in the models pool`;
    default:
      const exhaustiveCheck: never = error;
      return exhaustiveCheck;
  }
};
