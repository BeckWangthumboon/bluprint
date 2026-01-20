import { describe, expect, it } from 'bun:test';
import type { ModelConfig, ModelPreset } from '../../../src/config/index.js';
import { validatePresetPool } from '../../../src/config/index.js';

describe('config/validate', () => {
  it('accepts presets that only use models in the pool', () => {
    const model: ModelConfig = { providerID: 'openai', modelID: 'gpt-4' };
    const preset: ModelPreset = {
      coding: model,
      master: model,
      plan: model,
      summarizer: model,
      commit: model,
    };

    const result = validatePresetPool(preset, [model], 'starter');
    expect(result.isOk()).toBe(true);
  });

  it('rejects presets that reference models outside the pool', () => {
    const model: ModelConfig = { providerID: 'openai', modelID: 'gpt-4' };
    const preset: ModelPreset = {
      coding: model,
      master: model,
      plan: model,
      summarizer: model,
      commit: model,
    };

    const result = validatePresetPool(preset, [], 'starter');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('MODEL_NOT_IN_POOL');
    }
  });
});
