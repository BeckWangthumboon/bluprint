import * as p from '@clack/prompts';
import { exit } from '../../exit.js';
import { requireModelsConfigOrExit } from '../shared/utils.js';
import {
  buildPresetOptions,
  removePresetAndPersist,
  reportError,
  reportInfo,
  reportOutro,
} from './utils.js';

const confirmRemoval = async (presetName: string, skipConfirmations: boolean): Promise<boolean> => {
  if (skipConfirmations) {
    return true;
  }

  const confirmResult = await p.confirm({
    message: `Remove preset "${presetName}"?`,
  });

  if (p.isCancel(confirmResult)) {
    p.cancel('Operation cancelled');
    await exit(0);
    return false;
  }

  return confirmResult === true;
};

/**
 * Handles the "presets remove" command.
 *
 * @param options - Command options.
 * @param options.name - Optional preset name.
 * @param options.yes - Skip confirmation prompts.
 * @returns Resolves when the operation completes.
 */
const handlePresetsRemove = async (options: {
  name: string | undefined;
  yes: boolean;
}): Promise<void> => {
  const usePrompts = options.name === undefined || !options.yes;
  if (usePrompts) {
    p.intro('Remove model preset');
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

  let presetName: string;

  if (options.name) {
    presetName = options.name.trim();
    if (!presetName) {
      reportError(usePrompts, 'Preset name is required');
      await exit(1);
      return;
    }
    if (!config.presets[presetName]) {
      reportError(usePrompts, `Preset "${presetName}" not found`);
      await exit(1);
      return;
    }
  } else {
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

    presetName = selectedPresetResult;
  }

  const confirmed = await confirmRemoval(presetName, options.yes);
  if (!confirmed) {
    return;
  }

  const removalResult = await removePresetAndPersist(presetName, config, { usePrompts });
  if (!removalResult) {
    return;
  }

  reportInfo(usePrompts, `Removed preset "${presetName}"`);
  if (removalResult.clearedDefaultPreset) {
    reportInfo(usePrompts, `Default preset removed (was "${presetName}").`);
  }

  reportOutro(usePrompts, 'Done!');
  await exit(0);
};

export { handlePresetsRemove };
