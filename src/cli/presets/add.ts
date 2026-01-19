import * as p from '@clack/prompts';
import type { AgentType, ModelPreset } from '../../config/index.js';
import { AGENT_TYPES } from '../../config/index.js';
import { exit } from '../../exit.js';
import {
  buildModelOptionsWithStatus,
  connectToOpenCodeOrExit,
  requireModelsConfigOrExit,
} from '../shared/utils.js';
import {
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

const buildMissingModelFlagsMessage = (missing: AgentType[]): string => {
  return `Missing required model flag(s): ${missing.map((agentType) => `--${agentType}`).join(', ')}`;
};

/**
 * Handles the "presets add" command.
 *
 * @param options - Command options.
 * @param options.name - Optional preset name.
 * @param options.models - Optional model references keyed by agent type.
 * @returns Resolves when the operation completes.
 */
const handlePresetsAdd = async (options: {
  name: string | undefined;
  models: Partial<Record<AgentType, string>>;
}): Promise<void> => {
  const hasModelArgs = Object.values(options.models).some((value) => value !== undefined);
  const useNonInteractive = options.name !== undefined || hasModelArgs;
  const usePrompts = !useNonInteractive;

  if (usePrompts) {
    p.intro('Add model preset');
  }
  const config = await requireModelsConfigOrExit({ usePrompts });
  if (!config) return;

  if (config.models.length === 0) {
    reportWarning(usePrompts, 'No models added.');
    await exit(0);
    return;
  }

  if (useNonInteractive) {
    const presetName = options.name?.trim();
    if (!presetName) {
      reportError(usePrompts, 'Preset name is required when using flags');
      await exit(1);
      return;
    }

    if (config.presets[presetName]) {
      reportError(usePrompts, `Preset "${presetName}" already exists. Use "bluprint presets edit"`);
      await exit(1);
      return;
    }

    const parsed = parsePresetModelArgs(options.models);
    if (parsed.invalid.length > 0) {
      reportError(usePrompts, buildInvalidModelMessage(parsed.invalid));
      await exit(1);
      return;
    }

    const missingAgentTypes = AGENT_TYPES.filter(
      (agentType) => parsed.preset[agentType] === undefined
    );
    if (missingAgentTypes.length > 0) {
      reportError(usePrompts, buildMissingModelFlagsMessage(missingAgentTypes));
      await exit(1);
      return;
    }

    await persistPreset(presetName, parsed.preset as ModelPreset, config, 'Added', {
      usePrompts,
    });
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
    reportError(true, 'Preset name is required');
    await exit(1);
    return;
  }

  if (config.presets[presetName]) {
    reportError(true, `Preset "${presetName}" already exists. Use "bluprint presets edit"`);
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

    const parsed = parseModelReference(selectResult);
    if (!parsed) {
      reportError(true, 'Invalid model selection format');
      await exit(1);
      return;
    }

    preset[agentType] = parsed;
  }

  await persistPreset(presetName, preset as ModelPreset, config, 'Added', { usePrompts: true });
};

export { handlePresetsAdd };
