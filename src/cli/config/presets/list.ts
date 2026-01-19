import type { ModelPreset } from '../../../config/index.js';
import { AGENT_TYPES, formatModelConfig } from '../../../config/index.js';
import { exit } from '../../../exit.js';
import {
  connectToOpenCodeOrExit,
  formatModelWithStatus,
  requireModelsConfigOrExit,
  validateMultiplePresets,
} from '../utils.js';
import { buildPresetStatus, readBluprintConfigOrExit } from './utils.js';

const orderPresetNames = (
  presets: Record<string, ModelPreset>,
  defaultPresetName: string | undefined
): string[] => {
  const presetNames = Object.keys(presets);
  const sortedPresetNames = presetNames
    .filter((presetName) => presetName !== defaultPresetName)
    .sort((a, b) => a.localeCompare(b));

  if (defaultPresetName && presets[defaultPresetName]) {
    return [defaultPresetName, ...sortedPresetNames];
  }

  return sortedPresetNames;
};

/**
 * Handles the "presets list" command.
 *
 * @param options - Command options.
 * @param options.json - Output as JSON.
 * @returns Resolves when the operation completes.
 */
const handlePresetsList = async (options: { json: boolean }): Promise<void> => {
  const usePrompts = !options.json;
  const config = await requireModelsConfigOrExit({ usePrompts });
  if (!config) return;

  const presets = config.presets;
  const presetNames = Object.keys(presets);

  if (presetNames.length === 0) {
    if (options.json) {
      const payload = {
        defaultPreset: null,
        presets: [],
      };
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log('No presets added.');
    }
    await exit(0);
    return;
  }

  let defaultPresetName: string | undefined = undefined;
  const bluprintConfigResult = await readBluprintConfigOrExit({ usePrompts });
  if (!bluprintConfigResult) {
    return;
  }
  defaultPresetName = bluprintConfigResult.config?.defaultPreset;

  const resolvedDefaultPresetName =
    defaultPresetName && presets[defaultPresetName] ? defaultPresetName : undefined;

  const lib = await connectToOpenCodeOrExit(usePrompts);
  if (!lib) return;

  const modelStatusMap = await validateMultiplePresets(presets, config.models, lib, {
    usePrompts,
  });

  const orderedPresetNames = orderPresetNames(presets, resolvedDefaultPresetName);

  if (options.json) {
    const payload = {
      defaultPreset: resolvedDefaultPresetName ?? null,
      presets: orderedPresetNames.map((presetName) => {
        const preset = presets[presetName]!;
        return {
          name: presetName,
          models: preset,
          status: buildPresetStatus(preset, modelStatusMap),
        };
      }),
    };
    console.log(JSON.stringify(payload, null, 2));
    await exit(0);
    return;
  }

  console.log(`Presets (${presetNames.length}):`);
  for (const presetName of orderedPresetNames) {
    const defaultSuffix = presetName === resolvedDefaultPresetName ? ' (default)' : '';
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
};

export { handlePresetsList };
