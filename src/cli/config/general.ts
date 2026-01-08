import { ResultAsync, ok, err, Result } from 'neverthrow';
import type { BluprintConfig, GeneralConfig, GeneralConfigKey } from '../../config/index.js';
import {
  readGeneralConfig,
  configUtils,
  GENERAL_CONFIG_KEYS,
  DEFAULT_GENERAL_CONFIG,
  ensureConfigDir,
} from '../../config/index.js';
import type { ConfigValidationError } from '../../config/index.js';
import { exit } from '../../exit.js';

export type GeneralConfigCliError =
  | { type: 'UNKNOWN_KEY'; key: string }
  | { type: 'INVALID_VALUE'; key: string; value: string }
  | { type: 'RESET_USAGE_ERROR'; message: string };

/**
 * Parses and validates a string as a GeneralConfigKey.
 *
 * @param key - The string to parse as a config key.
 * @returns A Result containing the validated GeneralConfigKey on success, or an UNKNOWN_KEY error.
 */
function parseKey(key: string): Result<GeneralConfigKey, GeneralConfigCliError> {
  if (GENERAL_CONFIG_KEYS.includes(key as GeneralConfigKey)) {
    return ok(key as GeneralConfigKey);
  }
  return err({ type: 'UNKNOWN_KEY', key });
}

/**
 * Parses a string as a positive integer for a config key.
 *
 * Validates that the string represents a positive safe integer.
 *
 * @param key - The config key this value is for (used in error messages).
 * @param raw - The raw string value to parse.
 * @returns A Result containing the parsed number on success, or an INVALID_VALUE error.
 */
function parsePositiveInt(
  key: GeneralConfigKey,
  raw: string
): Result<number, GeneralConfigCliError> {
  const isInt = /^\d+$/.test(raw);
  if (!isInt) {
    return err({ type: 'INVALID_VALUE', key, value: raw });
  }

  const parsed = Number.parseInt(raw, 10);

  if (parsed <= 0 || !Number.isSafeInteger(parsed)) {
    return err({ type: 'INVALID_VALUE', key, value: raw });
  }

  return ok(parsed);
}

/**
 * Gets the default value for a general config key.
 *
 * @param key - The config key to get the default value for.
 * @returns The default numeric value for the specified key.
 */
function getDefaultForKey(key: GeneralConfigKey): number {
  const [section, field] = key.split('.') as ['limits' | 'timeouts', string];
  return DEFAULT_GENERAL_CONFIG[section][
    field as keyof (typeof DEFAULT_GENERAL_CONFIG)[typeof section]
  ];
}

/**
 * Gets the current value for a config key from a GeneralConfig object.
 *
 * @param key - The config key to retrieve (e.g., 'limits.maxIterations').
 * @param config - The GeneralConfig object to read from.
 * @returns The numeric value for the specified key.
 */
function getConfigValue(key: GeneralConfigKey, config: GeneralConfig): number {
  const [section, field] = key.split('.') as ['limits' | 'timeouts', string];
  return config[section][field as keyof (typeof config)[typeof section]];
}

/**
 * Creates a new BluprintConfig with an updated value for the specified key.
 *
 * Returns a new config object with the value set, leaving other fields unchanged.
 *
 * @param key - The config key to update (e.g., 'timeouts.codingAgentMin').
 * @param value - The new numeric value to set.
 * @param config - The existing BluprintConfig to update.
 * @returns A new BluprintConfig with the updated value.
 */
function setConfigValue(
  key: GeneralConfigKey,
  value: number,
  config: BluprintConfig
): BluprintConfig {
  const [section, field] = key.split('.') as ['limits' | 'timeouts', string];
  return {
    ...config,
    [section]: {
      ...config[section],
      [field]: value,
    },
  };
}

/**
 * Formats a ConfigValidationError into a human-readable error message.
 *
 * @param error - The config validation error to format.
 * @returns A user-friendly error message string.
 */
function formatConfigFileError(error: ConfigValidationError): string {
  switch (error.type) {
    case 'CONFIG_FILE_MISSING':
      return `Missing config file: ${error.file}`;
    case 'CONFIG_FILE_READ_ERROR':
      return `Failed to read bluprint config: ${error.message}`;
    case 'CONFIG_FILE_INVALID_JSON':
      return `Invalid JSON in bluprint.config.json: ${error.message}`;
    case 'CONFIG_SCHEMA_INVALID':
      return `Invalid bluprint config: ${error.message}`;
    default:
      return 'Unknown config file error';
  }
}

/**
 * Handles the "config show" CLI command.
 *
 * Displays all general config values in either JSON or human-readable format.
 * Exits the process after displaying.
 *
 * @param options - Command options.
 * @param options.json - If true, outputs config as formatted JSON; otherwise displays as key-value pairs.
 */
export async function handleConfigShow(options: { json: boolean }): Promise<void> {
  const result = await readGeneralConfig();

  if (result.isErr()) {
    console.error(formatConfigFileError(result.error));
    await exit(1);
    return;
  }

  const config = result.value;

  if (options.json) {
    console.log(JSON.stringify(config, null, 2));
  } else {
    console.log('General config:');
    console.log(`  ${GENERAL_CONFIG_KEYS[0]}: ${config.limits.maxIterations}`);
    console.log(`  ${GENERAL_CONFIG_KEYS[1]}: ${config.limits.maxTimeMinutes}`);
    console.log(`  ${GENERAL_CONFIG_KEYS[2]}: ${config.timeouts.codingAgentMin}`);
    console.log(`  ${GENERAL_CONFIG_KEYS[3]}: ${config.timeouts.masterAgentMin}`);
    console.log(`  ${GENERAL_CONFIG_KEYS[4]}: ${config.timeouts.planAgentMin}`);
    console.log(`  ${GENERAL_CONFIG_KEYS[5]}: ${config.timeouts.summarizerAgentMin}`);
    console.log(`  ${GENERAL_CONFIG_KEYS[6]}: ${config.timeouts.commitAgentMin}`);
  }

  await exit(0);
}

