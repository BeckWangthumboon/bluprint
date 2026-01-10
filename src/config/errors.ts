import type { AgentType, ModelConfig } from './schemas.js';
import { formatModelConfig } from './io.js';

/**
 * Errors that can occur when reading or validating configuration files.
 */
export type ConfigValidationError =
  | { type: 'CONFIG_FILE_MISSING'; file: string }
  | { type: 'CONFIG_FILE_READ_ERROR'; file: string; message: string }
  | { type: 'CONFIG_FILE_INVALID_JSON'; file: string; message: string }
  | { type: 'CONFIG_SCHEMA_INVALID'; file: string; message: string }
  | { type: 'PRESET_NOT_FOUND'; presetName: string }
  | { type: 'MODEL_NOT_IN_POOL'; presetName: string; agentType: AgentType; model: ModelConfig };

/**
 * Error indicating that a preset is required but not specified.
 */
export type PresetRequiredError = {
  type: 'PRESET_REQUIRED';
  message: string;
};

/**
 * Union of all errors that can occur when resolving runtime configuration.
 */
export type ResolveConfigError = ConfigValidationError | PresetRequiredError;

/**
 * Formats a ConfigValidationError into a human-readable string message.
 *
 * @param error - The error to format
 * @returns A formatted error message string
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
    default: {
      const exhaustiveCheck: never = error;
      return exhaustiveCheck;
    }
  }
};

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
