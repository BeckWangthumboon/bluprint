import * as p from '@clack/prompts';
import type { AgentType, ModelPreset } from '../../config/index.js';
import { AGENT_TYPES, formatModelConfig, modelConfigEquals } from '../../config/index.js';
import { exit } from '../../exit.js';
import {
  buildModelOptionsWithStatus,
  connectToOpenCodeOrExit,
  requireModelsConfigOrExit,
  formatModelWithStatus,
  validatePresets,
} from '../shared/utils.js';
import {
  buildPresetOptions,
  parseModelReference,
  parsePresetModelArgs,
  persistPreset,
  reportError,
  reportWarning,
} from './utils.js';

const buildInvalidModelMessage = (
  invalid: Array<{ agentType: AgentType; value: string }>
): string => {
  const invalidLabels = invalid.map(({ agentType, value }) => `--${agentType}=${value}`);
  return `Invalid model format: ${invalidLabels.join(', ')}`;
};

/**
 * Handles the "presets edit" command.
 *
 * @param options - Command options.
 * @param options.name - Optional preset name.
 * @param options.models - Optional model references keyed by agent type.
 * @returns Resolves when the operation completes.
 */
const handlePresetsEdit = async (options: {
  name: string | undefined;
  models: Partial<Record<AgentType, string>>;
}): Promise<void> => {
  const hasModelArgs = Object.values(options.models).some((value) => value !== undefined);
  const useNonInteractive = options.name !== undefined || hasModelArgs;
  const usePrompts = !useNonInteractive;

  if (usePrompts) {
    p.intro('Edit model preset');
  }

  if (useNonInteractive) {
    const presetName = options.name?.trim();
    if (!presetName) {
      reportError(usePrompts, 'Preset name is required when using flags');
      await exit(1);
      return;
    }

    const config = await requireModelsConfigOrExit({ usePrompts });
    if (!config) return;

    if (config.models.length === 0) {
      reportWarning(usePrompts, 'No models added.');
      await exit(0);
      return;
    }

    const currentPreset = config.presets[presetName];
    if (!currentPreset) {
      reportError(usePrompts, `Preset "${presetName}" not found`);
      await exit(1);
      return;
    }

    const parsed = parsePresetModelArgs(options.models);
    if (parsed.invalid.length > 0) {
      reportError(usePrompts, buildInvalidModelMessage(parsed.invalid));
      await exit(1);
      return;
    }

    if (Object.keys(parsed.preset).length === 0) {
      reportError(
        usePrompts,
        'No model updates provided. Use interactive mode or pass model flags.'
      );
      await exit(1);
      return;
    }

    const updatedPreset: ModelPreset = {
      ...currentPreset,
      ...parsed.preset,
    } as ModelPreset;

    const hasChanges = AGENT_TYPES.some(
      (agentType) => !modelConfigEquals(updatedPreset[agentType], currentPreset[agentType])
    );
    if (!hasChanges) {
      if (usePrompts) {
        p.outro('No changes made');
      } else {
        console.log('No changes made');
      }
      await exit(0);
      return;
    }

    await persistPreset(presetName, updatedPreset, config, 'Updated', { usePrompts });
    return;
  }

  const config = await requireModelsConfigOrExit({ usePrompts: true });
  if (!config) return;

  if (config.models.length === 0) {
    reportWarning(true, 'No models added.');
    await exit(0);
    return;
  }

  const presetNames = Object.keys(config.presets);
  if (presetNames.length === 0) {
    p.log.message('No presets added. Run "bluprint presets add" first.');
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

    const parsed = parseModelReference(selectResult);
    if (!parsed) {
      reportError(true, 'Invalid model selection format');
      await exit(1);
      return;
    }

    updatedPreset[agentType] = parsed;
  }

  await persistPreset(presetName, updatedPreset, config, 'Updated', { usePrompts: true });
};

export { handlePresetsEdit };
