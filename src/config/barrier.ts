import { resolveConfig } from './validate.js';
import type { ConfigValidationError } from './types.js';
import { formatModelConfig } from './io.js';
import { ResultAsync } from 'neverthrow';
import type { ResolvedConfig } from './schemas.js';

function formatConfigError(error: ConfigValidationError): string {
  switch (error.type) {
    case 'CONFIG_FILE_MISSING':
      return `Configuration file not found: ${error.file}`;
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
}

export function enforceConfigBarrier(): ResultAsync<ResolvedConfig, never> {
  return ResultAsync.fromPromise(
    (async () => {
      const result = await resolveConfig();

      if (result.isErr()) {
        const errorMessage = formatConfigError(result.error);
        console.error('Error: Bluprint configuration is invalid.');
        console.error('');
        console.error(errorMessage);
        console.error('');
        console.error("Run 'bluprint config --help' to set up your configuration.");
        process.exit(1);
      }

      return result.value;
    })(),
    () => {
      process.exit(1);
    }
  );
}
