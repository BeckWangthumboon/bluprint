import * as p from '@clack/prompts';
import type { BluprintConfig } from '../../../config/index.js';
import {
  AGENT_TYPES,
  DEFAULT_BLUPRINT_CONFIG,
  validatePresetPool,
} from '../../../config/index.js';
import { exit } from '../../../exit.js';
import {
  connectToOpenCodeOrExit,
  formatModelWithStatus,
  requireModelsConfigOrExit,
  validatePresets,
} from '../utils.js';
import {
  buildPresetOptions,
  ensureConfigDirOrExit,
  readBluprintConfigOrExit,
  reportError,
  reportInfo,
  reportOutro,
  writeBluprintConfigOrExit,
} from './utils.js';

const logInvalidPresetWarning = (usePrompts: boolean): void => {
  if (usePrompts) {
    p.log.warn('\nThis preset contains invalid models.');
  } else {
    console.warn('This preset contains invalid models.');
  }
};

/**
 * Handles the "presets default" command.
 *
 * @param options - Command options.
 * @param options.name - Optional preset name.
 * @param options.yes - Skip confirmation prompts.
 * @returns Resolves when the operation completes.
 */
const handlePresetsDefault = async (options: {
  name: string | undefined;
  yes: boolean;
}): Promise<void> => {
  const usePrompts = options.name === undefined;
  if (usePrompts) {
    p.intro('Set default preset');
  }
  const config = await requireModelsConfigOrExit({ usePrompts });
  if (!config) return;

  const presetNames = Object.keys(config.presets);
  if (presetNames.length === 0) {
    reportInfo(usePrompts, 'No presets added. Run "bluprint presets add" first.');
    reportInfo(usePrompts, '');
    await exit(0);
    return;
  }

  const bluprintConfigResult = await readBluprintConfigOrExit({ usePrompts });
  if (!bluprintConfigResult) {
    return;
  }

  const lib = await connectToOpenCodeOrExit(usePrompts);
  if (!lib) return;

  let selectedPresetName: string;

  if (options.name) {
    selectedPresetName = options.name.trim();
    if (!selectedPresetName) {
      reportError(usePrompts, 'Preset name is required');
      await exit(1);
      return;
    }
    if (!config.presets[selectedPresetName]) {
      reportError(usePrompts, `Preset "${selectedPresetName}" not found`);
      await exit(1);
      return;
    }
  } else {
    const configuredDefaultPreset = bluprintConfigResult.config?.defaultPreset;
    const defaultPresetExistsInPresets =
      configuredDefaultPreset !== undefined &&
      config.presets[configuredDefaultPreset] !== undefined;
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

    selectedPresetName = selectedPresetResult;
  }

  const selectedPreset = config.presets[selectedPresetName]!;

  const poolValidation = validatePresetPool(selectedPreset, config.models, selectedPresetName);
  if (poolValidation.isErr()) {
    reportError(
      usePrompts,
      `Preset "${selectedPresetName}" is invalid (models not in pool). Fix it before setting default.`
    );
    await exit(1);
    return;
  }

  const modelStatuses = await validatePresets(selectedPreset, config.models, lib, {
    usePrompts,
  });

  reportInfo(usePrompts, `\nSelected preset "${selectedPresetName}":`);
  for (const agentType of AGENT_TYPES) {
    const model = selectedPreset[agentType];
    const status = modelStatuses[agentType];
    const formatted = formatModelWithStatus(model, status);
    reportInfo(usePrompts, `  ${agentType}: ${formatted}`);
  }

  const hasInvalidModels = Object.values(modelStatuses).some((s) => s.validInOpenCode === false);

  if (hasInvalidModels) {
    logInvalidPresetWarning(usePrompts);

    if (!usePrompts && !options.yes) {
      reportError(
        usePrompts,
        'Selected preset contains invalid models. Re-run with --yes to set it anyway.'
      );
      await exit(1);
      return;
    }

    if (usePrompts && !options.yes) {
      const confirmResult = await p.confirm({
        message: 'Set as default anyway?',
      });

      if (p.isCancel(confirmResult) || !confirmResult) {
        p.cancel('Operation cancelled');
        await exit(0);
        return;
      }
    }
  }

  const ensured = await ensureConfigDirOrExit({ usePrompts });
  if (!ensured) {
    return;
  }

  const updatedBluprintConfig: BluprintConfig = {
    ...(bluprintConfigResult.config ?? DEFAULT_BLUPRINT_CONFIG),
    defaultPreset: selectedPresetName,
  };

  const wrote = await writeBluprintConfigOrExit(updatedBluprintConfig, { usePrompts });
  if (!wrote) {
    return;
  }

  reportInfo(usePrompts, `\nDefault model preset set to "${selectedPresetName}"`);
  reportOutro(usePrompts, 'Done!');
  await exit(0);
};

export { handlePresetsDefault };
