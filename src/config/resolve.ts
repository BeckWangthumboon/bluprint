import { ResultAsync, err } from 'neverthrow';
import type { ResolvedConfig } from './schemas.js';
import type { ConfigValidationError } from './types.js';
import { resolveConfigWithPreset, getDefaultPresetName, formatConfigError } from './validate.js';

export type PresetRequiredError = {
  type: 'PRESET_REQUIRED';
  message: string;
};

export type ResolveConfigError = ConfigValidationError | PresetRequiredError;

/**
 * Formats a ResolveConfigError into a human-readable string message.
 *
 * @param error - The error to format
 * @returns A formatted error message string
 */
export const formatResolveError = (error: ResolveConfigError): string => {
  if (error.type === 'PRESET_REQUIRED') {
    return error.message;
  }
  return formatConfigError(error);
};

/**
 * Resolves the runtime configuration by attempting to use a preset.
 *
 * If a presetOverride is provided, it will be used directly. Otherwise, the function
 * will attempt to use the default preset name. If no default preset is configured,
 * it returns an error indicating that a preset is required.
 *
 * @param presetOverride - Optional preset name to override the default preset
 * @returns A ResultAsync containing either the resolved config or a ResolveConfigError
 */
export const resolveRuntimeConfig = (
  presetOverride?: string
): ResultAsync<ResolvedConfig, ResolveConfigError> => {
  if (presetOverride) {
    return resolveConfigWithPreset(presetOverride).mapErr((e) => e as ResolveConfigError);
  }

  return getDefaultPresetName().andThen((defaultPreset) => {
    if (defaultPreset) {
      return resolveConfigWithPreset(defaultPreset).mapErr((e) => e as ResolveConfigError);
    }

    return err({
      type: 'PRESET_REQUIRED',
      message:
        'No preset specified. Set a default with `bluprint config presets default` or use `--preset <name>`',
    } as const);
  });
};
