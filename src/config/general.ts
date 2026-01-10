import { z } from 'zod';
import { ResultAsync, ok, err } from 'neverthrow';
import type { GeneralConfig, TimeoutsConfig, AgentType, BluprintConfig } from './schemas.js';
import { PositiveIntFromStringSchema, NonEmptyStringSchema } from './schemas.js';
import type { ConfigValidationError } from './errors.js';
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
  'specFile',
] as const;

export type GeneralConfigKey = (typeof GENERAL_CONFIG_KEYS)[number];

export type GeneralConfigValue = number | string;

export type ConfigKeyDef = {
  path: readonly string[];
  schema: z.ZodType<GeneralConfigValue>;
};

/**
 * Static map of config keys to their path and validation schema.
 *
 * This is the single source of truth for how each key is accessed and parsed.
 * TypeScript ensures all GeneralConfigKey values are covered.
 */
export const CONFIG_KEYS: Record<GeneralConfigKey, ConfigKeyDef> = {
  'limits.maxIterations': {
    path: ['limits', 'maxIterations'],
    schema: PositiveIntFromStringSchema,
  },
  'limits.maxTimeMinutes': {
    path: ['limits', 'maxTimeMinutes'],
    schema: PositiveIntFromStringSchema,
  },
  'timeouts.codingAgentMin': {
    path: ['timeouts', 'codingAgentMin'],
    schema: PositiveIntFromStringSchema,
  },
  'timeouts.masterAgentMin': {
    path: ['timeouts', 'masterAgentMin'],
    schema: PositiveIntFromStringSchema,
  },
  'timeouts.planAgentMin': {
    path: ['timeouts', 'planAgentMin'],
    schema: PositiveIntFromStringSchema,
  },
  'timeouts.summarizerAgentMin': {
    path: ['timeouts', 'summarizerAgentMin'],
    schema: PositiveIntFromStringSchema,
  },
  'timeouts.commitAgentMin': {
    path: ['timeouts', 'commitAgentMin'],
    schema: PositiveIntFromStringSchema,
  },
  specFile: {
    path: ['specFile'],
    schema: NonEmptyStringSchema,
  },
};

/**
 * Reads a config value using a path derived from the config key.
 *
 * @param config - The GeneralConfig object to read from.
 * @param path - The path segments to traverse (e.g., ['limits', 'maxIterations']).
 * @returns The value at the specified path.
 * @throws Error if the path does not exist in the config.
 */
export function getValueFromPath(
  config: GeneralConfig,
  path: readonly string[]
): GeneralConfigValue {
  let current: unknown = config;

  for (const segment of path) {
    if (current === null || typeof current !== 'object') {
      throw new Error(`Invalid config path: ${path.join('.')}`);
    }
    const record = current as Record<string, unknown>;
    if (!(segment in record)) {
      throw new Error(`Invalid config path: ${path.join('.')}`);
    }
    current = record[segment];
  }

  return current as GeneralConfigValue;
}

/**
 * Returns a new config object with a value set at the specified path.
 *
 * Creates shallow copies at each level to maintain immutability.
 *
 * @param target - The config object to update.
 * @param path - The path segments to traverse.
 * @param value - The value to set at the path.
 * @returns A new config object with the value set.
 * @throws Error if the path does not exist in the config.
 */
export function setValueAtPath(
  target: Record<string, unknown>,
  path: readonly string[],
  value: GeneralConfigValue
): Record<string, unknown> {
  if (path.length === 0) {
    return target;
  }

  const [segment, ...rest] = path;
  if (!segment) {
    return target;
  }

  if (rest.length === 0) {
    return { ...target, [segment]: value };
  }

  const current = target[segment];
  if (current === null || typeof current !== 'object') {
    throw new Error(`Invalid config path: ${path.join('.')}`);
  }

  return {
    ...target,
    [segment]: setValueAtPath(current as Record<string, unknown>, rest, value),
  };
}

/**
 * Gets the default value for a general config key.
 *
 * @param key - The config key to get the default value for.
 * @returns The default value for the specified key.
 */
export function getDefaultForKey(key: GeneralConfigKey): GeneralConfigValue {
  return getValueFromPath(DEFAULT_GENERAL_CONFIG, CONFIG_KEYS[key].path);
}

/**
 * Gets the current value for a config key from a GeneralConfig object.
 *
 * @param key - The config key to retrieve.
 * @param config - The GeneralConfig object to read from.
 * @returns The value for the specified key.
 */
export function getConfigValue(key: GeneralConfigKey, config: GeneralConfig): GeneralConfigValue {
  return getValueFromPath(config, CONFIG_KEYS[key].path);
}

/**
 * Creates a new BluprintConfig with an updated value for the specified key.
 *
 * @param key - The config key to update.
 * @param value - The new value to set.
 * @param config - The existing BluprintConfig to update.
 * @returns A new BluprintConfig with the updated value.
 */
export function setConfigValue(
  key: GeneralConfigKey,
  value: GeneralConfigValue,
  config: BluprintConfig
): BluprintConfig {
  const { path } = CONFIG_KEYS[key];
  return setValueAtPath(config as Record<string, unknown>, path, value) as BluprintConfig;
}

/**
 * Converts a timeout value from minutes (as stored in config) to milliseconds.
 *
 * @param timeouts - The TimeoutsConfig object from resolved config
 * @param agent - The agent type: 'coding' | 'master' | 'plan' | 'summarizer' | 'commit'
 * @returns The timeout value in milliseconds
 */
export const getTimeoutMs = (timeouts: TimeoutsConfig, agent: AgentType): number => {
  const key = `${agent}AgentMin`;
  return timeouts[key] * 60 * 1000;
};

/**
 * Reads the general configuration from the bluprint config file.
 *
 * Extracts the limits, timeouts, and specFile from the bluprint config.
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
        specFile: bluprintConfig.specFile,
      })
    )
    .orElse((error) => {
      if (error.type === 'CONFIG_FILE_MISSING') {
        return ok(DEFAULT_GENERAL_CONFIG);
      }
      return err(error);
    });
};
