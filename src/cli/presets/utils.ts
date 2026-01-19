import * as p from '@clack/prompts';
import type {
  AgentType,
  BluprintConfig,
  ModelConfig,
  ModelPreset,
  ModelsConfig,
} from '../../config/index.js';
import {
  AGENT_TYPES,
  configUtils,
  ensureConfigDir,
  formatModelConfig,
  validatePresetPool,
} from '../../config/index.js';
import { exit } from '../../exit.js';
import type { ModelValidationStatus } from '../shared/utils.js';

/**
 * Parses a provider/model string into a ModelConfig.
 *
 * @param value - Raw model reference string.
 * @returns Parsed model config or null if invalid.
 */
const parseModelReference = (value: string): ModelConfig | null => {
  const parts = value
    .trim()
    .split('/')
    .map((part) => part.trim());
  if (parts.length !== 2) {
    return null;
  }
  const [providerID, modelID] = parts;
  if (!providerID || !modelID) {
    return null;
  }
  return { providerID, modelID };
};

/**
 * Parses CLI model flags into a partial preset.
 *
 * @param values - Raw model values keyed by agent type.
 * @returns Parsed preset values and invalid inputs.
 */
const parsePresetModelArgs = (
  values: Partial<Record<AgentType, string>>
): { preset: Partial<ModelPreset>; invalid: Array<{ agentType: AgentType; value: string }> } => {
  const preset: Partial<ModelPreset> = {};
  const invalid: Array<{ agentType: AgentType; value: string }> = [];

  for (const agentType of AGENT_TYPES) {
    const rawValue = values[agentType];
    if (!rawValue) {
      continue;
    }
    const parsed = parseModelReference(rawValue);
    if (!parsed) {
      invalid.push({ agentType, value: rawValue });
      continue;
    }
    preset[agentType] = parsed;
  }

  return { preset, invalid };
};

/**
 * Builds selection options for preset names.
 *
 * @param presets - Preset definitions keyed by name.
 * @returns Options suitable for selection prompts.
 */
