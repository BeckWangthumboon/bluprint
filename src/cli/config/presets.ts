import * as p from '@clack/prompts';
import type { ModelConfig, ModelPreset, ModelsConfig } from '../../config/index.js';
import {
  AGENT_TYPES,
  formatModelConfig,
  validatePreset,
  configUtils,
  ensureConfigDir,
} from '../../config/index.js';
import { exit } from '../../exit.js';

const AGENT_TYPE_ORDER = AGENT_TYPES;

function buildModelOptions(models: ModelConfig[]): Array<{ value: string; label: string }> {
  return models
    .map((model) => ({
      value: formatModelConfig(model),
      label: formatModelConfig(model),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function parseModelSelection(value: string): ModelConfig {
  const parts = value.split('/');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { providerID: parts[0], modelID: parts[1] };
  }
  throw new Error(`Invalid model selection format: ${value}`);
}

function buildPresetOptions(
  presets: Record<string, ModelPreset>
): Array<{ value: string; label: string }> {
  return Object.keys(presets)
    .map((presetName) => ({
      value: presetName,
      label: presetName,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Reads the models config, exiting with an error if unavailable.
 *
 * Displays an error message and exits the process if the config file is missing or unreadable.
 *
 * @returns The models config, or null if an error occurred and the process is exiting.
 */
async function requireModelsConfig(): Promise<ModelsConfig | null> {
  const result = await configUtils.models.read();
  if (result.isErr()) {
    const error = result.error;
    const missingMsg = "No models.json found. Run 'bluprint config models add' first.";
    const errorMsg = 'Failed to read models config';
    const msg = error.type === 'CONFIG_FILE_MISSING' ? missingMsg : errorMsg;

    p.note(msg, 'Error');
    await exit(1);
    return null;
  }
  return result.value;
}

/**
 * Saves a new preset to the config file.
 *
 * Adds the preset to the existing config, validates it, and reports success or failure.
 * Exits the process on completion or error.
 *
 * @param presetName - The name of the preset to save.
 * @param preset - The ModelPreset configuration.
 * @param config - The existing models config.
 */
async function savePreset(
  presetName: string,
  preset: ModelPreset,
  config: ModelsConfig
): Promise<void> {
  const validation = validatePreset(preset, config.models, presetName);
  if (validation.isErr()) {
    const error = validation.error;
    p.note(`Preset validation failed: ${error.type}`, 'Error');
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

  const ensureDirResult = await ensureConfigDir();
  if (ensureDirResult.isErr()) {
    p.note('Failed to ensure config directory exists', 'Error');
    await exit(1);
    return;
  }

  const writeResult = await configUtils.models.write(updatedConfig);
  if (writeResult.isErr()) {
    p.note('Failed to write config', 'Error');
    await exit(1);
    return;
  }

  p.log.message(`Added preset "${presetName}":`);
  for (const agentType of AGENT_TYPE_ORDER) {
    p.log.message(`  ${agentType}: ${formatModelConfig(preset[agentType])}`);
  }

  p.outro('Done!');
  await exit(0);
}

/**
 * Handles the interactive "add preset" command.
 *
 * Prompts the user for a preset name and model selections for each agent type,
 * validates the selections, and saves the preset to the config file.
 *
 * @returns Resolves when the operation completes.
 */
export async function handlePresetsAdd(): Promise<void> {
  p.intro('Add model preset');

  const config = await requireModelsConfig();
  if (!config) return;

  if (config.models.length === 0) {
    p.note('No models added.', 'Warning');
    await exit(0);
    return;
  }

  const presetNameResult = await p.text({
    message: 'Preset name',
  });

  if (p.isCancel(presetNameResult)) {
    p.cancel('Operation cancelled');
    await exit(0);
    return;
  }

  const presetName = (presetNameResult as string).trim();

  if (!presetName) {
    p.note('Preset name is required', 'Error');
    await exit(1);
    return;
  }

  if (config.presets[presetName]) {
    p.note(`Preset "${presetName}" already exists. Use "bluprint config presets edit"`, 'Error');
    await exit(1);
    return;
  }

  const modelOptions = buildModelOptions(config.models);
  const preset: Partial<ModelPreset> = {};

  for (const agentType of AGENT_TYPE_ORDER) {
    const selectResult = await p.select({
      message: `Select model for ${agentType}`,
      options: modelOptions,
    });

    if (p.isCancel(selectResult)) {
      p.cancel('Operation cancelled');
      await exit(0);
      return;
    }

    const selectedModelStr = selectResult as string;
    preset[agentType] = parseModelSelection(selectedModelStr);
  }

  await savePreset(presetName, preset as ModelPreset, config);
}