/**
 * Handles the "config get" CLI command.
 *
 * Retrieves and displays the value of a single config key.
 * Exits with error if the key is invalid.
 *
 * @param key - The config key to retrieve (e.g., 'limits.maxIterations').
 */
export async function handleConfigGet(key: string): Promise<void> {
  const keyResult = parseKey(key);
  if (keyResult.isErr()) {
    console.error(`Invalid config key: "${key}". Valid keys: ${GENERAL_CONFIG_KEYS.join(', ')}`);
    await exit(1);
    return;
  }

  const configResult = await readGeneralConfig();

  if (configResult.isErr()) {
    console.error(formatConfigFileError(configResult.error));
    await exit(1);
    return;
  }

  const value = getConfigValue(keyResult.value, configResult.value);
  console.log(value);

  await exit(0);
}

/**
 * Handles the "config set" CLI command.
 *
 * Updates a single config key to a new value. Creates the config file if it doesn't exist.
 * Validates that the key is known and the value is a positive integer.
 *
 * @param key - The config key to update (e.g., 'timeouts.codingAgentMin').
 * @param value - The new value as a string (must be a positive integer).
 */
export async function handleConfigSet(key: string, value: string): Promise<void> {
  const keyResult = parseKey(key);
  if (keyResult.isErr()) {
    console.error(`Invalid config key: "${key}". Valid keys: ${GENERAL_CONFIG_KEYS.join(', ')}`);
    await exit(1);
    return;
  }

  const valueResult = parsePositiveInt(keyResult.value, value);
  if (valueResult.isErr()) {
    console.error(`Invalid value for ${key}: "${value}". Expected a positive integer.`);
    await exit(1);
    return;
  }

  const ensureDirResult = await ensureConfigDir();
  if (ensureDirResult.isErr()) {
    console.error('Failed to ensure config directory exists');
    await exit(1);
    return;
  }

  const configResult = await configUtils.bluprint.read();
  let config: BluprintConfig;

  if (configResult.isOk()) {
    config = configResult.value;
  } else if (configResult.error.type === 'CONFIG_FILE_MISSING') {
    config = {
      ...DEFAULT_GENERAL_CONFIG,
    };
  } else {
    console.error(formatConfigFileError(configResult.error));
    await exit(1);
    return;
  }

  config = setConfigValue(keyResult.value, valueResult.value, config);

  const writeResult = await configUtils.bluprint.write(config);
  if (writeResult.isErr()) {
    const error = writeResult.error;
    const errorMessage = 'message' in error ? error.message : String(error);
    console.error(`Failed to write bluprint config: ${errorMessage}`);
    await exit(1);
    return;
  }

  console.log(`Updated ${key} to ${value}.`);

  await exit(0);
}

/**
 * Handles the "config reset" CLI command.
 *
 * Resets config values to their defaults. Can reset a single key or all keys with --all.
 * Requires an existing config file; errors if none exists.
 *
 * @param key - The config key to reset, or undefined if using --all.
 * @param options - Command options.
 * @param options.all - If true, resets all general config keys to defaults.
 */
export async function handleConfigReset(
  key: string | undefined,
  options: { all: boolean }
): Promise<void> {
  if (options.all && key !== undefined) {
    console.error('--all cannot be used with a config key.');
    await exit(1);
    return;
  }

  if (!options.all && key === undefined) {
    console.error(
      "Missing config key. Use 'bluprint config reset <key>' or 'bluprint config reset --all'."
    );
    await exit(1);
    return;
  }

  const ensureDirResult = await ensureConfigDir();
  if (ensureDirResult.isErr()) {
    console.error('Failed to ensure config directory exists');
    await exit(1);
    return;
  }

  const configResult = await configUtils.bluprint.read();
  let config: BluprintConfig;

  if (configResult.isOk()) {
    config = configResult.value;
  } else if (configResult.error.type === 'CONFIG_FILE_MISSING') {
    console.error(
      "No bluprint.config.json found. Run 'bluprint config presets default <name>' first."
    );
    await exit(1);
    return;
  } else {
    console.error(formatConfigFileError(configResult.error));
    await exit(1);
    return;
  }

  if (options.all) {
    config = {
      ...DEFAULT_GENERAL_CONFIG,
      defaultPreset: config.defaultPreset,
    };
    console.log('Reset general config to defaults.');
  } else {
    const keyResult = parseKey(key!);
    if (keyResult.isErr()) {
      console.error(`Invalid config key: "${key}". Valid keys: ${GENERAL_CONFIG_KEYS.join(', ')}`);
      await exit(1);
      return;
    }

    const defaultValue = getDefaultForKey(keyResult.value);
    config = setConfigValue(keyResult.value, defaultValue, config);
    console.log(`Reset ${key} to default (${defaultValue}).`);
  }

  const writeResult = await configUtils.bluprint.write(config);
  if (writeResult.isErr()) {
    const error = writeResult.error;
    const errorMessage = 'message' in error ? error.message : String(error);
    console.error(`Failed to write bluprint config: ${errorMessage}`);
    await exit(1);
    return;
  }

  await exit(0);
}