const buildPresetOptions = (
  presets: Record<string, ModelPreset>
): Array<{ value: string; label: string }> => {
  return Object.keys(presets)
    .map((presetName) => ({
      value: presetName,
      label: presetName,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

const reportError = (usePrompts: boolean, message: string): void => {
  if (usePrompts) {
    p.note(message, 'Error');
  } else {
    console.error(message);
  }
};

const reportWarning = (usePrompts: boolean, message: string): void => {
  if (usePrompts) {
    p.note(message, 'Warning');
  } else {
    console.warn(message);
  }
};

const reportInfo = (usePrompts: boolean, message: string): void => {
  if (usePrompts) {
    p.log.message(message);
  } else {
    console.log(message);
  }
};

const reportOutro = (usePrompts: boolean, message: string): void => {
  if (usePrompts) {
    p.outro(message);
  } else {
    console.log(message);
  }
};

/**
 * Ensures the config directory exists, exiting on failure.
 *
 * @param options - Configuration options.
 * @param options.usePrompts - Whether to use prompt-friendly output.
 * @returns True when the directory exists.
 */
const ensureConfigDirOrExit = async (options: { usePrompts: boolean }): Promise<boolean> => {
  const ensureDirResult = await ensureConfigDir();
  if (ensureDirResult.isErr()) {
    reportError(options.usePrompts, 'Failed to ensure config directory exists');
    await exit(1);
    return false;
  }
  return true;
};

/**
 * Reads the bluprint config, returning missing info when absent.
 *
 * @param options - Configuration options.
 * @param options.usePrompts - Whether to use prompt-friendly output.
 * @returns The bluprint config, missing flag, or null on fatal error.
 */
const readBluprintConfigOrExit = async (options: {
  usePrompts: boolean;
}): Promise<{ config: BluprintConfig | undefined; missing: boolean } | null> => {
  const bluprintConfigResult = await configUtils.bluprint.read();
  if (bluprintConfigResult.isOk()) {
    return { config: bluprintConfigResult.value, missing: false };
  }
  if (bluprintConfigResult.error.type === 'CONFIG_FILE_MISSING') {
    return { config: undefined, missing: true };
  }
  reportError(options.usePrompts, 'Failed to read bluprint config');
  await exit(1);
  return null;
};

/**
 * Writes models config to disk, exiting on failure.
 *
 * @param config - Models config to write.
 * @param options - Configuration options.
 * @param options.usePrompts - Whether to use prompt-friendly output.
 * @param options.errorMessage - Optional override for error messaging.
 * @returns True when the write succeeds.
 */
const writeModelsConfigOrExit = async (
  config: ModelsConfig,
  options: { usePrompts: boolean; errorMessage?: string }
): Promise<boolean> => {
  const writeResult = await configUtils.models.write(config);
  if (writeResult.isErr()) {
    reportError(options.usePrompts, options.errorMessage ?? 'Failed to write config');
    await exit(1);
    return false;
  }
  return true;
};

/**
 * Writes bluprint config to disk, exiting on failure.
 *
 * @param config - Bluprint config to write.
 * @param options - Configuration options.
 * @param options.usePrompts - Whether to use prompt-friendly output.
 * @param options.errorMessage - Optional override for error messaging.
 * @returns True when the write succeeds.
 */
const writeBluprintConfigOrExit = async (
  config: BluprintConfig,
  options: { usePrompts: boolean; errorMessage?: string }
): Promise<boolean> => {
  const writeResult = await configUtils.bluprint.write(config);
  if (writeResult.isErr()) {
    reportError(options.usePrompts, options.errorMessage ?? 'Failed to write bluprint config');
    await exit(1);
    return false;
  }
  return true;
};

/**
 * Removes a preset and persists updates, clearing default preset when needed.
 *
 * @param presetName - Preset name to remove.
 * @param config - Current models config.
 * @param options - Configuration options.
 * @param options.usePrompts - Whether to use prompt-friendly output.
 * @returns Removal result or null if the process exits on error.
 */
const removePresetAndPersist = async (
  presetName: string,
  config: ModelsConfig,
  options: { usePrompts: boolean }
): Promise<{ clearedDefaultPreset: boolean } | null> => {
  const remainingPresets = { ...config.presets };
  delete remainingPresets[presetName];

  const ensured = await ensureConfigDirOrExit({ usePrompts: options.usePrompts });
  if (!ensured) {
    return null;
  }

  const bluprintConfigResult = await readBluprintConfigOrExit({
    usePrompts: options.usePrompts,
  });
  if (!bluprintConfigResult) {
    return null;
  }

  const bluprintConfig = bluprintConfigResult.config;
  let clearedDefaultPreset = false;

  if (bluprintConfig?.defaultPreset === presetName) {
    const updatedBluprintConfig: BluprintConfig = {
      ...bluprintConfig,
      defaultPreset: undefined,
    };
    const cleared = await writeBluprintConfigOrExit(updatedBluprintConfig, {
      usePrompts: options.usePrompts,
      errorMessage: 'Failed to clear default preset',
    });
    if (!cleared) {
      return null;
    }
    clearedDefaultPreset = true;
  }

  const updatedConfig: ModelsConfig = {
    ...config,
    presets: remainingPresets,
  };

  const writeResult = await configUtils.models.write(updatedConfig);
  if (writeResult.isErr()) {
    if (clearedDefaultPreset && bluprintConfig) {
      const rollbackResult = await configUtils.bluprint.write(bluprintConfig);
      if (rollbackResult.isErr()) {
        reportError(options.usePrompts, 'Failed to write config and restore default preset');
      } else {
        reportError(options.usePrompts, 'Failed to write config');
      }
    } else {
      reportError(options.usePrompts, 'Failed to write config');
    }
    await exit(1);
    return null;
  }

  return { clearedDefaultPreset };
};

/**
 * Persists a preset to the config file (used for both add and update).
 *
 * Validates the preset, writes to config, and exits the process.
 *
 * @param presetName - The name of the preset.
 * @param preset - The ModelPreset configuration.
 * @param config - The existing models config.
 * @param action - Whether this is an 'Added' or 'Updated' operation (for messaging).
 * @param options - Configuration options.
 * @param options.usePrompts - Whether to use prompt-friendly output.
 * @returns Resolves when the operation completes.
 */
const persistPreset = async (
  presetName: string,
  preset: ModelPreset,
  config: ModelsConfig,
  action: 'Added' | 'Updated',
  options: { usePrompts: boolean }
): Promise<void> => {
  const validation = validatePresetPool(preset, config.models, presetName);
  if (validation.isErr()) {
    const error = validation.error;
    reportError(options.usePrompts, `Preset validation failed: ${error.type}`);
    await exit(1);
    return;
  }

  const updatedConfig: ModelsConfig = {
    ...config,
    presets: {
      ...config.presets,
      [presetName]: preset,
    },
  };

  const ensured = await ensureConfigDirOrExit({ usePrompts: options.usePrompts });
  if (!ensured) {
    return;
  }

  const wrote = await writeModelsConfigOrExit(updatedConfig, { usePrompts: options.usePrompts });
  if (!wrote) {
    return;
  }

  reportInfo(options.usePrompts, `${action} preset "${presetName}":`);
  for (const agentType of AGENT_TYPES) {
    reportInfo(options.usePrompts, `  ${agentType}: ${formatModelConfig(preset[agentType])}`);
  }

  reportOutro(options.usePrompts, 'Done!');
  await exit(0);
};

/**
 * Builds a summary status for a preset based on per-model validation.
 *
 * @param preset - The preset to evaluate.
 * @param statusMap - Validation status keyed by model reference.
 * @returns Status object with validity and reason list.
 */
const buildPresetStatus = (
  preset: ModelPreset,
  statusMap: Map<string, ModelValidationStatus>
): { valid: boolean; reasons: string[] } => {
  const reasons: string[] = [];
  const seen = new Set<string>();

  for (const agentType of AGENT_TYPES) {
    const model = preset[agentType];
    const modelKey = formatModelConfig(model);
    if (seen.has(modelKey)) {
      continue;
    }
    seen.add(modelKey);
    const status = statusMap.get(modelKey);
    if (!status) {
      continue;
    }

    if (!status.inPool && status.validInOpenCode === false) {
      reasons.push(`${modelKey} is not in pool, invalid`);
      continue;
    }
    if (!status.inPool) {
      reasons.push(`${modelKey} is not in pool`);
      continue;
    }
    if (status.validInOpenCode === false) {
      reasons.push(`${modelKey} is invalid`);
    }
  }

  return { valid: reasons.length === 0, reasons };
};

export {
  buildPresetOptions,
  buildPresetStatus,
  ensureConfigDirOrExit,
  parseModelReference,
  parsePresetModelArgs,
  persistPreset,
  readBluprintConfigOrExit,
  removePresetAndPersist,
  reportError,
  reportInfo,
  reportOutro,
  reportWarning,
  writeBluprintConfigOrExit,
  writeModelsConfigOrExit,
};
