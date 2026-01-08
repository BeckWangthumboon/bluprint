import { ResultAsync, ok, err } from 'neverthrow';
import type { GeneralConfig, TimeoutsConfig, AgentType } from './schemas.js';
import type { ConfigValidationError } from './types.js';
import { configUtils } from './io.js';
import { DEFAULT_GENERAL_CONFIG } from './defaults.js';

export const GENERAL_CONFIG_KEYS = [
  'limits.maxIterations',
  'limits.maxTimeMinutes',
  'timeouts.codingAgentMin',
  'timeouts.masterAgentMin',
  'timeouts.planAgentMin',
  'timeouts.summarizerAgentMin',
  'timeouts.commitAgentMin',
] as const;

export type GeneralConfigKey = (typeof GENERAL_CONFIG_KEYS)[number];

/**
 * Converts a timeout value from minutes (as stored in config) to milliseconds.
 *
 * @param timeouts - The TimeoutsConfig object from resolved config
 * @param agent - The agent type: 'coding' | 'master' | 'plan' | 'summarizer' | 'commit'
 * @returns The timeout value in milliseconds
 */
export const getTimeoutMs = (timeouts: TimeoutsConfig, agent: AgentType): number => {
  const key = `${agent}AgentMin` as keyof TimeoutsConfig;
  return timeouts[key] * 60 * 1000;
};

/**
 * Reads the general configuration from the bluprint config file.
 *
 * Extracts the limits and timeouts sections from the bluprint config.
 * Returns default values if the config file is missing.
 *
 * @returns A ResultAsync containing the GeneralConfig on success, or a ConfigValidationError on failure.
 */
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
