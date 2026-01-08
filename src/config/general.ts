import { ResultAsync, ok, err } from 'neverthrow';
import type { GeneralConfig } from './schemas.js';
import type { ConfigValidationError } from './types.js';
import { configUtils } from './io.js';
import { DEFAULT_GENERAL_CONFIG } from './defaults.js';

export type GeneralConfigKey =
  | 'limits.maxIterations'
  | 'limits.maxTimeMinutes'
  | 'timeouts.codingAgentMs'
  | 'timeouts.masterAgentMs'
  | 'timeouts.planAgentMs'
  | 'timeouts.summarizerAgentMs'
  | 'timeouts.commitAgentMs';

export const GENERAL_CONFIG_KEYS: GeneralConfigKey[] = [
  'limits.maxIterations',
  'limits.maxTimeMinutes',
  'timeouts.codingAgentMs',
  'timeouts.masterAgentMs',
  'timeouts.planAgentMs',
  'timeouts.summarizerAgentMs',
  'timeouts.commitAgentMs',
];

export const readGeneralConfig = (): ResultAsync<GeneralConfig, ConfigValidationError> => {
  return configUtils.bluprint
    .read()
    .map(
      (bluprintConfig): GeneralConfig => ({
        limits: bluprintConfig.limits,
        timeouts: bluprintConfig.timeouts,
      })
    )
    .orElse((error) => {
      if (error.type === 'CONFIG_FILE_MISSING') {
        return ok(DEFAULT_GENERAL_CONFIG);
      }
      return err(error);
    });
};
