import { ok, err, Result } from 'neverthrow';
import type { BluprintConfig, GeneralConfigKey, GeneralConfigValue } from '../../config/index.js';
import {
  readGeneralConfig,
  configUtils,
  GENERAL_CONFIG_KEYS,
  CONFIG_KEYS,
  DEFAULT_GENERAL_CONFIG,
  ensureConfigDir,
  getDefaultForKey,
  getConfigValue,
  setConfigValue,
  formatConfigError,
} from '../../config/index.js';
import type { ConfigValidationError } from '../../config/index.js';
import { exit } from '../../exit.js';

export type GeneralConfigCliError =
  | { type: 'UNKNOWN_KEY'; key: string }
  | { type: 'INVALID_VALUE'; key: string; value: string; message: string }
  | { type: 'RESET_USAGE_ERROR'; message: string };

type InvalidValueError = Extract<GeneralConfigCliError, { type: 'INVALID_VALUE' }>;

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
 * Parses a raw CLI value using the Zod schema for the given key.
 *
 * @param key - The config key to parse a value for.
 * @param raw - The raw string value from the CLI.
 * @returns A Result containing the parsed value on success, or an INVALID_VALUE error.
 */
function parseConfigValue(
  key: GeneralConfigKey,
  raw: string
): Result<GeneralConfigValue, InvalidValueError> {
  const { schema } = CONFIG_KEYS[key];
  const result = schema.safeParse(raw);

  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Invalid value';
    return err({ type: 'INVALID_VALUE', key, value: raw, message });
  }

  return ok(result.data);
}

/**
 * Formats a ConfigValidationError into a CLI-friendly error message.
 *
 * Uses the centralized formatConfigError but filters to file-related errors only.
 *
 * @param error - The config validation error to format.
 * @returns A user-friendly error message string.
 */
function formatConfigFileError(error: ConfigValidationError): string {
  return formatConfigError(error);
}

/**
 * Handles the "config show" CLI command.
 *
 * Displays all general config values in either JSON or human-readable format.
 *
 * @param options - Command options.
 * @param options.json - If true, outputs config as formatted JSON.
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
    for (const key of GENERAL_CONFIG_KEYS) {
      const value = getConfigValue(key, config);
      console.log(`  ${key}: ${value}`);
    }
  }

  await exit(0);
}

/**
 * Handles the "config get" CLI command.
 *
 * Retrieves and displays the value of a single config key.
 *
 * @param key - The config key to retrieve.
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
 *
 * @param key - The config key to update.
 * @param value - The new value as a string.
 */
export async function handleConfigSet(key: string, value: string): Promise<void> {
  const keyResult = parseKey(key);
  if (keyResult.isErr()) {
    console.error(`Invalid config key: "${key}". Valid keys: ${GENERAL_CONFIG_KEYS.join(', ')}`);
    await exit(1);
    return;
  }

  const validatedKey = keyResult.value;
  const valueResult = parseConfigValue(validatedKey, value);
  if (valueResult.isErr()) {
    console.error(`Invalid value for ${key}: "${value}". ${valueResult.error.message}`);
    await exit(1);
    return;
  }
  const parsedValue = valueResult.value;

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

  config = setConfigValue(validatedKey, parsedValue, config);

  const writeResult = await configUtils.bluprint.write(config);
  if (writeResult.isErr()) {
    const error = writeResult.error;
    const errorMessage = 'message' in error ? error.message : String(error);
    console.error(`Failed to write bluprint config: ${errorMessage}`);
    await exit(1);
    return;
  }

  console.log(`Updated ${key} to ${String(parsedValue)}.`);

  await exit(0);
}

/**
 * Handles the "config reset" CLI command.
 *
 * Resets config values to their defaults. Can reset a single key or all keys with --all.
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
