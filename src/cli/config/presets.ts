import * as p from '@clack/prompts';
import type { ModelConfig, ModelPreset, ModelsConfig, BluprintConfig } from '../../config/index.js';
import {
  AGENT_TYPES,
  formatModelConfig,
  validatePresetPool,
  configUtils,
  ensureConfigDir,
  DEFAULT_GENERAL_CONFIG,
} from '../../config/index.js';
import { exit } from '../../exit.js';
import {
  connectToOpenCodeOrExit,
  requireModelsConfigOrExit,
  validateMultiplePresets,
  validatePresets,
  formatModelWithStatus,
  buildModelOptionsWithStatus,
} from './utils.js';

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
 * Persists a preset to the config file (used for both add and update).
 *
 * Validates the preset, writes to config, and exits the process.
 *
 * @param presetName - The name of the preset.
 * @param preset - The ModelPreset configuration.
 * @param config - The existing models config.
 * @param action - Whether this is an 'Added' or 'Updated' operation (for messaging).
 */
async function persistPreset(
  presetName: string,
  preset: ModelPreset,
  config: ModelsConfig,
  action: 'Added' | 'Updated'
): Promise<void> {
  const validation = validatePresetPool(preset, config.models, presetName);
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

  p.log.message(`${action} preset "${presetName}":`);
  for (const agentType of AGENT_TYPES) {
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
 * Shows validation status for each model in the selection list.
 *
 * @returns Resolves when the operation completes.
 */
export async function handlePresetsAdd(): Promise<void> {
  p.intro('Add model preset');

  const config = await requireModelsConfigOrExit({ usePrompts: true });
  if (!config) return;

  if (config.models.length === 0) {
    p.note('No models added.', 'Warning');
    await exit(0);
    return;
  }

  const lib = await connectToOpenCodeOrExit(true);
  if (!lib) return;

  const presetNameResult = await p.text({
    message: 'Preset name',
  });

  if (p.isCancel(presetNameResult)) {
    p.cancel('Operation cancelled');
    await exit(0);
    return;
  }

  const presetName = presetNameResult.trim();

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

  const modelOptions = await buildModelOptionsWithStatus(config.models, lib, { usePrompts: true });
  const preset: Partial<ModelPreset> = {};

  for (const agentType of AGENT_TYPES) {
    const selectResult = await p.select({
      message: `Select model for ${agentType}`,
      options: modelOptions,
    });

    if (p.isCancel(selectResult)) {
      p.cancel('Operation cancelled');
      await exit(0);
      return;
    }

    const selectedModelStr = selectResult;
    preset[agentType] = parseModelSelection(selectedModelStr);
  }

  await persistPreset(presetName, preset as ModelPreset, config, 'Added');
}

/**
 * Handles the interactive "edit preset" command.
 *
 * Prompts the user to select a preset and edit model selections for each agent type,
 * validates the selections, and updates the preset in the config file.
 * Shows current preset with validation status before editing.
 *
 * @returns Resolves when the operation completes.
 */
export async function handlePresetsEdit(): Promise<void> {
  p.intro('Edit model preset');

  const config = await requireModelsConfigOrExit({ usePrompts: true });
  if (!config) return;

  if (config.models.length === 0) {
    p.note('No models added.', 'Warning');
    await exit(0);
    return;
  }

  const presetNames = Object.keys(config.presets);
  if (presetNames.length === 0) {
    p.log.message('No presets added. Run "bluprint config presets add" first.');
    p.log.message('');
    await exit(0);
    return;
  }

  const lib = await connectToOpenCodeOrExit(true);
  if (!lib) return;

  const presetOptions = buildPresetOptions(config.presets);
  const selectPresetResult = await p.select({
    message: 'Select a preset',
    options: presetOptions,
  });

  if (p.isCancel(selectPresetResult)) {
    p.cancel('Operation cancelled');
    await exit(0);
    return;
  }

  const presetName = selectPresetResult;
  const currentPreset = config.presets[presetName]!;

  p.log.message(`\nCurrent configuration for "${presetName}":`);
  const currentPresetStatus = await validatePresets(currentPreset, config.models, lib, {
    usePrompts: true,
  });
  for (const agentType of AGENT_TYPES) {
    const model = currentPreset[agentType];
    const status = currentPresetStatus[agentType];
    const formatted = formatModelWithStatus(model, status);
    p.log.message(`  ${agentType}: ${formatted}`);
  }
  p.log.message('');

  const updatedPreset: ModelPreset = { ...currentPreset } as ModelPreset;

  const allModelOptionsDisplay = await buildModelOptionsWithStatus(config.models, lib, {
    usePrompts: true,
  });

  for (const agentType of AGENT_TYPES) {
    const currentModel = formatModelConfig(currentPreset[agentType]);

    const currentModelOption = allModelOptionsDisplay.find((opt) => opt.value === currentModel);
    const otherModelOptions = allModelOptionsDisplay.filter((opt) => opt.value !== currentModel);

    const modelOptions = currentModelOption
      ? [currentModelOption, ...otherModelOptions]
      : allModelOptionsDisplay;

    const selectResult = await p.select({
      message: `Select model for ${agentType}`,
      options: modelOptions,
      initialValue: currentModel,
    });

    if (p.isCancel(selectResult)) {
      p.cancel('Operation cancelled');
      await exit(0);
      return;
    }

    const selectedModelStr = selectResult;
    updatedPreset[agentType] = parseModelSelection(selectedModelStr);
  }

  await persistPreset(presetName, updatedPreset, config, 'Updated');
}

/**
 * Handles the interactive "remove preset" command.
 *
 * Prompts the user to select a preset to remove and removes it from the config file.
 *
 * @returns Resolves when the operation completes.
 */
export async function handlePresetsRemove(): Promise<void> {
  p.intro('Remove model preset');

  const config = await requireModelsConfigOrExit({ usePrompts: true });
  if (!config) return;

  const presetNames = Object.keys(config.presets);
  if (presetNames.length === 0) {
    p.log.message('No presets added. Run "bluprint config presets add" first.');
    p.log.message('');
    await exit(0);
    return;
  }

  const presetOptions = buildPresetOptions(config.presets);
  const selectedPresetResult = await p.select({
    message: 'Select a preset',
    options: presetOptions,
  });

  if (p.isCancel(selectedPresetResult)) {
    p.cancel('Operation cancelled');
    await exit(0);
    return;
  }

  const selectedName = selectedPresetResult;
  const remainingPresets = { ...config.presets };
  delete remainingPresets[selectedName];

  const ensureDirResult = await ensureConfigDir();
  if (ensureDirResult.isErr()) {
    p.note('Failed to ensure config directory exists', 'Error');
    await exit(1);
    return;
  }

  let clearedDefaultPreset = false;
  let bluprintConfig: BluprintConfig | undefined = undefined;
  const bluprintConfigResult = await configUtils.bluprint.read();
  if (bluprintConfigResult.isOk()) {
    bluprintConfig = bluprintConfigResult.value;
  } else if (bluprintConfigResult.error.type !== 'CONFIG_FILE_MISSING') {
    p.note('Failed to read bluprint config', 'Error');
    await exit(1);
    return;
  }

  if (bluprintConfig?.defaultPreset === selectedName) {
    const updatedBluprintConfig: BluprintConfig = {
      ...bluprintConfig,
      defaultPreset: undefined,
    };
    const writeBluprintResult = await configUtils.bluprint.write(updatedBluprintConfig);
    if (writeBluprintResult.isErr()) {
      p.note('Failed to clear default preset', 'Error');
      await exit(1);
      return;
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
        p.note('Failed to write config and restore default preset', 'Error');
      } else {
        p.note('Failed to write config', 'Error');
      }
    } else {
      p.note('Failed to write config', 'Error');
    }
    await exit(1);
    return;
  }

  p.log.message(`Removed preset "${selectedName}"`);
  if (clearedDefaultPreset) {
    p.log.message(`Default preset removed (was "${selectedName}").`);
  }

  p.outro('Done!');
  await exit(0);
}

/**
 * Handles the "list presets" command.
 *
 * Displays all configured presets with their agent types and models.
 * Shows validation status for each model (pool membership and SDK validity).
 *
 * @returns Resolves when the operation completes.
 */
export async function handlePresetsList(): Promise<void> {
  const config = await requireModelsConfigOrExit({ usePrompts: false });
  if (!config) return;

  const presets = config.presets;

  if (Object.keys(presets).length === 0) {
    console.log('No presets added.');
    await exit(0);
    return;
  }

  let defaultPresetName: string | undefined = undefined;
  const bluprintConfigResult = await configUtils.bluprint.read();
  if (bluprintConfigResult.isOk()) {
    defaultPresetName = bluprintConfigResult.value.defaultPreset;
  } else if (bluprintConfigResult.error.type !== 'CONFIG_FILE_MISSING') {
    p.note('Failed to read bluprint config', 'Error');
    await exit(1);
    return;
  }

  const lib = await connectToOpenCodeOrExit(false);
  if (!lib) return;

  const modelStatusMap = await validateMultiplePresets(presets, config.models, lib, {
    usePrompts: false,
  });

  const presetNames = Object.keys(presets);
  const sortedPresetNames = presetNames
    .filter((presetName) => presetName !== defaultPresetName)
    .sort((a, b) => a.localeCompare(b));
  const orderedPresetNames =
    defaultPresetName && presets[defaultPresetName]
      ? [defaultPresetName, ...sortedPresetNames]
      : sortedPresetNames;

  console.log(`Presets (${presetNames.length}):`);
  for (const presetName of orderedPresetNames) {
    const defaultSuffix = presetName === defaultPresetName ? ' (default)' : '';
    console.log(`  ${presetName}${defaultSuffix}:`);
    const preset = presets[presetName]!;
    for (const agentType of AGENT_TYPES) {
      const model = preset[agentType];
      const modelKey = formatModelConfig(model);
      const status = modelStatusMap.get(modelKey);
      const formatted = status ? formatModelWithStatus(model, status) : modelKey;
      console.log(`    ${agentType}: ${formatted}`);
    }
  }

  await exit(0);
}

/**
 * Handles the "set default preset" command.
 *
 * Prompts the user to select a preset to set as the default and updates the bluprint config.
 * Shows validation status for the selected preset and warns about invalid models.
 *
 * @returns Resolves when the operation completes.
 */
export async function handlePresetsDefault(): Promise<void> {
  p.intro('Set default preset');

  const config = await requireModelsConfigOrExit({ usePrompts: true });
  if (!config) return;

  const presetNames = Object.keys(config.presets);
  if (presetNames.length === 0) {
    p.log.message('No presets added. Run "bluprint config presets add" first.');
    p.log.message('');
    await exit(0);
    return;
  }

  const bluprintConfigResult = await configUtils.bluprint.read();
  if (bluprintConfigResult.isErr() && bluprintConfigResult.error.type !== 'CONFIG_FILE_MISSING') {
    p.note('Failed to read bluprint config', 'Error');
    await exit(1);
    return;
  }

  const lib = await connectToOpenCodeOrExit(true);
  if (!lib) return;

  const configuredDefaultPreset = bluprintConfigResult.isOk()
    ? bluprintConfigResult.value.defaultPreset
    : undefined;
  const defaultPresetExistsInPresets =
    configuredDefaultPreset !== undefined && config.presets[configuredDefaultPreset] !== undefined;
  const presetOptionsBase = buildPresetOptions(config.presets);
  const presetOptions = defaultPresetExistsInPresets
    ? [
        {
          value: configuredDefaultPreset,
          label: `${configuredDefaultPreset} (default)`,
        },
        ...presetOptionsBase.filter((option) => option.value !== configuredDefaultPreset),
      ]
    : presetOptionsBase;
  const selectedPresetResult = await p.select({
    message: 'Select a preset',
    options: presetOptions,
  });

  if (p.isCancel(selectedPresetResult)) {
    p.cancel('Operation cancelled');
    await exit(0);
    return;
  }

  const selectedPresetName = selectedPresetResult;
  const selectedPreset = config.presets[selectedPresetName]!;

  const poolValidation = validatePresetPool(selectedPreset, config.models, selectedPresetName);
  if (poolValidation.isErr()) {
    p.note(
      `Preset "${selectedPresetName}" is invalid (models not in pool). Fix it before setting default.`,
      'Error'
    );
    await exit(1);
    return;
  }

  const modelStatuses = await validatePresets(selectedPreset, config.models, lib, {
    usePrompts: true,
  });

  p.log.message(`\nSelected preset "${selectedPresetName}":`);
  for (const agentType of AGENT_TYPES) {
    const model = selectedPreset[agentType];
    const status = modelStatuses[agentType];
    const formatted = formatModelWithStatus(model, status);
    p.log.message(`  ${agentType}: ${formatted}`);
  }

  const hasInvalidModels = Object.values(modelStatuses).some((s) => s.validInOpenCode === false);

  if (hasInvalidModels) {
    p.log.warn('\nThis preset contains invalid models.');
    const confirmResult = await p.confirm({
      message: 'Set as default anyway?',
    });

    if (p.isCancel(confirmResult) || !confirmResult) {
      p.cancel('Operation cancelled');
      await exit(0);
      return;
    }
  }

  const ensureDirResult = await ensureConfigDir();
  if (ensureDirResult.isErr()) {
    p.note('Failed to ensure config directory exists', 'Error');
    await exit(1);
    return;
  }

  const updatedBluprintConfig: BluprintConfig = {
    ...(bluprintConfigResult.isOk() ? bluprintConfigResult.value : DEFAULT_GENERAL_CONFIG),
    defaultPreset: selectedPresetName,
  };

  const writeResult = await configUtils.bluprint.write(updatedBluprintConfig);
  if (writeResult.isErr()) {
    p.note('Failed to write bluprint config', 'Error');
    await exit(1);
    return;
  }

  p.log.message(`\nDefault model preset set to "${selectedPresetName}"`);
  p.outro('Done!');
  await exit(0);
}
