import { describe, expect, it } from 'bun:test';
import { buildModelKeySet, dedupeModels, parseModelArgs } from '../../../src/cli/models/utils.js';

describe('cli/models utils', () => {
  it('parses model arguments and reports invalid values', () => {
    const parsed = parseModelArgs(['openai/gpt-4', 'bad-format', 'openai/']);
    expect(parsed.models).toEqual([{ providerID: 'openai', modelID: 'gpt-4' }]);
    expect(parsed.invalid).toEqual(['bad-format', 'openai/']);
  });

  it('dedupes models by provider/model key', () => {
    const models = [
      { providerID: 'openai', modelID: 'gpt-4' },
      { providerID: 'openai', modelID: 'gpt-4' },
      { providerID: 'openai', modelID: 'gpt-3.5-turbo' },
    ];
    const deduped = dedupeModels(models);
    expect(deduped).toHaveLength(2);

    const keys = buildModelKeySet(deduped);
    expect(keys.has('openai/gpt-4')).toBe(true);
    expect(keys.has('openai/gpt-3.5-turbo')).toBe(true);
  });
});
