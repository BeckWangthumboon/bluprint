import * as p from '@clack/prompts';
import { ResultAsync, ok, err } from 'neverthrow';
import type { ModelConfig, ModelsConfig, ModelPreset } from '../../config/index.js';
import {
  configUtils,
  modelConfigEquals,
  formatModelConfig,
  ensureConfigDir,
} from '../../config/index.js';
import { getOpenCodeLib, type Provider } from '../../agent/opencodesdk.js';
import { exit } from '../../exit.js';

function findPresetsUsingModel(model: ModelConfig, presets: Record<string, ModelPreset>): string[] {
  const matchingPresets: string[] = [];
  for (const [presetName, preset] of Object.entries(presets)) {
    if (
      modelConfigEquals(preset.coding, model) ||
      modelConfigEquals(preset.master, model) ||
      modelConfigEquals(preset.plan, model) ||
      modelConfigEquals(preset.summarizer, model) ||
      modelConfigEquals(preset.commit, model)
    ) {
      matchingPresets.push(presetName);
    }
  }
  return matchingPresets;
}

export async function handleModelsAdd(): Promise<void> {}

export async function handleModelsRemove(): Promise<void> {}

export async function handleModelsList(): Promise<void> {}

export async function handleModelsValidate(): Promise<void> {}
