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

function parseKey(key: string): Result<GeneralConfigKey, GeneralConfigCliError> {
  if (GENERAL_CONFIG_KEYS.includes(key as GeneralConfigKey)) {
    return ok(key as GeneralConfigKey);
  }
  return err({ type: 'UNKNOWN_KEY', key });
}

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

function getDefaultForKey(key: GeneralConfigKey): number {
  const [section, field] = key.split('.') as ['limits' | 'timeouts', string];
  return DEFAULT_GENERAL_CONFIG[section][
    field as keyof (typeof DEFAULT_GENERAL_CONFIG)[typeof section]
  ];
}

function getConfigValue(key: GeneralConfigKey, config: GeneralConfig): number {
  const [section, field] = key.split('.') as ['limits' | 'timeouts', string];
  return config[section][field as keyof (typeof config)[typeof section]];
}

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
    console.log(`  ${GENERAL_CONFIG_KEYS[2]}: ${config.timeouts.codingAgentMs}`);
    console.log(`  ${GENERAL_CONFIG_KEYS[3]}: ${config.timeouts.masterAgentMs}`);
    console.log(`  ${GENERAL_CONFIG_KEYS[4]}: ${config.timeouts.planAgentMs}`);
    console.log(`  ${GENERAL_CONFIG_KEYS[5]}: ${config.timeouts.summarizerAgentMs}`);
    console.log(`  ${GENERAL_CONFIG_KEYS[6]}: ${config.timeouts.commitAgentMs}`);
  }

  await exit(0);
}

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
      defaultPreset: '',
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
