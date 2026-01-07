import * as p from '@clack/prompts';
import type { ModelConfig, ModelPreset } from '../../config/index.js';
import { AGENT_TYPES, formatModelConfig, validatePreset } from '../../config/index.js';

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
