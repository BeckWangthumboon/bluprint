import { ResultAsync, err } from 'neverthrow';
import type { ResolvedConfig } from './schemas.js';
import type { ConfigValidationError } from './types.js';
import { resolveConfigWithPreset, getDefaultPresetName, formatConfigError } from './validate.js';

export type PresetRequiredError = {
  type: 'PRESET_REQUIRED';
  message: string;
};

export type ResolveConfigError = ConfigValidationError | PresetRequiredError;

export const formatResolveError = (error: ResolveConfigError): string => {
  if (error.type === 'PRESET_REQUIRED') {
    return error.message;
  }
  return formatConfigError(error);
};

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

    return ResultAsync.fromSafePromise(
      Promise.reject({
        type: 'PRESET_REQUIRED',
        message:
          'No preset specified. Set a default with bluprint config presets default or use --preset <name>',
      } satisfies PresetRequiredError)
    );
  });
};
